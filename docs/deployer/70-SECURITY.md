# Security

How Lor Mentor protects accounts, student data and payments; how secrets are
handled; what to do when something goes wrong; and what is deliberately **not**
covered yet.

This document describes the system as implemented. Where a control is missing or
weaker than ideal, it says so — an incomplete list that is honest is more useful
than a complete-looking list that is not.

---

## 1. Reporting a vulnerability

Do **not** open a public issue for a security problem.

Send a description and reproduction steps to the college's IT lead:

> **Security contact:** `bereketadamsseged@gmail.com`

Include what you did, what happened, what you expected, and whether student data
or payments are affected. Expect an acknowledgement within two business days.

Do not test against production accounts you do not own, do not run denial-of-
service tests, and do not access other students' data to prove a point.

---

## 2. Assets and trust boundaries

| Asset | Where | Why it matters |
|---|---|---|
| Password hashes | `User.passwordHash` | Account takeover |
| Access / refresh tokens | Browser cookies | Session hijack |
| JWT signing secrets | `.env.production` | Forge any session, including admin |
| Payment records | `Payment`, `Subscription` | Money, entitlement disputes |
| Uploaded receipts | `uploads` volume | Personal and banking data |
| Provider keys (Chapa, Resend, Gemini) | `.env.production` | Financial loss, impersonation, spend |
| Student data (email, progress, AI content) | PostgreSQL | Privacy, regulatory duties |

Trust boundaries:

```text
Internet ──► nginx (TLS, host) ──► 127.0.0.1:3000 web
                               └─► 127.0.0.1:4000 api ──► docker network ──► postgres / redis / verifier
```

Only `web` and `api` publish ports, and only on loopback. PostgreSQL, Redis and
the verifier are reachable **only** from inside the Compose network.

---

## 3. Authentication

| Control | Implementation |
|---|---|
| Password hashing | bcrypt, cost factor **12** (`auth.service.ts`) |
| Access token | JWT, signed with `JWT_ACCESS_SECRET`, lifetime **15m** |
| Refresh token | JWT, separate `JWT_REFRESH_SECRET`, lifetime **7d** |
| Token storage | `httpOnly` cookies; `Secure` in production; `SameSite=Lax` |
| Email verification code | **6 digits** from `crypto.randomInt`, stored only as a bcrypt hash, single-use, **15m**, **5** attempts per code, 60s resend cooldown, **5** codes/hour/account |
| Reset token | `crypto.randomBytes(32)`, single-use, **1h** |
| Brute force | **5** failed logins → **15-minute** account lockout |
| Login rate limit | **5 requests/min per IP** on top of the account lockout |
| Global rate limit | **120 requests/min** per client across the API |
| Enumeration resistance | Forgot-password and resend-verification always return the same message |
| Logout / revocation | Refresh token `jti` added to a Redis denylist |

Cookies are `httpOnly`, so JavaScript cannot read them — an XSS bug cannot
exfiltrate a token directly. `SameSite=Lax` blocks most cross-site request
forgery; `Secure` prevents the token travelling over plain HTTP.

### 3.1 Split-host topology and `COOKIE_DOMAIN`

When the web app and API are on different subdomains (`lormentor.com` and
`api.lormentor.com`), the auth cookies are set by the API host. Without
`COOKIE_DOMAIN=.lormentor.com` the browser will not send them to the web host,
and every protected page redirects to login. This is a **configuration
requirement**, documented in [docs/deployer/60-ENVIRONMENT-VARIABLES.md](60-ENVIRONMENT-VARIABLES.md).
It is not currently enforced at boot, so a missing value fails as a login loop
rather than a startup error.

### 3.2 Not implemented

- **No multi-factor authentication.** Admin and super-admin accounts are
  protected by password strength, lockout and rate limiting only. Choose a long,
  unique password and store it in the password manager.
- **No separate admin login domain or IP allowlist.** `ADMIN`/`SUPER_ADMIN` log
  in through the same form.

---

## 4. Authorisation

Roles: `GUEST`, `STUDENT`, `TEACHER`, `ADMIN`, `SUPER_ADMIN` (Prisma `Role`).

