# Docker & Deployment Readiness — Engineering Report

Scope: the Docker and deployment configuration for a Hostinger VPS deployment.
This document records what was changed, why, and — importantly — **what has and
has not been verified**. It complements `docs/deployer/10-DEPLOYMENT-GUIDE.md` (host setup) and
`docs/deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md` (deploy-time deltas).

## 1. Classification

**CONDITIONALLY READY.** The configuration defects found in this pass are fixed
and the fixes that can be validated without building images have been validated.
Two conditions remain:

1. **Image builds were not executed in this environment** (host disk exhausted).
   Every artifact touched here must be built once and booted before go-live —
   see §4 for the exact commands. Until then, treat the runtime behaviour as
   unverified.
2. **A real credential is present in Git history** and must be rotated — see §5.

No critical or high-risk configuration defect remains *outstanding*; the
outstanding items are verification and credential hygiene.

## 2. What changed, and why

### 2.1 Secret scoping — the most serious defect (`docker-compose.prod.yml`)

`postgres` and `verifier` previously loaded `env_file: .env.production`. That
handed both of them the JWT signing secrets, Chapa keys, SMTP password, Gemini
key and `SUPER_ADMIN_PASSWORD`. The verifier is the worst possible recipient: it
parses untrusted receipts fetched from arbitrary bank URLs and drives a browser.

Now:

| Service | Secrets reachable | Before |
|---|---|---|
| `postgres` | `POSTGRES_PASSWORD` only (3 vars total) | all 43+ |
| `verifier` | `VERIFIER_SHARED_TOKEN` only (1 var total) | all 43+ |
| `redis` | none (0 vars) | 0 |
| `web` | none (3 vars) | 3 |
| `api` | full file — **by design**, it owns the application secrets | full file |

Verified by resolving the compose config and inspecting each service's
environment.

### 2.2 nginx read timeout raced the payment path (`deploy/nginx/*.conf`)

Receipt verification is **synchronous inside the HTTP request**: the API awaits
Cheki (`CHEKI_TIMEOUT_MS`, 20 s) and can then fall back to the receipt verifier
(`RECEIPT_VERIFIER_TIMEOUT_MS`, default 60 s, validated up to 120 s). Both vhosts
allowed only `proxy_read_timeout 60s`, so a legitimate submission could receive
**504 while the payment was still being recorded** — a confusing,
revenue-affecting failure. Raised to `180s` on both the API and web vhosts (the
web vhost matters because Next.js rewrites `/api/v1/*` upstream).

The staging API vhost also had **no security headers**; it now mirrors
production so the soak tests what will actually ship.

### 2.3 Log rotation and resource limits (`docker-compose.prod.yml`)

Neither existed in production. Now every service has `json-file` logging capped
at 10 MB × 3 files, an explicit `mem_limit`, and
`security_opt: [no-new-privileges:true]`. Without log caps a chatty service
eventually fills the VPS disk; without memory caps one runaway service can take
down the whole box rather than just itself.

Limits moved from the staging overlay into the base file so staging exercises
the same limits production will run — a staging-only limit hides problems
instead of catching them.

### 2.4 Verifier image ran as root (`services/receipt-verifier/Dockerfile`)

It now runs as an unprivileged user (uid 10001). The Chromium extractor passes
`--no-sandbox`, which works fine as non-root. Dependencies are pinned to the
exact versions the bundled test suite was validated against, and the base image
pins the Debian codename so the OS cannot change under a floating `slim` tag.

Chromium is **kept** — it is genuinely required by
`ethiobank_receipts/extractors/boa.py` for Bank of Abyssinia receipts. No
`shm_size` override is needed: that extractor already passes
`--disable-dev-shm-usage`.

### 2.5 Build context was 185 MB (`\.dockerignore`)

The root `.dockerignore` did not exclude `.venv`, so the receipt verifier's
~140 MB local Python virtualenv was sent to the Docker daemon on **every** api
and web build (those use the repo root as context). Context is now **39.6 MB**.

Also excluded: `aicheck.mjs`, which embeds a real database credential (§5), so a
future `COPY . .` can never place it in an image layer.

### 2.6 Incomplete environment template (`.env.production.example`)

Three variables read by the code were absent from the template: `PORT`
(default 4000), `CHEKI_CACHE_TTL_MS` (default 300000), and `SENTRY_DSN`
(optional error reporting). All three are now documented.

### 2.7 Backup script fragility (`deploy/backup/pg-backup.sh`)

It parsed `.env.production` with `grep | cut`, which breaks on the CRLF endings a
Windows-authored file carries when deployed to Linux — `pg_dump` would receive
`lor_mentor\r` as the database name. It now strips `\r` and quotes, fails loudly
when a key is missing instead of producing a nameless dump, and runs `gzip -t`
so a truncated dump cannot be mistaken for a good one.

## 3. Deliberate non-changes

- **The API image ships devDependencies.** This is required, not an oversight:
  `docker-entrypoint.sh` runs `prisma migrate deploy`, and `prisma.config.ts`
  does `import 'dotenv/config'`, so the Prisma CLI and `dotenv` must exist at
  runtime. Pruning them would break migrations at boot. Making this smaller
  means promoting `prisma` and `dotenv` to production dependencies — a
  dependency-classification change that should not be made without a
  build-and-boot test.
- **Redis has no password.** The app has no `REDIS_PASSWORD` support, so adding
  `requirepass` would break both the BullMQ queue and the token denylist. Redis
  is never published to the host. Adding auth means touching three client
  constructions in the API — out of scope here, worth a follow-up ticket.
