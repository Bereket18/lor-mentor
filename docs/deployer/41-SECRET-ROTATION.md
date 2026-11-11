# Secret Rotation Runbook (S-2 / F-6)

**Status:** NOT STARTED — operator action required  
**Owner:** Operator with access to the hosting provider, database, and each
third-party console  
**Estimated time:** 30–60 minutes plus verification  
**Why this is mandatory:** S-2 is an open production blocker. The audit found
live-looking secrets in the local environment and one database password was
echoed into a local session log (F-6). A secret that has been written to a log,
chat, shell history, screenshot or repository must be treated as compromised.
Rotation is the only fix; deleting the log is not enough.

Do not paste secret values into chat, a ticket, this file or Git. Store them in
a password manager or the deployment secret store.

## 1. What must be rotated

| Secret | Where it is used | Where to rotate | Effect |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | API access-token signing | Generate locally / secret store | All existing access tokens become invalid |
| `JWT_REFRESH_SECRET` | API refresh-token signing | Generate locally / secret store | All existing refresh tokens become invalid; users must log in again |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | API ↔ PostgreSQL | PostgreSQL role + deployment env | API cannot connect until both sides match |
| `SMTP_PASS` (Resend API key) | Registration, verification, reset email | Resend dashboard | Old key stops sending |
| `CHAPA_SECRET_KEY` | Chapa initialize/verify | Chapa dashboard | Old key stops working |
| `CHAPA_WEBHOOK_SECRET` | Webhook signature verification | Chapa dashboard | Old webhook signature is rejected |
| `RECEIPT_VERIFIER_TOKEN` | API ↔ Python receipt verifier | Generate locally; set on both services | Verifier calls fail until both sides match |
| `GEMINI_API_KEY` | AI tutor / PDF→AI generation | Google AI Studio | AI calls fail until updated |
| Super-admin password | Initial super-admin account | App password change (`PATCH /users/me/password`) or reset flow | Old password stops working |
| Any other production secret | `.env.production` / compose / tunnel / Sentry | Corresponding provider | Depends on the service |

`SUPER_ADMIN_PASSWORD` in `.env.production` is only used by the one-time seed.
Changing it after the account exists does **not** change the user's password.
Use the in-app password change or a one-off password-hash update for the
existing super-admin account.

## 2. Before you start

- Schedule a short maintenance window; rotating JWT secrets logs everyone out.
- Take a database backup and confirm it restores.
- Have the deploy command and rollback command ready.
- Put every **new** value in the password manager before editing files.
- Keep the old values in the password manager only until verification passes;
  then revoke them at the provider and delete the old local copies.
- Do not rotate production and staging with the same values. Use separate
  secrets per environment.
- Verify `.env.production` has no duplicate keys and no placeholders:

  ```bash
  npm run check:env -- .env.production --strict
  ```

  The script reports only key names, never values. Duplicate keys are silent
  last-wins in dotenv, so they must be removed before deploying.
- Leave `REDIS_FAIL_MODE=closed` (the default). Revoked-refresh-token checks
  fail closed when Redis is unreachable; `open` is a local-debug escape hatch
  only and would allow a possibly-revoked refresh token through.

## 3. Generate new values

Use a cryptographic generator. On this project, Node is always available:

```bash
# JWT secrets (48 random bytes -> 96 hex chars)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Verifier shared secret (24 random bytes)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"

# Database password (32 random bytes, URL-safe)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Generate **different** values for access and refresh. Never reuse a value
across environments or services.

## 4. Rotation order

### Step 1 — Database password

The safe order is: change the database role, immediately update the API env,
then restart the API.

Local PostgreSQL example (run as a role that can alter the app role):

```sql
ALTER ROLE lor WITH PASSWORD '<new-db-password>';
```

Docker Compose example:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U lor -d lor_mentor -c "ALTER ROLE lor WITH PASSWORD '<new-db-password>';"
```

Then update **both** values in `.env.production` (or the secret manager):

```dotenv
POSTGRES_PASSWORD=<new-db-password>
DATABASE_URL=postgresql://lor:<url-encoded-new-db-password>@postgres:5432/lor_mentor
```

Important: changing `POSTGRES_PASSWORD` in the compose env does **not** change
the password of an existing database volume. The `ALTER ROLE` above is the
actual rotation; the env value must match it. If the password contains
characters such as `@`, `:`, `/` or `#`, percent-encode it in `DATABASE_URL`.

Verify:

```bash
curl -fsS http://localhost:4000/api/v1/health/ready
```

Expected: HTTP 200 with `"database":"up"`.

### Step 2 — JWT access and refresh secrets

Update both values:

```dotenv
JWT_ACCESS_SECRET=<new-access-secret>
JWT_REFRESH_SECRET=<new-refresh-secret>
```

Restart/redeploy the API. Every existing access and refresh token is now
invalid; that is expected and is the point of rotation.

Verify:

- Log in with a known test account; expect success.
- Use an old access token; expect `401`.
- Use an old refresh token; expect `401`.
- Log out and confirm the refresh cookie is cleared.

### Step 3 — Resend / SMTP key

Complete `RESEND-DOMAIN-VERIFICATION.md` first if the domain is not verified.
Then:

