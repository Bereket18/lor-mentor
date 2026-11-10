# Server Prerequisites (Hostinger VPS)

What the host must provide **before** `docker compose up`. Written to make as few
assumptions as possible: Hostinger ships several OS templates (Ubuntu, Debian,
AlmaLinux, Rocky, and others) and its images differ by plan and by when the VPS
was provisioned. Nothing here depends on the Hostinger panel or on a
pre-installed Docker.

Companion documents: [GO-LIVE.md](GO-LIVE.md) (step-by-step go-live),
[NGINX-SETUP.md](NGINX-SETUP.md) (reverse proxy + TLS),
[DOCKER-READINESS.md](DOCKER-READINESS.md) (what was and was not verified).

---

## 1. Hardware

The application runs five containers plus host nginx.

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB | 8 GB if you build images on the VPS |
| vCPU | 2 | 2–4 |
| Disk | 40 GB SSD | 80 GB SSD |
| Swap | **2 GB (required)** | 4 GB |

**Why swap is not optional.** The steady-state container limits sum to about
2.4 GB (512 postgres + 256 redis + 512 verifier + 640 api + 512 web), leaving
only ~1.5 GB for the OS, nginx and the Docker daemon on a 4 GB box. A
`docker compose build` runs the Next.js production build, which can peak above
2 GB on its own. Without swap, the OOM killer terminates the build (or, worse,
a running service).

```bash
# 2 GB swapfile — run once, as root
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

If builds consistently fail, build on a workstation/CI instead and push the
images, or temporarily resize the VPS.

**Disk hygiene.** Docker images and build cache are the largest consumers.
Schedule a periodic prune (the deploy user is usually in the `docker` group):

```bash
# Weekly: remove unused images and build cache, keep the running stack
docker image prune -af --filter "until=168h"
docker builder prune -af --filter "until=168h"
```

---

## 2. Operating system

**Any current 64-bit Linux with systemd works.** Verified families:

- Debian 12 (bookworm) / 13 (trixie)
- Ubuntu 22.04 LTS / 24.04 LTS
- AlmaLinux 9 / Rocky Linux 9 (Docker CE packages; see §3.2)

Identify what you actually got before installing anything:

```bash
cat /etc/os-release          # ID, VERSION_ID
uname -m                     # x86_64 or aarch64
```

Both architectures are supported: every base image in this project is pinned to
a multi-arch digest, and the app is built from source on the host.

Notes:

- **Do not** rely on a host control panel to install Docker. Install it from
  official packages (§3) so the version is known and Compose v2 is present.
- If the template is RHEL-family, `podman`/`buildah` may be preinstalled and may
  provide a `docker` shim. Confirm `docker compose` (v2 syntax, not
  `docker-compose`) works before continuing.
- A minimal template is fine. You do **not** need a desktop, a web panel, or a
  preinstalled LAMP stack.

---

## 3. Required software

| Package | Minimum | Purpose |
|---|---|---|
| Docker Engine | 24.x (27+ recommended) | Runs the containers |
| Docker Compose | **v2 plugin** (`docker compose`) | Compose files use v2 features |
| nginx | 1.20+ | TLS termination and reverse proxy |
| certbot + nginx plugin | current | Let's Encrypt certificates |
| git | any | Obtain the repo (`git clone`, never a zip — see BACKUP-RESTORE.md §6) |
| curl, ca-certificates, openssl | current | Health checks, TLS checks, secret generation |
| cron or systemd timers | — | Nightly database backup |
| ufw (Debian/Ubuntu) or firewalld (RHEL) | — | Host firewall |

### 3.1 Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git nginx certbot python3-certbot-nginx

# Docker from Docker's own repository (distro `docker.io` is often too old and
# ships no Compose v2 plugin)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo $ID)/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/$(. /etc/os-release && echo $ID) \
$(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 3.2 RHEL / AlmaLinux / Rocky

```bash
sudo dnf install -y dnf-plugins-core git nginx certbot python3-certbot-nginx
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo systemctl enable --now nginx
```

### 3.3 Verify

```bash
docker --version            # -> Docker version 24.x or newer
docker compose version      # -> Docker Compose version v2.x   (v2, not 1.x)
docker buildx version       # -> buildx v0.x (needed for digest pinning)
nginx -v                    # -> nginx version: nginx/1.20 or newer
certbot --version
```

If `docker compose version` fails, the Compose plugin is missing — install
`docker-compose-plugin` (apt) / `docker-compose-plugin` (dnf). Do not fall back
to the deprecated `docker-compose` v1 binary; the compose files use v2 syntax.

---

## 4. What must NOT be installed on the host

| Do not install | Because |
|---|---|
| Node.js / npm | The API and web run inside containers. A host Node version is never used and can only cause confusion. |
| PostgreSQL server | Runs in the `postgres` container; host Postgres would compete for port 5432. |
| Redis | Runs in the `redis` container. |
| Apache | Conflicts with nginx on ports 80/443. |

The host only needs Docker, nginx and certbot.

---

## 5. Network and DNS

Create these DNS records **before** requesting certificates:

| Record | Type | Value |
|---|---|---|
| `lormentor.com` | A | VPS IPv4 |
| `www.lormentor.com` | A | VPS IPv4 (or CNAME → `lormentor.com`) |
| `api.lormentor.com` | A | VPS IPv4 |

Add `AAAA` records only if the VPS has a stable IPv6 address and you intend to
serve over it.

Verify propagation before running certbot — Let's Encrypt validates over HTTP:

```bash
dig +short lormentor.com
dig +short api.lormentor.com
```

A single-host deployment (web and API on the same hostname, different paths) is
also supported: then `COOKIE_DOMAIN` can stay blank. The default documented
topology is the split-host one, which **requires** `COOKIE_DOMAIN=.yourdomain`.

---

## 6. Firewall

Only 22, 80 and 443 should be reachable. The database, cache and verifier must
never be exposed: in `docker-compose.prod.yml` they publish **no** ports, and
api/web bind to `127.0.0.1` only.

Debian/Ubuntu (UFW):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Belt-and-braces: the container ports must never be reachable from the
# internet. The actual control is the 127.0.0.1 bind in
# docker-compose.prod.yml, because Docker-published ports bypass UFW's INPUT
# chain (DNAT runs before it); keep these denies as a second layer.
sudo ufw deny 4000/tcp
sudo ufw deny 3000/tcp
sudo ufw enable
sudo ufw status verbose
```

