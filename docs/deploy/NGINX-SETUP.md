# Nginx and TLS Setup

How the reverse proxy in front of Lor Mentor is configured, why each setting
exists, and how to diagnose the failures that actually happen.

Host prerequisites (install commands, firewall, DNS) are in
[SERVER-PREREQUISITES.md](SERVER-PREREQUISITES.md). This document starts once
nginx is installed.

---

## 1. Topology

```
                                   ┌─ 127.0.0.1:3000  web   (Next.js, standalone)
Internet ── 443 ── nginx (host) ───┤
                                   └─ 127.0.0.1:4000  api   (NestJS)

                     internal Docker network (no host ports)
                     postgres · redis · verifier
```

- nginx is installed **on the host**, not as a container.
- The web container serves `lormentor.com` and `www.lormentor.com`.
- The API container serves `api.lormentor.com`.
- Postgres, Redis and the verifier publish **no ports at all**.
- api and web bind to `127.0.0.1` only, so they are unreachable from the
  internet even if the firewall is misconfigured.

Two nginx files ship with the repo:

| File | Use |
|---|---|
| `deploy/nginx/lor-mentor.conf` | Public site (after go-live) |
| `deploy/nginx/lor-mentor-staging.conf` | Private soak — HTTP Basic Auth on the frontend, `noindex` |

Both create the same upstream blocks; the staging file adds the password gate.

---

## 2. Install the site

```bash
cd /opt/lor-mentor

# 1. Replace the placeholder domain in the file first
sed -i 's/lormentor\.com/YOUR-DOMAIN/g' deploy/nginx/lor-mentor.conf

# 2. Install and enable
sudo cp deploy/nginx/lor-mentor.conf /etc/nginx/sites-available/lor-mentor
sudo ln -sf /etc/nginx/sites-available/lor-mentor /etc/nginx/sites-enabled/lor-mentor
sudo rm -f /etc/nginx/sites-enabled/default

# 3. Syntax check and reload (never restart blindly)
sudo nginx -t && sudo systemctl reload nginx
```

On RHEL-family hosts the include path is `/etc/nginx/conf.d/` instead of
`sites-available`; copy the file there and drop the symlink step.

### Test the whole config offline

`deploy/nginx/test-nginx-config.sh` copies the conf, substitutes the domain
with `example.test`, mints a throwaway certificate and runs `nginx -t`. It is
also wired into CI. Use it after editing the file:

```bash
sudo bash deploy/nginx/test-nginx-config.sh
```

---

## 3. HTTPS

The shipped file listens on port 80 only. **Certbot adds the 443 blocks and the
HTTP→HTTPS redirect itself** — do not write them by hand and do not overwrite
the file afterwards.

```bash
sudo certbot --nginx \
  -d your-domain \
  -d www.your-domain \
  -d api.your-domain \
  --redirect
```

Certbot edits the **installed** file under `/etc/nginx/`, not the repo copy.
That is why re-copying `deploy/nginx/lor-mentor.conf` over it later would delete
the TLS configuration. After the first certificate, edit the installed file
directly (or re-run certbot).

Renewal is automatic via the `certbot.timer` systemd unit. Confirm it:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

### HSTS — enable only after HTTPS is verified

`Strict-Transport-Security` is present but commented out in both files. Enable
it only once `https://` works for the frontend and the API and the HTTP
redirect is confirmed. It is a one-way switch: browsers will refuse plain HTTP
for a year once they see it.

---

## 4. Upload size limits

Three limits must stay consistent:

| Layer | Limit | Where |
|---|---|---|
| nginx | `client_max_body_size 30m` | `deploy/nginx/*.conf` |
| Materials upload | 25 MB | `materials.controller.ts` (Multer) |
| Receipt upload | 10 MB | `payments.controller.ts` (Multer) |

nginx is intentionally higher than the largest Multer limit so multipart
framing overhead cannot cause nginx to reject a request that the app would
accept. If you raise a Multer limit, raise `client_max_body_size` above it too.

A 413 from nginx looks like an application error in the browser; check the nginx
error log first.

---

## 5. Timeouts

Both vhosts set `proxy_read_timeout 180s`.

