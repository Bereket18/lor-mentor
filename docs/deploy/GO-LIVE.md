# Lor Mentor — Go-Live Guide (follow top to bottom)

This is the single, beginner-friendly guide to take Lor Mentor from an empty
Hostinger VPS to a live, secure production site. Run every command **on the VPS**
unless it says otherwise. Don't skip steps.

> **A note on PM2/Node:** your original checklist mentioned installing Node.js +
> PM2 directly. We deploy with **Docker Compose** instead — it packages Node, the
> Python service, Postgres, and Redis together, auto-restarts crashed containers,
> and starts everything on reboot. So there's no separate Node/PM2 install; Docker
> does that job more reliably. Everything below reflects the Docker approach.

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

Watch it come up:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api      # Ctrl-C to stop watching
```

### 3.4 Seed the initial data (once)
```bash
docker compose -f docker-compose.prod.yml exec api npx ts-node prisma/seed.ts
```
*Why:* creates the subscription plans, departments/years, and the first admin user
the app needs to function.

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
```bash
cd /opt/lor-mentor
git log --oneline -5            # find the previous good commit
git checkout <previous-commit>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
**Restore the database** from a backup if needed:
```bash
gunzip -c /var/backups/lor-mentor/<file>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U lor -d lor_mentor
```

---

## Getting help
When something fails on the server, copy the exact command + its output (and
`docker compose logs <service> --tail=50`) and bring it back — that's usually
enough to pinpoint the fix.
