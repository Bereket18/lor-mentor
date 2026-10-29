# Lor Mentor — Production Release Checklist

Ordered, copy-paste checklist for a **fresh Ubuntu 24.04 LTS VPS**. Run every
command on the VPS unless a step says otherwise. This is the short release
gate; the long-form explanations live in [`GO-LIVE.md`](./GO-LIVE.md).

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
- [ ] Web lint passes: `npm run lint --workspace=apps/web`.
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
      `CORS_ORIGIN` must be the exact web origin; the preflight currently does
      **not** reject `CORS_ORIGIN=*`, so check it by eye.
- [ ] Validate Compose interpolation:
      `docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet`.

## 4. Build, start, and migrate

- [ ] Build and start the stack:
      `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.
- [ ] All five services are healthy:
      `docker compose -f docker-compose.prod.yml ps`.
- [ ] API logs show no migration/startup errors:
      `docker compose -f docker-compose.prod.yml logs --tail=100 api`.
- [ ] Migrations are current:
      `docker compose -f docker-compose.prod.yml --env-file .env.production exec api npx prisma migrate status`
      → `Database schema is up to date!`.
- [ ] Local health checks:
      `curl -fsS http://127.0.0.1:4000/api/v1/health`
      `curl -fsS http://127.0.0.1:4000/api/v1/health/ready`
      `curl -fsSI http://127.0.0.1:3000/` (200 or the intentional `/login` redirect).

## 5. Seed core data and heart-only anatomy

- [ ] Seed plans, departments/years, and the first admin **once**:
      `docker compose -f docker-compose.prod.yml --env-file .env.production exec api npm run db:seed`.
- [ ] Seed/reconcile **heart only** (urinary stays an unpublished draft):
      ```bash
      docker compose -f docker-compose.prod.yml --env-file .env.production \
        exec api npm run db:seed:anatomy -- --reconcile --system heart
      ```
- [ ] Verify the published flags read-only:
      ```bash
      docker compose -f docker-compose.prod.yml --env-file .env.production \
        exec -T postgres sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
        "SELECT slug, \"isPublished\", \"isSample\", \"modelUrl\" FROM \"AnatomySystem\" ORDER BY slug;"'
      ```
      Expected: `heart | t | t | /models/anatomy/heart.v2.glb`; `urinary`
      (if present) `f | f | /models/anatomy/urinary.v1.glb`. Do not publish
      urinary until faculty review and `anatomy:review --confirm`.
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
      Expected: `PASS: 18 FAIL: 0`, exit `0`. The model cache assertion is
      strict by default because production has Nginx in front. For a local
      Next dev server only, use `SMOKE_STRICT_CACHE=0`.
- [ ] Manual journey on the real domain: register → verify email → login →
      logout → forgot password → protected route redirect.
- [ ] Anatomy Lab: heart loads, urinary is absent/unpublished, attribution page
      shows the BodyParts3D credit line.
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

- [ ] **DBCLS licence:** obtain written clarification of whether BodyParts3D
      geometry is CC BY 4.0 or the legacy CC BY-SA 2.1 Japan. Commercial release
      remains blocked until this is resolved; do not change licence wording
      before the written answer.
- [ ] **Secret rotation (S-2):** rotate every secret that was ever committed,
      shared, or used in staging; update `.env.production`, restart the affected
      services, and re-test login/email/payments. Rotating JWT secrets logs
      every user out.
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
