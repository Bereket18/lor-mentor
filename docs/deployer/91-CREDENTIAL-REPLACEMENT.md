# Credential replacement — from the previous owner to the college

This document is for the person taking the project over. It answers one
question: **the previous owner created all the accounts and secrets — how do I
replace every one of them with the college's own?**

Do this once, before the site goes public. It takes a few hours because some
providers (Chapa, the domain registrar) move slowly.

> **Golden rule:** create the new value *first*, put it in `.env.production`,
> restart, verify, and only then revoke the old one. Never delete or rotate a
> credential you cannot replace yet.

---

## 1. What has to change

Every row below is something the previous owner currently controls. "New owner"
means who should hold it after handover; "where it lives" is where you change it.

### 1.1 Accounts and access

| Thing | Where it lives today | New owner | What to do |
|---|---|---|---|
| Domain and DNS records | Registrar / Hostinger hPanel (DNS zone) | College | Transfer the domain into a college registrar account, or at minimum move DNS management and give the college the registrar login (§4.1) |
| Hostinger VPS + hPanel | Hostinger account of the previous owner | College | Transfer the VPS to a college Hostinger account, or create a new VPS and redeploy (§4.2) |
| Root / deploy SSH access | `~/.ssh/authorized_keys` on the VPS | College | Add the college's key, remove the old key (§4.2) |
| Git repository | GitLab `bereketadamsseged/lor-mentor-edu`; GitHub mirror `Bereket18/lor-mentor` | College | Fork/transfer to a college namespace, then re-point the server's `origin` (§4.3) |
| Resend (email) | Resend account of the previous owner, with the sending domain verified | College | Create a college Resend account, re-verify the domain, new API key (§4.4) |
| Google AI Studio (Gemini) | API key created by the previous owner | College | New key in a college Google account (§4.5) |
| Chapa (card/Telebirr) | Merchant account of the previous owner | College | New merchant account, KYC in the college's name, settlement to the college's bank account (§4.6) |
| Sentry (error tracking, optional) | Project of the previous owner | College | New project, new DSN (§4.7) |
| Cheki (receipt source, optional) | Third-party integration, no login in this repo | College | Confirm the college's agreement with Cheki; nothing to paste into the app except `CHEKI_*` settings (§4.8) |
| Bank account numbers | `/admin/banks` in the app, plus legacy `COMPANY_BANK_ACCOUNTS` | College | Enter the college's accounts in the admin UI (§4.13) |
| First administrator | `SUPER_ADMIN_*` seed values | College | Seed with the college's address, then change the password in the UI (§4.12) |

### 1.2 Secrets that exist only on the server

These are generated values, not accounts. They are stored in
`.env.production` on the VPS and in the college's password manager. Never
commit them, never paste them into chat or a ticket.

| Secret | Used by | Replace it by |
|---|---|---|
| `POSTGRES_PASSWORD` + `DATABASE_URL` | PostgreSQL and the API | Generate a new value and update **both** together (§4.9) |
| `JWT_ACCESS_SECRET` | access tokens | `openssl rand -hex 48` — invalidates every session (§4.10) |
| `JWT_REFRESH_SECRET` | refresh tokens | a different `openssl rand -hex 48` (§4.10) |
| `RECEIPT_VERIFIER_TOKEN` | API ↔ verifier | `openssl rand -hex 24`; Compose passes it to both sides (§4.11) |
| `SUPER_ADMIN_PASSWORD` | first admin login | Set before the first seed; change again in the UI (§4.12) |
| `SMTP_PASS` | email | The **new** Resend API key (§4.4) |
| `GEMINI_API_KEY` | AI features | The **new** Google AI Studio key (§4.5) |
| `CHAPA_SECRET_KEY` / `CHAPA_WEBHOOK_SECRET` | payments | The **new** Chapa live key + webhook secret (§4.6) |
| `SENTRY_DSN` | error reporting | The **new** Sentry DSN (§4.7) |

### 1.3 Values that are not secrets but still say "previous owner"

| Variable | What to change it to |
|---|---|
| `WEB_PUBLIC_URL`, `API_PUBLIC_URL`, `APP_URL` | the college's domain |
| `CORS_ORIGIN` | the college's web origin (exact match) |
| `COOKIE_DOMAIN` | `.college-domain` on a split-host deploy |
| `SMTP_FROM` | an address on the **verified** college domain, e.g. `Lor Mentor <no-reply@college-domain>` |
| `COLLEGE_NAME`, `APP_NAME` | the college's name and the product name it should show |
| `SUPPORT_EMAIL` | the mailbox that should receive support notifications (leave blank to use the fallback) |
| `COMPANY_BANK_ACCOUNTS`, `COMPANY_BANK_ACCOUNT_LABELS` | leave blank if the college's accounts are entered in `/admin/banks` |

