# External Integrations — Account Setup

What the college must create and configure outside the codebase, exactly what
credentials the application needs, which URLs must be registered, and what each
service costs.

Three integrations require accounts: **Chapa** (card/Telebirr payments),
**Resend** (transactional email) and **Google AI Studio / Gemini** (AI
features). A fourth concern — **DNS** — underpins all of them.

The application is already implemented against these APIs. Nothing in the code
changes for production; only credentials and URLs do.

> Never commit credentials. Every value below belongs in `.env.production` on
> the VPS (mode 600) and in the college's password manager.

---

## 0. At a glance

| Integration | Required for launch? | Account owner | Credential | Goes into |
|---|---|---|---|---|
| DNS | **Yes** | College (domain holder) | — | Registrar / Hostinger DNS zone |
| Resend (email) | **Yes** — password reset and verification depend on it | College | API key | `SMTP_PASS` |
| Gemini | Optional, but AI features are declared | College | API key | `GEMINI_API_KEY` |
| Chapa | Optional — bank transfer + manual review is the launch path | College (KYC documents) | Secret key + webhook secret | `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` |

---

## 1. DNS

Everything else depends on DNS being correct first. It is also the slowest step
(propagation), so start here.

### 1.1 Application records

Add these in **Hostinger → Domains → DNS Zone** (or wherever the domain's
nameservers point). Replace `<VPS_IP>` with the address shown in the Hostinger
VPS panel.

| Record | Type | Name | Value |
|---|---|---|---|
| Apex | A | `@` | `<VPS_IP>` |
| WWW | A | `www` | `<VPS_IP>` (or CNAME → apex) |
| API | A | `api` | `<VPS_IP>` |

Verify from any machine:

```bash
dig +short your-domain
dig +short api.your-domain
```

