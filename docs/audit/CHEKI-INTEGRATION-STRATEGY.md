# LOR MENTOR — CHEKI INTEGRATION STRATEGY

**Date:** 2026-10-18 · **Source of truth read before implementation:**
`https://cheki.et/llms.txt`, `/api/banks`, cheki's MIT source
(`/api/ocr`, `/api/parse`), and live probes · **Companion:**
`PAYMENT-RECEIPT-VERIFICATION.md`.

> **Rev 2 (2026-10-18):** adds the screenshot flow — uploaded receipt images are
> scanned for a QR code via Cheki's `POST /api/ocr`, and the extracted
> reference/link auto-verifies through the same bank-confirmation pipeline. The
> QR remains a lookup hint only; it is never proof of payment (Cheki's own docs
> state the same).
>
> **Rev 3 (2026-10-18, later):** banks are now an **admin-managed catalog** —
> 31 Cheki-listed banks (the duplicate `cbe-new` alias omitted), 6 enabled by
> default. M-Pesa/Siinqee/eBirr/ZamZam joined the automated mapping; catalog
> banks without an automated lookup are accepted for **manual review only**.
>
> **Rev 4 (2026-10-18, follow-up):** admins can set the college's **receiving
> account per adopted bank** on `/admin/banks`. The full account is stored and
> matched against the bank receipt; CBE's last 8 digits and BOA's last 5 are
> derived **Cheki lookup rules**, not the stored account. Legacy
> `COMPANY_BANK_ACCOUNTS` remains a fallback. Receipt amount must now match the
> selected plan exactly to auto-approve: underpay → **REJECT** with a
> correct-amount message; overpay → **PENDING manual review** (never auto-approve).
>
> **Rev 5 (2026-10-19):** BOA now asks students for a **reference**, not a URL.
> The API derives the last 5 Cheki lookup digits from the admin-configured BOA
> receiving account; if the reference cannot be confirmed by Cheki and the local
> fallback requires a full link, it goes to manual review rather than a 400.
> The public transfer panel lists only admin-set receiving accounts; legacy
> `COMPANY_BANK_ACCOUNTS` remains a matching fallback but is never displayed.

> **Camera (Rev 4):** The web page also offers camera capture, but the image
> still goes through the same server-side OCR/verification path.

---

## 1. Decision