> **UFW does not filter Docker-published ports.** Docker installs its own
> `DOCKER-USER`/NAT rules, so `ufw deny 4000/tcp` alone would **not** make a
> container published as `0.0.0.0:4000:4000` unreachable. Always keep the
> `127.0.0.1:4000:4000` / `127.0.0.1:3000:3000` binds in
> `docker-compose.prod.yml`; `deploy/smoke-test.sh` (step 10) checks that
> `<api-host>:4000` is refused from outside.

RHEL-family (firewalld):

```bash
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

If the Hostinger panel offers its own firewall, leave 22/80/443 open there too.

Verify nothing else is listening publicly after the stack starts:

```bash
sudo ss -tlnp | grep -E ':(3000|4000|5432|6379|8000)\b'
# expect: only 127.0.0.1:3000 and 127.0.0.1:4000 — no 0.0.0.0 lines
```

---

## 7. Users and permissions

Run Docker as a non-root deploy user; do **not** run the stack as root.

```bash
sudo adduser deploy
sudo usermod -aG docker deploy     # lets `deploy` run docker without sudo
```

> **Security note:** membership in the `docker` group is effectively root —
> a member can mount the host filesystem into a container. Only add people who
> would otherwise have root.

The application containers already run unprivileged:
`api`/`web` as the image's `node` user, `verifier` as uid 10001. Postgres and
Redis use their images' own entrypoints and drop privileges internally. Every
service sets `no-new-privileges`.

**Upload directory ownership.** The `uploads` named volume is initialised from
the image's `/app/apps/api/uploads`, which the API Dockerfile creates and
`chown`s to `node`. If you ever restore that volume from a backup made by root,
re-check ownership before starting:

```bash
docker run --rm -v lor-mentor_uploads:/data alpine ls -ln /data
# uid/gid should match the `node` user (1000:1000 in the node image)
```

---

## 8. Time and locale

Certificates, token expiry, backups and audit logs all assume a correct clock.

```bash
sudo timedatectl set-timezone Africa/Addis_Ababa     # or your local zone
sudo timedatectl set-ntp true
timedatectl
```

---

## 9. Pre-deploy verification

Run these on the VPS after §1–§8 and before the first `docker compose up`.
Every line should print what the comment says.

```bash
# 1. Tooling
docker --version && docker compose version && nginx -v

# 2. Compose files parse against the real secrets file
cd /opt/lor-mentor
docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet && echo "compose OK"

# 3. The env file passes the project's own preflight
npm run check:env -- .env.production --strict

# 4. DNS resolves to this host
dig +short lormentor.com; dig +short api.lormentor.com

# 5. Ports 80/443 are free (nothing else bound them)
sudo ss -tlnp | grep -E ':(80|443)\b'

# 6. Memory and swap
free -h

# 7. Disk headroom (want >= 15 GB free before building)
df -h /
```

`npm run check:env` requires Node. If Node is deliberately not installed on the
host, run it from a workstation against a copy of the file, or rely on the API's
own boot-time validation, which fails fast on the same rules.

---

## 10. Hostinger-specific notes

- **Template choice.** Pick a plain OS image (Ubuntu 24.04 LTS is the safest
  default). Hostinger application templates that preinstall a web panel or a
  LAMP stack are unnecessary here and can conflict on ports 80/443.
- **Docker may or may not be preinstalled.** Detect with `docker --version`
  before following §3; if it exists, confirm it is ≥24 with the Compose v2
  plugin rather than assuming.
- **Root access.** Hostinger VPS plans give root. Create the `deploy` user
  (§7) and use it for day-to-day work.
- **Panel firewall vs host firewall.** If the hPanel firewall is enabled, it is
  evaluated in addition to UFW/firewalld. Open 22/80/443 in both or HTTPS will
  fail with a timeout that looks like an nginx problem.
- **Backups.** hPanel backups (if your plan includes them) are **not** a
  substitute for the database/uploads backup in
  [BACKUP-RESTORE.md](BACKUP-RESTORE.md) — restore them only into a scratch
  environment, and still run the documented restore drill.
- **Reverse proxy already on the image.** Some templates ship Apache or a
  panel proxy on port 80. `sudo ss -tlnp | grep :80` will reveal it; stop and
  disable that service before installing nginx.