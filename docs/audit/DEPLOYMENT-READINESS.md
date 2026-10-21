# LOR MENTOR — DEPLOYMENT READINESS

**Phase:** Six — DevOps and Deployment
**Date:** 2026-10-17
**Pass:** static review + execution addendum (Rev 2, 2026-10-17). `docker compose config` validated (exit 0); **DR-3 and DR-4 fixed and verified**. Docker compose **build/up, TLS, and staging smoke tests remain NOT executed** (no server; host memory constraints — see `TEST-RESULTS.md` F-7).

## 1. Deployment Shape

- **Compose:** `docker-compose.prod.yml` (name `lor-mentor`) — services `postgres` (16-alpine), `redis` (7-alpine, AOF), `verifier` (Python receipts), `api` (NestJS), `web` (Next.js). `web`/`api` publish on **127.0.0.1 only**; Postgres/Redis are internal-only. Named volumes `pgdata`, `redisdata`, `uploads`. Healthchecks on postgres/redis/verifier/api (api `/health`).
- **Staging overlay:** `docker-compose.staging.yml` layers memory caps + env labels on the prod file; `NODE_ENV` stays `production` on purpose.
- **Env:** `.env.production` (git-ignored) is both the compose `--env-file` and each service's `env_file`. Template: `.env.production.example` (all secrets are `CHANGE_ME_*`).
- **Images:**
  - `apps/api/Dockerfile` — multi-stage, `node:24-slim`, builds Prisma client + `nest build`; runtime keeps devDeps **on purpose** because `docker-entrypoint.sh` runs `npx prisma migrate deploy` before `node dist/src/main`. Runs as `node` user; `uploads/` created + chowned.
  - `apps/web/Dockerfile` — multi-stage; `NEXT_PUBLIC_API_URL` passed as a **build arg** (inlined into the client bundle); copies `.next/standalone`, static, public; runs `node apps/web/server.js` as `node`.
- **TLS / reverse proxy:** host Nginx (`deploy/nginx/lor-mentor.conf`) proxies `lormentor.com` → `:3000` and `api.lormentor.com` → `:4000`, adds security headers, uses `certbot --nginx` for TLS. `X-Forwarded-Proto` is forwarded so the API builds HTTPS callback URLs.
- **Migrations:** applied automatically on API container start via `prisma migrate deploy` (production-safe). This means the new `20261017120000_add_performance_indexes` migration will run on the next deploy.

## 2. Configuration Checklist (must be verified on the VPS)

| Item | Requirement | Status |
|---|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥32 chars, high entropy, **different** | Template present; enforce at fill time |
| `DATABASE_URL` / `POSTGRES_*` | Real strong password; host = `postgres` | Template present |
| `SMTP_*` | Required in prod (validation) + verified sending domain (SPF/DKIM) | Template present |
| `CHAPA_*` | All-or-nothing; live keys only when ready | Template present (optional) |
| `RECEIPT_VERIFIER_TOKEN` | ≥32 chars if verifier enabled | Template present |
| `COMPANY_BANK_ACCOUNTS` | Real receiving account numbers if verifier enabled | Template present |
| `REDIS_HOST/PORT` | `redis:6379` in compose | Set by compose |
| `SENTRY_DSN` | Set to capture production errors | **Not in template — add** |
| `WEB_PUBLIC_URL`/`API_PUBLIC_URL`/`CORS_ORIGIN` | Real HTTPS, no localhost | Template present |
| `SUPER_ADMIN_*` | Strong unique password, stored in a manager | Template present |

## 3. Operational Gaps

| ID | Gap | Impact | Recommendation |
|---|---|---|---|
| DR-1 | **`uploads` volume is not backed up** | Restore loses bank-receipt images + generated PDF receipts (proof of payment) | Extend `pg-backup.sh` (or add a job) to archive the `uploads` volume off-box |
| DR-2 | **DB backup is not scheduled by the stack** | Relies on a manual host crontab install | Document/automate the cron entry; restore procedure verified locally (T-49 equivalent, row counts match) — script wrapper itself is docker-bound, untested |
| DR-3 | ~~**`web` has no healthcheck**~~ **FIXED (Rev 2)** | Orchestrator could not detect a broken web container | Healthcheck added to `docker-compose.prod.yml` (HTTP fetch `:3000`); `docker compose config` validates |
| DR-4 | ~~**Readiness checks DB only, not Redis**~~ **FIXED (Rev 2)** | A dead Redis was not surfaced | `/health/ready` now pings Redis via `RedisHealthService`; live-verified `{"status":"ready","database":"up","redis":"up"}` + 4/4 unit tests |
| DR-5 | **No CI/CD deploy job** | CI builds/tests but does not deploy | Add a gated deploy workflow or document a manual runbook |
| DR-6 | **Migrations not run in CI** | Schema/migration drift can reach prod undetected | Add T-10 (drift diff) + T-16 (migrate on disposable DB) to CI |
| DR-7 | `NEXT_PUBLIC_API_URL` must be a **build arg** | A wrong value ships a broken client bundle | Verify the build arg equals the public API origin |
| DR-8 | Secrets likely need rotation | See SECURITY-AUDIT S-2 | Rotate before production |

## 4. Deployment Runbook (to execute)

1. Provision VPS, install Docker + Nginx + certbot.
2. `git clone` on the server; `cp .env.production.example .env.production`, fill **all** `CHANGE_ME_*`, `chmod 600`.
3. Generate secrets: `openssl rand -hex 48` (JWT ×2, distinct), `openssl rand -hex 24` (verifier token), strong DB + super-admin passwords.
4. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.
5. Wait for healthy; run `npm run db:seed` inside the api container (or `prisma db seed`) with `SUPER_ADMIN_*` set.
6. Install `deploy/nginx/lor-mentor.conf`, `nginx -t`, reload; `certbot --nginx -d lormentor.com -d www.lormentor.com -d api.lormentor.com`.
7. Run `deploy/smoke-test.sh https://api.lormentor.com https://lormentor.com`.
8. Install the DB backup cron; add the uploads-volume backup.
9. Set `SENTRY_DSN`; confirm an event arrives.
10. Tear down / relaunch once to prove migrations + `uploads` volume persist.

## 5. Rollback

- Images are rebuilt from source; keep the previous tag/commit to redeploy.
- Migrations applied this pass are additive (`CREATE INDEX`), so a rollback does not require dropping them (harmless to leave in place).
- DB restore via the `pg-backup.sh` dump (verify T-49 first).

## 6. Verdict

The deployment **design** is solid and production-oriented (internal-only services, host TLS, automatic safe migrations, health checks, backup script, staging overlay, smoke test). Rev 2 closed **DR-3** (web healthcheck) and **DR-4** (Redis readiness) and validated the compose file; the DB backup/restore procedure was verified locally by an equivalent dump/restore (T-49). Still open: **DR-1** (uploads backup), scheduling/CI items (DR-2/DR-5/DR-6), and secret rotation (DR-8). Compose build/up, TLS, and staging smoke tests remain **NOT VERIFIED** (no server; host memory limits — see `TEST-RESULTS.md` F-7).