The full variable reference is [60-ENVIRONMENT-VARIABLES.md](60-ENVIRONMENT-VARIABLES.md).
The per-secret rotation procedure is [90-SECRET-ROTATION.md](90-SECRET-ROTATION.md).

---

## 2. The order to do it in

Do the phases in order. Each phase ends with a working site, so you can stop
and come back.

| Phase | What | Why it is in this position |
|---|---|---|
| A | Transfer the **domain** and **VPS** | Everything else (email, TLS, payments) depends on the domain and the server |
| B | Move the **Git repository** and add the college's SSH key | You need to be able to deploy before you change application secrets |
| C | Create the **new third-party accounts** (Resend, Gemini, Chapa, Sentry) | The new values must exist before you can put them in `.env.production` |
| D | **Generate server secrets** and update `.env.production` | One editing session, one restart |
| E | Create the **college's administrator** and bank accounts | The site is ready for the college to log in |
| F | **Revoke** the previous owner's access | Only after phases A–E are verified |
| G | **Verify** with the smoke test | The handover is done when the checklist is green |

---

## 3. Before you start

- [ ] The college has a **password manager** (Bitwarden, 1Password, or the
      college's own vault) and owns it. Do not keep the only copy in a personal
      account.
- [ ] You have SSH access to the VPS as the `deploy` user.
- [ ] You can run `sudo` on the VPS.
- [ ] You know the **domain** and can log in to its DNS zone.
- [ ] You have a maintenance window: changing `POSTGRES_PASSWORD` or the JWT
      secrets restarts the API and logs everyone out.
- [ ] You have read [10-DEPLOYMENT-GUIDE.md](10-DEPLOYMENT-GUIDE.md) — this
      document assumes the stack is already deployed and running.

---

## 4. Per-service steps

### 4.1 Domain and DNS

1. Log in to the registrar or Hostinger hPanel where the domain is registered.
2. Move the domain into a college-owned account (registrar transfer, or an
   account change if the registrar supports it). This can take days — start it
   first.
3. Confirm the DNS zone still has the records from
   [10-DEPLOYMENT-GUIDE.md](10-DEPLOYMENT-GUIDE.md): `A @`, `A www`, `A api`.
4. Confirm the email records too (SPF, DKIM, DMARC) — they belong to Resend and
   must survive the transfer.
5. Verify from a machine that is not the VPS:

   ```bash
   dig +short <domain> api.<domain> www.<domain>
   ```

   All three must print the VPS address.

> If the domain cannot be transferred, at minimum move the **registrar login**
> and **DNS management** to the college, and write that limitation down in
> [80-GO-NOGO-GATE.md](80-GO-NOGO-GATE.md).

### 4.2 Hostinger VPS and SSH

Either transfer the existing VPS to a college Hostinger account, or build a new
one and redeploy from scratch ([10-DEPLOYMENT-GUIDE.md](10-DEPLOYMENT-GUIDE.md)).

On the server:

```bash
# 1. Add the college engineer's public key to the deploy user
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys /path/to/college-key.pub
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys

# 2. Confirm the new key works (open a second terminal, do not close the first)

# 3. Remove the previous owner's key
sudo -u deploy nano /home/deploy/.ssh/authorized_keys
```

Also in the Hostinger panel:

- Change the hPanel account email to a college address.
- Review the panel firewall: keep 22, 80 and 443 open, nothing else.
- Remove any API keys or sub-accounts the previous owner created.

### 4.3 Git repository

The server clones from GitLab. To move it to the college:

1. On GitLab, transfer the project to the college's group (Settings → General →
   Advanced → Transfer project), or create a college-owned project and push a
   mirror.
2. Point the server at the new URL **without touching the working tree**:

   ```bash
   cd /opt/lor-mentor
   git remote set-url origin <college-repo-url>
   git fetch origin
   git status
   ```

3. If you also use the GitHub mirror, do the same in its settings. Remember the
   mirror is not the source of truth — GitLab is.
4. Give the college's engineers the roles they need, and remove the previous
   owner's access **after** phase F verification.

> Do not re-clone on the server unless you must. A fresh clone is safe, but
> `git pull` from a changed remote keeps the CRLF-sensitive migration files
> exactly as they were.

### 4.4 Resend (email)

1. Create a Resend account with a college address.
2. Add the sending domain, choose the region, and copy the DNS records Resend
   shows into the domain's DNS zone.