- Route-level checks use `@Roles(...)` with the roles guard (55 usages).
- Resource-level checks confirm ownership before returning or mutating a record
  (a student cannot read another student's attempt, receipt or progress).
- Anatomy Lab is restricted to `STUDENT` and `TEACHER`; `ADMIN`/`SUPER_ADMIN`
  receive `403` and the web app redirects them to `/admin`.
- Faculty review endpoints require the reviewer guard; the review token is not
  interchangeable with a normal JWT.
- `AuditLog` is readable by `SUPER_ADMIN` only — it contains lockouts, IPs and
  review decisions.

When adding an endpoint: deny by default, declare roles explicitly, and check
ownership for anything keyed by a user-supplied id.

---

## 5. Application controls

| Control | Detail |
|---|---|
| Input validation | Global `ValidationPipe` with `whitelist` and **`forbidNonWhitelisted`** — unknown body fields are rejected, not ignored |
| Output escaping | React escapes by default; `react-markdown` is used without raw HTML |
| Security headers | `helmet()` default set on the API |
| CORS | Exact allowlist from `CORS_ORIGIN`; wildcards rejected at boot |
| Proxy trust | `TRUST_PROXY` is an explicit hop count, never `true`, so client IPs cannot be spoofed into the lockout or rate limiter |
| File uploads | Multer `diskStorage` into the `uploads` volume; **25 MB** for materials, **10 MB** for payment receipts; MIME allowlist via `fileFilter`, plus magic-byte checks on images (`image-magic-bytes.ts`) because the client-supplied MIME type is trivial to forge |
| Payment webhooks | HMAC-SHA256 over the **raw** body, compared with `timingSafeEqual`; rejected before any state change |
| Payment activation | Idempotent — a replayed webhook cannot double-activate a subscription |
| Receipt verifier | Isolated container, one shared token, drives Chromium as a non-root user (uid 10001); it never receives JWT, SMTP, Chapa or Gemini credentials |
| Anatomy review writes | Throttled to 30 writes/min; public anatomy reads 20/min |

### 5.1 The receipt verifier is treated as hostile input

It parses PDFs and screenshots supplied by students and renders them in a
headless browser. That is the most exposed component, which is why it:

- runs as a separate container with no host ports,
- receives exactly one secret (`VERIFIER_SHARED_TOKEN`),
- runs as an unprivileged user,
- cannot reach the database directly.

Do not merge it into the API container to "simplify" deployment.

---

## 6. Secrets

### 6.1 Where secrets live

| Secret | Location |
|---|---|
| All application secrets | `/opt/lor-mentor/.env.production`, mode **600**, owned by `deploy` |
| Compose substitutions | the same file, via `--env-file` |
| API runtime | the same file, via `env_file:` |
| Verifier | only `VERIFIER_SHARED_TOKEN`, injected by Compose |
| Images | **nothing** — no secret is a build argument or baked into a layer |

`.env.production`, `.env` and `.env.local` are git-ignored.

### 6.2 Rules

- Never commit a filled env file, a dump, or a screenshot containing keys.
- Never put a secret behind a `NEXT_PUBLIC_` prefix — those values ship to the
  browser.
- Never paste secrets into chat, tickets, PRs, CI logs or error reports.
- Never pass secrets as Docker build args; `docker history` exposes them.
- Rotate any secret that has been exposed. Exposure means "assume compromised",
  not "probably fine".

### 6.3 Generation

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET (must differ)
openssl rand -hex 24   # RECEIPT_VERIFIER_TOKEN
openssl rand -hex 24   # POSTGRES_PASSWORD (URL-safe only)
```

Boot validation rejects short secrets, placeholders, identical access/refresh
secrets and single-character repeats.

### 6.4 Rotation

Full procedure: [`docs/deployer/90-SECRET-ROTATION.md`](90-SECRET-ROTATION.md).
Provider key rotation: [docs/deployer/50-INTEGRATIONS-AND-ACCOUNTS.md §6](50-INTEGRATIONS-AND-ACCOUNTS.md#6-rotation-and-revocation).

Rotating `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` invalidates every session —
users must log in again. Do it during a quiet period and announce it.

---

## 7. Transport and infrastructure

| Control | Detail |
|---|---|
| TLS | Let's Encrypt via Certbot; HTTP redirected to HTTPS |
| Certificate renewal | Certbot systemd timer; verify it is active |
| Database exposure | No host port. Never add `ports:` to `postgres` |
| Redis exposure | No host port, **no password** — it is internal-only. Do not publish it |
| Container privileges | `security_opt: [no-new-privileges:true]` on every service; API, web and verifier run as non-root |
| Process init | `init: true` so zombies are reaped and signals reach Node |
| Log rotation | 10 MB × 3 per service |
| Image pinning | Base images pinned by digest; updates are deliberate commits |
| SSH | Key-based only, root login disabled, firewall allows 22/80/443 |

---

## 8. Logging and audit

- `AuditLog` records administrative actions (user changes, lockouts, review
  decisions) with actor, IP and timestamp. Readable by `SUPER_ADMIN`.
- Request bodies, passwords, tokens and full env values are **not** logged.
- Container logs go to json-file with rotation. They are not tamper-proof —
  treat them as operational, not evidentiary.
- `SENTRY_DSN` is optional. If set, unhandled errors and a 10% trace sample go to
  Sentry. Errors may contain stack traces and identifiers; review scrubbing
  before enabling for student data.

---

## 9. Third-party data sharing

| Recipient | Data sent | When |
|---|---|---|
| Gemini | Prompts containing course material and student questions | Student uses an AI feature |
| Resend | Email address, name, verification/reset link | Registration, password reset |
| Chapa | Name, email, amount, transaction reference | Online checkout (if enabled) |
| Cheki | Receipt details for verification | Bank-transfer verification |

Each is a separate processor, and each has its own terms. The college is the data
controller and is responsible for telling students what leaves the platform. See
[docs/deployer/50-INTEGRATIONS-AND-ACCOUNTS.md](50-INTEGRATIONS-AND-ACCOUNTS.md) for the account and policy details.

---

## 10. Incident response

### 10.1 If a secret is exposed

1. **Revoke it at the provider** (Chapa, Resend, Google AI Studio) before doing
   anything else.
2. Replace it: generate a new value, update `.env.production`, restart:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
   ```
3. If a JWT secret was exposed, all sessions are now untrusted — rotation already
   invalidates them.
4. If a database credential was exposed, rotate `POSTGRES_PASSWORD` **and**
   `DATABASE_URL` together, then restart `postgres` and `api`.
5. Record what leaked, when, how, and what was rotated.
6. If the leak reached Git history, treat it as public. Purging history does not
   un-leak it — the credential is compromised regardless.

### 10.2 If an account is compromised

1. Lock or delete the account (`/admin/users`), which ends its sessions on the
   next refresh.
2. Review `AuditLog` for that actor.
3. Force a password reset.
4. If it was an admin account, audit changes made during the window — especially
   payment approval, bank-account edits and anatomy publication.

### 10.3 If the server is suspected compromised

1. Take a snapshot/dump **before** rebuilding, for forensics.
2. Rotate every secret in `.env.production` and every provider key.
3. Rebuild from a clean image; do not "clean" a compromised host in place.
4. Restore data from a backup taken before the compromise, after checking that
   the backup itself is clean.
5. Change SSH keys for all operators.

### 10.4 If payments are affected

Reconcile `Payment` against Chapa's settlement report. Any payment marked active
without a matching Chapa transaction is a fraud signal. Freeze the affected
accounts and investigate before re-enabling checkout.

---

## 11. Data protection

- Personal data: names, email addresses, phone numbers, password hashes,
  progress, AI-generated content, uploaded receipts.
- Storage: a single PostgreSQL database on the college's VPS, plus the `uploads`
  volume.
- Backups contain the same personal data — protect them like the database
  ([docs/deployer/30-DATABASE-AND-BACKUPS.md](30-DATABASE-AND-BACKUPS.md)).
- Retention, consent and student deletion requests are **college policy**; the
  platform has no automated retention job. If deletion is required, it must be
  performed deliberately (and the associated uploads and audit entries
  considered).

---

## 12. Known gaps and accepted risks

| Gap | Impact | Mitigation / decision |
|---|---|---|
| No MFA | Password compromise = account takeover | Long unique passwords; lockout + rate limiting; revisit before admin scale-up |
| Single VPS, no HA | Host loss = full outage | Off-box backups; documented recovery; acceptable for launch |
| `COOKIE_DOMAIN` not enforced at boot | Login loop instead of a clear error | Documented in the env templates and [42-NGINX-AND-TLS.md](42-NGINX-AND-TLS.md); fixed in a follow-up |
| Redis has no password | Internal-only, no host port | Do not publish Redis; adding `requirepass` needs a client change |
| Verification/reset tokens stored raw in the DB | DB read access could mint a session | Tokens are single-use and short-lived; rotate on suspected DB access |
| No automated dependency scanning | Vulnerable transitive package could linger | Run `npm audit` before each release |
| Anatomy content not faculty-reviewed | Clinical-accuracy risk, not a security risk | Gate publication on review; see `docs/archive/PROGRESS.md` |
| No web application firewall | Generic attacks reach the app | Rate limiting, validation and headers; add a WAF only if traffic justifies it |

---

## 13. Pre-release security checks

```bash
npm audit --workspace=apps/api --omit=dev
npm audit --workspace=apps/web --omit=dev
npm run check:env -- .env.production --strict
git log -p -- .env .env.production 2>/dev/null | head    # must be empty
```

The last command must produce no output. If it shows credentials, they are in
Git history and must be treated as compromised.
