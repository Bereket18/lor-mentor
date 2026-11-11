# Lor Mentor — Production Release Checklist

Ordered, copy-paste checklist for a **fresh Ubuntu 24.04 LTS VPS**. Run every
command on the VPS unless a step says otherwise. This is the short release
gate; the long-form explanations live in
[`10-DEPLOYMENT-GUIDE.md`](10-DEPLOYMENT-GUIDE.md).

> **Never** commit `.env.production`, print secret values into logs, or run
> `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against
> production. Migrations are forward-only; restore a backup instead.

## 0. Record the release

Fill this in before touching the server:

| Item | Value |
| --- | --- |
| Release commit | `<git rev-parse HEAD>` |
| Previous known-good commit | `<previous-commit>` |
| Pre-deploy DB backup | `<backup-file>` |
| Deploy operator / date | `<name> / <YYYY-MM-DD>` |
| Domains | `lormentor.com`, `www.lormentor.com`, `api.lormentor.com` |

## 1. Local / CI pre-flight

- [ ] Working tree is clean and the release commit is the intended one:
      `git status --short && git log -1 --oneline`.
- [ ] API build passes: `npm run build:api`.
- [ ] Web build passes: `npm run build:web`.
- [ ] API tests pass: `npm test --workspace=apps/api`.
- [ ] Web lint: `npm run lint --workspace=apps/web`. CI currently treats this as
      report-only; there are five pre-existing
      `react-hooks/set-state-in-effect` errors in untouched auth/layout files.
      Run targeted lint on any changed file and require exit 0.
- [ ] Playwright: `npm run e2e --workspace=apps/web` → **15 passed, 2 skipped**
      (the opt-in auth tests). With a temporary super admin in
      `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` and `E2E_RUN_AUTH=1`, both auth
      tests must pass.
- [ ] Both anatomy validators pass:
      `cd apps/web && node scripts/validate-anatomy-model.mjs --system heart`
      and `... --system urinary`.
- [ ] `npm audit --omit=dev` has been reviewed; no unplanned high/critical
      dependency changes are bundled into this release.
- [ ] Smoke script parses: `bash -n deploy/smoke-test.sh`.

## 2. Prepare the fresh Ubuntu host

- [ ] Ubuntu 24.04 LTS, at least 2 vCPU / 4 GB RAM / 20 GB free disk
      (the receipt verifier installs Chromium).
- [ ] DNS A records exist for `@`, `www`, and `api` and resolve to the VPS:
      `dig +short lormentor.com api.lormentor.com`.
- [ ] Update the OS: `sudo apt update && sudo apt upgrade -y`.
- [ ] Create the deploy user and allow sudo:
      `sudo adduser deploy && sudo usermod -aG sudo deploy`.
- [ ] Install your SSH key for `deploy`, confirm key login works, then disable
      root/password SSH in `/etc/ssh/sshd_config` and restart `ssh`.
- [ ] Firewall:
      `sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable`.
- [ ] Install Docker, Nginx, Certbot, fail2ban, and unattended-upgrades:
      `curl -fsSL https://get.docker.com | sudo sh`
      `sudo usermod -aG docker deploy`
      `sudo apt install -y nginx certbot python3-certbot-nginx fail2ban unattended-upgrades`
- [ ] Log out/in so the `docker` group applies; `docker ps` works without sudo.

## 3. Configure the release

- [ ] Clone and check out the recorded commit:
      `sudo mkdir -p /opt/lor-mentor && sudo chown $USER:$USER /opt/lor-mentor`
      `git clone <repo-url> /opt/lor-mentor && cd /opt/lor-mentor`
      `git checkout <release-commit>`
- [ ] Create the secrets file:
      `cp .env.production.example .env.production && chmod 600 .env.production`.
- [ ] Generate and paste distinct secrets:
      `openssl rand -hex 48` → `JWT_ACCESS_SECRET`
      `openssl rand -hex 48` → `JWT_REFRESH_SECRET`
      `openssl rand -hex 24` → `RECEIPT_VERIFIER_TOKEN`.
