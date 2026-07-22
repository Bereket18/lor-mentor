# Chapa Production Payment Setup

Your app already implements Chapa correctly (`apps/api/src/modules/payments/chapa.service.ts`):
initialize → hosted checkout → **HMAC-verified webhook** + browser return →
idempotent `finalizeApproval()`. Nothing in the code changes for production. What's
left is **account setup + credentials + URLs**. This guide walks every step.

> Chapa is OPTIONAL for launch. Your primary online path is bank-transfer +
> manual review, which needs no Chapa. Do this section when you want card/Telebirr
> checkout. Env validation treats Chapa keys as **all-or-nothing** — set both or
> leave both blank.

---

## The most important distinction (read first)

There are **two different "bank accounts"** in this system. Don't confuse them:

| | What it is | Where it's configured |
|---|---|---|
| **Chapa settlement account** | Where Chapa deposits money customers paid you through Chapa checkout | **Chapa dashboard only** (during business verification). NOT in the app, NOT an env var. |
| **`COMPANY_BANK_ACCOUNTS`** | Your bank account numbers used by the *bank-transfer verifier* to confirm a student transferred directly to the school | App **env var** (`.env.production`). Unrelated to Chapa. |

So when "the school's receiving bank account is provided":
- If it's the account Chapa pays out to → enter it in the **Chapa dashboard**.
- If it's the account students transfer into directly (manual/verifier path) → put it
  in **`COMPANY_BANK_ACCOUNTS`**.
- Often it's the same physical account used in both places — but they're set in two
  different systems.

---

## 1. Create the merchant account

1. Go to **https://dashboard.chapa.co** and sign up as a business/merchant.
2. Complete **business verification** (KYC). For an educational institution Chapa
   typically asks for:
   - Business/trade license or institution registration,
   - TIN,
   - The authorized person's ID,
   - The **bank account** for settlement (this is the Chapa settlement account above).
3. Verification is manual on Chapa's side and can take a few business days. You get
   **test keys immediately**; **live keys unlock after approval**.

## 2. Test keys first (sandbox)

In **Settings → API Keys** you'll see test keys (prefixed `CHASECK_TEST-...`).
Use these to prove the flow end-to-end before going live:

```env
# .env (local) or a staging .env.production
CHAPA_BASE_URL=https://api.chapa.co/v1
CHAPA_SECRET_KEY=CHASECK_TEST-xxxxxxxx
CHAPA_WEBHOOK_SECRET=<the webhook secret from the dashboard, see §4>
```

## 3. Live keys (production)

After approval, switch to the **Live** toggle in the dashboard and copy the live
secret key (`CHASECK-...`, no `TEST`). In `.env.production`:

```env
CHAPA_BASE_URL=https://api.chapa.co/v1
CHAPA_SECRET_KEY=CHASECK-xxxxxxxx        # LIVE secret — server env only
CHAPA_WEBHOOK_SECRET=<live webhook secret>
```

> **Test vs live separation** is just which key string is in the env. Never mix a
> test key with live traffic or vice-versa. Keep them in the respective env files
> and never in the repo.

## 4. Configure the webhook (this is what makes payments reliable)

Two URLs matter. Your code already sends them on every checkout, but the webhook
must also be registered + given a secret in the dashboard:

| Purpose | URL your app uses | Notes |
|---|---|---|
| **Checkout callback** (server→server) | `https://api.lormentor.com/api/v1/payments/chapa/callback` | Chapa sends a GET; the API re-verifies the transaction before approval. |
| **Webhook** (server→server, source of truth) | `https://api.lormentor.com/api/v1/payments/chapa/webhook` | Chapa POSTs here signed with the webhook secret. |
| **Return** (browser redirect after paying) | `https://lormentor.com/pricing/payment/callback?tx=<txRef>` | UX only; the app re-verifies with Chapa before trusting it. |

Steps in the dashboard:
1. **Settings → Webhooks** → set the webhook URL to your `/payments/chapa/webhook`.
2. Set/copy the **webhook secret** → put it in `CHAPA_WEBHOOK_SECRET`. The app
   validates the `chapa-signature` HMAC-SHA256 on every webhook and rejects
   anything that doesn't match — this is your anti-fraud gate (a spoofed
   "payment succeeded" call is dropped).
3. The webhook must be **internet-reachable over HTTPS** — so DNS + TLS (Nginx/
   certbot) must already be live for the API subdomain.

## 5. How a payment flows (already implemented)

1. Student clicks Pay → `POST /payments/chapa/initialize` creates a PENDING payment
   with `tx_ref = lm-<paymentId>` and returns Chapa's `checkout_url`.
2. Student pays on Chapa's hosted page (card / Telebirr / bank).
3. Chapa calls your **webhook** → signature verified → `finalizeApproval()` activates
   the subscription, writes the receipt number, generates the PDF. **Idempotent**:
   duplicate webhooks and the browser-return both hit the same guard and never
   double-activate.
4. Browser is redirected to the return URL; that page calls
   `GET /payments/chapa/verify/:txRef`, which re-checks with Chapa's verify endpoint
   (defence in depth — the UI never trusts a redirect alone).

## 6. Failed / pending payments
- A failed or abandoned checkout leaves the payment `PENDING`; no access is granted.
- The verify endpoint reflects Chapa's real status, so the UI can show
  success/failure honestly.
- Because activation only happens on a **verified** webhook or verify call, a user
  cannot self-grant access by faking the return URL.

## 7. Security checklist
- ✅ Keys in `.env.production` (server env), never in the repo or client bundle.
- ✅ `CHAPA_WEBHOOK_SECRET` set → signature verification active.
- ✅ Webhook over HTTPS only.
- ✅ Never hardcode keys, secrets, or account numbers in source.
- ✅ Amount/subscription come from the server-side plan, not the client.

## 8. End-to-end test before launch
1. With **test** keys, run a full checkout using Chapa's test cards/numbers (see
   Chapa docs → "Test Cards").
2. Confirm: PENDING → webhook received → subscription ACTIVE → PDF receipt generated.
3. Confirm a spoofed POST to the webhook without a valid signature is rejected (401/400).
4. Switch to **live** keys, do ONE small real payment, confirm settlement appears in
   your Chapa dashboard balance, then refund/reconcile.

## Required environment variables (summary)

| Var | Where | Secret? |
|---|---|---|
| `CHAPA_BASE_URL` | `.env.production` (`https://api.chapa.co/v1`) | no |
| `CHAPA_SECRET_KEY` | `.env.production` | **yes** |
| `CHAPA_WEBHOOK_SECRET` | `.env.production` | **yes** |
| `API_PUBLIC_URL` / `WEB_PUBLIC_URL` | `.env.production` (build webhook/return URLs) | no |
| Settlement bank account | **Chapa dashboard** (not app) | — |
