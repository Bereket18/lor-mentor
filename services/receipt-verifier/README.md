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

Header `x-verifier-token: <VERIFIER_SHARED_TOKEN>` (when configured).

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

For a complete setup and test matrix, see
`docs/deploy/receipt-verifier.md`.