Certificate issuance (Let's Encrypt) and Chapa webhooks both fail until these
resolve to the VPS.

### 1.2 Mail authentication records (SPF, DKIM, DMARC)

These are **separate from the application records** and prove the college owns
the domain it sends mail from. Your provider supplies the exact values; the
shapes below are Resend's.

| Record | Type | Name | Value (provider-supplied) |
|---|---|---|---|
| SPF | TXT | `@` | `v=spf1 include:resend.com ~all` |
| DKIM | CNAME | `resend._domainkey` | `<value>.resend.com` |
| DMARC | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@your-domain` |

Two rules that cause most failures:

1. **Only one SPF record may exist** for a domain. If one already exists, merge
   the `include:` into it — do not add a second TXT record.
2. **DMARC starts at `p=none`.** Leave it there for a couple of weeks, read the
   reports, then move to `p=quarantine` and eventually `p=reject`.

DNS changes take 5 minutes to 24 hours. Do not send production mail until the
provider shows the domain as **Verified**.

**Owner:** college representative (they control the domain). The deployment
engineer can verify with `dig` and the provider dashboard.

---

## 2. Resend (transactional email)

The API sends mail through SMTP with `nodemailer`. Any SMTP provider works, but
Resend is the documented default.

### 2.1 Create the account and verify the domain

1. Sign up at <https://resend.com>.
2. Add the sending domain (e.g. `your-domain`).
3. Copy the DNS records it shows into the DNS zone (§1.2).
4. Click **Verify** and wait for **Verified**.

### 2.2 Create an API key

Resend → **API Keys** → create a key. This is the value for `SMTP_PASS`.

The SMTP settings are fixed:

| Setting | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` (STARTTLS) |
| User | `resend` |
| Password | the API key |

### 2.3 Sender address

```text
SMTP_FROM="Lor Mentor <no-reply@your-domain>"
```

- The domain **must** be the verified one.
- Use a `no-reply@` mailbox you do not need to read; replies are not processed.
- `@resend.dev` senders are **rejected at boot** — that address only delivers to
  the Resend account owner, so students would never receive anything.

### 2.4 What the application sends

| Message | Trigger | Link lifetime |
|---|---|---|
| Email verification | Registration / resend-verification | 24 hours |
| Password reset | Forgot password | 1 hour |

### 2.5 Billing and usage

- Resend's free tier historically covers a few thousand messages per month with
  a daily cap; confirm the current allowance in the dashboard before launch.
- Expected volume is low: verification + password reset only, not marketing.
- If the college expects a large intake, confirm the daily cap exceeds a peak
  registration day.
- Deliverability depends on §1.2 being correct. Mail that lands in spam is
  almost always an unverified DKIM/SPF record, not an application bug.

**Owner:** college creates the account and verifies the domain; deployment
engineer installs the API key and restarts the API.

---

## 3. Google AI Studio / Gemini

Powers AI summaries, flashcards, quizzes, the tutor and Anatomy Lab help.

### 3.1 Create the key

1. Sign in at <https://aistudio.google.com/apikey> with the college's Google
   account (use a shared institutional account, not a personal one).
2. Create an API key.
3. Put it in `GEMINI_API_KEY`.

### 3.2 Model

The code default is `gemini-3.8-flash`
(`apps/api/src/modules/ai/gemini.service.ts`). `GEMINI_MODEL` only overrides the
configurable path; two call sites hard-code the model, so switching models
wholesale requires a code change.

### 3.3 Billing and privacy

- AI Studio keys have free-tier quotas. Enabling billing on the Google Cloud
  project raises them; check the current quota page before launch.
- AI use is student-driven (summaries, questions), so cost scales with usage.
  Set a budget alert on the Google Cloud project.
- **Student content leaves the platform**: prompts may include course material
  and, for the tutor, the student's question. Review Google's data-usage terms
  and, if required by college policy, inform students. This is a policy decision
  for the college, not a technical one.
- If AI is not approved for launch, leave `GEMINI_API_KEY` blank and disable the
  AI surfaces; the rest of the platform works without it.

**Owner:** college owns the Google account and billing; deployment engineer
installs the key.

---

## 4. Chapa (online payments — optional at launch)

> **Launch position:** the primary payment path is **bank transfer + manual
> admin review**, which needs no Chapa account. Add Chapa when card/Telebirr
> checkout is wanted. Env validation treats the keys as **all-or-nothing**.

### 4.1 Two different "bank accounts"

Do not confuse them:

| | What it is | Where it is configured |
|---|---|---|
| **Chapa settlement account** | Where Chapa deposits money collected through Chapa checkout | Chapa dashboard only (during business verification) |
| **`COMPANY_BANK_ACCOUNTS`** | Accounts students transfer into directly, used by the receipt verifier | App env var (legacy matching fallback); live accounts are managed in `/admin/banks` |

### 4.2 Create the merchant account

1. Sign up at <https://dashboard.chapa.co> as a business/merchant.
2. Complete business verification (KYC). For an educational institution Chapa
   typically asks for: institution registration or trade licence, TIN, an
   authorised person's ID, and the settlement bank account.
3. Approval is manual and can take several business days. **Test keys are issued
   immediately**; live keys unlock after approval.

**Owner:** college representative — the KYC documents and legal entity belong to
the college, not to the deployment engineer.

### 4.3 Credentials

| Credential | Where to find it | Env var |
|---|---|---|
| Test secret key (`CHASECK_TEST-…`) | Dashboard → Settings → API, Test mode | `CHAPA_SECRET_KEY` (staging) |
| Live secret key (`CHASECK-…`) | Dashboard → Settings → API, Live mode | `CHAPA_SECRET_KEY` (production) |
| Webhook secret | Dashboard → Settings → Webhooks | `CHAPA_WEBHOOK_SECRET` |

Never mix a test key with live traffic. Staging uses test keys; production uses
live keys. Production **refuses to boot** if `CHAPA_SECRET_KEY` looks like a
test key (Chapa test keys contain `TEST`, e.g. `CHASECK_TEST-…`).

**Mode is enforced.** Chapa's verify response reports `mode` (`test` or `live`).
When the field is present it must match the environment — `live` in production,
`test` elsewhere — or the payment is treated as a verification mismatch
(`CHAPA_VERIFY_MISMATCH`, field `mode`) and left for admin review instead of
being approved. When the field is absent the check is skipped rather than
guessing a value.

### 4.4 URLs to register

Replace `your-domain` with the real domain and use **HTTPS**.

| Purpose | URL | Where it is set |
|---|---|---|
| **Webhook** (server-to-server, source of truth) | `https://api.your-domain/api/v1/payments/chapa/webhook` | Chapa dashboard → Settings → Webhooks |
| **Callback** (Chapa redirects the browser to the API) | `https://api.your-domain/api/v1/payments/chapa/callback` | Sent automatically by the API on every checkout (`callback_url`) |
| **Return** (browser lands on the web app) | `https://your-domain/pricing/payment/callback?tx=<txRef>` | Sent automatically by the API on every checkout (`return_url`) |

Only the **webhook** needs to be registered by hand. The other two are built
from `API_PUBLIC_URL` / `WEB_PUBLIC_URL` and sent on each initialise call — so
those two variables must be correct and public.

The webhook must be reachable over HTTPS, which means DNS and the certificate
must already be live.

**Dashboard settings to configure:**

| Setting | Value / action | Why it matters |
|---|---|---|
| **Webhook URL** | `https://api.your-domain/api/v1/payments/chapa/webhook` | Server-to-server source of truth. |
| **Webhook secret hash** | A long random value; store the same value in `CHAPA_WEBHOOK_SECRET` | Chapa signs every delivery with it. Rotating it means updating both sides together. |
| **Webhook retry interval** | Chapa's default: every 10 minutes, up to 10 attempts over 72 hours | Our endpoint returns `200` only when the event is durably handled or deterministically ignorable, `5xx` on transient failures (so Chapa retries), and `400` on a bad signature. |
| **Checkout / retry timeout** | 60 minutes (or whatever the dashboard uses) | Set `CHAPA_RETRY_WINDOW_MINUTES` to the same value. A payment younger than this is never treated as abandoned. |
| **Customer-paid fees** | On or off, per the college's commercial choice | Verified `amount` stays the settled transaction amount; Chapa's fee is reported separately as `charge` and is never compared. |

Do not change the webhook URL or secret without updating `.env.production` and
redeploying the API: a mismatch makes every delivery fail signature validation.

### 4.5 How a payment is verified

1. Student clicks Pay → `POST /api/v1/payments/chapa/initialize` creates a
   `PENDING` payment with `tx_ref = lm-<uuid>` (a fresh random UUID per
   checkout — **not** the payment id; Chapa permanently reserves a `tx_ref`,
   including abandoned attempts, so it can never be reused) and returns Chapa's
   hosted checkout URL. At most one `PENDING` payment per user is allowed; a
   second concurrent checkout is refused.
2. Student pays on Chapa.
3. Chapa POSTs the webhook. The API verifies the HMAC-SHA256 signature over the
   raw body with `CHAPA_WEBHOOK_SECRET`, using a timing-safe comparison, then
   confirms the transaction with Chapa's verify endpoint before activating the
   subscription and generating the PDF receipt. Activation is **idempotent** —
   duplicate webhooks and the browser return cannot double-activate. Chapa
   retries every 10 minutes (up to 10 attempts over 72 hours), so the endpoint
   answers `200` only for durably handled/ignorable events, `5xx` for transient
   failures (verify timeout/unreachable, database error), and `400` for a bad
   signature or malformed body.
4. The browser returns to the web app, which calls
   `GET /api/v1/payments/chapa/verify/:txRef`; the API re-checks with Chapa's
   verify endpoint. The UI never trusts the redirect alone.

**Amount verification (exact).** Chapa fixes the amount at checkout, so an
under- or overpayment is not a normal outcome. The verify response is compared
against the snapshot stored on the payment:

- `tx_ref` must be present and exactly equal to our reference;
- `currency` must be present and `ETB`;
- `amount` must be present and exactly equal to the snapshotted amount —
  compared as a decimal (`decimal.js`), never `Number()` and never with a float
  tolerance. A one-cent difference is a mismatch;
- `mode`, when present, must be `live` in production and `test` elsewhere.

If any check fails, the payment **stays `PENDING`**, a `PaymentEvent`
(`CHAPA_VERIFY_MISMATCH`) is written, the row is flagged as an admin-queue
exception, and a secret-free warning is logged. It is never auto-approved and
never receives a customer-facing under/overpayment message. A 404 / "payment
not paid yet" and network failures/timeouts also leave it `PENDING` (a later
webhook or the browser callback can retry); every Chapa call has a timeout
(`CHAPA_TIMEOUT_MS`, default 15000 ms).

