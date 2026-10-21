# LOR MENTOR — PAYMENT RECEIPT VERIFICATION

**Date:** 2026-10-19 (Rev 6) · **Area:** bank-transfer receipt pipeline (Issues B & D) ·
**Companions:** `CHEKI-INTEGRATION-STRATEGY.md`, `SUBSCRIPTION-PRICE-VALIDATION.md`,
`FINAL-DEFECT-INVESTIGATION.md`.

---

## 1. Architecture of the receipt path

```
student pastes reference or receipt link
        │
        ▼
POST /payments/verify  (VerifyReceiptDto — strict whitelist)
        │
        ├─ guard: at least one verification source enabled (Cheki or local verifier)
        ├─ accepted-bank gate: bank must be enabled in the admin catalog
        ├─ manual-only catalog bank → PENDING review (no external lookup)
        ├─ plan lookup (server-side) · no pending payment · no active subscription
        ├─ pre-check: reference not already used (cheap reject before scraping)
        ├─ CBE account-digit guard: lookups restricted to the college's accounts
        │
        ▼
CHEKI (primary; server-side)             — only `verified === true` yields a receipt
        │  fail / decoded-only / rate-limited / geo-blocked / malformed
        ▼
LOCAL RECEIPT-VERIFIER (fallback)        — official-endpoint extraction only
        │  not found / bad input → 400 · blocked/unavailable → PENDING for review
        ▼
assessReceipt  (single decision authority — PaymentsService)
        │
        ├─ confirmed failure  → payment REJECTED (hard, not admin-overridable) + 400
        ├─ incomplete evidence→ payment PENDING (manual review queue)
        └─ all checks pass    → Payment created + finalizeApproval → subscription ACTIVE
```