Cheki (https://cheki.et) is the **primary automated receipt-verification source**.
The existing Python receipt-verifier remains the **controlled fallback**. This
follows the sprint brief (“Cheki as the primary receipt verification mechanism;
only bank-confirmed verification may grant access”) while keeping a single,
unchanged decision authority in `PaymentsService` and **zero changes to the
fallback service**.

Rationale:
- Cheki reads the **bank's own records** (verified:true = bank-confirmed) across
  CBE, Dashen, Awash, BOA, Zemen, Telebirr, M-Pesa, Siinqee, eBirr and ZamZam —
  more banks than our local scraper.
- Free public API, no key; server-side calls from the API only.
- The fallback covers Cheki outages/rate limits/geo-blocking, and receipts Cheki
  cannot confirm — with the same “bank-confirmed or bust” rules.
- Which of these banks the college accepts is an **admin-managed list** (§3b) —
  changing it needs no deploy, and a disabled bank is rejected server-side.

## 2. What is used from Cheki

| Endpoint | Use |
|---|---|
| `POST /api/verify` | the only **bank-confirmation** call — one receipt per student submission, whether the value was typed or extracted from a QR |
| `POST /api/ocr` | reads a QR code out of an **uploaded screenshot** (multipart `image`, ≤10 MB) and returns `{source:"qr", bank, reference, text}`; a **lookup hint only** — the extracted value still has to pass `/api/verify` + the normal receipt checks |
| `GET /api/health` | manual diagnostics only (no monitor wired) |
| `POST /api/verify/batch` | **not used** — our flow is per-submission; a batch-based admin reconciliation tool is a possible future enhancement (§8) |

Rate limits (per IP at Cheki: verify 30/min, OCR 20/min) are managed by:
per-receipt calls only, a 5-minute positive-result cache (≤200 entries, verify
only — OCR results are never cached), our own 10/min `@Throttle` on
`/payments/submit`, and graceful 429 handling (Retry-After is logged; the
receipt simply falls through to the local verifier / review).

## 3. Request mapping (adapter → Cheki)

| Our bank | Cheki code | Input shape sent |
|---|---|---|
| `cbe` | `cbe` | FT reference + account digits. A pasted legacy link (`apps.cbe.com.et…?id=FT…<8 digits>`) is parsed into those two parts; other receipt links (`mbreciept`, receipt ids) are passed through as the reference |
| `dashen` / `awash` / `zemen` | same | receipt link or bare reference |
| `boa` | `boa` | bare reference; the API derives the last 5 account digits from the configured BOA receiving account. A pasted slip link is still accepted |
| `tele` | `telebirr` | transaction number; links (`transactioninfo.ethiotelecom.et/receipt/…`) are parsed to the reference first |
| `mpesa` | `mpesa` | transaction reference (or the full receipt link) |
| `siinqee` | `siinqee` | eBirr receipt link (`receipt.ebirr.com/siinqee/…`) |
| `ebirr` | `ebirr` | eBirr tenant receipt link (`receipt.ebirr.com/{tenant}/…`) |
| `zamzam` | `zamzam` | numeric receipt id or the receipt link |

Unsupported banks short-circuit as `UNSUPPORTED_BANK` → fallback (never an
approval and never an error to the student unless both sources fail). Catalog
banks with `auto:false` never reach the adapter at all — they are routed to
manual review by `PaymentsService` (§3b).

The same mapping applies to QR-extracted values: the OCR `text` (raw QR
content) is preferred when it is a receipt URL — it carries full-link
information, including legacy CBE account digits — otherwise the extracted
`reference` is used. A QR for a bank we do not support goes straight to manual
review with the provider code recorded; a bare CBE FT without account digits
does too (legacy lookups require the digits).

### 3b. Admin-managed accepted banks

The college does not accept every Cheki bank by default, and it can change its
list without a deploy.

- **Catalog (code):** `apps/api/src/modules/payments/bank-catalog.ts` — 31 banks
  from Cheki's `/api/banks`. Each entry carries the label, the input the student
  is asked for (`cbe` / `ref` / `url`), and `auto` (our stack can confirm it
  automatically). Adding a brand-new bank later is one entry here — deliberate,
  so the DTO value whitelist stays finite and reviewable.
- **Enabled list (DB):** `AcceptedBank` (`code` unique, `isActive`, nullable
  `accountNumber` / `accountName`), seeded with the six banks the page offered
  before this feature: cbe, tele, dashen, awash, boa, zemen. Migrations
  `20261018160000_add_accepted_banks` and
  `20261018200000_add_bank_receiving_accounts`.
- **Admin API/UI:** `GET/POST/PATCH/DELETE /payments/admin/banks` (ADMIN /
  SUPER_ADMIN) and the `/admin/banks` page. `GET /payments/banks` is the public
  picker feed (enabled banks only, catalog order).
- **Enforcement:** `verifyAndSubmit` checks the enabled list **before** any
  external call. A hidden/removed bank → `400`; the picker is not a security
  boundary.
- **Manual-only catalog banks** (`auto:false`, e.g. Abay, CBE Birr, Nib): the
  submission skips Cheki and the local verifier entirely, records the submitted
  evidence and creates a **PENDING** payment for an admin. This path can never
  auto-approve, honouring the “bank-confirmed only” rule. The submitted
  reference still occupies the unique `bankReference` slot, so replay is
  blocked.
- **Uploads are not gated by the list:** a bank-confirmed receipt paid into a
  configured college account is valid evidence even if that bank is hidden from
  the picker. Hiding a bank only removes it from the typed-reference flow.

### 3c. Admin-managed college receiving accounts (Rev 4)

- **Storage:** one `accountNumber` (digit-only, unique) and optional
  `accountName` per `AcceptedBank` row. The full number is what students see and
  what the verifier matches against the receiver printed on the bank receipt.
- **Admin API/UI:** `PATCH/DELETE /payments/admin/banks/:code/account`
  (ADMIN / SUPER_ADMIN); inline editor on `/admin/banks`. A bank must be adopted
  before an account can be attached. The service rejects fewer than 8 digits and
  duplicate numbers assigned to another bank.
- **Per-bank Cheki rules:** the catalog now carries `accountDigits` — CBE `8`
  (legacy FT lookup) and BOA `5` (slip lookup). These are **derived** from the
  stored full account by the adapter; they are never substituted for the full
  number in the transfer panel. Other banks have no Cheki account requirement.
- **Matching source:** `allCompanyAccounts()` = admin-managed rows (including
  hidden banks, because the upload path is not gated) + legacy
  `COMPANY_BANK_ACCOUNTS`. The public `GET /payments/bank-accounts` feed shows
  **only admin-set accounts of active banks**; legacy env entries are used for
  matching old receipts but are never listed as transfer destinations. If no
  admin account is set, the student transfer panel is hidden.
- **Why the fallback stays:** the college can move accounts into the DB without
  a deploy window in which a previously valid receiving account stops working.
  Once every account is in the DB, removing the env values is a separate,
  operator-approved cleanup.

## 4. Response handling & trust rules

- Actions are taken only on `verified === true`.
- Defensive parsing: fields are read from the top level (observed live) **or**
  from a `result` wrapper (per docs); anything else → `MALFORMED` → fallback.
- `decodedOnly: true` (QR read, bank not confirmed) → **no receipt** returned;
  recorded as `chekiCode` for review triage if the case reaches the queue.
- `fallbackUrl` (Telebirr/M-Pesa outside Ethiopia) → `FALLBACK_REQUIRED` →
  fallback/manual review; the URL is never “opened” as proof.
- `success:false` + error → `DECLINED` → fallback.
- 429 → `RATE_LIMITED` (+ Retry-After in the log); 5xx/invalid JSON → `HTTP_ERROR`
  / `MALFORMED`; network failure/timeout → `UNREACHABLE`.
- Never cached: all failure kinds (so recovery is immediate). Cached: VERIFIED /
  DECODED_ONLY, TTL 5 min, ≤200 entries, per (bank, reference, account) key.
- **Uploaded screenshots (OCR):** the decoded QR is a lookup hint that selects
  what to ask the bank — it can never approve anything by itself. An uploaded
  image auto-approves only when the bank-confirmed receipt passes the same
  assessment as a typed reference. Unreadable QRs, unconfirmable receipts, or
  reader errors fall back to the manual review queue with the screenshot kept
  as evidence and the OCR provenance stored (`verification.ocr`).
- 256 KB response cap; 20 s default timeout (AbortController) for both calls.
- Logs redact references (`FT26…12 chars`) — no full links/refs in logs or reports.
- **Privacy note:** the upload flow forwards the student's screenshot to
  Cheki's OCR endpoint for QR extraction (their own site scans images the same
  way). The image is still stored locally as review evidence as before. With
  `CHEKI_ENABLED=false` the upload skips OCR entirely and is reviewed manually.

