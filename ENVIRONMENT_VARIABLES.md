# Environment Variables

Every variable the application actually reads, what it does, whether it is
required, whether it is server-side or shipped to the browser, where the value
comes from, and whether staging differs from production.

The canonical templates are:

| File | Use |
|---|---|
| [`.env.example`](.env.example) | Local development |
| [`.env.production.example`](.env.production.example) | Staging **and** production on the VPS |
| [`services/receipt-verifier/.env.example`](services/receipt-verifier/.env.example) | Verifier when run standalone |

> **Rule:** `.env` and `.env.production` are git-ignored and must never be
> committed. Anything prefixed `NEXT_PUBLIC_` is public — never put a secret
> behind that prefix. There is exactly one such variable in this project.

---

## 1. How configuration is loaded

| Context | File | Loaded by |
|---|---|---|
| Local API | `apps/api/.env` | `ConfigModule` (cwd must be `apps/api`) |
| Local web | `apps/web/.env.local` | Next.js |
| Docker Compose | `.env.production` via `--env-file` | `${VAR}` substitution in `docker-compose.prod.yml` |
| `api` container | the same `.env.production` via `env_file:` | NestJS `ConfigModule` |
| `postgres` container | `POSTGRES_*` only, from compose `environment:` | the postgres image |
| `verifier` container | `VERIFIER_SHARED_TOKEN` only, from compose | FastAPI |
| `web` container | `NODE_ENV`, `PORT`, `NEXT_PUBLIC_API_URL` | Next.js |

The scoping is deliberate: the verifier parses untrusted receipts and drives a
browser, so it receives exactly one secret and none of the JWT, SMTP, Chapa or
Gemini credentials. Only `api` loads the full file.

---

## 2. Required in production

The API **refuses to start** if any of these is missing, empty, a placeholder,
or (for URLs) points at localhost:

```text
DATABASE_URL
JWT_ACCESS_SECRET          >= 32 chars, distinct, not a placeholder
JWT_REFRESH_SECRET         >= 32 chars, distinct, not a placeholder
SMTP_HOST  SMTP_USER  SMTP_PASS  SMTP_FROM
API_PUBLIC_URL  WEB_PUBLIC_URL  CORS_ORIGIN
```

Conditionally required:

| Condition | Also required |
|---|---|
| `RECEIPT_VERIFIER_URL` set (compose always sets it) | `RECEIPT_VERIFIER_TOKEN` |
| `CHAPA_SECRET_KEY` set | `CHAPA_WEBHOOK_SECRET` (and vice versa) |
| Docker Compose deploy | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Split-host deploy (web ≠ api hostname) | `COOKIE_DOMAIN` |
| Running the seed | `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` |

---

## 3. Reference

Legend — **Req:** R required · O optional · C conditional.
**Exposure:** S server-only · B browser.

### Application

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `NODE_ENV` | Enables production behaviour (secure cookies, strict validation, localhost rejection) | R | S | Set by you | Both `production` |
| `PORT` | API listen port inside the container | O (4000) | S | Fixed by the stack | Same |
| `WEB_PUBLIC_URL` | Web origin for email links, password reset, Chapa return URL | R | S | Your registered domain | Different host |
| `API_PUBLIC_URL` | API origin for the Chapa callback URL | R | S | Your registered domain | Different host |
| `APP_URL` | Legacy fallback for email links | O | S | Copy of `WEB_PUBLIC_URL` | Same |
| `COLLEGE_NAME` | Name printed on PDF receipts and emails | O | S | The college | Same |
| `APP_NAME` | Brand name in emails and receipts | O | S | The college | Same |

### CORS and proxy

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `CORS_ORIGIN` | Exact browser origin(s) allowed to call the API, comma-separated | R | S | Your web domain | Different |
| `TRUST_PROXY` | Trusted reverse-proxy hops or addresses/subnets for `X-Forwarded-For` | O (blank = 1 in prod) | S | Your topology; `loopback,172.18.0.0/16` (recommended) or `2` behind Cloudflare | Same |
| `COOKIE_DOMAIN` | Parent domain shared by the auth cookies | C (required for split-host) | S | Your registered domain, e.g. `.lormentor.com` | Each environment's own domain |

Wildcards in `CORS_ORIGIN` are rejected. `COOKIE_DOMAIN` must be a bare hostname
with an optional leading dot — no scheme, port, path or wildcard.