**Trust rule in one line:** only **bank-confirmed** data (Cheki `verified === true`,
or the local verifier's official-endpoint extraction) may auto-approve. A decoded
QR, a screenshot, OCR text, a `fallbackUrl`, client-supplied fields, or any error
path can never grant paid access on its own.

### 1b. Screenshot upload (`POST /payments/submit`) — Rev 2

Uploads enter the **same** pipeline when the image contains a QR code:

```
student uploads a receipt screenshot (multipart)
        │
        ▼
POST /payments/submit  (10/min throttle)
        │
        ├─ guard: image magic bytes · plan (server-side) · no pending · no active sub
        ├─ CHEKI OCR (POST /api/ocr): QR → bank + reference/link   ← lookup hint only
        │     no QR · reader failure · unsupported bank · bare CBE FT (no digits)
        │        → PENDING manual review (screenshot kept, verification.ocr recorded)
        ▼
  CHEKI verify → LOCAL verifier fallback → assessReceipt   (pipeline of §1)
        ├─ confirmed failure → REJECTED row (screenshot kept) + 400
        ├─ incomplete        → PENDING review (screenshot kept)
        └─ all checks pass   → APPROVED + subscription ACTIVE
```

The OCR-extracted value is treated exactly like typed input — duplicate gate,
CBE digit guard, assessment, and audit metadata all apply. Unlike the reference
flow, "correct-my-input" cases (bare CBE FT without digits, unconfirmable QR)
become review items instead of 400s, because the student typed nothing to fix.

### 1c. Admin-managed accepted banks (Rev 3)

The college chooses which banks it accepts (`AcceptedBank` table, managed on
`/admin/banks`; catalog in `bank-catalog.ts`). Semantics:

- **Typed-reference flow:** the bank must be enabled (`GET /payments/banks`
  feeds the picker) — otherwise `400 "This bank is not currently accepted…"`.
  Checked server-side before any external call.
- **Manual-only banks** (catalog `auto:false` — e.g. Abay, CBE Birr, Nib):
  skip Cheki/local lookups, record the submitted reference and create a
  **PENDING** row for an admin. Nothing is approved from client input; the
  reference still occupies the unique `bankReference` slot (replay blocked).
- **Upload/OCR flow:** does **not** consult the enabled list. A bank-confirmed
  receipt paid into a configured college account is valid evidence even if that
  bank is hidden from the picker; hiding only affects the typed flow.
- **Automated additions:** M-Pesa, Siinqee, eBirr and ZamZam are mapped in the
  adapter and can auto-verify (`CHEKI-INTEGRATION-STRATEGY.md` §3); everything
  else in the catalog is manual-only by design.

### 1d. Admin-managed receiving accounts (Rev 5)

`AcceptedBank` carries an optional full `accountNumber` / `accountName`,
managed on `/admin/banks` through
`PATCH|DELETE /payments/admin/banks/:code/account`. The full number is shown to
students and matched against the receiver printed on a bank-confirmed receipt.

- **Only admin-set accounts are listed to students.** The public
  `/payments/bank-accounts` feed returns active `AcceptedBank` rows with a
  non-null account. If none are set, the transfer-accounts panel is not shown.
  Legacy `COMPANY_BANK_ACCOUNTS` entries remain available for matching old
  receipts, but they are never displayed as transfer destinations.
- The catalog's per-bank `accountDigits` (CBE `8`, BOA `5`) is a **Cheki lookup
  rule**, derived from the full account — it is not the stored/displayed number.
- **BOA now asks for a reference, not a URL.** The server derives the last five
  lookup digits from the college's configured BOA account; the student never
  sees or types them. A pasted BOA slip link is still accepted in the reference
  field. BOA receipts do not expose the beneficiary account, so a confirmed BOA
  receipt still goes to manual review unless another rule resolves it.
- If a BOA bare reference cannot be confirmed by Cheki and the local verifier
  requires a full link, the submission is queued for manual review instead of
  being rejected as a bad URL.
- The account editor rejects fewer than 8 digits (full number required for the
  transfer panel) and a number already assigned to another bank.
- The public feed only shows accounts of **active** banks; verification includes
  hidden banks' accounts because the upload path is intentionally not gated by
  the accepted-bank list.

### 1e. Amount matching (Rev 4)

`POST /payments/verify` and the QR-resolved upload path now require the
bank-confirmed amount to match the selected plan:

| Receipt amount vs. plan price | Outcome |
|---|---|
| Equal (±0.01) | continue to the remaining checks (may auto-approve) |
| Lower | **REJECT** + 400: “Please upload a receipt for the selected plan amount or contact the college.” |
| Higher | **PENDING manual review** (never auto-approve): message asks the student to contact the college or choose the plan matching the payment |

Overpayment is deliberately **not** a hard reject: the college has received the
money, so an admin must reconcile it (apply to a larger plan/refund). The admin
review screen already displays `verification.amount` and `reviewNote`, so the
mismatch is visible before approval. Uploads with **no QR** still go to manual
review without an automated amount check — the admin must compare the screenshot
with the selected plan.

### 1f. Chapa checkout visibility and app dialogs (Rev 5)

- `POST /payments/chapa/initialize` creates a local `PENDING` CHAPA row before
  the student reaches Chapa's hosted page. That row is an **internal checkout
  attempt**, not an admin-review item. `GET /payments/admin` now excludes
  `method=CHAPA, chapaRef=null, status!=APPROVED`, so opening and abandoning
  checkout, or a Chapa initialization that fails before any payment, no longer
  looks like a payment request in the admin dashboard. An approved row is always
  kept. A Chapa-confirmed row that could not auto-approve (e.g. underpaid)
  carries a `chapaRef` plus a review note and **remains visible** for
  reconciliation.
- The student's own recent-payment history applies the same filter, so an
  opened-but-abandoned or failed-initialization checkout does not appear as a
  pending or rejected payment in the profile.
- The manual-payment duplicate guard (`"You already have a payment awaiting
  review"`) now considers only `method=MANUAL` pending rows. An abandoned Chapa
  checkout therefore no longer blocks a bank-transfer submission.
- Chapa payments are still finalized only by Chapa webhook/callback
  verification; admin approval remains disabled for `method=CHAPA`.
- No product screen uses `window.alert` / `window.confirm`. Destructive actions
  use the themed `ConfirmDialogProvider`; transient feedback uses `sonner`
  toasts. Chapa's own hosted checkout page is outside the app and may show its
  own browser prompt when the tab is closed; the product cannot suppress an
  external page's `beforeunload` dialog.

## 2. Decision rules (`assessReceipt`)

| Rule | Outcome on violation |
|---|---|
| Bank status success, or status not exposed at all | REJECT if the bank reports a failed status |
| Currency ETB when exposed | REJECT |
| Receiver account is one of the DB/admin accounts or legacy `COMPANY_BANK_ACCOUNTS` | REJECT |
| Receipt amount is below the plan price (+0.01 epsilon) | REJECT |
| Receipt amount is above the plan price (+0.01 epsilon) | REVIEW (manual reconciliation) |
| Receiver account present | REVIEW (e.g. BOA receipts never expose it) |
| Amount present | REVIEW if missing |
| Otherwise | APPROVE (auto) |

REJECT is reserved for *confirmed* failures (wrong receiver, failed status,
underpay, non-ETB). Missing evidence and overpayments go to REVIEW so a human
compares the evidence — neither is silently approved.

## 3. Duplicate protection (three layers)

1. Cheap pre-check before any bank call (`assertReferenceUnused`).
2. Re-check against the **bank-reported** reference after extraction (it may
   differ from what the student typed — the F-15 lesson).
3. Database `@unique` on `bankReference` + `P2002` catch → `400 "This receipt has
   already been submitted."` — the real race guard. **Live-verified this sprint.**

Blocked duplicates create **no** payment row (live-verified: count 0).

## 4. Request hardening (Issue C adjacent)

`VerifyReceiptDto` whitelist rejects anything outside
`{ planId, bank, reference?, url?, account? }` — including `amount`, `price`,
`duration`, `isVerified`, `userId` (each proven by `verify-receipt.dto.spec.ts`).
Bank checks insensitivity: extra unknown fields → 400 (`forbidNonWhitelisted`).

## 5. Failure taxonomy → behavior

| Source outcome | Pipeline behavior |
|---|---|
| Cheki `verified:true` | proceed to assessment (may auto-approve) |
| Cheki `decodedOnly` (QR read, bank not confirmed) | fall through to local verifier; recorded as `chekiCode: DECODED_ONLY` if review needed |
| Cheki `fallbackUrl` (Telebirr/M-Pesa geo-block) | fall through (never treated as verified) |
| Cheki `RATE_LIMITED` / `UNREACHABLE` / `HTTP_ERROR` / `MALFORMED` / `DECLINED` / `UNSUPPORTED_BANK` | fall through to local verifier |
| Local verifier `NOT_FOUND` | `400` — receipt does not exist |
| Local verifier `BAD_INPUT` / `MISSING_ACCOUNT` / `URL_REQUIRED` | `400` with the reason, **except** a BOA bare reference (`URL_REQUIRED` → PENDING manual review; the student was not asked for a URL) |
| Local verifier `BLOCKED` / `EXTRACT_FAILED` / `UNREACHABLE` | PENDING for manual review (with `verifierCode` + `chekiCode` in metadata) |
| Both sources unavailable/undecodable | PENDING for manual review |

## 6. Evidence (2026-10-18)

| Check | Evidence |
|---|---|
| Live Cheki call through the running API | `[ChekiService] Cheki verified cbe FT26…12 chars` (api.log 20:08:56) |
| Live duplicate gate | `400 {"message":"This receipt has already been submitted."}`; no row created |
| Cheki live probe (real FT) | `verified:true`, top-level fields, `cached:false` (direct probe) |
| Cheki negative probe (fabricated link) | HTTP 502 handled as ordinary failure → fallback (no approve/reject) |
| Unit — adapter | `cheki.service.spec.ts` 26/26 (18 verify + 8 OCR) |
| Unit — pipeline | `payments.service.spec.ts` incl. Cheki auto-approve (no local verifier), reject matrix, fallback matrix, duplicate, P2002 race, 8 upload/OCR-flow tests |
| Unit — accepted banks | +4 tests: disabled bank → 400 before any lookup; manual-only bank → PENDING (no verifier call); picker order/only-enabled; unknown catalog code refused |
| Unit — receiving accounts (Rev 5) | +6 tests: digit-only save, short account rejected, duplicate account rejected, clear without deleting bank, only admin-managed accounts listed, env-only accounts excluded from the public feed |
| Unit — BOA reference (Rev 5) | BOA bare reference derives the last 5 digits from the configured account and goes to manual review when the local fallback needs a URL |
| Unit — Chapa queue hygiene (Rev 5) | Unconfirmed CHAPA attempts (no `chapaRef`, not approved) excluded from the admin queue and the student's own history; an approved row is kept; a pending Chapa checkout does not block a manual payment; a confirmed underpayment keeps its `chapaRef`/review note and stays visible |
| Unit — amount matching (Rev 4) | +2 overpayment tests: typed reference → PENDING review (not APPROVED); QR-resolved upload → PENDING review with screenshot + `reviewNote` |
| Unit — DTO tamper-proofing | `verify-receipt.dto.spec.ts` — injected amount/price/duration/etc. all rejected |
| Live — OCR upload pipeline | QR image of the real consumed receipt: Cheki OCR read it (`Cheki OCR read a cbe QR`, api.log 21:20), bank confirmation + duplicate gate → 400, no row, no leftover file; unverifiable QR → PENDING with screenshot + `verification.ocr`; 12/12 checks (`sprint-e2e-ocr.cjs`) |
| Live — admin bank catalog + manual routing | 18/18 checks (`sprint-e2e-banks.cjs`): 6 seeded defaults; add Abay → picker shows manual-review; submit → PENDING “verified manually”, no auto-approval; hide → picker removal + 400; M-Pesa add → auto-verified; cleanup back to 6; student 403 on admin API |
| Live — admin receiving account CRUD (Rev 4) | 8/8 checks (`sprint-e2e-accounts.cjs`): save account on Abay → admin catalog + public feed show it; short account 400; clear → public feed removes it; disposable bank/account restored; no payment rows created |
| Live — BOA reference (Rev 6) | Operator submitted a real BOA reference; the form asked for **BOA TRANSACTION REFERENCE** and no receiver account; Cheki returned HTTP 422 and the local verifier `URL_REQUIRED`, so the payment was queued for **PENDING manual review** (not auto-approved, no URL-required error). The super-admin then rejected that test row (`PAYMENT_REJECTED`); its evidence is retained |
| Live — overpayment (Rev 6) | Operator submitted a fresh overpaid receipt; it reached **PENDING manual review**, not auto-approval (operator-observed; see `REGRESSION-TEST-RESULTS.md` §12) |
| Live — legacy overpayment reversal (Rev 6) | `cmve8ob3k00066cty2a9niikj` APPROVED → REJECTED, its subscription ACTIVE → CANCELLED at reversal time, user notification + `PAYMENT_REVERSED` audit row, student history still shows REJECTED; no other approved payment for the user was touched. (The same student later made a separate 500 ETB approved Chapa payment that legitimately re-activated the row; see §7 post-reversal clarification.) |
| Live — camera capture (Rev 6) | Operator confirmed the browser camera capture path works and feeds the same server-side OCR upload pipeline (operator-observed) |
| Regression | API suite **177/177** (15 suites) after the Rev 7 fail-closed/env additions; payments subset **99/99** (5 suites); verifier **20/20**; web lint and build exit 0 (`REGRESSION-TEST-RESULTS.md` §13) |

**NOT VERIFIED (environment-limited):** a fresh unused real receipt auto-approving
through the full live pipeline; live `mbreciept` short link; live
Telebirr/M-Pesa geo-block; and live lookups for the newly mapped banks. Live
BOA reference, fresh overpayment review, camera capture, the reversal, and the
Chapa return-state fix are now verified (§12). Previous live approvals (Chapa
checkout; real-FT CBE instant approval via the local verifier, Rev 5) remain the
strongest live proof of the approval branch.

## 7. Residual risks / open items

- **F-8** (Resend domain) and **S-2** (secret rotation) are the launch blockers —
  orthogonal to this pipeline.
- A real `CHEKI_ENABLED=false` fallback path exists but was not exercised live in
  production mode (unit-covered only).
- The manual-review queue is the designed safety net whenever automated evidence
  is incomplete — admin training should treat `chekiCode`/`verifierCode` as the
  triage signal.
- Adding a bank that is not in `bank-catalog.ts` requires a code change (a
  deliberate trade-off: the catalog is the finite value whitelist). Live receipt
  lookups for the newly mapped M-Pesa/Siinqee/eBirr/ZamZam banks are not yet
  exercised (unit-covered only).
- The receiving-account model is **one account per bank**; a second account at
  the same bank needs the env fallback or a future multi-account table.
- The legacy 250-plan/792-receipt payment was **reversed on 2026-10-19** at the
  operator's explicit request: payment REJECTED, linked subscription CANCELLED,
  user notified, audit row written. Its receipt evidence is retained but the
  document endpoint refuses non-APPROVED payments. See
  `REGRESSION-TEST-RESULTS.md` §12.1.
- **Post-reversal clarification (2026-10-19):** the same student later made a
  separate legitimate **APPROVED CHAPA payment** (`cmveyb0co000cvwtytkp9v0bs`,
  500 ETB) and that new payment backs the currently ACTIVE subscription. The
  subscription row is the same `cmve8ob9n00076cty8hbvqt3r`, but the active
  access is not a reinstatement of the reversed 792 ETB receipt. The read-only
  reversal check now requires an approved backing payment and reports
  `approvedBackingPaymentId: cmveyb0co000cvwtytkp9v0bs`. See
  `REGRESSION-TEST-RESULTS.md` §13.9.