3. Wait until Resend shows the domain as **Verified**, then send a test message.
4. Create an API key with sending permission. This becomes `SMTP_PASS`.
5. Update `.env.production`:

   ```env
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=587
   SMTP_USER=resend
   SMTP_PASS=<new college API key>
   SMTP_FROM="Lor Mentor <no-reply@college-domain>"
   ```

6. Revoke the previous owner's API key in Resend after the new one works.

Full walkthrough, including SPF/DKIM/DMARC and the `@resend.dev` boot check:
[41-EMAIL-SETUP.md](41-EMAIL-SETUP.md).

### 4.5 Google AI Studio (Gemini)

1. Sign in to Google AI Studio with a college Google account.
2. Create an API key in a project the college owns.
3. Put it in `.env.production` as `GEMINI_API_KEY`.
4. Restart the API and exercise the tutor, flashcards and quiz once.
5. Delete the previous owner's key from the old account.

Without a key the AI features are unavailable, but the site still runs.

### 4.6 Chapa (payments)

Chapa is optional — bank transfer works without it. If the college wants card
and Telebirr checkout:

1. Create a merchant account in the **college's legal name** and complete KYC
   (trade licence, TIN, authorised person's ID, settlement bank account). The
   settlement account is set **in the Chapa dashboard**, not in this app.
2. Add the college's domain and webhook:
   `https://api.<domain>/api/v1/payments/chapa/webhook`.
3. Copy the **live** secret key (`CHASECK-…`) and the webhook Secret Hash.
4. Put both in `.env.production` — the API refuses to boot with only one:

   ```env
   CHAPA_BASE_URL=https://api.chapa.co/v1
   CHAPA_SECRET_KEY=<live key>
   CHAPA_WEBHOOK_SECRET=<webhook secret>
   ```

5. Do one small real payment and confirm it settles in the college's balance.
6. Remove the previous owner's team access in the Chapa dashboard.

If Chapa is not ready, leave both values blank. Details:
[40-PAYMENTS.md](40-PAYMENTS.md) and [82-PRODUCTION-GATES-AND-EVIDENCE.md](82-PRODUCTION-GATES-AND-EVIDENCE.md).

### 4.7 Sentry (optional)

1. Create a project in a college Sentry organisation.
2. Copy the DSN into `SENTRY_DSN`.
3. Trigger one handled error in staging and confirm it appears.
4. Remove the previous owner's project members.

### 4.8 Cheki (optional)

Cheki is the primary bank-receipt source. There is no credential in this
repository — the app calls the public receipt endpoint configured by
`CHEKI_BASE_URL`, with `CHEKI_ENABLED` as a kill switch. Nothing to replace
unless the college's agreement with Cheki provides a different endpoint; if it
does, change `CHEKI_BASE_URL` and keep `CHEKI_TIMEOUT_MS` and
`CHEKI_CACHE_TTL_MS` at their documented defaults unless Cheki advises
otherwise.

Receipts that cannot be verified automatically always fall back to admin review,
so a missing integration does not block launch.

### 4.9 Database password

`POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must always match.
Generate a URL-safe value (no `@ : / # % ?`):

```bash
openssl rand -hex 24
```

Then edit `.env.production`:

```env
POSTGRES_PASSWORD=<new value>
DATABASE_URL=postgresql://<POSTGRES_USER>:<new value>@postgres:5432/<POSTGRES_DB>?schema=public
```

PostgreSQL only reads `POSTGRES_PASSWORD` when it **initialises** an empty data
directory. On an existing volume you must change the password inside the
database too. Load the file into your shell first so `$POSTGRES_USER` expands:

```bash
cd /opt/lor-mentor
set -a; . ./.env.production; set +a

docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "ALTER USER \"$POSTGRES_USER\" WITH PASSWORD '<new value>';"
```

Then recreate the API so it picks up the new `DATABASE_URL`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
curl -s https://api.<domain>/api/v1/health/ready
```

If the health check fails with `password authentication failed`, the two values
disagree — fix `.env.production`, do not touch the database again.

> **Why this matters here:** the old database password must be considered
> exposed. It appeared in the Git history of a local helper script (§5). Rotating
> it is the only fix that does not depend on a history rewrite.

### 4.10 JWT secrets

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET — must be different from the first
```

Put both in `.env.production` and restart the API. **Every user is logged out**
and must sign in again. That is expected.

### 4.11 Receipt verifier token

```bash
openssl rand -hex 24
```

Set `RECEIPT_VERIFIER_TOKEN` in `.env.production`. Compose passes it to the
verifier as `VERIFIER_SHARED_TOKEN`, so the two sides cannot drift. Recreate
both services together:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api verifier
```

### 4.12 The college's administrator

The seed creates the first super admin once and never overwrites it. If the
database is fresh, set the values before the first seed:

```env
SUPER_ADMIN_EMAIL=admin@college-domain
SUPER_ADMIN_PASSWORD=<strong temporary password>
SUPER_ADMIN_NAME=College Administrator
```

If the database already exists, do not re-seed — change the administrator's
password in the app (profile → change password), and use the users module to
remove any account that belonged to the previous owner.

### 4.13 Bank accounts

Live payment instructions come from **Admin → Banks** (`/admin/banks`), not from
environment variables. Enter the college's receiving accounts there, with the
labels students should see.

`COMPANY_BANK_ACCOUNTS` and `COMPANY_BANK_ACCOUNT_LABELS` are a legacy
matching-only fallback. Leave them blank unless the college deliberately wants
the fallback list; if you use them, every account number must have at least 8
digits.

### 4.14 Support email

`SUPPORT_EMAIL` decides where support notifications go. If it is unset, the app
uses its fallback address — which may still be the previous owner's. Set it to
the college's mailbox.

---

## 5. Remove the old password from `aicheck.mjs`

`aicheck.mjs` is a local development helper committed at the repository root.
The **current version** reads `DATABASE_URL` from the environment and refuses to
run without it, so the file no longer contains a password. The **initial
commit** did contain one, which means the value is still in Git history.

What to do:

1. Rotate the database password (§4.9). This is the part that actually protects
   the data — assume the old value is public.
2. Confirm the current file is clean:

   ```bash
   git grep -n "postgresql://" -- aicheck.mjs
   ```

   Expect no output.
3. Never re-introduce a literal connection string. Run it as:

   ```bash
   DATABASE_URL="postgresql://..." node aicheck.mjs
   ```

4. A history rewrite (removing the password from old commits) is a **college
   decision**: it rewrites every commit hash and forces every clone to be
   re-created. Rotation alone is sufficient for security; the rewrite is for
   tidiness. Record the decision in
   [80-GO-NOGO-GATE.md](80-GO-NOGO-GATE.md) either way.

---

## 6. Revoking the previous owner

Do this only after §7 passes.

| Service | What to remove |
|---|---|
| GitLab / GitHub | previous owner's membership; rotate deploy keys and personal access tokens |
| Hostinger | previous owner's hPanel user, API keys, SSH key |
| Server | previous owner's `authorized_keys` entry; any sudo user they created |
| Resend | previous API keys; previous owner's team membership |
| Google AI Studio | previous API key |
| Chapa | previous owner's team membership |
| Sentry | previous owner's membership |
| Domain registrar | previous owner's login |
| Database | the old password is already invalid after §4.9 |
| Any shared password manager folder | remove the previous owner's access |

Then search the repository for anything that still names the old accounts:

```bash
git grep -n -I -E "bereket|Bereket18|bereketadamsseged" -- . ":!*.md"
```

Replace what is a real dependency (a URL in a script) and leave historical notes
in `docs/archive/` alone.

---

## 7. Verification — the handover is done when this passes

Run everything on the production host after the last restart.

```bash
cd /opt/lor-mentor

# 1. The env file is complete and self-consistent
npm run check:env -- .env.production --strict

# 2. Every container is healthy
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# 3. API and database
curl -s https://api.<domain>/api/v1/health/ready

# 4. The site
curl -sS -o /dev/null -w "%{http_code}\n" https://<domain>/

# 5. The end-to-end smoke test
bash deploy/smoke-test.sh https://api.<domain> https://<domain>
```

Then, in the browser:

- [ ] Sign in as the **college administrator** (not the old account).
- [ ] Register a test student → the verification code arrives **from the college
      address** and lands in the inbox.
- [ ] Forgot password → the reset link arrives and works.
- [ ] AI tutor / flashcards / quiz answer (proves the Gemini key).
- [ ] A bank-transfer reference verifies, or lands in admin review; approving it
      generates a PDF receipt with the **college's name**.
- [ ] If Chapa is live: one small real payment settles.
- [ ] `sudo certbot renew --dry-run` succeeds.
- [ ] The nightly backup ran and a restore drill passed
      ([30-DATABASE-AND-BACKUPS.md](30-DATABASE-AND-BACKUPS.md)).
- [ ] The previous owner can no longer sign in to any service in §6.

Record the date, who did it, and any limitation you could not remove in
[80-GO-NOGO-GATE.md](80-GO-NOGO-GATE.md) §11.

---

## 8. If you get stuck

[92-TROUBLESHOOTING.md](92-TROUBLESHOOTING.md) covers the failures this
procedure produces most often: the login loop after `COOKIE_DOMAIN` changes,
`password authentication failed` after the database rotation, email rejected at
boot because `SMTP_FROM` is still on `resend.dev`, and Chapa refusing to boot
with only half a key pair.
