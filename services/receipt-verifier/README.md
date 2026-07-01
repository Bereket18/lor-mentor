# receipt-verifier

A small **FastAPI** service that wraps the unofficial
[`ethiobank-receipts`](https://github.com/NahomAl/ethiobank_receipts) library so
the (NestJS) API can verify Ethiopian bank transfers from a transaction
reference or receipt URL.

It is **stateless** and never touches the app database. It extracts and
normalizes receipt data; all verification *policy* (does the amount match, is
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

| code | meaning | caller action |
|------|---------|---------------|
| `NOT_FOUND` | no receipt data extracted | reject / ask user to recheck |
| `BLOCKED` | 403 / timeout (e.g. Telebirr foreign IP) | fall back to manual admin review |
| `EXTRACT_FAILED` | scraper/parse error (bank changed page?) | fall back to manual admin review |
| `BAD_INPUT` / `MISSING_ACCOUNT` / `URL_REQUIRED` / `UNSUPPORTED_BANK` | bad request | surface validation error |
| `UNAUTHORIZED` | wrong/missing token | fix config |

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

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# or
docker build -t receipt-verifier . && docker run -p 8000:8000 receipt-verifier
```
