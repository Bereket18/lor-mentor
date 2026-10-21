# Staging Host and Environment-Limited Gate Runbook

**Purpose:** run T-30, T-46, T-47, T-48, T-49 wrapper and T-50–T-53 outside the
developer laptop. This document defines what a staging host is, the exact
commands, and what can and cannot be proven on local Docker.

## 1. What a staging host is

A staging host is a **separate Linux server** (a small VPS is fine: 2 vCPU /
4 GB RAM / 40 GB disk) that runs the same `docker-compose.prod.yml` stack with:

- its own domain or subdomain, e.g. `staging.lormentor.com` and
  `api.staging.lormentor.com`;
- its own Postgres/Redis volumes and its own `.env.production`;
- its own TLS certificate (Nginx + Certbot or Caddy);
- its own test-mode Chapa/Resend keys (never production secrets);
- no student data.

It is not a Git branch, a preview URL on the dev laptop, or a shared production
database. Without it you can prove the images build and start, but not DNS,
TLS/HSTS, real webhook callbacks, realistic load, or persistence across a
server-level restart.

## 2. Host setup

```bash
# On the staging server (Ubuntu example)
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git nginx certbot python3-certbot-nginx curl
git clone <repo> /opt/lor-mentor
cd /opt/lor-mentor
cp .env.production.example .env.production
# Fill in staging values. Generate secrets, do not reuse production:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Required production values:
#   NODE_ENV=production
#   DATABASE_URL, POSTGRES_USER/PASSWORD/DB
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (different, >=32 chars)
#   SMTP_HOST/USER/PASS/FROM (a verified test sender)
#   API_PUBLIC_URL/WEB_PUBLIC_URL/CORS_ORIGIN (the staging HTTPS origins)
#   RECEIPT_VERIFIER_TOKEN (>=32 chars)
#   REDIS_FAIL_MODE=closed
#   CHAPA_SECRET_KEY + CHAPA_WEBHOOK_SECRET (test mode) or both blank
npm run check:env -- .env.production --strict
```

## 3. T-50 — build both images

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build
```

PASS: both `api` and `web` images build with exit 0.

## 4. T-51 — start the stack and apply migrations

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api | tail -50
```

PASS: all services healthy; API boot log shows migrations applied and
`Database connected`; `GET /api/v1/health/ready` returns `200` with database
and Redis up.

## 5. T-52 — smoke test against staging

```bash
bash deploy/smoke-test.sh https://api.staging.lormentor.com https://staging.lormentor.com
```

PASS: `FAIL: 0`.

## 6. T-53 — TLS, HSTS/headers, uploads persistence

```bash
curl -sI https://api.staging.lormentor.com/api/v1/health | grep -Ei 'strict-transport|x-content-type|x-frame'
```

PASS: HSTS + the helmet headers are present over HTTPS.

Uploads persistence:

```bash
# Create a file through the API upload flow or docker exec into the API volume.
docker compose -f docker-compose.prod.yml exec api sh -c 'echo staging-persistence > /app/apps/api/uploads/t53-probe.txt'
docker compose -f docker-compose.prod.yml up -d --force-recreate api
docker compose -f docker-compose.prod.yml exec api cat /app/apps/api/uploads/t53-probe.txt
```

PASS: the probe file still exists after the API container is recreated.

## 7. T-49 wrapper — backup script

```bash
REPO_DIR=/opt/lor-mentor BACKUP_DIR=/var/backups/lor-mentor bash deploy/backup/pg-backup.sh
ls -lh /var/backups/lor-mentor
```

PASS: a non-trivial `.sql.gz` dump is written and the script exits 0. Restore it
into a throwaway database and compare row counts.

## 8. T-46 — load test

Run the existing k6/Artillery script (or `autocannon`/`k6` equivalent) against
courses/materials/forum read paths with a staging student token. Record p95,
error rate and any N+1 evidence in the API logs/query counts.

PASS: p95 within the target in `PERFORMANCE-RELIABILITY-AUDIT.md`, no error
spike, no N+1 blow-up.

## 9. T-47 — kill the API mid-AI-job

1. Start a PDF→AI generation on staging.
2. `docker compose -f docker-compose.prod.yml kill api`.
3. `docker compose -f docker-compose.prod.yml up -d api`.
4. Check BullMQ logs/job state and the material row.

PASS: the job is retried or marked FAILED with a reason; no half-written
flashcards/quiz set is left behind.

## 10. T-48 — provider outage matrix

- **Gemini:** set an invalid `GEMINI_API_KEY` in a staging override or block
  egress; AI requests should return a graceful error, not crash the API.
- **SMTP:** block the SMTP host; registration/reset should fail gracefully and
  registration should roll back its user row.
- **Chapa:** block `api.chapa.co`; initialize should return a clear 503/502
  error and no admin-visible unconfirmed request.