`CORS_ORIGIN` (together with `WEB_PUBLIC_URL` and `API_PUBLIC_URL`) is **also
the origin allow-list for state-changing requests**. A global `OriginGuard`
rejects any `POST`/`PUT`/`PATCH`/`DELETE` whose `Origin` header is present and
not on the list — a second CSRF layer on top of `SameSite=Lax` cookies. Requests
carrying no `Origin` header are allowed (server-to-server calls, webhooks, and
the web app's same-origin `/api/proxy` forwarding all use that shape), and safe
methods are never blocked. **If you add a browser origin that talks to the API,
it must be in `CORS_ORIGIN` or its writes will be rejected with 403.** Origins
are compared case-insensitively with any trailing slash ignored.

`COOKIE_DOMAIN` is **enforced at API boot in production**, not merely
documented. Three rules run before the app starts (`apps/api/src/config/env.validation.ts`,
mirrored in `scripts/check-env.mjs --strict`):

1. If `WEB_PUBLIC_URL` and `API_PUBLIC_URL` are on **different hosts**, a
   `COOKIE_DOMAIN` is **required**. Without a shared parent domain the browser
   never sends the auth cookie to the web host, so login succeeds and every
   protected page bounces back to `/login`.
2. It must have at least **two labels** — `com`, `localhost` and `internal` are
   rejected (public suffix or not shared between two hosts).
3. It must be a **parent domain of both** `WEB_PUBLIC_URL` and `API_PUBLIC_URL`,
   matched on **label boundaries**: `example.com` covers `api.example.com` but
   *not* `notexample.com`.

A single-host deployment (`WEB_PUBLIC_URL` and `API_PUBLIC_URL` identical, e.g.
nginx serving both paths from one domain) needs no `COOKIE_DOMAIN` and must
leave it blank. Non-production environments are unaffected: staging and local
development may omit it.

### Database

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `DATABASE_URL` | Prisma connection string | R | S | Built from your PostgreSQL credentials | Different DB and password |
| `POSTGRES_USER` | Superuser created in the container | R (Docker) | S | Chosen by you | Different |
| `POSTGRES_PASSWORD` | Container password; must match the one inside `DATABASE_URL` | R (Docker) | S | `openssl rand -hex 24` — URL-safe only | Different |
| `POSTGRES_DB` | Database name created in the container | R (Docker) | S | Chosen by you | Different |

`@ : / # % ?` in the password corrupts `DATABASE_URL`; percent-encode or use
hex. Changing `POSTGRES_PASSWORD` without changing `DATABASE_URL` (or vice
versa) locks the API out of its own database.

### Authentication

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `JWT_ACCESS_SECRET` | Signs 15-minute access tokens | R | S | `openssl rand -hex 48` | **Must differ** |
| `JWT_REFRESH_SECRET` | Signs 7-day refresh tokens | R | S | A second `openssl rand -hex 48` | **Must differ** |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime | O (15m) | S | Your policy | Same |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime | O (7d) | S | Your policy | Same |

Anyone holding `JWT_ACCESS_SECRET` can forge an administrator session. These two
values are the most sensitive in the file.

### Email (SMTP / Resend)

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `SMTP_HOST` | SMTP server hostname | R | S | Provider (Resend: `smtp.resend.com`) | Same |
| `SMTP_PORT` | 587 (STARTTLS) or 465 (implicit TLS) | O (587) | S | Provider | Same |
| `SMTP_USER` | SMTP username (Resend: literally `resend`) | R | S | Provider | Same |
| `SMTP_PASS` | SMTP password / API key | R | S | Provider dashboard → API keys | Separate keys if possible |
| `SMTP_FROM` | Sender identity, `Name <address@domain>` | R | S | A **verified** domain | Same domain |

`SMTP_FROM` must contain a valid address, and `@resend.dev` senders are rejected
at boot: they only deliver to the account owner. See [INTEGRATIONS.md](INTEGRATIONS.md).

### AI

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `GEMINI_API_KEY` | Authenticates AI jobs, the tutor and Anatomy Lab help | C | S | Google AI Studio | Separate keys recommended |
| `GEMINI_MODEL` | Model override; the code default is `gemini-3.8-flash` | O | S | Your choice | Normally identical |

Two call sites in `gemini.service.ts` hard-code `gemini-3.8-flash`; the env var
only affects the configurable path. Retiring that model requires a code change.

### Redis

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `REDIS_HOST` | Cache, BullMQ queue, token denylist | R (Docker) | S | Compose service name `redis` | `redis` in both |
| `REDIS_PORT` | Redis port | O (6379) | S | Fixed | Same |
| `REDIS_FAIL_MODE` | `closed` rejects refresh attempts when Redis is down; `open` is a debug escape hatch | O (`closed`) | S | Fixed | Same |

Redis has **no password support** in this application and is never published to
the host. Do not add `requirepass` without changing the client code.

### Payments — Chapa (optional)

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `CHAPA_BASE_URL` | Chapa API base | O | S | `https://api.chapa.co/v1` | Same |
| `CHAPA_SECRET_KEY` | API secret | C (all-or-nothing) | S | Chapa dashboard → Settings → API | **Test key vs live key** |
| `CHAPA_WEBHOOK_SECRET` | HMAC secret for webhook signatures | C (all-or-nothing) | S | Chapa dashboard → Webhooks | **Test vs live** |

Test keys are prefixed `CHASECK_TEST-`; live keys are `CHASECK-`.

### Receipt verification

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `RECEIPT_VERIFIER_URL` | Internal verifier endpoint | O | S | Compose sets `http://verifier:8000` | Same |
| `RECEIPT_VERIFIER_TOKEN` | Shared secret sent as `x-verifier-token` | C | S | `openssl rand -hex 24` | **Must differ** |
| `RECEIPT_VERIFIER_TIMEOUT_MS` | Per-attempt timeout, 5000–120000 | O (60000) | S | Your policy | Same |
| `COMPANY_BANK_ACCOUNTS` | Legacy matching-only fallback; live accounts live in `/admin/banks` | O | S | College bank accounts | Same |
| `COMPANY_BANK_ACCOUNT_LABELS` | Labels for the legacy env accounts | O | S | College | Same |

Compose passes `RECEIPT_VERIFIER_TOKEN` to the verifier as
`VERIFIER_SHARED_TOKEN`, so the two can never drift. The pairing is enforced on
both sides:

- `docker-compose.prod.yml` uses
  `${RECEIPT_VERIFIER_TOKEN:?RECEIPT_VERIFIER_TOKEN must be set ...}`, so compose
  refuses to start the verifier without it.
- The verifier itself refuses to **start** when `VERIFIER_SHARED_TOKEN` is
  unset, empty or whitespace-only, and re-checks the header on every `/extract`
  call with a constant-time comparison. An empty value is treated exactly like a
  missing one — there is no configuration that silently disables the check.
  `GET /health` is unauthenticated (it is the container healthcheck target).

Changing the value means restarting **both** the verifier and the API.

### Cheki

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `CHEKI_ENABLED` | Kill switch for the primary verification source | O (`"true"`) | S | Your policy | Same |
| `CHEKI_BASE_URL` | Cheki base URL | O | S | `https://cheki.et` | Same |
| `CHEKI_TIMEOUT_MS` | Per-attempt timeout | O (20000) | S | Your policy | Same |
| `CHEKI_CACHE_TTL_MS` | Result cache duration | O (300000) | S | Your policy | Same |

### Observability and seeding

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `SENTRY_DSN` | Error reporting | O | S | Sentry project → Client Keys (DSN) | Separate projects |
| `SUPER_ADMIN_EMAIL` | First administrator login | C (seed) | S | The college | Different |
| `SUPER_ADMIN_PASSWORD` | First administrator password | C (seed) | S | Password manager | Different |
| `SUPER_ADMIN_NAME` | Display name | O | S | The college | Same |

The seed never overwrites an existing super admin, so set these **before** the
first seed and change the password from the UI afterwards if desired.

### Frontend

| Name | Purpose | Req | Exp | Where the value comes from | Staging vs production |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | API origin for the browser bundle **and** for server components, route handlers and rewrites | R (Docker) | **B** | Your API domain | Different host |
| `ALLOW_LOCAL_API_ORIGIN` | Escape hatch that permits a loopback API origin in a production build | Never in a deployment | **B**/R | Unset | Never set |

This is the only browser-exposed variable and it holds a public URL, never a
secret. It is used twice: inlined into the client bundle at **build** time
(compose build arg) and read at **runtime** by server-side code (compose
environment). Removing either copy breaks the web app.

**It is validated, not merely read** (`apps/web/src/lib/api-base.ts`). In
production the value must be a bare absolute `http(s)` origin with no path,
query or fragment, and it must not point at a loopback or private address:

| Value | Development | Production |
|---|---|---|
| unset or empty/whitespace | falls back to `http://localhost:4000` | **build/runtime error** |
| `https://api.example.com` | accepted | accepted |
| `https://api.example.com/api/v1` | error (not a bare origin) | error |
| `api.example.com` (no scheme) | error (not an absolute URL) | error |
| `http://localhost:4000`, `http://10.0.0.5`, `http://api` | accepted (LAN testing) | error (loopback/private) |

The check runs at **both** ends: `next.config.ts` fails the *build*, and the
`/api/proxy` route handler refuses to serve (HTTP 503, generic message) if a
runtime value is bad. An empty string used to fall through a `??` fallback to
localhost and silently break every server-side API call, which is why it is now
an error rather than a default.

`ALLOW_LOCAL_API_ORIGIN=1` exists only so a developer can smoke-test a
production build against a local API (`next build` always runs with
`NODE_ENV=production`). It weakens *only* the loopback rule — syntax checks
still apply — and must **never** be set on a deployment: it would let a
production image ship pointing at an unreachable private address.

### Test and tooling only

`E2E_BASE_URL` (Playwright), `ANALYZE` (bundle analyser), `CI`. Never set these
in production.

---

## 4. Validation rules enforced at boot

`apps/api/src/config/env.validation.ts` runs once at startup and throws rather
than starting with a bad configuration:

- Required keys present and non-empty.
- Placeholders (`change-me*`, `your-*`, empty) rejected in production.
- JWT secrets: ≥ 32 characters, not a single repeated character, access ≠ refresh.
- `DATABASE_URL` must not contain `change-me`.
- `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `CORS_ORIGIN`: required in production and
  must not contain `localhost` / `127.0.0.1`.
- `CORS_ORIGIN`: no wildcards.
- `COOKIE_DOMAIN`: bare hostname, optional leading dot, no scheme/port/path/wildcard.
- `COOKIE_DOMAIN` in production (split-host rule): required when the web and API
  hosts differ, at least two labels, and a parent domain of both hosts matched on
  label boundaries — see §3.
- `SMTP_PASS`: not a placeholder. `SMTP_FROM`: valid address, not `@resend.dev`.
- Chapa: both keys or neither.
- `REDIS_FAIL_MODE`: `closed` or `open`.
- `RECEIPT_VERIFIER_TOKEN`: required and ≥ 32 chars when the verifier URL is set.
- `COMPANY_BANK_ACCOUNTS` entries: at least 8 digits each.
- `RECEIPT_VERIFIER_TIMEOUT_MS`: integer 5000–120000.
- `TRUST_PROXY`: a non-negative integer (proxy hops) or a comma-separated list of trusted proxy IPs/CIDRs/named ranges (`loopback`, `linklocal`, `uniquelocal`) if set.

The web app validates `NEXT_PUBLIC_API_URL` separately, in its own process, at
**build** time (`next.config.ts`) and **request** time (`/api/proxy`) — see §3.
Both belong to the same preflight: `npm run check:env -- .env.production --strict`
covers the file-level half.

`scripts/check-env.mjs` checks the same rules against a file before deployment:

```bash
npm run check:env -- .env.production            # structure and duplicates
npm run check:env -- .env.production --strict   # placeholders and localhost
```

Its `--strict` mode is expected to **fail** on `.env.production.example` — the
template deliberately contains placeholders.

---

## 5. Generating and storing secrets

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET
openssl rand -hex 24   # RECEIPT_VERIFIER_TOKEN
openssl rand -hex 24   # POSTGRES_PASSWORD
```

- Store every generated value in the college's password manager, not in chat,
  tickets or email.
- On the VPS: `chmod 600 .env.production`, owned by the deploy user.
- Rotation procedure: [`docs/audit/SECRET-ROTATION-RUNBOOK.md`](docs/audit/SECRET-ROTATION-RUNBOOK.md).
- Compromised secret handling: [`SECURITY.md`](SECURITY.md).

## 6. Staging versus production — the short version

Same key set. Different values for:

- Domains (`WEB_PUBLIC_URL`, `API_PUBLIC_URL`, `CORS_ORIGIN`, `COOKIE_DOMAIN`,
  `NEXT_PUBLIC_API_URL`)
- Database credentials
- JWT secrets
- `RECEIPT_VERIFIER_TOKEN`
- Chapa keys (test vs live)

Everything else is normally identical. Never weaken security settings for
staging — the soak exists to exercise the production configuration.