- [ ] Set at minimum:
      `NODE_ENV=production`,
      `WEB_PUBLIC_URL=https://lormentor.com`,
      `API_PUBLIC_URL=https://api.lormentor.com`,
      `APP_URL=https://lormentor.com`,
      `CORS_ORIGIN=https://lormentor.com`,
      `NEXT_PUBLIC_API_URL=https://api.lormentor.com`,
      `COOKIE_DOMAIN=.lormentor.com`,
      `TRUST_PROXY=1` (use `2` behind Cloudflare),
      `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and a matching
      `DATABASE_URL`,
      `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
      `RECEIPT_VERIFIER_TOKEN`, `REDIS_HOST`, `REDIS_PORT`.
- [ ] Leave `CHAPA_*` blank unless both Chapa keys are ready; a half-configured
      gateway fails validation.
- [ ] Run the preflight **with `--strict`**:
      `npm run check:env -- .env.production --strict`.
      `CORS_ORIGIN` must be an exact comma-separated allowlist; wildcards such
      as `*` and `https://*.example.com` are rejected. The same wildcard check
      runs at API boot in `env.validation.ts`.
- [ ] Validate Compose interpolation:
      `docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet`.
      If the daemon is unavailable, the file can still be checked with
      `--no-env-resolution` against `.env.production.example`; that does not
      validate the real secrets file.
- [ ] Confirm both nginx configs allow the API's largest upload:
      `client_max_body_size 30m` in the web and API locations (materials are
      capped at 25 MB by Multer; receipts at 10 MB).

## 4. Back up, build, start, and migrate

- [ ] **Pre-deploy backup (before any schema or code change).** On a first
      deploy the database is empty, so this is a no-op; on every later deploy
      this is mandatory. Stop writers first if you can:
      ```bash
      /opt/lor-mentor/deploy/backup/pg-backup.sh
      ls -lh /var/backups/lor-mentor/   # record the filename in the release ticket
      ```
      If the stack is not running yet, dump directly from the Postgres
      container/volume instead and record that filename.
- [ ] Build and start the stack:
      `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.
- [ ] Confirm migrations were applied. The API entrypoint
      (`apps/api/docker-entrypoint.sh`) runs
      `npx prisma migrate deploy` before the server starts, and
      `migrate deploy` is the only production-safe migrate command here; never
      run `migrate dev`, `migrate reset`, or `db push` against production. Watch
      the startup lines and then verify:
      ```bash
      docker compose -f docker-compose.prod.yml logs --tail=100 api   # expect "prisma migrate deploy" with no error
      docker compose -f docker-compose.prod.yml --env-file .env.production \
        exec api npx prisma migrate status                            # -> Database schema is up to date!
      ```
      To re-apply explicitly idempotently:
      `docker compose -f docker-compose.prod.yml --env-file .env.production exec api npx prisma migrate deploy`.
- [ ] **Post-deploy backup (after migrate + seed, before the smoke gate).** The
      schema and seed are now in their release state:
      `/opt/lor-mentor/deploy/backup/pg-backup.sh`.
- [ ] All five services are healthy:
      `docker compose -f docker-compose.prod.yml ps`.
- [ ] Local health checks:
      `curl -fsS http://127.0.0.1:4000/api/v1/health`
      `curl -fsS http://127.0.0.1:4000/api/v1/health/ready`
      `curl -fsSI http://127.0.0.1:3000/` (200 or the intentional `/login` redirect).

## 5. Seed core data and heart-only anatomy

- [ ] Seed plans, departments/years, and the first admin **once**:
      `docker compose -f docker-compose.prod.yml --env-file .env.production exec api npm run db:seed`.
- [ ] Seed/reconcile **heart only**. Always pass `--system heart`; running
      the anatomy seed without `--system` inserts every registered system,
      including urinary. Urinary must **never be created** in production until
      faculty review and `anatomy:review --confirm`:
      ```bash
      docker compose -f docker-compose.prod.yml --env-file .env.production \
        exec api npm run db:seed:anatomy -- --reconcile --system heart
      ```
- [ ] Before any `anatomy:review --confirm`, export and validate a read-only
      faculty packet for that system (see `10-DEPLOYMENT-GUIDE.md` §3.4.1). `--export` and
      `--validate` must not change teaching text, `isReviewed`, or
      `isPublished`; `--confirm` remains the separate sign-off step.