## 5. Failure matrix (Cheki → pipeline)

| Cheki outcome | Student response | Internal |
|---|---|---|
| VERIFIED | proceeds to assessment (auto-approve only if all rules pass) | receipt `source:'cheki'` |
| DECODED_ONLY | falls back; if review needed → “awaiting review” | `chekiCode:'DECODED_ONLY'` |
| RATE_LIMITED / UNREACHABLE / HTTP_ERROR / MALFORMED / FALLBACK_REQUIRED / DECLINED / UNSUPPORTED_BANK | falls back to local verifier → 400 / review per its result | `chekiCode` recorded only when review is created |

For uploaded screenshots, OCR outcomes map in as: `source:"none"` / any OCR
failure kind → the upload proceeds as a normal manual-review submission (with
`verification.ocr` showing what was attempted); `FOUND` → the extracted value
enters the table above through the normal pipeline.

## 6. Configuration & operations

```dotenv
# apps/api/.env (+ .env.production.example)
CHEKI_ENABLED="true"      # set "false"/"0" for a controlled rollout without Cheki
CHEKI_BASE_URL="https://cheki.et"
CHEKI_TIMEOUT_MS="20000"
# internal (defaults fine): CHEKI_CACHE_TTL_MS=300000
```

- **Kill switch:** `CHEKI_ENABLED=false` + restart API → local verifier-only mode
  (the pre-sprint behavior), no deploy needed.