1. Create a new **Sending access** API key in Resend.
2. Update `SMTP_PASS` in the production env.
3. Restart the API.
4. Send a password-reset email to a non-owner mailbox.
5. Confirm delivery in Resend and in the mailbox.
6. Revoke the old Resend key.

### Step 4 — Chapa keys

In the Chapa dashboard:

1. Rotate the secret key.
2. Rotate the webhook secret.
3. Update `CHAPA_SECRET_KEY` and `CHAPA_WEBHOOK_SECRET` in the env.
4. Restart the API.
5. In test mode, initialize a checkout and confirm the returned `checkoutUrl`
   and `txRef`.
6. Send a signed test webhook and confirm it is accepted. A tampered signature
   must return `400`.

Do not switch to live Chapa keys until the test-mode rotation and webhook
checks pass.

### Step 5 — Receipt-verifier token

1. Generate a new token.
2. Set `RECEIPT_VERIFIER_TOKEN` for **both** the API and the verifier service
   (compose service environment / secret store).
3. Restart both services.
4. Confirm the verifier health endpoint and one extraction still work.
5. Confirm a request with the old token is rejected.

### Step 6 — Gemini API key

1. Create a new key in Google AI Studio.
2. Update `GEMINI_API_KEY`.
3. Restart the API.
4. Run the AI tutor once and confirm a real answer.
5. Upload a small PDF and confirm the AI job reaches `COMPLETED`.
6. Delete/disable the old key in Google AI Studio.

### Step 7 — Super-admin password

Use the logged-in account flow:

```http
PATCH /api/v1/users/me/password
Content-Type: application/json

{
  "currentPassword": "<old>",
  "newPassword": "<new-strong-password>"
}
```

If the current password is unavailable, use the password-reset flow after F-8
is fixed, or a one-off script that hashes the new password and updates the
existing user. Do not rely on changing `SUPER_ADMIN_PASSWORD` in the env after
the seed has run.

### Step 8 — Other production secrets

Inventory `.env.production` and the compose file for any additional
authenticating values, for example:

- Cloudflare named-tunnel token, if used.
- Sentry auth token / DSN, if used.
- Redis password, if the deployment enables `requirepass`.
- Any object-storage or backup credentials.

Rotate them in their providers, update the deployment secret store, and
restart the affected service.

## 5. Redeploy and verify

After all values are updated:

```bash
# local production-like API
cd apps/api
node dist/src/main

# docker compose deployment
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate
```

Run the verification checklist:

- [ ] `npm run check:env -- .env.production --strict` passes (no duplicate keys, no placeholders).
- [ ] `GET /api/v1/health/ready` → `200`, database and Redis up.
- [ ] Login with the new password works.
- [ ] An old access token returns `401`.
- [ ] An old refresh token returns `401`.
- [ ] Registration sends a verification email to a non-owner address.
- [ ] Password reset sends and completes for a non-owner address.
- [ ] Chapa test-mode initialize returns a checkout URL.
- [ ] A valid Chapa webhook is accepted; a tampered one returns `400`.
- [ ] Verifier health is OK and one extraction succeeds.
- [ ] AI tutor returns an answer; PDF→AI job reaches `COMPLETED`.
- [ ] Super-admin can log in with the new password.
- [ ] Old provider keys are revoked.
- [ ] No secret values were committed; `git status` shows no `.env` files.

Then run the normal regression and smoke checks:

```bash
cd apps/api && npx jest --silent --runInBand
cd apps/api && npx jest src/modules/payments --silent --runInBand
cd apps/web && npm run lint && npm run build
```

## 6. After rotation

1. Revoke/delete every old key in the provider consoles.
2. Remove old values from local `.env` files, shell history and any temporary
   scripts. Rotation already makes them useless, but cleanup reduces exposure.
3. Confirm no secret was committed:

```bash
git status --short
git grep -n "CHANGE_ME" -- .env.production.example
```

Do not run a broad grep that prints real secret values into the terminal.
4. Record the completion in the audit (date, environment, secrets rotated,
   verifier results) **without values**.
5. Update the F-6/S-2 rows in `FINAL-PRODUCTION-READINESS-REPORT.md` and
   `SECURITY-AUDIT.md` from Open to Closed after all checks pass.
6. Retain the new values only in the password manager / deployment secret store.

## 7. Rollback

If a rotation breaks the stack:

1. Restore the previous value from the password manager for the failing
   service only.
2. Restart that service and confirm health.
3. Fix the mismatch (especially DB password vs `DATABASE_URL`, or verifier
   token on only one side).
4. Retry the rotation in a smaller step.
5. Once successful, revoke the old value again. Do not leave both old and new
   keys active.

## 8. Definition of done

S-2/F-6 is closed only when:

- [ ] Every secret in the inventory has a new value.
- [ ] The API and verifier run with the new values.
- [ ] Old JWTs/refresh tokens are rejected.
- [ ] Old provider keys are revoked.
- [ ] Email, Chapa, verifier and AI smoke checks pass.
- [ ] No `.env` file or secret is tracked by Git.
- [ ] The audit records the rotation date and evidence.