- [ ] Verify the published flags and that no urinary row exists:
      ```bash
      docker compose -f docker-compose.prod.yml --env-file .env.production \
        exec -T postgres sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
        "SELECT slug, \"isPublished\", \"isSample\", \"modelUrl\" FROM \"AnatomySystem\" ORDER BY slug;"'
      ```
      Expected: exactly one row — `heart | t | t | /models/anatomy/heart.v2.glb`.
      If a `urinary | f | f | ...` row appears, the wrong seed command was used;
      keep it unpublished and record the incident (do not delete anatomy rows
      ad hoc in production).
- [ ] Confirm the versioned model is served locally:
      `curl -fsSI http://127.0.0.1:3000/models/anatomy/heart.v2.glb`
      → `200`, `content-type: model/gltf-binary`.

## 6. Nginx and TLS

- [ ] Install the production vhost:
      `sudo cp deploy/nginx/lor-mentor.conf /etc/nginx/sites-available/lor-mentor`
      `sudo ln -s /etc/nginx/sites-available/lor-mentor /etc/nginx/sites-enabled/`
      `sudo rm -f /etc/nginx/sites-enabled/default`.
- [ ] Replace `lormentor.com` with the real domain in the vhost if different.
- [ ] Syntax check and reload: `sudo nginx -t && sudo systemctl reload nginx`.
      On a machine without nginx, `bash deploy/nginx/test-nginx-config.sh`
      syntax-checks both configs in the CI nginx image; local runs skip with a
      notice, which is not a pass.
- [ ] Issue certificates:
      `sudo certbot --nginx -d lormentor.com -d www.lormentor.com -d api.lormentor.com`
      (choose redirect-to-HTTPS).
- [ ] Confirm renewal: `sudo certbot renew --dry-run`.
- [ ] Re-check Nginx after Certbot edits: `sudo nginx -t`.
- [ ] Verify HTTPS and headers:
      `curl -fsSI https://api.lormentor.com/api/v1/health`
      `curl -fsSI https://lormentor.com/models/anatomy/heart.v2.glb`
      → `cache-control: public, max-age=31536000, immutable` and
      `content-type: model/gltf-binary`.
- [ ] Only after HTTPS is verified end-to-end, uncomment the HSTS lines in the
      vhost, then `sudo nginx -t && sudo systemctl reload nginx`.

## 7. Production smoke test

- [ ] Run the automated gate:
      ```bash
      bash deploy/smoke-test.sh https://api.lormentor.com https://lormentor.com
      ```
      Expected: exit `0` and `FAIL: 0`. Over HTTPS with the strict cache
      assertion, the passing count is **20** (2 health + 3 headers + 1 TLS +
      2 auth + 1 validation + 1 enumeration + 2 CORS + 1 rate-limit + 7
      anatomy). A local Next dev server behind no nginx cannot satisfy the
      immutable model header: run it as
      `SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000`,
      which reports **18** passing (the cache check is skipped) and must still
      show `FAIL: 0`.
- [ ] Manual journey on the real domain: register → verify email → login →
      logout → forgot password → protected route redirect.
- [ ] Anatomy Lab: heart loads, urinary is absent/unpublished, attribution page
      shows the BodyParts3D credit line.
- [ ] Anatomy role gate: STUDENT and TEACHER can open `/anatomy`; ADMIN and
      SUPER_ADMIN get **403** from `/api/v1/anatomy/systems` (and the detail/AI
      routes) and are redirected to `/admin` by the web app.
- [ ] Payments: bank-transfer reference/upload → admin review → approval → PDF
      receipt. If Chapa is live, one real payment settles.
- [ ] Admin sees the payment and can approve it; no 5xx in `docker compose logs`.

## 8. Backups

- [ ] Create the backup directory and make it writable by the deploy user:
      `sudo mkdir -p /var/backups/lor-mentor && sudo chown deploy:deploy /var/backups/lor-mentor`.
- [ ] Run one backup now:
      `/opt/lor-mentor/deploy/backup/pg-backup.sh`.
- [ ] Verify it is non-empty and valid gzip:
      `ls -lh /var/backups/lor-mentor/ && gzip -t /var/backups/lor-mentor/<file>.sql.gz`.
