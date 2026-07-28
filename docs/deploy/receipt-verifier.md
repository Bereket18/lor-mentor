# Receipt Verifier Setup

The receipt verifier validates direct Ethiopian bank or Telebirr transfers.
It is separate from Chapa: Chapa payments are verified with Chapa's API and
webhook, while this service extracts data from a bank receipt reference or URL.

## Required Values

Generate one shared token:

```bash
openssl rand -hex 32
```

Use the same token on both sides:

```env
# NestJS API
RECEIPT_VERIFIER_URL=http://127.0.0.1:8000
RECEIPT_VERIFIER_TOKEN=<generated-token>
RECEIPT_VERIFIER_TIMEOUT_MS=60000
COMPANY_BANK_ACCOUNTS=<real-college-account-1>,<real-college-account-2>

# Python verifier process
VERIFIER_SHARED_TOKEN=<generated-token>
```

`COMPANY_BANK_ACCOUNTS` must contain the real accounts that receive direct
student transfers. Separate multiple accounts with commas. Spaces and hyphens
are accepted, but each entry must contain at least eight digits.

## Local Windows Setup

From the repository root:

```powershell
cd services/receipt-verifier
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

$env:VERIFIER_SHARED_TOKEN="<generated-token>"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Confirm the service:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Add the API values shown above to `apps/api/.env`, then restart the API.
The API intentionally refuses to start if the URL is enabled without a token
and valid-looking account entries.

## VPS Docker Setup

In `.env.production`:

```env
RECEIPT_VERIFIER_URL=http://verifier:8000
RECEIPT_VERIFIER_TOKEN=<generated-token>
RECEIPT_VERIFIER_TIMEOUT_MS=60000
COMPANY_BANK_ACCOUNTS=<real-college-account-1>,<real-college-account-2>
```

Do not expose port 8000 publicly. Docker Compose places the verifier and API on
the private `internal` network and maps the shared token automatically:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 verifier api
```

## Test Inputs

- CBE: FT reference plus the last eight or full digits of the destination
  account.
- Telebirr: receipt ID.
- Dashen, Awash, BOA, and Zemen: generally the full receipt URL.
- BOA does not expose the receiver account and therefore always enters manual
  review.
- A fake reference cannot pass because extraction uses the bank's live receipt
  source.

Use a student account that has no active subscription and no payment already
waiting for review. A successful auto-approval requires:

1. The extracted receiver matches `COMPANY_BANK_ACCOUNTS`.
2. The extracted amount is at least the selected plan price.
3. The receipt status is successful, or the bank does not publish status.
4. The bank reference has not already been submitted.

If a bank blocks scraping or changes its receipt page, the application keeps
the payment pending with the submitted reference or URL for manual review.
Confirmed wrong receiving accounts, underpayments, and failed/cancelled bank
statuses are rejected and cannot be overridden from the admin dashboard.