- **The staging API vhost stays publicly reachable.** Documented in the file:
  the Chapa webhook and the Let's Encrypt HTTP-01 challenge must reach it. This
  is a deliberate trade-off, not an oversight.
- **`node:24-slim` is not pinned to a codename** because `node:24-slim-bookworm`
  does not exist. The tag already tracks Node 24 LTS patches.

## 4. What to run on the VPS (verification owed)

Nothing below was executed in the development environment. Run it and confirm
before declaring go-live.

```bash
cd /opt/lor-mentor

# 4.1 Compose must parse against the real secrets file
docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet

# 4.2 Build all three images
docker compose -f docker-compose.prod.yml --env-file .env.production build

# 4.3 Boot and confirm every service reports healthy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production ps
# expect: postgres, redis, verifier, api, web all "(healthy)"

# 4.4 Migrations were applied by the api entrypoint
docker compose -f docker-compose.prod.yml --env-file .env.production \
  logs api | grep -i "migrate"
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npx prisma migrate status

# 4.5 The API is alive
curl -sS https://api.lormentor.com/api/v1/health/ready

# 4.6 Every service logs its memory limit, proving the caps applied
docker inspect --format '{{.Name}} Mem={{.HostConfig.Memory}} NNP={{.HostConfig.SecurityOpt}}' \
  $(docker compose -f docker-compose.prod.yml ps -q)
```

### Specific runtime behaviour to confirm

These are the changes most likely to bite, because they alter how containers
start and I could not boot them here:

| Check | Why it matters | Expected |
|---|---|---|
| Postgres and Redis start with `no-new-privileges` | Their entrypoints drop privileges via `gosu`/`su-exec`. This is expected to work, but it is the single change most likely to break startup. | Containers reach healthy |
| Verifier starts as non-root | Chromium must launch as uid 10001 | `/health` returns `{"status":"ok"}` |
| BOA receipt extraction in-container | Selenium must locate Chromium and chromedriver | Submit a real BOA receipt; expect real extracted data, not `EXTRACT_FAILED` |
| Pinned verifier dependencies install | `pip install` of the pinned set on Python 3.12 | Build succeeds |
| A ~60 s receipt submission | Confirms the `proxy_read_timeout` fix | No 504 after 60 s |

## 5. Credential exposure — action required

`aicheck.mjs` line 5 contains a **live database password identical to the value
in `apps/api/.env`**. It has been tracked in Git since the initial commit
`f6f98ac`, and the file is referenced by nothing.

- The host is `localhost:5432`, so the blast radius is the development database
  — **unless that same password was ever reused for staging or production**.
- Deleting the file does **not** remove it from Git history.
- This document deliberately does not reproduce the value.

Required:

1. **Rotate the password.** `ALTER ROLE <user> WITH PASSWORD '<new>';` then
   update `apps/api/.env` — see `docs/deployer/90-SECRET-ROTATION.md`.
2. **Confirm production differs.** The VPS `POSTGRES_PASSWORD` must not equal the
   development one.
3. **Remove the file and purge history** before the repository is ever made
   public (`git filter-repo` or BFG, then force-push and have every clone
   re-clone). If the GitLab project stays private and strictly access-controlled,
   purge becomes lower priority — but rotation is still required.

Other hits from the history scan were checked and cleared:
`.gitlab-ci.yml` (`lor_ci_password` — documented throwaway for the ephemeral CI
Postgres), `docs/deployer/90-SECRET-ROTATION.md` (a `<new-db-password>`
template), and the `.env.example` files (placeholders).

## 6. Repo hygiene note

`.gitattributes` pins `*.sh` to `eol=lf` and three `migration.sql` files to
`eol=crlf`. The latter is deliberate: Prisma hashes migration files exactly as
they sit on disk and the recorded checksums match CRLF. **Obtain the repo with
`git clone`**, never a zip or an rsync that normalises line endings, or
`prisma migrate deploy` will fail on a re-deploy against an existing database.

## 7. Phase F deltas (stack hardening)

Applied after the audit above, with all compose files re-validated:

| Change | Why |
|---|---|
| Base images pinned to registry digests (`node:24-slim`, `postgres:16-alpine`, `redis:7-alpine`, `python:3.12-slim-bookworm`) | Reproducible builds; a silent upstream re-tag can no longer change the OS or database engine under a rebuild. All four digests are multi-arch indexes, so amd64 and arm64 hosts both work. |
| `init: true` on api, web and verifier | tini as PID 1 forwards SIGTERM and reaps zombies. The verifier matters most: Selenium starts and stops Chromium per request and could otherwise accumulate orphans. |
| `stop_grace_period` on postgres (30s) and redis (20s) | Postgres needs time for a fast shutdown and checkpoint; Redis flushes its AOF on SIGTERM. The 10s default could interrupt both. |
| `web` waits for `api: service_healthy` | The web server rewrites `/api/v1/*` to the API; starting it first produced avoidable 502s during boot. |

New documentation:

- `docs/deployer/20-SERVER-PREREQUISITES.md` — OS-agnostic host requirements
  (hardware, swap, packages per distro family, firewall, DNS, permissions),
  including Hostinger-specific caveats.
- `docs/deployer/42-NGINX-AND-TLS.md` — topology, installation, Certbot flow, upload
  limits, timeouts, the split-host cookie rule, and a failure-mode table.

**Still not verified:** no image was built in this environment (the Docker
daemon is not running here). The digest pins were resolved with
`docker buildx imagetools inspect`, which reads the registry directly. The §4
build-and-boot sequence remains the gate.
