# Lor Mentor — Go-Live Guide (follow top to bottom)

This is the single, beginner-friendly guide to take Lor Mentor from an empty
Hostinger VPS to a live, secure production site. Run every command **on the VPS**
unless it says otherwise. Don't skip steps.

> **A note on PM2/Node:** your original checklist mentioned installing Node.js +
> PM2 directly. We deploy with **Docker Compose** instead — it packages Node, the
> Python service, Postgres, and Redis together, auto-restarts crashed containers,
> and starts everything on reboot. So there's no separate Node/PM2 install; Docker
> does that job more reliably. Everything below reflects the Docker approach.
>
> **Audit gates & deferred items:** secret rotation (S-2), Resend domain
> verification (F-8), Chapa live setup, and the remaining audit gates
> (T-45 evidence, T-46/T-47/T-48, full verifier build, real TLS) are consolidated
> in **`docs/audit/HOSTINGER-DEPLOYMENT-PLAYBOOK.md`**. This guide gets the site
> running; the playbook closes the production gates.

---

## Before you start — fill in YOUR values

Write these down; you'll paste them throughout:

| Thing | Example | Yours |
|---|---|---|
| Domain | `lormentor.com` | ______ |
| VPS public IP | `203.0.113.45` | ______ |
| Sudo username you'll create | `deploy` | ______ |
| Repo URL | `https://github.com/Bereket18/lor-mentor.git` | ______ |

If you don't have a domain yet, buy one (Hostinger sells them) — you need it for
HTTPS, email, and Chapa webhooks.

---

# SECTION 1 — Prepare the Hostinger VPS

### 1.1 Pick the OS
In the Hostinger panel (VPS → Operating System), choose **Ubuntu 24.04 LTS**.
*Why:* it's the long-term-support release; all commands below assume it.

### 1.2 First login
Hostinger emails you a root password (or you set one). From your own computer:
```bash
ssh root@YOUR_VPS_IP
```
*What this does:* logs you into the server as the all-powerful `root` user. We'll
stop using root shortly because a mistake as root can destroy the server.

### 1.3 Update the system
```bash
apt update && apt upgrade -y
```
*Why:* installs the latest security patches before exposing anything.

### 1.4 Create a non-root user
```bash
adduser deploy            # set a password when prompted
usermod -aG sudo deploy   # allow it to run admin commands with sudo
```
*Why:* day-to-day work should never be done as root. `sudo` asks for confirmation,
which prevents accidental damage and limits what a compromised session can do.

### 1.5 Set up SSH key login (and turn off passwords)
On **your own computer** (not the server), if you don't already have a key:
```bash
ssh-keygen -t ed25519        # press Enter through the prompts
ssh-copy-id deploy@YOUR_VPS_IP
```
Test it: `ssh deploy@YOUR_VPS_IP` should log in **without** a password.

*Why:* SSH keys are far stronger than passwords and can't be brute-forced. Now
harden SSH (still in the root session):
```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```
> ⚠️ **Before closing root**, open a NEW terminal and confirm `ssh deploy@YOUR_VPS_IP`
> works. If you skip this and the key is wrong, you'll lock yourself out.

### 1.6 Firewall (UFW)
```bash
sudo ufw allow OpenSSH     # port 22 — so you don't lock yourself out
sudo ufw allow 80/tcp      # HTTP (needed for the SSL certificate challenge)
sudo ufw allow 443/tcp     # HTTPS (your real traffic)
sudo ufw --force enable
sudo ufw status
```
*Why:* a firewall blocks every port except the ones you explicitly open — shrinking
the attack surface to just SSH + web.

### 1.7 Brute-force protection + auto security updates
```bash
sudo apt install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
```
*Why:* `fail2ban` bans IPs that repeatedly fail SSH login; `unattended-upgrades`
keeps security patches current without you remembering to.