**Fee/charge semantics.** Chapa's verify `data` carries both `amount` (the
settled transaction amount) and `charge` (Chapa's fee; present when the payer
bears the fee). We compare `amount`, never `charge`: when the customer pays the
fee, `charge` is reported separately and does not change `amount`. Confirm the
account's fee-bearer setting in the Chapa dashboard; changing it does not
require a code change because the comparison is on `amount` only.

**A single failed attempt is not terminal.** Chapa's documentation does not
define what verify returns between retry attempts, so a verify response that
reports `failed`/`cancelled` does **not** move a `PENDING` payment to
`REJECTED`. The API records a `CHAPA_ATTEMPT_FAILED` `PaymentEvent` with the
reported status and keeps the payment `PENDING`; the customer may still retry
inside the retry window. The row ends only through expiry after a confirmed
Chapa cancel (§ retry window) or through a verified late/terminal outcome.

A missing or invalid signature is rejected before any state changes.

**Signature headers.** Chapa documents two headers and either is sufficient:
`chapa-signature` (HMAC-SHA256 of the webhook secret, keyed with itself) and
`x-chapa-signature` (HMAC-SHA256 of the raw event body, keyed with the
secret). The API accepts both and compares in constant time. The signature
only proves the request came from someone holding the secret: **the
server-side verify call is the real control**, and no payment is ever approved
from a webhook body alone.

