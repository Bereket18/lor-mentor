# Lor Mentor — Production Deployment Runbook

Target: **Hostinger VPS, Ubuntu 24.04 LTS**, Docker Compose. Stack: Next.js
(web) · NestJS (api) · Python receipt-verifier · PostgreSQL · Redis, behind a
host **Nginx** reverse proxy with **Let's Encrypt** TLS.

> Replace `lormentor.com` with your real domain and `deploy` with your chosen
> sudo username throughout.

---

## Architecture (production)

```
                          Internet (HTTPS :443)
                                  │
                        ┌─────────▼──────────┐
                        │  Nginx (host)      │  TLS termination, reverse proxy
                        │  lormentor.com     ├───────────► 127.0.0.1:3000  web
                        │  api.lormentor.com ├───────────► 127.0.0.1:4000  api
                        └────────────────────┘
                                  │  (docker network: internal)
   ┌───────────────┬─────────────┼───────────────┬──────────────────┐
   ▼               ▼             ▼                ▼                  ▼
 web            api          verifier         postgres            redis
(Next.js)     (NestJS)      (FastAPI)        (16-alpine)        (7-alpine)
 :3000          :4000         :8000        volume: pgdata       volume: redisdata
                │  volume: uploads (receipts + PDFs)
                └── prisma migrate deploy on start
```

Only `web` and `api` are published — and only on `127.0.0.1`. Postgres and Redis
are reachable **only** inside the Docker network. Nginx is the single public door.

---

## 0. DNS (do this first — propagation takes time)

Point these A records at your VPS IP (find it in the Hostinger panel):

| Record | Type | Value |
|--------|------|-------|
| `lormentor.com` | A | `<VPS_IP>` |
| `www` | A | `<VPS_IP>` |
| `api` | A | `<VPS_IP>` |

Verify: `dig +short lormentor.com api.lormentor.com`

---

## 1. Server hardening

SSH in as root (Hostinger emails you the password), then:

```bash
# Create a sudo user and disable root/password SSH login
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # copy your key up first

# Firewall — allow SSH + HTTP/HTTPS only
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Harden SSH
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Automatic security updates + brute-force protection
sudo apt update && sudo apt install -y unattended-upgrades fail2ban
sudo systemctl enable --now fail2ban
```

> ⚠️ Confirm you can `ssh deploy@<VPS_IP>` with your key **before** closing the
> root session, or you can lock yourself out.

---

## 2. Install Docker + Nginx

```bash
# Docker Engine + Compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy    # log out/in for this to take effect

# Nginx + Certbot on the host
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 3. Get the code + configure secrets

```bash
sudo mkdir -p /opt/lor-mentor && sudo chown deploy:deploy /opt/lor-mentor
git clone <your-repo-url> /opt/lor-mentor
cd /opt/lor-mentor

cp .env.production.example .env.production
chmod 600 .env.production          # readable only by you
nano .env.production                # fill in EVERY value (see checklist below)
```

Generate strong secrets:

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET  (must differ)
openssl rand -hex 24   # RECEIPT_VERIFIER_TOKEN
# Pick a strong POSTGRES_PASSWORD and mirror it inside DATABASE_URL.
```

**Must be set before first boot** (env validation refuses to start otherwise):
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars, different), `DATABASE_URL`,
`SMTP_HOST/USER/PASS/FROM`, `WEB_PUBLIC_URL`, `API_PUBLIC_URL`, `CORS_ORIGIN`
(no `localhost`), and — because the verifier is enabled — `COMPANY_BANK_ACCOUNTS`.
Chapa keys stay **blank** for launch (all-or-nothing rule).

---

## 4. Build and start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The `api` container runs `prisma migrate deploy` automatically before serving.
Watch it come up:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

Seed baseline data (subscription plans, admin user) **once**:

```bash
docker compose -f docker-compose.prod.yml exec api npx ts-node prisma/seed.ts
```

Smoke-test locally on the box:

```bash
curl -s localhost:4000/api/v1/health           # {"status":"ok",...}
curl -s localhost:4000/api/v1/health/ready      # {"status":"ready","database":"up"}
curl -sI localhost:3000                          # 200 OK
```

---

## 5. Nginx + HTTPS

```bash
sudo cp deploy/nginx/lor-mentor.conf /etc/nginx/sites-available/lor-mentor
# edit the file: replace lormentor.com with your domain
sudo ln -s /etc/nginx/sites-available/lor-mentor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Issue certificates (also configures the :443 blocks + HTTP→HTTPS redirect)
sudo certbot --nginx -d lormentor.com -d www.lormentor.com -d api.lormentor.com
```

Certbot auto-renews via a systemd timer; confirm with `sudo certbot renew --dry-run`.

---

## 6. Post-deploy verification (do every one)

- [ ] `https://lormentor.com` loads over HTTPS (valid padlock).
- [ ] Register a new account → **verification email arrives in inbox** (not spam).
- [ ] Click the link → email verified → log in → cookie set (`Secure`, `HttpOnly`).
- [ ] Forgot password → reset email arrives → reset works.
- [ ] Protected routes redirect to login when logged out.
- [ ] AI tutor / flashcards / quiz generate (Gemini key live; Redis queue works).
- [ ] Pricing → **bank transfer → paste reference** verifies (or lands in admin
      review); **upload image** lands in admin review.
- [ ] Admin panel shows the payment + extracted-data strip; approve → PDF receipt.
- [ ] `docker compose restart` → uploads + DB survive (volumes persist).

---

## 7. Backups, logs, monitoring

**DB backups** (nightly, 14-day retention):

```bash
chmod +x deploy/backup/pg-backup.sh
sudo crontab -e
# 15 2 * * *  /opt/lor-mentor/deploy/backup/pg-backup.sh >> /var/log/lor-backup.log 2>&1
```
Then sync `/var/backups/lor-mentor` off-box (rclone → S3/Backblaze) for durability.

**Logs:** `docker compose logs -f <service>`. Cap disk usage by setting a global
log rotation in `/etc/docker/daemon.json`:
```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```
then `sudo systemctl restart docker`.

**Uptime/error monitoring (recommended):** point a free uptime monitor
(UptimeRobot/BetterStack) at `https://api.lormentor.com/api/v1/health/ready` and
`https://lormentor.com`. Add Sentry DSNs later for error tracking.

---

## 8. Updating (redeploy)

```bash
cd /opt/lor-mentor && git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# migrations apply automatically on api start; check logs afterwards.
```

Rollback: `git checkout <previous-tag>` then the same `up -d --build`. Restore DB
from a dump with `gunzip -c <file>.sql.gz | docker compose exec -T postgres psql -U lor -d lor_mentor`.

---

## Known operational limits

- **Telebirr auto-verification won't work from Hostinger.** Telebirr blocks
  non-Ethiopian IPs, so those receipts fall back to manual admin review (handled
  gracefully). CBE/Dashen/Awash/Zemen depend on the bank allowing your VPS IP.
- **BOA** receipts never expose a receiver account → always manual review.
- **Chapa** is dormant until you add live keys (bank transfer + manual is the
  launch payment path).
- Single VPS = single point of failure. Fine for launch; revisit HA + managed
  Postgres as you grow.
