# Lor Mentor — Production Deployment Runbook

Target: a single **Hostinger VPS** running Docker Compose, with **nginx**
installed on the host and Let's Encrypt TLS.

The runbook is ordered. Do not skip the pre-flight steps — several failures
downstream (certificates, cookie sessions, webhooks) are caused by DNS or
firewall work that was deferred.

> Replace `lormentor.com` with your real domain and `deploy` with your chosen
> sudo username throughout.

Related documents:

- [docs/deploy/SERVER-PREREQUISITES.md](docs/deploy/SERVER-PREREQUISITES.md) — hardware, OS, packages, firewall
- [docs/deploy/NGINX-SETUP.md](docs/deploy/NGINX-SETUP.md) — proxy, TLS, upload limits, timeouts
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) — every variable
- [INTEGRATIONS.md](INTEGRATIONS.md) — Chapa, Resend, Gemini, DNS
- [DATABASE_AND_BACKUPS.md](DATABASE_AND_BACKUPS.md) — migrations and restores
- [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) — go/no-go gate

---

## 1. Architecture

```text
                          Internet (HTTPS :443)
                                  │
                        ┌─────────▼──────────┐
                        │  nginx (host)      │  TLS termination, reverse proxy
                        │  lormentor.com     ├──────► 127.0.0.1:3000  web  (Next.js)
                        │  api.lormentor.com ├──────► 127.0.0.1:4000  api  (NestJS)
                        └────────────────────┘
                                  │  docker network: internal
   ┌───────────────┬─────────────┼───────────────┬──────────────────┐
   ▼               ▼             ▼               ▼                  ▼
  api            web         verifier        postgres            redis
 :4000          :3000        :8000        volume: pgdata      volume: redisdata
   │  volume: uploads (receipts, materials, generated PDFs)
   └── prisma migrate deploy runs before the API starts serving
```

- **Only** `web` and `api` publish ports, and only on `127.0.0.1`.
- Postgres, Redis and the verifier have **no host ports** and are reachable only
  on the internal Docker network.
- `prisma migrate deploy` runs automatically in the API entrypoint. It is
  forward-only and never resets data.

---

## 2. Pre-flight (before touching the VPS)

- [ ] Domain purchased and DNS access available.
- [ ] Chapa account created (test keys are issued immediately; live keys need KYC approval).
- [ ] Resend (or another SMTP provider) account created and the sending domain verified.
- [ ] Gemini API key created in Google AI Studio.
- [ ] A password manager available for the generated secrets.
- [ ] Decision made on `COOKIE_DOMAIN` (see §5).

Full account walkthroughs: [INTEGRATIONS.md](INTEGRATIONS.md).

---

## 3. Prepare the server

Follow [docs/deploy/SERVER-PREREQUISITES.md](docs/deploy/SERVER-PREREQUISITES.md).
It covers the OS check, package installs for Debian/Ubuntu **and**
RHEL/Alma/Rocky, swap, the firewall, the non-root deploy user, clock/NTP, and
the Hostinger-specific caveats.

Minimum outcome before continuing:

```bash
docker --version          # >= 24
docker compose version    # v2 plugin
nginx -v                  # >= 1.20
free -h                   # swap present
```

---

## 4. DNS (do this early — propagation is the usual delay)

Point these records at the VPS IPv4:

| Record | Type | Value |
|---|---|---|
| `lormentor.com` | A | `<VPS_IP>` |
| `www.lormentor.com` | A | `<VPS_IP>` (or CNAME to the apex) |
| `api.lormentor.com` | A | `<VPS_IP>` |

```bash
dig +short lormentor.com api.lormentor.com
```

Certbot cannot issue a certificate until these resolve.

---

## 5. Get the code and configure secrets

```bash
sudo mkdir -p /opt/lor-mentor && sudo chown deploy:deploy /opt/lor-mentor
git clone <repo-url> /opt/lor-mentor     # git clone, never a zip (see §11)
cd /opt/lor-mentor

cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Generate secrets:

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET  (must differ)
openssl rand -hex 24   # RECEIPT_VERIFIER_TOKEN
openssl rand -hex 24   # POSTGRES_PASSWORD  (URL-safe: no @ : / # % ?)
```

Then mirror `POSTGRES_PASSWORD` into `DATABASE_URL` — the two must always match.

**The API refuses to boot** unless these are set, non-placeholder and
non-localhost:

`DATABASE_URL` · `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` ·
`SMTP_HOST` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` ·
`API_PUBLIC_URL` · `WEB_PUBLIC_URL` · `CORS_ORIGIN`

Also required in practice:

- `COOKIE_DOMAIN=.lormentor.com` — the web host must read the auth cookies set
  by `api.lormentor.com`. Leaving it blank on a split-host deploy causes a
  login → redirect-to-login loop.
- `RECEIPT_VERIFIER_TOKEN` — compose always points the API at the verifier, so
  this must be set or validation fails.

**Chapa is optional at launch.** Leave `CHAPA_SECRET_KEY` and
`CHAPA_WEBHOOK_SECRET` both blank, or set both — a half-configured gateway is
rejected at boot. The primary payment path is bank transfer + manual review.

Validate before building:

```bash
npm run check:env -- .env.production --strict
```

`check:env` needs Node. If you deliberately keep Node off the server, run it
from a workstation against a copy of the file; the API's own boot validation
enforces the same rules.

---

## 6. Build and start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Builds peak above 2 GB of memory. On a 4 GB VPS with no swap this can be
OOM-killed — see SERVER-PREREQUISITES §1.

Watch startup:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

Expect all five services to reach `(healthy)`. The API logs
`Applying database migrations` before it serves traffic.

Seed once:

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:seed
docker compose -f docker-compose.prod.yml exec api \
  npm run db:seed:anatomy -- --reconcile --system heart
```

`SUPER_ADMIN_*` values in `.env.production` are consumed by this seed. Always
pass `--system heart` until the other systems complete faculty review.

Local checks on the box:

```bash
curl -s localhost:4000/api/v1/health        # {"status":"ok",...}
curl -s localhost:4000/api/v1/health/ready  # database + redis up
curl -sI localhost:3000                     # 200
```

---

## 7. nginx and HTTPS

Follow [docs/deploy/NGINX-SETUP.md](docs/deploy/NGINX-SETUP.md). Short version:

```bash
sudo cp deploy/nginx/lor-mentor.conf /etc/nginx/sites-available/lor-mentor
sudo ln -sf /etc/nginx/sites-available/lor-mentor /etc/nginx/sites-enabled/lor-mentor
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d lormentor.com -d www.lormentor.com -d api.lormentor.com
```

Certbot edits the **installed** file. Do not copy the repo template over it
afterwards or the TLS blocks are lost.

---

## 8. Post-deploy verification

Run every item; details in [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

```bash
bash deploy/smoke-test.sh https://api.lormentor.com https://lormentor.com
```

- [ ] HTTPS loads for both hosts with a valid certificate.
- [ ] Register → verification email arrives in the **inbox**.
- [ ] Verify → log in → cookie is `Secure` + `HttpOnly`; protected pages work.
- [ ] Forgot password → reset email arrives and works.
- [ ] AI tutor / flashcards / quiz generate.
- [ ] Bank transfer → reference verifies or lands in admin review.
- [ ] Uploaded receipt lands in admin review; approval generates a PDF.
- [ ] `docker compose restart` → uploads and database survive.

---

## 9. Backups and monitoring

Nightly database dump (14-day retention), plus off-box sync:

```bash
chmod +x deploy/backup/pg-backup.sh
sudo crontab -e
# 15 2 * * *  /opt/lor-mentor/deploy/backup/pg-backup.sh >> /var/log/lor-backup.log 2>&1
# 30 2 * * *  rclone sync /var/backups/lor-mentor remote:lor-mentor-backups
```

Uploads are **not** covered by that script — back up the volume separately.
Complete procedure and the restore drill: [DATABASE_AND_BACKUPS.md](DATABASE_AND_BACKUPS.md).

Log rotation is already configured per service in `docker-compose.prod.yml`
(json-file, 10 MB × 3). Do not also set a conflicting global driver in
`/etc/docker/daemon.json`.

Uptime monitoring: point a monitor at
`https://api.lormentor.com/api/v1/health/ready` and `https://lormentor.com`.

---

## 10. Updating and rollback

```bash
cd /opt/lor-mentor
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml logs --tail=100 api   # migrations ran
```

Rollback:

```bash
git checkout <previous-tag-or-sha>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

A code rollback does **not** undo a migration. If a release included a
destructive migration, restore the pre-release dump —
[DATABASE_AND_BACKUPS.md §6](DATABASE_AND_BACKUPS.md).

---

## 11. Operational cautions

- **Obtain the repo with `git clone`.** Prisma hashes `migration.sql` files
  exactly as they sit on disk; three are pinned to CRLF in `.gitattributes`. A
  zip download or an rsync that normalises line endings changes those hashes and
  breaks `prisma migrate deploy` on redeploy.
- **Do not run `docker compose down -v`.** The `-v` flag deletes `pgdata`,
  `redisdata` and `uploads`.
- **Keep `.env.production` mode 600** and never copy it into the repo.
- **Base images are digest-pinned.** Updates are deliberate: resolve a new
  digest with `docker buildx imagetools inspect <image>` and change it in a
  commit.
- **Single VPS is a single point of failure.** Acceptable for launch; revisit
  redundancy and managed PostgreSQL as usage grows.

## Known operational limits

- **Telebirr auto-verification will not work from a non-Ethiopian IP.** Those
  receipts fall back to manual admin review.
- **BOA receipts never expose a receiver account** → always manual review.
- **Chapa is dormant** until live keys are added (pending KYC).
- **Email deliverability depends on your DNS** (SPF/DKIM/DMARC) — see
  [INTEGRATIONS.md](INTEGRATIONS.md).