**Retry window and cancellation.** A `PENDING` checkout younger than
`CHAPA_RETRY_WINDOW_MINUTES` (default 60, matching the dashboard) is still open:
a retry resumes the stored checkout URL instead of creating a duplicate. Past
that window the API first calls `PUT /v1/transaction/cancel/<tx_ref>` (bearer
secret, timeout). Only a confirmed dead link is expired locally
(`PENDING → EXPIRED`, `PAYMENT_EXPIRED`). If Chapa reports the checkout was
already paid, the normal verify-and-approve path runs instead; if Chapa is
unreachable or refuses, **nothing changes** and the student gets a clear retry
message. A student cancelling their own checkout goes through the same
cancel-at-Chapa check before the local `PENDING → CANCELLED` transition.

**Refunds, reversals and failures.** Documented webhook events
`charge.refunded` (status `refunding` or `refunded`), `charge.reversed`, and
`charge.failed` (or a `cancelled` status) always write a `PaymentEvent`
(`CHAPA_REFUND_RECEIVED`, `CHAPA_REVERSAL_RECEIVED`,
`CHAPA_FAILED_OR_CANCELLED`). A refund or reversal on an `APPROVED` payment is
flagged in the admin queue for human review; the subscription is **never**
auto-cancelled and the payment status is not changed automatically. A
failed/cancelled event changes no state beyond the ledger entry. Refunds and
chargebacks are still executed in the Chapa dashboard.

### 4.6 End-to-end test

1. With **test** keys, run a checkout using Chapa's test cards.
2. Confirm `PENDING → webhook received → subscription ACTIVE → PDF receipt`.
3. POST to the webhook without a valid signature and confirm it is rejected
   (`400`).
4. Start another checkout, cancel it from the student UI, and confirm Chapa's
   checkout link is dead before the row becomes `CANCELLED`. Then confirm a
   retry can start a fresh checkout.
5. Switch to **live** keys (production refuses test keys at boot), take one
   small real payment, confirm settlement appears in the Chapa balance, then
   refund or reconcile. A refund webhook should flag the approved payment in
   the admin queue without cancelling access.

### 4.7 Billing and usage

- Chapa charges a per-transaction fee; confirm the current rate and settlement
  schedule in the dashboard — do not rely on figures quoted elsewhere.
- Settlement goes to the account registered during KYC.
- Refunds and chargebacks are executed in the Chapa dashboard. The app records
  the webhook event and flags an approved payment for review, but never moves
  money or cancels a subscription automatically.
- The app records each payment and generates a receipt PDF; reconcile those
  against Chapa's settlement report monthly.

**Owner:** college owns the merchant account, KYC and settlement; deployment
engineer configures the webhook URL and secrets and runs the end-to-end test.

---

## 5. Credential inventory

Everything the integrations produce, and where it lives.

| Credential | Sensitivity | Stored in | Who may hold it |
|---|---|---|---|
| Chapa live secret key | Critical | `.env.production` + password manager | Deployment engineer, college IT lead |
| Chapa webhook secret | Critical | `.env.production` + password manager | Same |
| Resend API key | Critical — can send mail as the college | `.env.production` + password manager | Same |
| Gemini API key | High — billable | `.env.production` + password manager | Same |
| DNS zone credentials | Critical — controls the domain | Registrar / Hostinger account | College only |

**Never** place any of these in: the repository, a browser bundle, a
`NEXT_PUBLIC_` variable, a screenshot, a ticket, or an email.

---

## 6. Rotation and revocation

If a credential leaks or a staff member leaves:

1. **Revoke first** in the provider dashboard (Chapa / Resend / Google AI Studio),
   then issue a replacement.
2. Update `.env.production` on the VPS.
3. Restart the affected service:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
   ```
4. Record the rotation date in the college's operations log.

Chapa and Resend keys can be revoked instantly. The Gemini key is tied to the
Google Cloud project — rotate the key rather than deleting the project, so
billing history and quotas survive.

See [`SECURITY.md`](SECURITY.md) for the full incident procedure and
[`docs/audit/SECRET-ROTATION-RUNBOOK.md`](docs/audit/SECRET-ROTATION-RUNBOOK.md)
for the step-by-step runbook.
