# receipt-verifier

A small **FastAPI** service that wraps the unofficial
[`ethiobank-receipts`](https://github.com/NahomAl/ethiobank_receipts) library so
the (NestJS) API can verify Ethiopian bank transfers from a transaction
reference or receipt URL.

It is **stateless** and never touches the app database. It extracts and
normalizes receipt data; all verification _policy_ (does the amount match, is
the receiver our account, has this reference been used before) lives in the
NestJS `payments` module.

## Why a separate service?

`ethiobank-receipts` is a Python library and the API is TypeScript/NestJS — it
can't be imported. This service is the bridge: NestJS → HTTP → here.

## Endpoints

### `GET /health`

Liveness + the list of supported banks.

### `POST /extract`

Header `x-verifier-token: <VERIFIER_SHARED_TOKEN>` — **required, always**. The
header is compared in constant time. A missing, empty or wrong value gets
`401 { "detail": { "code": "UNAUTHORIZED" } }`, and the service refuses to
start at all if `VERIFIER_SHARED_TOKEN` is unset or blank (see
[Authentication](#authentication)).

```jsonc
// CBE by FT number + account (last 8 digits or full)
{ "bank": "cbe", "reference": "FT25211G11JQ", "account": "21827223" }

// Telebirr by receipt id
{ "bank": "tele", "reference": "CHQ0FJ403O" }

// Any bank by full receipt URL
{ "bank": "dashen", "url": "https://…" }
```

Returns the **normalized contract** (see `normalize.py`):

```jsonc
{
  "bank": "cbe",
  "reference": "FT25211G11JQ",
  "amount": 1234.5,            // ETB credited to the receiver, float
  "receiverAccount": "1000123456789",
  "receiverName": "LORCAN MEDICAL COLLEGE",
  "payerName": "ABEBE KEBEDE",
  "payerAccount": "1000...",
  "status": "Completed",       // present only for Telebirr & Zemen
  "statusKnown": true,         // false for cbe/dashen/awash/boa
  "date": "2026-06-30T10:11:12",
  "raw": { … }
}
```

### Error shape

Non-2xx responses carry `{ "detail": { "code", "message" } }`. Codes the
caller switches on:

| code                                                                  | meaning                                  | caller action                    |
| --------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| `NOT_FOUND`                                                           | no receipt data extracted                | reject / ask user to recheck     |
| `BLOCKED`                                                             | 403 / timeout (e.g. Telebirr foreign IP) | fall back to manual admin review |
| `EXTRACT_FAILED`                                                      | scraper/parse error (bank changed page?) | fall back to manual admin review |
| `BAD_INPUT` / `MISSING_ACCOUNT` / `URL_REQUIRED` / `UNSUPPORTED_BANK` | bad request                              | surface validation error         |
| `UNAUTHORIZED`                                                        | wrong/missing token                      | fix config                       |

## Authentication

`/extract` is **fail-closed** in two independent places, so it can never be
reached anonymously even if one of them is misconfigured or bypassed:

1. **Startup gate.** `main.py` loads the shared token at import time via
   `security.load_shared_token()`. If `VERIFIER_SHARED_TOKEN` is missing, empty
   or whitespace-only the process raises and never begins serving requests. A
   blank variable (`VERIFIER_SHARED_TOKEN=`) is treated exactly like an unset
   one — there is no configuration in which the check is silently disabled.
2. **Per-request check.** Every `/extract` call runs
   `security.is_authorized(SHARED_TOKEN, x_verifier_token)`, which uses
   `hmac.compare_digest` on the UTF-8 bytes and returns `False` for a missing,
   empty or incorrect credential.

The token is never logged and never echoed in an error body — a failure returns
only `{"detail": {"code": "UNAUTHORIZED"}}`. `GET /health` stays open: it is the
container healthcheck target, is not proxied by nginx, and exposes no secret.

This is a defence in depth, not a substitute for network isolation. The service
still publishes no host port in Compose, and the API additionally refuses to
start when `RECEIPT_VERIFIER_URL` is set without a `RECEIPT_VERIFIER_TOKEN` of
at least 32 characters (`apps/api/src/config/env.validation.ts`).

### Module layout

`security.py` holds the pure, dependency-light helpers — token loading and
comparison, request validation, bank URL allow-listing. Both `main.py` and the
tests import from it, which keeps the test suite runnable without installing
`ethiobank-receipts` and its Selenium/Chromium stack (the cause of the CI
`ModuleNotFoundError`). `main.py` owns the FastAPI routes and the extractor
call. The startup gate itself is covered by a subprocess test that stubs the
extractor package.

## Tests

```bash
python -m py_compile normalize.py cbe_links.py security.py main.py
python test_normalize.py
python test_cbe_links.py
python test_security.py
```

`test_security.py` covers both gates: missing/empty/whitespace configured token,
missing/empty/incorrect/correct presented token, non-ASCII credentials, bank
URL allow-listing, and the process refusing to start without a token. It needs
only `requests`, `fastapi` and `pydantic`.

## ⚠️ Deployment constraints

- **Host in Ethiopia.** Telebirr blocks non-Ethiopian IPs (`403` / `ERR_FAILED`).
- **BOA needs Chrome** — bundled in the `Dockerfile`. Note BOA receipts **do not
  contain a receiver account**, so BOA can never be auto-approved; those go to
  manual review.
- Only **Telebirr** and **Zemen** expose a transaction status. For the others,
  successful extraction is the only success signal (`statusKnown: false`).
- It's an **unofficial scraper** — it can break when a bank changes its receipt
  page. Keep the manual admin-review path as a fallback.

## Run locally

### Windows PowerShell

```powershell
cd services/receipt-verifier
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Generate once and keep the same value in apps/api/.env.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$env:VERIFIER_SHARED_TOKEN="<generated-token>"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Configure `apps/api/.env`, then restart the NestJS API:

```env
RECEIPT_VERIFIER_URL=http://127.0.0.1:8000
RECEIPT_VERIFIER_TOKEN=<same-generated-token>
RECEIPT_VERIFIER_TIMEOUT_MS=60000
COMPANY_BANK_ACCOUNTS=<real-college-account-1>,<real-college-account-2>
```

Do not use Chapa settlement accounts unless students also transfer directly
into those accounts. `COMPANY_BANK_ACCOUNTS` is specifically the allowlist for
direct bank/Telebirr transfers submitted through `/payments/verify`.

### Production

The production Compose file builds and starts this service automatically. Set
the same `RECEIPT_VERIFIER_TOKEN` and the real `COMPANY_BANK_ACCOUNTS` values in
the VPS `.env.production`; Compose injects the token as
`VERIFIER_SHARED_TOKEN` and connects the API to `http://verifier:8000`.

```bash
openssl rand -hex 32
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml exec verifier \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

For a complete setup and test matrix, see `docs/deploy/payments.md` (§2,
bank-receipt rail).