### 1.8 Install Docker + Nginx + Certbot
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy          # run docker without sudo
sudo apt install -y nginx certbot python3-certbot-nginx apache2-utils
```
Then **log out and back in** so the docker group applies. Verify: `docker ps`.

*What each does:* **Docker** runs your app containers. **Nginx** is the public web
server that terminates HTTPS and forwards traffic to your app. **Certbot** gets
free SSL certificates. **apache2-utils** provides `htpasswd` for the private soak.

---

# SECTION 2 — Point your domain (DNS)

In your domain's DNS zone (Hostinger → Domains → DNS/Nameservers) add:

| Type | Name | Value |
|---|---|---|
| A | `@` | YOUR_VPS_IP |
| A | `www` | YOUR_VPS_IP |
| A | `api` | YOUR_VPS_IP |

*Why:* this maps your domain names to the server. `api.` is a separate subdomain
for the backend. Verify (wait a few minutes): `dig +short lormentor.com api.lormentor.com`
— both should print your IP.

> DNS must resolve **before** you can get SSL or receive Chapa webhooks. You'll
> keep the public out during testing with a password (Section 5), not by delaying
> DNS.

### 2.1 Cookie domain and trusted proxy (split-host deployments)

The web app is served from `lormentor.com` and the API from
`api.lormentor.com`. The web edge guard (`apps/web/src/proxy.ts`) and the
`/api/proxy` route read auth cookies on the **web host**, so the API must set a
shared parent-domain cookie:

```env
COOKIE_DOMAIN=.lormentor.com
TRUST_PROXY=1
```

- `COOKIE_DOMAIN` is optional for a single-host deployment, but **required** for
  `api.<domain>` + `<domain>`. Use the parent domain (leading dot is accepted).
  Without it, login can succeed at the API while every protected web page
  redirects to `/login`.
- `TRUST_PROXY` tells Express which proxies may supply `X-Forwarded-For`. The
  standard nginx setup is one hop (`1`, also the production default when
  blank); use `2` if Cloudflare is in front of nginx. The **recommended** form
  is an explicit list of trusted addresses/subnets, e.g.
  `TRUST_PROXY=loopback,172.18.0.0/16` (nginx on loopback plus the Docker
  bridge), which also constrains which peers may set the header. Never use
  `true`; either form prevents clients from spoofing their address. Verify it
  after go-live by sending one request and reading the client IP the API
  recorded in `AuditLog.ipAddress` (the exact steps are in
  [payments.md](payments.md) 1.6.1). A wrong value collapses every per-IP rate
  limit into one shared bucket.
- The application's rate-limit counters are **in memory**: they are correct for
  the single `api` service in `docker-compose.prod.yml`, but if you ever run
  more than one API instance you must configure shared (Redis) throttler
  storage first, or each instance will enforce its own copy of the limit.

---

# SECTION 3 — Deploy the application

### 3.1 Get the code
```bash
sudo mkdir -p /opt/lor-mentor && sudo chown $USER:$USER /opt/lor-mentor
git clone YOUR_REPO_URL /opt/lor-mentor
cd /opt/lor-mentor
```
*Why `/opt`:* the conventional place for self-hosted applications.

### 3.2 Create the production secrets file
```bash
cp .env.production.example .env.production
chmod 600 .env.production      # only you can read it
nano .env.production
```
Generate strong secrets (run each, paste the output into the file):
```bash
openssl rand -hex 48    # → JWT_ACCESS_SECRET
openssl rand -hex 48    # → JWT_REFRESH_SECRET  (must be DIFFERENT)
openssl rand -hex 24    # → RECEIPT_VERIFIER_TOKEN
```
Fill in, at minimum:
- `WEB_PUBLIC_URL=https://lormentor.com`, `API_PUBLIC_URL=https://api.lormentor.com`,
  `APP_URL`, `API_URL`, `CORS_ORIGIN=https://lormentor.com`,
  `NEXT_PUBLIC_API_URL=https://api.lormentor.com`
- `COOKIE_DOMAIN=.lormentor.com` (required for the web/API split; see 2.1)
- `TRUST_PROXY=1` (one nginx hop; use `2` behind Cloudflare; blank defaults to 1
  in production)
- `POSTGRES_PASSWORD=` (a strong password) and mirror it inside `DATABASE_URL`
- `GEMINI_API_KEY=` (from Google AI Studio)
- SMTP_* → **Section 4**
- `COMPANY_BANK_ACCOUNTS=` → the school's receiving account number(s) for direct
  bank transfers
- Chapa keys → leave blank for now (**Section 6**)

*Why it matters:* the app **refuses to start** if a required secret is missing or
still points at `localhost`. This is deliberate — it stops you shipping a broken or
insecure config. Secrets live only in this file (never in the code or Git).

### 3.3 Build and start everything (private soak mode)
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml \
  --env-file .env.production up -d --build