- **Redis:** see T-30; with `REDIS_FAIL_MODE=closed`, `/health/ready` must
  report `redis: down` and refresh-token rotation must return 401.

PASS: no crash, no stuck button/request, no data corruption; Sentry events
appear if `SENTRY_DSN` is configured.

## 11. T-30 — Redis-down drill

```bash
docker compose -f docker-compose.prod.yml stop redis
curl -s http://127.0.0.1:4000/api/v1/health/ready   # expect 503
# refresh with a real cookie -> expect 401 under fail-closed
docker compose -f docker-compose.prod.yml start redis
curl -s http://127.0.0.1:4000/api/v1/health/ready   # expect 200
```

PASS: readiness surfaces the dependency failure, refresh is denied while Redis
is down, and everything recovers when Redis returns.

`scripts/t30-redis-drill.ps1` automates exactly this (used for the 2026-10-19
PASS). It logs in as the seeded super admin and extracts the refresh cookie from
`Set-Cookie` because `NODE_ENV=production` marks it `Secure`, which a .NET
cookie jar refuses to replay over a plain-HTTP test URL.

## 12. Local Docker limitations

`Docker Desktop` on the developer laptop can run T-50 (build), T-51 (up with a
staging env), T-52 (smoke against localhost ports), the uploads half of T-53 and
the T-49 wrapper command. It **cannot** prove:

- DNS and public TLS/Let's Encrypt issuance;
- real Chapa webhook callbacks over HTTPS;
- BOA Selenium extraction unless the full Chromium verifier image is built (the
  2026-10-19 rehearsal used a slim verifier for the non-BOA gates);
- realistic multi-client load (the laptop is also running the IDE/dev stack).

The Redis-down drill is no longer in this list: T-30 runs against the compose
stack's own Redis 7 container, so it needs no maintenance window on the dev
stack. Record the rest as **staging-only** until a real host exists. Do not mark
TLS gates PASS from a localhost HTTP run.

## 13. Local compose rehearsal results (2026-10-19)

Actual run against `docker-compose.prod.yml` + `docker-compose.staging.yml` with
a generated staging-only `.env.production` (deleted afterwards; volumes removed
with `down -v`):

| Gate | Result | Notes |
|---|---|---|
| T-50 | PARTIAL | API + web images built; slim verifier (no Chromium) for the local gates; full Chromium verifier build deferred to the Hostinger VPS. |
| T-51 | PASS | 5/5 containers healthy; 11/11 migrations; readiness 200; web 200; verifier health ok. |
| T-52 | PASS | `deploy/smoke-test.sh` → 12 PASS / 0 FAIL. |
| T-53 | PARTIAL | HSTS/helmet headers + uploads persistence PASS; public TLS/domain pending. |
| T-49 wrapper | PASS | Backup dump + restore; 30/30 tables matched row counts; throwaway DB dropped. |
| T-30 | PASS | Redis stop → readiness 503 → refresh 401 (real signed cookie) → start → readiness 200. |

Command sequence used (from the repo root):

```bash
# after check:env --strict and compose config --quiet
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml \
  --env-file .env.production up -d --no-build
# T-51: compose ps / ready endpoint / _prisma_migrations query
# T-52:
deploy/smoke-test.sh http://127.0.0.1:4000 https://staging.lormentor.test
# T-53: curl headers; write a file under /app/apps/api/uploads; force-recreate
#       api; read it back; confirm the lor-mentor_uploads volume
# T-49:
REPO_DIR="$PWD" BACKUP_DIR=/tmp/lor-backups deploy/backup/pg-backup.sh
# then restore the dump into a throwaway DB and compare row counts
# T-30:
pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/t30-redis-drill.ps1
```

### Hostinger VPS deployment notes

The ordered, step-by-step VPS playbook (full verifier build, TLS/HSTS, the
deferred F-8/S-2/Chapa items, and the T-45/T-46/T-47/T-48 procedures) is
`HOSTINGER-DEPLOYMENT-PLAYBOOK.md`. The notes below are the short version.

- Build the **full verifier image on the VPS** (`docker compose -f
  docker-compose.prod.yml --env-file .env.production build verifier`). The
  Chromium layer is roughly 1 GB; allow at least 2 GB free disk and enough RAM
  for the build. Do not ship the slim verifier used for this laptop rehearsal:
  BOA extraction needs Chromium. (The slim image is kept locally only, tagged
  `lor-mentor-verifier:slim-local`; `:latest` is intentionally unset so a build
  cannot silently reuse it.)
- The VPS is also the first real staging host. Run §6 (T-53) and §7 (T-49)
  against it, then §8–§10 (T-46/T-47/T-48) with the college's load and outage
  profile.
- Point DNS at the VPS, issue TLS via host Nginx/Let's Encrypt, and run
  `deploy/smoke-test.sh https://api.<domain> https://<domain>` — this time the
  TLS case must run, not skip.