- **Health triage:** `curl https://cheki.et/api/health` (manual); API log lines
  `Cheki verified …`, `Cheki decoded-only …`, `Cheki unreachable …`,
  `Cheki … → HTTP nnn`, `Cheki OCR read a … QR`, `Cheki OCR unreachable …`
  give the per-window picture.
- Env validation accepts the new keys; unknown keys are ignored (checked).

## 7. Verification status

- **Unit:** adapter 26/26 (`cheki.service.spec.ts`, incl. 8 OCR contract tests)
  + the pipeline matrix and 8 upload-flow tests in `payments.service.spec.ts`;
  full API suite **152/152** across 14 suites (payments subset **87/87**).
- **Live:** real FT probe verified:true; fabricated-link 502 handled; through the
  **running API**, a real consumed receipt produced a live Cheki call +
  duplicate rejection; no row created. Log: `Cheki verified cbe FT26…12 chars`.
- **Live (screenshot/OCR pipeline, 2026-10-18):** synthetic QR images uploaded
  through the running API — (1) QR of the real consumed receipt: Cheki OCR read
  it live (`Cheki OCR read a cbe QR`), Cheki confirmed the legacy link, the
  duplicate gate blocked it (400, no row, no leftover file); (2) QR of an
  unverifiable reference: went to PENDING review with the screenshot kept and
  `verification.ocr = {via:"cheki-ocr", bankCode:"cbe"}`. **12/12 checks**
  (`sprint-e2e-ocr.cjs`, self-cleaning fixtures).
- **Live (admin-managed catalog, 2026-10-18):** **18/18 checks**
  (`sprint-e2e-banks.cjs`): 31-entry catalog; 6 seeded defaults; student token
  gets 403 on admin endpoints; admin adds Abay → appears in the picker as
  manual-review; a submission → PENDING with “verified manually” (no bank call,
  no auto-approval); hide → gone from the picker and the API returns 400;
  add M-Pesa → appears as auto-verified; remove both → DB back to the six
  defaults; disposable student removed.
- **NOT VERIFIED live:** fresh unused receipt → auto-approval via Cheki (typed
  or uploaded — unit-covered; needs a real unused receipt);
  `mbreciept` short link end-to-end (token signed, not constructible);
  Telebirr/M-Pesa geo-block flow; **live lookups for the newly mapped banks
  (M-Pesa/Siinqee/eBirr/ZamZam)** — the mapping is unit-covered, but a real
  receipt is needed to exercise each bank live.
- **Parity note:** the local verifier’s extraction tests (Python, 20/20) and the
  earlier live CBE instant approval remain the fallback’s proof.

## 8. Future enhancements (not blocking)

1. **Batch reconciliation:** a periodic job calling `/api/verify/batch` (≤20) to
   cross-check APPROVED payments (fraud audit) — feasible once a reconciliation
   CLI/endpoint exists (admin tooling, not student flow).
2. **Health monitor:** wrap `GET /api/health` in the readiness/deploy alerting to
   flip `CHEKI_ENABLED` automatically on sustained outages.
3. **Admin UI surfacing of `chekiCode` / `source`** in the review queue (data is
   already stored in the payment verification JSON).
4. **Multiple receiving accounts per bank** if the college needs more than one
   account at the same bank (current model is one per adopted bank; the legacy
   env fallback can still carry extra accounts).
5. **Local QR decoding** (e.g. `jsqr`/`zxing`) as a privacy-maximizing
   alternative to forwarding screenshots to Cheki's OCR — only the decoded
   link would leave the device/server. Revisit if the college objects to image
   forwarding (§4 privacy note) or if OCR quota becomes a bottleneck.
6. **Live camera auto-scan** (continuous QR detection in the viewfinder) — the
   current camera button captures one photo and uploads it; live scanning would
   need an on-device decoder and is not required for correctness.