Receipt submission is synchronous: the API waits for Cheki (20 s) and can then
fall back to the receipt verifier (up to 120 s). The original 60 s default
returned **504 while the payment was still being recorded** — a student sees a
failure, but the receipt is accepted. 180 s covers the documented worst case
(120 + 20) with margin.

The frontend vhost needs the same value because Next.js rewrites `/api/v1/*`
to the API, so a submission can travel through it too.

`proxy_connect_timeout` and `proxy_send_timeout` stay at their defaults; only
the read timeout was too short.

---

## 6. Headers, gzip and caching

- **Security headers** are set at nginx for both vhosts (`X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`). The API also sends them via
  Helmet; duplicating them at the edge means a browser never depends on the
  upstream app.
- **CSP is deliberately absent.** The Next.js app uses inline bootstrap
  scripts; a strict CSP needs nonces/hashes first. Adding `default-src 'self'`
  blindly will break the app.
- **gzip** covers text/JSON and `model/gltf-binary`. `.glb` files compress
  poorly and are already cached immutably, so gzip is not applied to them on
  the frontend vhost.
- **Anatomy models** matching `^/models/anatomy/<name>.v<N>.glb$` get
  `Cache-Control: public, max-age=31536000, immutable`. The version is in the
  filename, so a changed model is a new URL. The `always` flag is intentionally
  omitted there so a 404 is not cached for a year.

---

## 7. The split-host cookie rule

The web app is on `your-domain` and the API on `api.your-domain`. The API sets
`access_token` / `refresh_token` cookies, and the **web host** must be able to
read them, otherwise:

- the edge guard (`apps/web/src/proxy.ts`) sees no session and redirects every
  protected page to `/login`, and
- `/api/proxy/*` forwards the request without credentials and the API returns
  401.

The API must therefore set the cookie on the parent domain:

```dotenv
COOKIE_DOMAIN=.your-domain
```

with the leading dot, no scheme, no port. A blank `COOKIE_DOMAIN` is only
correct for single-host / local development. This is the single most common
cause of a "login works but I'm bounced back to the login page" report.

---

## 8. Diagnosing common failures

| Symptom | Likely cause | Check |
|---|---|---|
| **502 Bad Gateway** | api or web container down / not healthy | `docker compose -f docker-compose.prod.yml ps`; `docker compose ... logs api` |
| **504 Gateway Timeout** | verification exceeded 180 s, or a proxy in front (Cloudflare) has a shorter timeout | `docker compose ... logs api`; check any CDN timeout |
| **413 Request Entity Too Large** | upload above `client_max_body_size` | nginx error log; §4 |
| **Login succeeds, then bounces to /login** | `COOKIE_DOMAIN` blank or wrong on a split-host deploy | §7; browser devtools → Application → Cookies |
| **CORS error in the console** | `CORS_ORIGIN` does not exactly match the browser origin (scheme, port or trailing slash differ) | `.env.production`; API boot log |
| **`nginx: [emerg] ... unknown directive`** | file copied without the `http{}`-level context, or a typo after editing | `sudo nginx -t`, then `deploy/nginx/test-nginx-config.sh` |
| **Certbot fails with a challenge error** | DNS not propagated, or the Hostinger panel firewall blocks 80 | §5 of SERVER-PREREQUISITES; `dig +short`; retry |
| **Site works on the VPS via curl, not externally** | panel firewall vs host firewall mismatch | `ss -tlnp`, hPanel firewall rules |

Log locations:

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 9. Post-install verification

```bash
# Frontend responds over HTTPS
curl -sS -o /dev/null -w "%{http_code}\n" https://your-domain/

# API health (expect JSON with status ok)
curl -sS https://api.your-domain/api/v1/health/ready

# HTTP redirects to HTTPS
curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://your-domain/

# Certificate is valid and auto-renewable
echo | openssl s_client -servername your-domain -connect your-domain:443 2>/dev/null \
  | openssl x509 -noout -dates
sudo certbot renew --dry-run

# Containers are healthy and ports are not public
docker compose -f docker-compose.prod.yml ps
sudo ss -tlnp | grep -E ':(3000|4000|5432|6379|8000)\b'
```