- [ ] Schedule it (as `deploy`):
      `crontab -e`
      `15 2 * * * /opt/lor-mentor/deploy/backup/pg-backup.sh >> /var/log/lor-backup.log 2>&1`.
- [ ] Configure off-box durability (rclone/S3) and confirm a copy lands outside
      the VPS.
- [ ] Rehearse a restore into a scratch database; record the result.
- [ ] Cap Docker logs in `/etc/docker/daemon.json`
      (`max-size: 10m`, `max-file: 3`) and restart Docker.

## 9. Rollback plan

- [ ] Record the failing commit, the previous known-good commit, and the
      pre-deploy backup filename before changing anything.
- [ ] Code rollback:
      `cd /opt/lor-mentor && git checkout <previous-commit>`
      `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.
- [ ] Check migrations after rollback:
      `docker compose -f docker-compose.prod.yml --env-file .env.production exec api npx prisma migrate status`.
- [ ] If the old code cannot run against the already-applied schema, restore
      the pre-deploy backup instead of editing migrations:
      ```bash
      gunzip -c /var/backups/lor-mentor/<file>.sql.gz | \
        docker compose -f docker-compose.prod.yml --env-file .env.production \
        exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
      ```
      Stop writers and take a fresh backup of the current state first.
- [ ] Anatomy model rollback: restore the previous versioned `modelUrl`
      (for example `heart.v1.glb`) in the registry data, rebuild, then:
      ```bash
      docker compose -f docker-compose.prod.yml --env-file .env.production \
        exec api npm run db:seed:anatomy -- --reconcile --system heart
      ```
      Never overwrite an old `.vN.glb`; it is the rollback asset.
- [ ] Re-run the smoke test and health checks after any rollback.

## 10. Owner-only gates (cannot be closed by an automated check)

- [ ] **DBCLS licence:** email DBCLS (the BodyParts3D maintainer, contact
      published on the dataset licence page) asking for written confirmation of
      whether the geometry is CC BY 4.0 or the legacy CC BY-SA 2.1 Japan for a
      commercial medical-education product. Record the ticket/reference and the
      reply. Commercial release remains blocked until this is resolved; do not
      change licence wording before the written answer.
- [ ] **Secret rotation (S-2):** rotate every secret that was ever committed,
      shared, or used in staging. At minimum, by variable name:
      `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RECEIPT_VERIFIER_TOKEN`,
      `POSTGRES_PASSWORD` (and the `DATABASE_URL` password), `SMTP_PASS`,
      `SUPER_ADMIN_PASSWORD`, `GEMINI_API_KEY`, `CHAPA_SECRET_KEY`,
      `CHAPA_WEBHOOK_SECRET`. Update `.env.production`, restart the affected
      containers, and re-test. Note that rotating `JWT_ACCESS_SECRET` /
      `JWT_REFRESH_SECRET` logs every user out, and rotating
      `RECEIPT_VERIFIER_TOKEN` must be done on both the API and verifier
      together.
- [ ] **Resend / email (F-8):** domain verified (SPF, DKIM, DMARC), `SMTP_FROM`
      uses the verified domain (not `@resend.dev`), and a real non-owner
      registration + password reset arrive in the inbox.
- [ ] **Chapa (if enabled):** live keys and webhook secret installed, one small
      real payment settles, and a forged/unsigned webhook is rejected.
- [ ] **TLS/DNS ownership:** registrar and DNS access documented, Certbot
      renewal monitored, uptime monitor points at
      `https://api.lormentor.com/api/v1/health/ready`.
- [ ] **Backup ownership:** off-box credentials stored in the password manager,
      retention agreed, and a restore rehearsal signed off.
- [ ] **Migration/verifier evidence:** migration replay evidence recorded and
      the production verifier image (Chromium) confirmed with
      `docker compose ... exec verifier chromium --version`.
- [ ] **Legal/privacy:** terms, privacy policy, refund policy, and institutional
      sign-off completed.

## 11. Release sign-off

- [ ] All boxes above are checked, or every exception is written down with an
      owner and a date.
- [ ] Smoke test is green, backups are running, and the rollback commit/backup
      are recorded in the release ticket.
- [ ] Only after the 24–48 hour private soak is clean, remove the staging
      password gate from the Certbot-managed vhost and reload Nginx.