```
*What happens:* Docker builds the web, api, and verifier images and starts all five
services. The API container **automatically runs database migrations** before it
starts serving. This takes a few minutes the first time.

> **Verifier note:** the verifier image installs Chromium (~1 GB) for BOA
> receipts — allow **≥ 2 GB RAM and ~20 GB free disk** on the VPS. Confirm it
> landed:
> `docker compose -f docker-compose.prod.yml exec verifier chromium --version`.
> Never deploy the laptop's `slim-local` image.

Watch it come up:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api      # Ctrl-C to stop watching
```

### 3.4 Apply migrations and seed the initial data (once)

The API container entrypoint runs `prisma migrate deploy` before the server
starts. Confirm the result and that the schema is current:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npx prisma migrate status
# expected: "Database schema is up to date!"
```
Migrations are forward-only in production. Never run `prisma migrate dev`,
`prisma migrate reset`, or `prisma db push` against production; restore a backup
instead if a deploy must be reversed (see "Rollback" below).

Seed the subscription plans, departments/years, and first admin user:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npx ts-node prisma/seed.ts
```

Then reconcile the Anatomy Lab registry (heart + urinary):
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npm run db:seed:anatomy -- --reconcile
# Or limit the run to one system:
#   ... -- --reconcile --system heart
#   ... -- --reconcile --system urinary
```
`--reconcile` refreshes system metadata and derived citation, sort-order, and
related-structure fields. It never overwrites `name`, `latinName`, `summary`,
`location`, `function`, `bloodSupply`, `clinicalNotes`, `meshName`, or
`isReviewed`. `--prune-stale` is destructive: take a database backup, read the
printed plan, and only then run it; the script refuses to delete
faculty-reviewed rows.

### 3.4.1 Anatomy model checks (CI or a Node checkout)

Run both validators before every deploy that touches an Anatomy Lab asset. CI
runs them on `main`, `integration/**`, and `feature/**`; you can run them from a
local checkout with Node 20+:

```bash
cd apps/web
node scripts/validate-anatomy-model.mjs --system heart
node scripts/validate-anatomy-model.mjs --system urinary
```

They verify the GLB structure, manifest hashes, source provenance, and the
immutable-filename rule; the API test suite covers the seed-to-model contract.
Shipped models must be named
`<name>.vN.glb`; `published-models.json` pins each shipped SHA-256, so changing
bytes under an existing filename fails validation. Publish a new version and
register it instead. Nginx gives only versioned `.vN.glb` files the one-year
immutable cache header.

Faculty sign-off is separate from model validation. First export a read-only
review packet. The JSON packet has one blank decision per structure and records
a SHA-256 of the current teaching text, so a stale packet cannot be signed off:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npm run anatomy:review -- --system urinary \
    --export /tmp/urinary-review.json
docker compose -f docker-compose.prod.yml --env-file .env.production \
  cp api:/tmp/urinary-review.json ./urinary-review.json
# A Markdown copy is also available with --export urinary-review.md.
```

The faculty reviewer fills in `review.reviewer`, `review.reviewDate`, and each
`review.decisions.<slug>` (`approved`, `approved-with-edits`, or `rejected`;
rejections need a comment). Validate the completed file and copy it back into
the API container:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  cp ./urinary-review.json api:/tmp/urinary-review.json
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npm run anatomy:review -- --system urinary \
    --validate /tmp/urinary-review.json
```

`--export` and `--validate` are read-only: they never change teaching text,
`isReviewed`, or `isPublished`, and they refuse to run with `--confirm` or
`--revoke`. Review the packet, then run the sign-off with an explicit
confirmation before publishing:

```bash
# Dry run first (no --confirm): prints the review plan without writing.
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npm run anatomy:review -- --system urinary \
    --reviewer "Dr Example" --date 2026-10-28

# Apply after the faculty member signs off.
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npm run anatomy:review -- --system urinary \
    --reviewer "Dr Example" --date 2026-10-28 --confirm
```

### 3.5 Quick local check (before Nginx)
```bash
curl -s localhost:4000/api/v1/health          # {"status":"ok",...}
curl -s localhost:4000/api/v1/health/ready     # {"status":"ready","database":"up"}
curl -sI localhost:3000                         # HTTP/1.1 200 OK
```
If any fail, check `docker compose logs <service>`.

### 3.6 Put Nginx in front (private, password-protected)
```bash
sudo htpasswd -c /etc/nginx/.htpasswd preview        # choose a password to test with
sudo cp deploy/nginx/lor-mentor-staging.conf /etc/nginx/sites-available/lor-mentor
sudo nano /etc/nginx/sites-available/lor-mentor      # replace lormentor.com with your domain
sudo ln -s /etc/nginx/sites-available/lor-mentor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
*What this does:* Nginx now forwards `lormentor.com` → the web app and
`api.lormentor.com` → the backend. The **frontend is password-locked** during
testing; the API stays open (it's protected by login tokens, and Chapa/SSL need to
reach it).

### 3.7 Enable HTTPS
```bash
sudo certbot --nginx -d lormentor.com -d www.lormentor.com -d api.lormentor.com
```
Follow the prompts (enter your email, agree, choose redirect-to-HTTPS). Certbot
edits the Nginx config to add the secure `:443` blocks and sets up **auto-renewal**
(a systemd timer). Confirm renewal works: `sudo certbot renew --dry-run`.

*Why:* HTTPS encrypts all traffic. Browsers, email links, and Chapa all require it.

### 3.8 Reboot resilience (already handled)
All containers use `restart: unless-stopped`, and Docker starts on boot, so the
whole stack comes back automatically after a reboot. Nginx and fail2ban are systemd
services and also auto-start. Test it: `sudo reboot`, wait a minute, reconnect, and
check `docker compose ps`.

### 3.9 First-boot hardening checklist

Run once after the stack is up, before opening the site to users:

- [ ] `.env.production` is complete and `npm run check:env -- .env.production`
      passes (run from a Node 20+ checkout).
- [ ] `TRUST_PROXY` matches the real topology (`1` for nginx only, `2` behind
      Cloudflare). Confirm API logs/rate-limit keys show the client address, not
      `127.0.0.1`.
- [ ] `COOKIE_DOMAIN` is the shared parent domain. Log in on the web host, confirm
      the browser stores the auth cookies for that domain, and confirm
      `/api/proxy/*` calls are authenticated.
- [ ] `npx prisma migrate status` reports "Database schema is up to date!" and no
      failed migrations.
- [ ] `prisma/seed.ts` ran; the first admin can log in.
- [ ] `db:seed:anatomy -- --reconcile` ran. Heart is published; urinary remains
      an unpublished draft until faculty review and `anatomy:review --confirm`.
- [ ] Both anatomy model validators pass in CI (or locally), and
      `published-models.json` contains the current versioned filenames/hashes.
- [ ] `sudo nginx -t` passes; security headers are present; all HSTS lines are
      still commented until HTTPS is verified, then uncomment them together.
- [ ] `/api/v1/health` and `/api/v1/health/ready` return 200; the web app returns
      200; login, refresh, and logout work.
- [ ] Docker images were built from the deployed commit
      (`docker compose -f docker-compose.prod.yml build api web`), and containers
      are healthy.
- [ ] `npm audit --omit=dev` was reviewed for high/critical findings; fixes are
      planned deliberately, not applied blind to production.
- [ ] Nightly backups are scheduled and a restore has been rehearsed; record the
      last good commit and backup filename for rollback.

---

# SECTION 4 — Production email (verification + password reset)

Your app already sends real emails with expiring tokens — you only need a provider
and DNS. Full detail in `docs/deploy/email-setup.md`; the short version:

1. **Choose a provider** — **Resend** is recommended (simplest, great delivery).
   Alternatives: SendGrid, Mailgun, AWS SES.
2. **Create the account**, add your domain `lormentor.com`.
3. **Add the DNS records they give you** in your Hostinger DNS zone — three kinds:
   - **SPF** (TXT on `@`): authorizes them to send as your domain.
   - **DKIM** (CNAME/TXT): cryptographically signs your mail so it isn't marked spam.
   - **DMARC** (TXT on `_dmarc`, start with `p=none`): policy + reports.
   Click **Verify** in the provider; wait until it shows *Verified*.
4. **Get SMTP credentials** and put them in `.env.production`:
   ```env
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=587
   SMTP_USER=resend
   SMTP_PASS=your_api_key           # secret — never commit
   SMTP_FROM=Lor Mentor <no-reply@lormentor.com>
   ```
5. Reload the API: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d api`
6. **Test:** register a new account → the verification email should arrive in the
   **inbox** (not spam — if it's spam, DKIM/SPF aren't verified yet). Then test
   **Forgot password**. Verification links expire in 24h, reset links in 1h.

*The verification code is emailed to the user — never printed to the terminal.*
(The old console behavior doesn't exist in this codebase.)

> **Acceptance + probe:** full procedure in `docs/audit/RESEND-DOMAIN-VERIFICATION.md`.
> After switching `SMTP_FROM`, run
> `npm run check:f8-email -- --api https://api.<domain> --email <non-owner>`
> and then prove delivery with a real non-owner registration + password reset
> (Resend → Emails must show **Delivered**). This closes F-8.

---

# SECTION 5 — Private soak (24–48h)

You're now live on the real domain but password-protected. During this window:
- Do the **full manual test** in Section 7.
- Watch logs: `docker compose -f docker-compose.prod.yml logs -f`
- Set up an uptime monitor (free UptimeRobot) pinging
  `https://api.lormentor.com/api/v1/health/ready`.
- Turn on nightly DB backups:
  ```bash
  chmod +x deploy/backup/pg-backup.sh
  sudo crontab -e
  # add:  15 2 * * *  /opt/lor-mentor/deploy/backup/pg-backup.sh >> /var/log/lor-backup.log 2>&1
  ```
- Cap Docker log growth: create `/etc/docker/daemon.json` with
  `{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}` then
  `sudo systemctl restart docker`.

---

# SECTION 6 — Chapa payments (get your keys)

Chapa is **optional** — your launch payment path is bank transfer + manual review,
which needs no Chapa. Do this when you want card/Telebirr checkout. Full detail in
`docs/deploy/chapa-production.md`.

### 6.1 The critical distinction
- The **school's settlement bank account** (where Chapa deposits your money) is set
  **in the Chapa dashboard** during verification — NOT in the app, NOT an env var.
- `COMPANY_BANK_ACCOUNTS` in `.env.production` is a *different* thing: the account
  students transfer into directly for the manual/verifier path.

### 6.2 Create the merchant account & verify the business
1. Sign up at **https://dashboard.chapa.co** as a business.
2. Complete **KYC / business verification**. As an educational institution, expect
   to provide: trade license / registration, TIN, the authorized person's ID, and
   the **bank account for settlement**. Approval is manual and can take a few days.

### 6.3 Get TEST keys (available immediately)
In the dashboard: **Settings → API Keys**. Copy the **test secret key**
(`CHASECK_TEST-...`). Use these to rehearse the flow before real money.

### 6.4 Set up the webhook + Secret Hash
This is what makes payments trustworthy. In **Settings → Webhooks**:
1. Set the **Webhook URL** to:
   `https://api.lormentor.com/api/v1/payments/chapa/webhook`
2. Set/copy the **Secret Hash** (Chapa's name for the webhook signing secret).
3. Chapa signs each webhook with HMAC-SHA256 and sends `Chapa-Signature` /
   `x-chapa-signature` headers; your app already verifies these and **rejects any
   unsigned or forged "payment succeeded" call** — this is your anti-fraud gate.

> **How verification works + production tests** (server-side re-verify with
> Chapa's verify endpoint, amount policy, idempotent finalize, spoofed-webhook
> test): see `docs/audit/HOSTINGER-DEPLOYMENT-PLAYBOOK.md` §4 and
> `docs/deploy/chapa-production.md` §5.

### 6.5 Put the keys in the app
In `.env.production` (both required together — the app enforces all-or-nothing):
```env
CHAPA_BASE_URL=https://api.chapa.co/v1
CHAPA_SECRET_KEY=CHASECK_TEST-...      # test key for now
CHAPA_WEBHOOK_SECRET=your_secret_hash  # the Secret Hash from 6.4
```
Reload: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d api`

### 6.6 Test end-to-end (test mode)
Do a checkout with Chapa's test cards/numbers (dashboard → docs → "Test"). Confirm:
PENDING → webhook received → subscription becomes ACTIVE → PDF receipt generated.

### 6.7 Go LIVE
Once your business is approved, flip to **Live** in the dashboard, copy the **live**
secret key (`CHASECK-...`, no `TEST`) and the live Secret Hash, replace them in
`.env.production`, reload the API, and do **one small real payment** to confirm it
settles in your Chapa balance.

**Never hardcode** keys, the Secret Hash, or account numbers in source — env vars only.

---

# SECTION 7 — Final pre-launch checklist

Test each on the real (password-protected) domain:

- [ ] **HTTPS** padlock valid on `lormentor.com` and `api.lormentor.com`
- [ ] **Register** → verification email arrives in inbox
- [ ] **Verify email** → link works → account active
- [ ] **Login** → works; **logout** clears session
- [ ] **Forgot password** → reset email → new password works
- [ ] **Protected routes** redirect to login when logged out
- [ ] **AI tutor / flashcards / quiz** generate (Gemini + Redis queue working)
- [ ] **Payment (bank transfer):** paste reference verifies OR uploads for review
- [ ] **Admin** sees the payment + extracted data → approve → PDF receipt
- [ ] **(If Chapa live)** one real payment settles + activates
- [ ] `bash deploy/smoke-test.sh https://api.lormentor.com https://lormentor.com` passes
- [ ] After `docker compose restart`, uploads + data survive (volumes persist)
- [ ] Backups run; uptime monitor green; logs clean for 24–48h

---

# SECTION 8 — Go public

When the checklist is green and the soak is clean, remove only the password
gate from the Certbot-managed config. Do not copy the original HTTP-only
template over it, because that would remove the HTTPS blocks Certbot added:
```bash
sudo cp /etc/nginx/sites-available/lor-mentor \
  /etc/nginx/sites-available/lor-mentor.pre-public
sudo sed -i \
  -e '/auth_basic "/d' \
  -e '/auth_basic_user_file/d' \
  -e '/add_header X-Robots-Tag/d' \
  /etc/nginx/sites-available/lor-mentor
sudo nginx -t && sudo systemctl reload nginx
```
The certificates and proxy settings stay; you've just dropped the preview lock.
**You're live.** 🎉

---

# Updating later (no downtime) + rollback

**Update:**
```bash
cd /opt/lor-mentor && git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
Docker rebuilds only what changed and swaps containers; migrations auto-apply.

**Rollback** if a deploy misbehaves:

1. Record the failing commit and the last known-good commit.
2. Check out the previous commit and rebuild:
```bash
cd /opt/lor-mentor
git log --oneline -5            # find the previous good commit
git checkout <previous-commit>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
3. Confirm health and migrations:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npx prisma migrate status
```
Migrations are forward-only. If the previous code cannot run against the
already-applied schema, restore the pre-deploy database backup instead of
editing migration files or running `migrate dev`/`migrate reset`/`db push`.

**Restore the database** from a backup if needed (stop writers first, and take a
fresh backup of the current state before overwriting it):
```bash
gunzip -c /var/backups/lor-mentor/<file>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U lor -d lor_mentor
```

**Roll back an Anatomy model** without touching the database schema: restore the
previous versioned `modelUrl` in the registry data (for example
`/models/anatomy/heart.v1.glb`), rebuild, and reconcile that system:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api npm run db:seed:anatomy -- --reconcile --system heart
```
Never overwrite the old `.vN.glb` file; it is the rollback asset and is covered
by the immutable cache and the published-hash registry.

## Secret rotation checklist

Rotate on a schedule and immediately after any suspected exposure. Update
`.env.production` (never commit it), then restart the affected service and verify
health/login. Rotating the JWT secrets invalidates all existing sessions.

| Secret | What it protects | After rotating |
|---|---|---|
| `JWT_ACCESS_SECRET` | access-token signatures | restart API; users re-login |
| `JWT_REFRESH_SECRET` | refresh-token signatures | restart API; users re-login |
| `POSTGRES_PASSWORD` + `DATABASE_URL` | database credentials | update both together; restart API/Postgres; verify readiness |
| `SMTP_PASS` | verification/reset/payment email | restart API; send a test email |
| `GEMINI_API_KEY` | paid AI calls | restart API; test tutor + anatomy AI |
| `CHAPA_SECRET_KEY` | Chapa API calls | restart API; run one test payment |
| `CHAPA_WEBHOOK_SECRET` | webhook HMAC verification | restart API; send a signed test webhook |
| `RECEIPT_VERIFIER_TOKEN` | API ↔ receipt-verifier auth | update both services together; restart both |
| `SUPER_ADMIN_PASSWORD` | one-time seed admin | change the password in the app; do not re-seed |
| `SENTRY_DSN` (if used) | error reporting | restart API; confirm events arrive |

`COOKIE_DOMAIN` and `TRUST_PROXY` are configuration, not secrets; changing them
requires an API restart and a login/cookie check.

---

## Getting help
When something fails on the server, copy the exact command + its output (and
`docker compose logs <service> --tail=50`) and bring it back — that's usually
enough to pinpoint the fix.
