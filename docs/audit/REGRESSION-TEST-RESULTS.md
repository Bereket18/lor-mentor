# LOR MENTOR — REGRESSION TEST RESULTS (final defect sprint)

**Date:** 2026-10-18 (evening, local dev host) · **Build under test:** the
uncommitted working tree (Rev 4 snapshot; see `git status --short`) with the API
and web **rebuilt and restarted** before the live runs.

All commands were executed on the running stack; outputs below are actual.

---

## 1. Automated suites

| # | Command (cwd) | Result |
|---|---|---|
| 1 | `npx jest --silent` — `apps/api` | **14 suites / 159 tests PASS** (exit 0; rev 4 — §10) |
| 2 | `npx jest src/modules/payments --silent` — `apps/api` | **5 suites / 94 tests PASS** (exit 0; rev 4 — §10) |
| 3 | `npx jest src/modules/payments/cheki.service.spec.ts --silent` — `apps/api` | **26 tests PASS** (exit 0; 18 verify + 8 OCR — §8) |
| 4 | `npx jest src/modules/users/users.service.spec.ts` — `apps/api` | **10 tests PASS** (exit 0; part of #1) |
| 5 | `npm run build` — `apps/api` (`nest build`) | **exit 0** |
| 6 | `npm run build` — `apps/web` (`next build`, Turbopack) | **exit 0** — all routes incl. `/admin/users`, `/admin/banks` (§9) |
| 7 | `.venv\Scripts\python.exe -m pytest -q` — `services/receipt-verifier` | **20 passed** (1.72 s) |

Notes:
- The Python suite needed `pytest` in the project’s local venv; it was installed
  there for the run (`pip install pytest`) — the service’s runtime dependencies
  were untouched. Bare-system-python collection fails (no `requests`) — use the
  venv.
- The earlier ambiguous jest invocation (exit 45, no output) did not reproduce:
  all reruns capture clean exit 0 with full summaries.

## 2. Suite-level changes this sprint

- New: `cheki.service.spec.ts` (18) — response shapes, wrapper vs top-level,
  decodedOnly/fallback/declined/429/5xx/timeout links per bank, caching,
  redaction.
- Extended: `payments.service.spec.ts` — Cheki auto-approve without the local
  verifier, reject matrix (underpay / non-ETB / receiver), fallback matrix
  (decodedOnly, unreachable, both-fail → review), duplicate + race (P2002).
- New: `users.service.spec.ts` (10) — course pre-assignment incl. transaction
  rollback.
- New: `verify-receipt.dto.spec.ts` — field-injection rejection.
- Extended: `cheki.service.spec.ts` — bare `verified:false` never yields a receipt.

## 3. Builds & service restart

- API rebuilt (`nest build`) and **restarted** (`node dist/src/main`); web
  rebuilt and restarted (`npm run start`); cloudflared tunnel + Python verifier
  untouched.
- Rev 3: `prisma migrate deploy` applied the pending
  `20261017120000_add_performance_indexes` (additive `CREATE INDEX`) and the new
  `20261018160000_add_accepted_banks` (new table + 6 seed rows); `prisma generate`
  + rebuild + restart. Health: `ready`, database up, redis up.
- Post-restart health: `GET /api/v1/payments/bank-accounts` → 200 with the
  college accounts; web root → 200.

## 4. Live end-to-end harness (`%TEMP%\lor-logs\sprint-e2e.cjs`)

Runs against the **live dev DB + live API**, creates its own disposable fixtures
(2 draft courses in 2 departments, 1 teacher account, 1 student), and removes
every fixture at the end. Full output of the final (extended) run:

```
PASS found an active SUPER_ADMIN
PASS found 2 active semesters in different departments :: Doctor of Medicine | Doctor of Dental Medicine
PASS created 2 disposable draft courses
PASS create-staff returns 201
PASS temporary password returned
PASS both courses persisted with the new teacherId
PASS teacher can log in with the temporary password :: status 200
PASS GET /courses/mine returns 200
PASS dashboard lists course A (cross-department OK)
PASS dashboard lists course B
PASS reusing an assigned course is rejected with 400
PASS rejected request created no partial account
PASS PATCH teacherId:null unassigns (200)
PASS course B teacherId cleared in DB
PASS dashboard now lists only course A
PASS teacher is forbidden from the admin course catalog (403)
PASS found an active subscription plan
PASS Cheki-primary live: real consumed receipt is rejected as duplicate
PASS no payment row was created for the blocked duplicate :: count=0
PASS cleanup removed all disposable fixtures
ALL E2E CHECKS PASSED   (exit=0)
```

An earlier (pre-authorization-check) run of the same harness was also fully
green — 19/19.

## 5. Live evidence captured in the API log

```
[Nest] 14456 - 10/18/2026, 8:08:56 PM  LOG [ChekiService] Cheki verified cbe FT26…12 chars
```

This is the live Cheki call performed by the running API during the duplicate-gate
E2E — the adapter executed against the real service, and the pipeline then blocked
the already-consumed reference (`400 This receipt has already been submitted.`).

## 6. What is NOT covered by these results

- Fresh unused real receipt → live auto-approval via Cheki (unit-covered only).
- Live Telebirr/M-Pesa geo-block flow; live `mbreciept` short link (needs a real link).
- Production-mode deployment checks (T-30, T-46, T-47, T-50–T-53) — unchanged from
  the main test plan; environment-limited.
- Load testing and outage drills — unchanged.

## 7. Verdict on regressions

**No regressions.** Every previously passing suite still passes; new suites cover
the new code; the live E2E adds end-to-end proof for Issue A and the Cheki
duplicate/fallback safety behavior.

## 8. Addendum (Rev 2, same day) — screenshot/QR upload auto-verification

Feature: uploaded receipt screenshots are scanned for a QR code via Cheki's
`POST /api/ocr` (adapter method `scanReceiptImage`); the extracted bank +
reference/link then runs through the **same** bank-confirmation pipeline
(`/payments/submit` → Cheki verify → local verifier fallback → `assessReceipt`).
The QR is a lookup hint only — it can never approve by itself (§ trust rules in
`PAYMENT-RECEIPT-VERIFICATION.md` §1b).

### Tests added

- `cheki.service.spec.ts` **+8** (26 total): OCR live-contract shape (CBE link /
  mbreciept / bare FT per live probes), bank-code mapping (telebirr→tele),
  unsupported-bank flagging, no-QR `NONE`, 429 without retry, HTTP-error /
  malformed-body / unreachable degradation, empty+oversized+disabled guards.
- `payments.service.spec.ts` **+8**: upload auto-approve on bank confirmation,
  unconfirmable QR → PENDING with screenshot + `verification.ocr`, replayed QR
  blocked (no row), confirmed underpayment → REJECTED row + 400, no-QR fallback,
  bare CBE FT → review without any bank call, unsupported bank → review with the
  provider code, disabled Cheki → OCR skipped entirely.
- Suites re-run after the change: **API 148/148**, payments **83/83**, cheki
  **26/26** (all exit 0). `nest build` and `next build` exit 0.

### Live end-to-end harness (`%TEMP%\lor-logs\sprint-e2e-ocr.cjs`)

Uploads synthetic QR images through the running API against the **live Cheki
service**, with a disposable student fixture (self-cleaning):

```
PASS found an active subscription plan
PASS real-receipt QR upload is blocked as a duplicate (400) :: 400 ... "This receipt has already been submitted."
PASS no payment row created for the blocked QR upload :: count=0
PASS failed duplicate upload left no file behind :: []
PASS unverifiable QR upload is accepted for review (2xx) :: 201 {"status":"PENDING","autoApproved":false,"needsReview":true,...}
PASS response marks needsReview and not autoApproved
PASS pending payment exists
PASS pending payment keeps the screenshot as evidence :: 1df296...png
PASS pending payment did not auto-approve anything :: PENDING
PASS ocr provenance recorded on the pending payment :: {"via":"cheki-ocr","bankCode":"cbe"}
PASS cleanup removed the disposable student
PASS cleanup removed every uploaded fixture file :: []
ALL OCR E2E CHECKS PASSED   (exit=0)
```

The first case proves the whole new chain live: screenshot → Cheki OCR (QR read)
→ legacy CBE link resolved by Cheki (`verified`) → duplicate gate. API log:

```
[ChekiService] Cheki OCR read a cbe QR (FT26…12 chars)   (21:20:23)
[ChekiService] Cheki OCR read a cbe QR (QCNo…18 chars)   (21:20:29)
```

### Still NOT VERIFIED live

- A **fresh unused** receipt (typed or uploaded) auto-approving via Cheki — needs
  a real unused receipt; unit-covered end to end.
- Live `mbreciept` short link (signed token, not constructible).
- Telebirr/M-Pesa geo-block flow.
- Privacy note: uploads forward the screenshot to Cheki's OCR endpoint (same as
  cheki.et's own scan flow); documented in `CHEKI-INTEGRATION-STRATEGY.md` §4.

### Build note (transparency)

The web rebuild crashed once with exit 134 (Next.js worker abort — resource
contention while the API build ran in parallel on the same host); the solo rerun
exited 0 with all routes. No code change was made in between.

## 9. Addendum (Rev 3, same day) — admin-managed payment banks

Feature: the college chooses which banks it accepts. A 31-bank catalog derived
from Cheki's `/api/banks` lives in
`apps/api/src/modules/payments/bank-catalog.ts` (labels, input mode,
auto-verifiable flag); the `AcceptedBank` table stores which entries are enabled.
Admin UI: `/admin/banks`; public picker feed: `GET /payments/banks`.
M-Pesa/Siinqee/eBirr/ZamZam joined the automated adapter mapping; all other
catalog banks are accepted for **manual review only** (never auto-approved from
student input). The typed-reference flow rejects banks that are not enabled
server-side; the upload/OCR flow remains receiver-gated as before.

### Tests / migration

- `payments.service.spec.ts` **+4** → payments **87/87**, full API **152/152**
  (14 suites), cheki **26/26** unchanged (two existing cases retargeted to
  genuinely unsupported banks: Abay for verify, Nib for OCR).
- `prisma migrate deploy` applied `20261017120000_add_performance_indexes` and
  `20261018160000_add_accepted_banks`; client regenerated; API + web rebuilt;
  both restarted.
- `nest build` exit 0; `next build` exit 0 (includes `/admin/banks`).

### Live end-to-end harness (`%TEMP%\lor-logs\sprint-e2e-banks.cjs`) — 18/18 PASS

```
PASS found an active subscription plan
PASS found an active admin account
PASS admin can read the bank catalog (31 entries) :: 200 count=31
PASS six seeded banks are adopted and enabled :: cbe,tele,dashen,awash,boa,zemen
PASS student token is forbidden from the admin bank list (403) :: 403
PASS admin adds Abay Bank (adopted + enabled) :: 201 {... "auto":false,"adopted":true,"isActive":true}
PASS Abay appears in the student picker as manual review :: {"code":"abay",...,"auto":false}
PASS manual-bank submission is queued (PENDING, not auto-approved) :: 201 {"status":"PENDING","autoApproved":false,"needsReview":true,...}
PASS response explains manual verification :: Payments from Abay Bank are verified manually. Our team will review it shortly.
PASS manual payment row records the reference and review note :: abay PENDING
PASS admin hides Abay Bank :: 200 {... "adopted":true,"isActive":false}
PASS hidden bank is removed from the student picker :: ["cbe","tele","dashen","awash","boa","zemen"]
PASS hidden bank is rejected server-side (400) :: 400 This bank is not currently accepted for payment. Please contact the college.
PASS admin adds M-Pesa (automatic verification) :: 201 {... "auto":true,...}
PASS M-Pesa appears in the student picker as auto-verified :: {"code":"mpesa",...,"auto":true}
PASS admin removes the test banks; six defaults remain :: cbe,tele,dashen,awash,boa,zemen
PASS dev DB left with the six default banks :: awash:true,boa:true,cbe:true,dashen:true,tele:true,zemen:true
PASS disposable student cleaned up
RESULT: ALL PASS
```

(Fixture student + payment row deleted; the two test banks removed; the six
seeded defaults verified untouched. Also checks: 31-entry catalog, admin role
guard, picker ordering, and cleanup.)

### Still NOT VERIFIED

- A **fresh unused** receipt auto-approving via Cheki (typed or uploaded) —
  unchanged from §8.
- Live receipt lookups for the newly mapped M-Pesa/Siinqee/eBirr/ZamZam banks —
  adapter mapping is unit-covered; real receipts are needed per bank.
- Live `mbreciept` short link; Telebirr/M-Pesa geo-block flow (unchanged).

## 10. Addendum (Rev 4, same evening) — receiving accounts, amount matching, camera capture

### Defect confirmed

The operator selected the **Quarter** plan (250 ETB) and uploaded an **800 ETB**
receipt. The live payment row was created with `plan.priceETB = 250` but the
bank-confirmed receipt amount was **792 ETB**, and it was **auto-approved**
(`cmve8ob3k00066cty2a9niikj`, status APPROVED). Root cause: the old assessment
only rejected `amount < plan price`; overpayment had no branch and fell through
to APPROVE. The payment predates the fix and remains approved (see §10.5).

### Fixes implemented

- **Amount:** underpay still REJECTs, now with: “Please upload a receipt for the
  selected plan amount or contact the college.” Overpay now routes to **PENDING
  manual review** with a message to contact the college/choose the matching
  plan. No overpayment can auto-approve.
- **Receiving accounts:** `AcceptedBank.accountNumber` / `accountName` (+ unique
  index), admin `PATCH|DELETE /payments/admin/banks/:code/account`, inline editor
  on `/admin/banks`, public feed merge, and receiver matching against DB accounts
  plus the legacy `COMPANY_BANK_ACCOUNTS` fallback. CBE last 8 / BOA last 5 are
  derived Cheki lookup rules; the full account is stored for display/matching.
- **Camera:** the subscribe upload view now has a “Take a photo with camera”
  button (`getUserMedia`, rear camera when available) that captures a JPEG and
  submits it through the existing `/payments/submit` server OCR path. Cancelling
  or unmounting releases the camera. Camera access needs HTTPS or localhost.

### Automated results (actual)

| # | Command (cwd) | Result |
|---|---|---|
| 1 | `npx jest --silent` — `apps/api` | **14 suites / 159 tests PASS** (exit 0; +7 vs Rev 3) |
| 2 | `npx jest src/modules/payments --silent` — `apps/api` | **5 suites / 94 tests PASS** (exit 0; +7) |
| 3 | `npm run build` — `apps/api` | **exit 0** |
| 4 | `npm run build` — `apps/web` | **exit 0** (includes `/admin/banks`, subscribe page) |
| 5 | `npx prisma migrate deploy` — `apps/api` | applied `20261018200000_add_bank_receiving_accounts` |
| 6 | `npx prisma generate` — `apps/api` | exit 0 |

New unit coverage: overpay typed-reference → PENDING review; overpay QR upload →
PENDING review with screenshot + `reviewNote`; account save normalization;
short-account reject; duplicate-account reject; clear-without-delete; DB-first /
env-dedupe public feed.

### Live end-to-end harness (`%TEMP%\lor-logs\sprint-e2e-accounts.cjs`) — 8/8 PASS

```
PASS found an active admin account
PASS catalog contains the test bank :: abay
PASS test bank added for the account test :: 201
PASS admin saves a receiving account :: 200 {...accountNumber:"9999000012345"...}
PASS saved account appears on the public transfer panel feed
PASS short account is rejected (400)
PASS admin clears the receiving account
PASS cleared account disappears from the public feed
CLEANUP null (restored)
ALL CHECKS PASSED
```

The harness recorded the bank's prior state, added Abay only for the test,
saved/cleared a disposable account, then removed the bank — no payment rows.
API and web were rebuilt and restarted; `/api/v1/health/ready` returned
`{"status":"ready","database":"up","redis":"up"}` and web `/` returned 200.

### Still NOT VERIFIED live

- A **fresh overpaid receipt** reaching manual review through the full live
  Cheki/verifier path — unit-covered; the original 792 ETB approval is the
  reproduction, but it was already finalized before the fix.
- **Camera capture on a real device/browser** — build/type-check only; requires
  HTTPS (or localhost) and camera permission. The existing file-upload OCR path
  remains live-verified (§8).
- Fresh unused receipt auto-approval, live `mbreciept`, Telebirr/M-Pesa
  geo-block, and the newly mapped banks' live lookups — unchanged from §8/§9.

### 10.5 Existing affected payment

> **Superseded by §12.1 (2026-10-19).** The operator approved reversal. The
> payment is now REJECTED, its subscription is CANCELLED, and the user has been
> notified with an audit trail. The historical v4 text below is retained for the
> record.

The 250-plan/792-receipt payment remains **APPROVED** and its subscription
active. Correcting it is not automatic: that would revoke access and change
historical billing. It needs an explicit operator decision (leave as an
overpayment, apply the difference to a larger plan, or reverse/refund).

## 11. Addendum (Rev 5, 2026-10-19) - payment-page and dialog fixes

### Reported defects

1. The transfer panel showed CBE/BOA accounts from `COMPANY_BANK_ACCOUNTS`
   even though no receiving account had been set on `/admin/banks`.
2. Bank of Abyssinia asked for a receipt **URL** instead of a reference.
3. Clicking the online-payment action created a `PENDING` CHAPA row that
   appeared in the admin queue before the student had paid or even completed
   Chapa's checkout. An abandoned checkout also blocked a later manual payment
   with "You already have a payment awaiting review".
4. Destructive actions used native `window.confirm()` dialogs (admin users,
   admin banks, admin/teacher materials, forum moderation).

### Fixes implemented

- `GET /payments/bank-accounts` now returns **only active `AcceptedBank` rows
  with an admin-set account**. Legacy `COMPANY_BANK_ACCOUNTS` entries still
  participate in receipt matching but are never listed as transfer
  destinations; when no account is set the panel is hidden.
- BOA's catalog input changed from `url` to `ref`. The student enters only the
  transaction reference; the API derives the last 5 Cheki lookup digits from
  the configured BOA receiving account. A pasted BOA slip link is still
  accepted. If Cheki cannot confirm a bare reference and the local fallback
  returns `URL_REQUIRED`, the submission is queued for manual review instead of
  returning a hard input error.
- `GET /payments/admin` excludes unconfirmed Chapa attempts
  (`method=CHAPA, chapaRef=null, status!=APPROVED`), so an
  initialized/abandoned checkout or a failed initialization is not presented as
  an admin request. Approved Chapa rows are always kept. The student's own
  recent payment history (`GET /payments/me` and the profile payload) applies
  the same filter, so such an attempt does not look like a pending or rejected
  payment. A Chapa-confirmed underpayment stores its `chapaRef` and a review
  note and stays visible for reconciliation. Chapa payments remain confirmed
  only by webhook/callback verification.
- The manual duplicate guard now checks `method=MANUAL` pending rows only, so
  an open Chapa checkout cannot block a bank-transfer submission.
- Added `ConfirmDialogProvider` / `useConfirm()` and replaced every
  `window.confirm()` in the web app. The same themed destructive dialog now
  covers admin user deletion, bank/account removal, material deletion (admin
  and teacher), and forum thread/reply removal. No product code calls
  `window.alert` or `window.confirm`.
- The subscribe page header initially received a direct "Back to dashboard"
  link; the operator asked for that control on `/pricing` instead, so it was
  moved in §12.3. The Chapa panel states that nothing is sent to the college
  until Chapa confirms. Loading copy is "Opening secure checkout..." (not
  "Redirecting to Chapa...").

### Automated results (actual)

| # | Command (cwd) | Result |
|---|---|---|
| 1 | `npx jest --silent --runInBand` - `apps/api` | **14 suites / 164 tests PASS** (exit 0; +5 vs Rev 4) |
| 2 | `npx jest src/modules/payments --silent --runInBand` - `apps/api` | **5 suites / 99 tests PASS** (exit 0; +5) |
| 3 | `npm run build` - `apps/api` | **exit 0** |
| 4 | `npm run build` - `apps/web` | **exit 0** (includes `/pricing/subscribe`, `/admin/banks`, `/admin/users`, `/admin/courses`, `/teacher/courses`, `/forum`) |
| 5 | TypeScript check - `apps/web` | **exit 0** |

The web production build was re-run after the final copy change. The production
chunks contain "secure checkout opens only after you click Pay" and no
"Redirecting to Chapa" text; the only old-copy chunks are under the stale
`.next/dev` development cache, which `next start` does not serve.

New coverage: admin queue excludes unconfirmed Chapa attempts (abandoned
checkouts and failed initializations, i.e. no `chapaRef` and not approved); the
student's own payment history hides the same attempts; an in-progress Chapa
checkout does not block a manual payment; a Chapa-confirmed underpayment stores
its `chapaRef` and review note while staying visible to admins; BOA bare
reference derives `02844` from a configured `85802844` account and reaches
manual review when the local fallback needs a URL; public feed returns only
admin-managed accounts and excludes env-only entries.

### Still NOT VERIFIED live

- **CLOSED in §12.2:** a live BOA reference with a configured BOA account.
  The operator submitted a real reference; the page asked for a transaction
  reference (not a receiver account/URL) and the payment was queued for manual
  review, as designed. Unit coverage still owns the lookup-digit derivation.
- **Abandoned Chapa checkout:** the operator's UI return path is now fixed and
  live-tested (`§12.3` - click Pay, reach Chapa, browser Back, button restored).
  Queue/history exclusion remains covered by the earlier live row check and by
  unit tests.
- **Every in-app dialog** was type-checked/built, but a manual browser
  click-through of the remaining destructive actions (bank, account, materials,
  forum) is still recommended.
- Camera capture, fresh overpaid receipt review, real unused receipt approval,
  live `mbreciept`, and Telebirr/M-Pesa geo-block remain unchanged from §10.

### Live verification after restart (2026-10-19 01:26-01:34 local)

API and web were rebuilt and restarted on the new build (API `dist/src/main`,
web `next start`). Verified:

| Check | Live result |
|---|---|
| `GET /api/v1/health/ready` | `{"status":"ready","database":"up","redis":"up"}` |
| `GET /api/v1/payments/banks` BOA entry | `{"code":"boa","label":"Bank of Abyssinia (BOA)","input":"ref","auto":true}` |
| `GET /api/v1/payments/bank-accounts` | only `source:"database"` accounts that the operator has explicitly set; no env fallback entries |
| `GET /api/v1/payments/admin` | 16 rows returned, **0** `method=CHAPA, chapaRef=null, status!=APPROVED` rows leaked; the DB had **16** unconfirmed CHAPA rows at the final check (2 PENDING + 14 REJECTED), so the filter was exercised live |
| `GET /api/v1/payments/me` and `GET /api/v1/users/me/full` for the checkout owner | the same unconfirmed row is **absent** from both student histories |
| Web `/` | HTTP 200 |
| Local verifier `GET :8000/health` | `{"status":"ok","banks":["awash","boa","cbe","dashen","tele","zemen"]}` |
| Prisma Studio `:5555` | HTTP 200 |
| Cloudflare quick tunnel `/api/v1/health/ready` | `{"status":"ready","database":"up","redis":"up"}` |

The final live admin-queue check had 16 unconfirmed CHAPA rows present (2 PENDING
+ 14 REJECTED) and returned zero of them, confirming the filter on real data. Three
approved CHAPA rows with a null `chapaRef` were still returned (approved rows
are never hidden), and four REJECTED rows with a `chapaRef` were also kept. The
PENDING row was absent from the owner's `/payments/me` and `/users/me/full`
responses. The filter and the confirmed-underpayment visibility path are also
unit-tested above.

### Chapa close prompt (external)

The close prompt the operator sees on `checkout.chapa.co` belongs to Chapa's
hosted page (`beforeunload`), not to LOR Mentor. A page cannot remove another
origin's browser dialog. The app-side fix is that checkout is opened only on an
explicit "Pay" click, and no native dialogs remain in our own screens.

### Remaining acceptance step

The BOA reference acceptance step was completed live on 2026-10-19 (see
§12.2): the field says **BOA TRANSACTION REFERENCE**, no receiver account is
requested, and a real BOA reference reaches manual review without a URL error.
The remaining manual item is a destructive-action click-through: click a
destructive control (e.g. remove a bank) and confirm the themed dialog appears
and **Cancel** leaves data unchanged.

## 12. Addendum (Rev 6, 2026-10-19) - operator decisions, branding, and return-state fixes

### 12.1 Existing 792 ETB payment - reversed

The operator explicitly approved the reversal of the legacy overpayment
`cmve8ob3k00066cty2a9niikj`. A targeted, idempotent script (temporary operator
tooling, not product code) performed the change in one transaction after
refusing if the user had another APPROVED payment:

| Item | Before | After |
|---|---|---|
| Payment `cmve8ob3k00066cty2a9niikj` | `APPROVED`, amount 250, Quarter plan, receipt evidence 792 ETB | `REJECTED`; reason recorded: "Bank receipt showed 792 ETB but the selected plan price was 250 ETB. Payment reversed by operator; access removed." |
| Subscription `cmve8ob9n00076cty8hbvqt3r` | `ACTIVE` | `CANCELLED` |
| User-facing history | APPROVED receipt | row remains visible as `REJECTED` in `GET /payments/me` |
| Subscription API | `isActive: true` | `{"status":"CANCELLED","isActive":false}` |
| Notification | - | `PAYMENT_REJECTED` / "Payment reversed" |
| Audit | - | `PAYMENT_REVERSED` with previous status, reason, plan price, subscription id and cancellation flag |

The receipt number and bank evidence were retained for the audit trail; the PDF
document endpoint already refuses non-APPROVED payments. No other approved rows
for that user existed, so no newer access was affected.

Post-reversal live checks:

```
{"status":"REJECTED","amount":"250","plan":"Quarter","planPrice":"250","reviewedBy":"cmqys89ju0036dstyeoqe0om5"}
studentHistory: {"visible":true,"status":"REJECTED"}
subscription:   {"status":"CANCELLED","isActive":false}
audit:          present
notification:   {"present":true,"title":"Payment reversed"}
PASS
```

Payment-queue re-check after the reversal: **17** admin rows returned; **0**
unconfirmed CHAPA rows leaked (DB still contained 19 such rows: 5 PENDING and 14
REJECTED with no `chapaRef`). Three approved CHAPA rows with no `chapaRef` and
four confirmed/rejected rows remained visible. The unconfirmed row was still
absent from the student's `/payments/me` and `/users/me/full` payloads.

### 12.2 BOA live reference - manual review confirmed

The operator submitted a real BOA reference through the live subscribe page.
The form asked for **BOA TRANSACTION REFERENCE**, did **not** ask for a receiver
account (unlike CBE), and the submission was queued for **manual review** instead
of returning a URL/input error. API log evidence:

```
[ChekiService] Cheki boa FT26...12 chars -> HTTP 422
[ReceiptVerifierService] Verifier boa -> URL_REQUIRED: boa lookups need a full receipt URL
```

This is the intended secure outcome for BOA, whose receipts do not expose a
verifiable beneficiary account. The reference is retained for the reviewer; no
automatic approval is possible from the absence of receiver evidence.

The submission created a **PENDING** `MANUAL` row (1000 ETB yearly,
`bankReference FT262794LKF0`) with the review note above; the super-admin
rejected that test row about three minutes later (`PAYMENT_REJECTED`, reason
"Receipt could not be verified"), so it is now `REJECTED` and does not appear
as a pending item. The verification evidence is retained on the row. This is
consistent with the queue counts in §12.1 (no `MANUAL/PENDING` rows after the
test session).

### 12.3 Navigation and Chapa return state

- The back-arrow control now lives on `/pricing`: `<- Back to dashboard`.
  Browser click-through landed on `/dashboard`.
- `/pricing/subscribe` now shows only `<- Back to pricing`; the duplicate
  dashboard link was removed. This also removes the visual collision the
  operator reported on the return path.
- **Back-forward-cache fix:** the Pay Now handler now listens for `pageshow`
  with `event.persisted` and releases the `submitting` state. Live reproduction:
  1. Open `/pricing/subscribe?planId=...` as a disposable student.
  2. Click `Pay 250 ETB now`; button changes to `Opening secure checkout...`.
  3. Chapa hosted checkout loads at `checkout.chapa.co/...`.
  4. Browser **Back** returns to the subscribe page
     (`performance navigation type: back_forward`).
  5. The button is again **`Pay 250 ETB now`**, enabled, with no overlapping
     "Back to dashboard" text.
  The disposable student and its one Chapa attempt were deleted after the test.
- **Final post-restart check:** `/pricing` returned 200, the `Back to dashboard`
  link resolved to `/dashboard`, the shield logo loaded (40x40), and the browser
  console had no errors. `/pricing/subscribe` rendered with a signed student
  session (read-only; no payment submitted): it showed `Back to pricing` only
  and an enabled `Pay 1,000 ETB now` button, with no console errors.

### 12.4 LORCAN logo integration

New assets:

- `apps/web/public/lorcan-logo.webp` (full shield + college banner)
- `apps/web/public/lorcan-mark.webp` (shield-only crop)
- `apps/web/src/app/icon.png` (512 px browser icon)
- `apps/web/src/app/apple-icon.png` (180 px iOS icon)

`BrandLogo` (`apps/web/src/components/shared/brand-logo.tsx`) is the single
component for both variants. It is used in the expanded and collapsed sidebar,
login, register, admin login, pricing header, forgot-password, reset-password,
and verify-email screens. The logo sits on a white tile so it stays legible in
both themes. `/icon.png`, `/apple-icon.png`, `/lorcan-logo.webp` and
`/lorcan-mark.webp` all returned HTTP 200 from the rebuilt web server.

### 12.5 Automated validation (actual)

| # | Command (cwd) | Result |
|---|---|---|
| 1 | `npx jest --silent --runInBand` - `apps/api` | **14 suites / 164 tests PASS** (exit 0) |
| 2 | `npx jest src/modules/payments --silent --runInBand` - `apps/api` | **5 suites / 99 tests PASS** (exit 0) |
| 3 | `npm run lint` - `apps/web` | **exit 0** (two existing react-hooks/set-state-in-effect findings fixed while editing the touched pages; no warnings) |
| 4 | `npm run build` - `apps/web` | **exit 0** (35 routes; `/icon.png` and `/apple-icon.png` included) |
| 5 | `GET /api/v1/health/ready` after restart | `200 {"status":"ready","database":"up","redis":"up"}` |

No API source changed in this pass; the running API is the previously built
`dist/src/main` and was restarted to restore the live checks. Redis readiness is
up, but the local instance is Redis **5.0.14.1** (below BullMQ's recommended
6.2.0) and the prior-run error log contained a BullMQ `MISCONF` persistence
error; this is an environmental/ops item covered by the existing S-1 posture
decision, not caused by these changes.

### 12.6 Still open

- Browser click-through of the remaining destructive dialogs (bank removal,
  receiving-account removal, material deletion, forum thread/reply deletion).
- Fresh exact-amount unused receipt auto-approval; real `mbreciept`; live
  Telebirr/M-Pesa geo-block; lookups for newly mapped banks.
- F-8 (Resend domain), S-2 (secret rotation), S-1 (Redis fail-open/persistence),
  real receiving accounts for every college bank, co-teaching sign-off and T-45
  manual AI retry.

## 13. Addendum (Rev 7, 2026-10-19) — S-1 fail-closed, env preflight, watchdog

### 13.1 Operator manual UI pass (operator-reported)

The operator completed the short authenticated UI pass and reported all four
items working:

- `/ai-tutor`: a real tutor answer was returned (no 500).
- `/admin/courses`: a PDF material upload reached AI generation completion.
- `/courses`: a PDF material opened in the in-app viewer.
- `/admin/banks`: a destructive remove dialog was opened and **Cancel** was
  clicked; the bank/account data remained unchanged.

This is operator confirmation rather than captured screenshot evidence. It
closes the previously PARTIAL T-42/T-45 manual items pending the operator's
exact notes; no native `confirm()`/`alert()` appeared.

### 13.2 S-1 Redis posture — fail closed

`TokenDenylistService` now defaults to **fail-closed** when Redis is
unreachable. A refresh token whose revocation state cannot be checked is
denied, not allowed. `REDIS_FAIL_MODE` accepts only `closed` (documented
production value) or `open` (explicit local-debug escape hatch);
`env.validation.ts` rejects anything else.

New unit coverage in `apps/api/src/common/redis/token-denylist.service.spec.ts`:
normal allow/deny, deny-on-Redis-error, allow-only-with-`open`, missing `jti`,
TTL storage, and shutdown. The Redis-down outage drill (T-30) was then executed
against the compose stack (§13.7): stop → readiness 503 → refresh 401 with a
real signed cookie → start → readiness 200. The fail-closed path is now
outage-proven, not just unit-proven.

### 13.3 Environment preflight and duplicate-key cleanup

- `env.validation.ts` now rejects placeholder `DATABASE_URL`/`SMTP_PASS`,
  invalid or `resend.dev` `SMTP_FROM`, and unknown `REDIS_FAIL_MODE` values.
- Legacy `COMPANY_BANK_ACCOUNTS` is validation-optional and matching-only;
  public transfer accounts come from the DB (`/admin/banks`).
- New `scripts/check-env.mjs` / `npm run check:env -- <file> [--strict]` reports
  duplicate keys, missing required keys, placeholders and localhost URLs
  without printing values.
- The root local `.env` had two `GEMINI_API_KEY` lines; the earlier line was
  removed so the previous last-wins value is preserved. A timestamped backup
  was made before the edit.
- `.env.production.example` now documents `REDIS_FAIL_MODE=closed`, the
  duplicate-key preflight, the verified-sender requirement and the DB-first
  receiving-account model.

### 13.4 Local watchdog / scheduled task

New `scripts/local-stack-watchdog.ps1` starts any missing API/web/verifier/
Prisma Studio/cloudflared process, respects a 150-second per-service grace
window, and logs to `%TEMP%\lor-logs\watchdog.log`. It never kills a healthy
process.

Windows scheduled task **`LorMentorStackWatchdog`** was registered for every
2 minutes with `MultipleInstances IgnoreNew`, `StartWhenAvailable`, and
battery-safe settings. First automatic run: 2026-10-19 19:56 local, result
`0`; next run 19:58. The stack was also restarted manually via the script after
the API/web rebuild.

Recovery was proven live: the verifier listener (PID 3920) was stopped, the
watchdog was invoked, it started a new verifier (PID 9524), and
`GET :8000/health` returned 200 four seconds later. The scheduled task's later
ticks (20:00, 20:02, 20:04) saw every service already healthy and started
nothing, so there is no duplicate-process loop.

Follow-up (2026-10-20 ~00:56 local): the task still flashed a PowerShell
console window on every 2-minute tick — `-WindowStyle Hidden` on `pwsh.exe`
is not honoured by this machine's default, delegated console host. The task
action was switched to `scripts/local-stack-watchdog-hidden.vbs` run via
`wscript.exe //B //NoLogo` (a GUI-subsystem process starting the watchdog with
window style 0, so no console is ever created). A direct launcher run and a
manual `Start-ScheduledTask` tick both returned result `0` and appended fresh
`watchdog.log` lines; the registration snippet at the bottom of the script now
documents the hidden launcher so a re-register cannot regress.

### 13.5 F-8 probe (trigger check only; delivery still blocked)

`npm run check:f8-email -- --api http://localhost:4000 --email
f8-check-20261019@example.com` returned:

```text
WARN: SMTP_FROM still points at resend.dev. Only the Resend account owner can receive these messages (F-8 is not fixed yet).
POST /api/v1/auth/forgot-password -> 200
{"message":"If that email exists, a reset link has been sent."}
```

This proves the probe and API trigger work. It does **not** prove delivery: the
sending domain is still unverified and `SMTP_FROM` still uses `resend.dev`.
F-8 stays open until a non-owner inbox and the Resend `Emails` log both show
delivery.

### 13.6 Automated validation (actual, after the changes)

| # | Command (cwd) | Result |
|---|---|---|
| 1 | `npx jest --silent --runInBand` - `apps/api` | **15 suites / 177 tests PASS** (exit 0) |
| 2 | `npx jest src/modules/payments --silent --runInBand` - `apps/api` | **5 suites / 99 tests PASS** (exit 0) |
| 3 | `.venv\Scripts\python.exe -m pytest -q` - `services/receipt-verifier` | **20/20 PASS** |
| 4 | `npm run build --workspace=apps/api` | **exit 0** |
| 5 | `npm run lint` - `apps/web` | **exit 0** |
| 6 | `npm run build` - `apps/web` | **exit 0** (35 routes) |
| 7 | `npm run check:env -- .env.production.example` | no duplicate keys; strict mode correctly rejects example placeholders |
| 8 | `GET /api/v1/health/ready` | `200 {"status":"ready","database":"up","redis":"up"}` |
| 9 | `GET :3000`, `:8000/health`, `:5555` | `200`, `200`, `200` |
| 10 | `npm run e2e` - `apps/web` | 13 passed, 1 skipped (opt-in auth), 2 `evaluateAll` 30s timeouts while the Docker build saturated the host; both failing tests passed 2/2 on an isolated `--workers=1` rerun. No functional failure found. |

All services were restarted after the rebuild: API, web, verifier, Prisma
Studio and the Cloudflare quick tunnel. Current tunnel:
`https://cgi-ease-transparency-format.trycloudflare.com` (API). The tunnel URL
changes if cloudflared restarts.

### 13.7 Staging gates on local Docker (actual)

Docker Desktop was not running at the start of this pass; it was started and
the engine was reachable (`29.6.2`). A **staging-only** `.env.production` was
generated locally with random values (never committed; `.gitignore` covers it)
and `npm run check:env -- .env.production --strict` plus `docker compose
-f docker-compose.prod.yml --env-file .env.production config --quiet` both
passed.

The full verifier image build (Chromium + chromium-driver for BOA Selenium) was
cancelled after the Debian mirror stalled for ~30 minutes. The API and web
images had already built and tagged. Because T-51/T-52/T-53/T-49/T-30 do not
exercise BOA extraction, a slim verifier image (same app, no Chromium) was
built and tagged `lor-mentor-verifier:slim-local` to unblock the local gates.
The `:latest` tag was deliberately removed so a VPS build cannot accidentally
pick the slim image. The full verifier image remains a **Hostinger VPS deploy
step** — a datacenter network and disk are the right place for the ~1 GB
Chromium layer. The staging-only env file and compose volumes were deleted
after the run.

| Gate | Result | Evidence |
|---|---|---|
| T-50 | **PARTIAL** | `lor-mentor-api:latest` and `lor-mentor-web:latest` built; slim verifier built (no Chromium). Full verifier Dockerfile build deferred to the VPS. |
| T-51 | **PASS (local compose)** | `up -d --no-build`; all 5 containers healthy; `_prisma_migrations` shows all 11 migrations applied, including `20261018200000_add_bank_receiving_accounts`; `/api/v1/health/ready` 200; web `/` 200; verifier `/health` `{"status":"ok","banks":[...6 banks...]}`. |
| T-52 | **PASS (local compose)** | `deploy/smoke-test.sh http://127.0.0.1:4000 https://staging.lormentor.test` → **12 PASS / 0 FAIL** (health, helmet headers, auth 401, validation 400, generic forgot-password, CORS allowlist, 429 rate limit). The TLS case correctly skipped over HTTP. |
| T-53 | **PARTIAL** | HSTS `max-age=31536000; includeSubDomains` plus the full helmet header set, no `X-Powered-By`; an uploads marker survived `--force-recreate api` in the named volume `lor-mentor_uploads`. **Real TLS/Let's Encrypt and public domain are still unproven** (no staging host). |
| T-49 wrapper | **PASS** | `deploy/backup/pg-backup.sh` produced a 6,975-byte gzip dump; `gzip -t` passed; restored into throwaway `lor_t49_restore`; **30/30 public tables matched row counts, 0 diffs** (11/11 migrations); throwaway DB dropped. |
| T-30 | **PASS (compose Redis 7)** | `scripts/t30-redis-drill.ps1`: login PASS → stop Redis → readiness **503** → refresh with a real signed cookie **401** (fail-closed) → start Redis → readiness **200**. |

The drill needed one test-harness fix: `NODE_ENV=production` marks the refresh
cookie `Secure`, so .NET's cookie jar will not replay it over the local
plain-HTTP staging URL. The script now extracts the signed cookie value from
`Set-Cookie` and sends it explicitly **for the drill only**; real clients must
keep the cookie jar behavior. The compose stack was then torn down (`down -v`)
and the local dev stack restarted; current tunnel:
`https://code-idle-creature-isolation.trycloudflare.com` (API only; changes on
restart).

This is local Docker validation, **not** a staging host. It does not prove
public DNS/TLS, real Chapa webhooks over HTTPS, BOA Selenium extraction, or
multi-client load.

### 13.8 Still open

- F-8 non-owner inbox + Resend delivery log; S-2/F-6 rotation.
- T-50 full verifier Chromium image build on the Hostinger VPS.
- T-53 real TLS/domain/HSTS through host Nginx; T-46 load, T-47 kill-API-mid-
  AI-job, T-48 full outage matrix.
- Fresh exact-amount unused receipt auto-approval, live `mbreciept`, live
  Telebirr/M-Pesa geo-block, newly mapped bank lookups.
- Real receiving accounts for every college bank, co-teaching sign-off.
- T-45 exact authenticated evidence notes (operator-reported items are in
  §13.1).

### 13.9 Reversal re-check after restart (clarification)

The 792 ETB payment `cmve8ob3k00066cty2a9niikj` remains **REJECTED** and
visible as REJECTED in the student history, with the `PAYMENT_REVERSED` audit
row and "Payment reversed" notification intact. The linked subscription
`cmve8ob9n00076cty8hbvqt3r` is currently **ACTIVE again**, but not because the
reversal regressed: the same student made a separate, legitimate **APPROVED
CHAPA payment** `cmveyb0co000cvwtytkp9v0bs` for 500 ETB on 2026-10-19, and that
payment backs the active access. The updated read-only check passes only when
active access is explained by an approved payment, and it now reports
`approvedBackingPaymentId: cmveyb0co000cvwtytkp9v0bs`. Do not treat the active
subscription as reinstatement of the reversed 792 ETB payment.

## 14. Addendum (Rev 8, 2026-10-20) — admin dashboard UX: payment tabs, reversal, user filters, audit read

Scope: the admin-dashboard UX pass. Implemented decisions: (A1) admin accounts
carry no program — UI hidden for them **and** the API rejects it; (A2) teacher
program display/edit unchanged; (B1/B2) payment queue gets status tabs with
server-side filtering and per-tab counts (no pagination, single-category fetch);
(C1) users list gets role/program/account-status filters; (D1–D3)
SUPER_ADMIN-only payment reversal with access removal and a fourth "Reversed"
tab; (X1) the missing audit read endpoint (F-32).

### Schema / migration (`20261019205154_add_payment_reversal`) — additive only

- `ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED'`
- `ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REVERSED'`
- `ALTER TABLE "Payment" ADD COLUMN "reversalReason"/"reversedBy"/"reversedAt"`

No column changed, no row touched, no backfill needed.

### Behavior implemented

- `GET /payments/admin?status=` returns `{ payments, counts }`. Unknown status
  values are ignored (never trusted). Counts run on the same Chapa-hiding base
  filter as the list, so the tab badges always add up to the queue. Reversed
  rows live in their own tab; they are not mixed into Rejected.
- `PATCH /payments/:id/reverse` — **SUPER_ADMIN only**, mandatory reason.
  APPROVED → REVERSED via a race-safe `updateMany` claim; the subscription is
  CANCELLED (`endDate = now`) **only if no other APPROVED payment backs it**;
  the student gets a `PAYMENT_REVERSED` notification and an audit row
  (`PAYMENT_REVERSED`, actor + reason + accessRemoved) is written. Reversing
  an already-reversed payment is idempotent (`alreadyReversed: true`);
  PENDING/REJECTED rows are rejected (400). The original approval fields stay
  intact — the reversal never rewrites the review trail.
- `GET /users` adds `isActive=true|false` (account status — deliberately
  separate from subscription state) and `departmentId`; invalid values are
  ignored; filters compose with search/role/sort; `meta.total` unchanged.
- Admin accounts carry no program: `assignDepartment` and `createUser` reject a
  `departmentId` for ADMIN/SUPER_ADMIN (400). The users UI hides the program
  picker for those roles and shows a read-only Program cell; teachers keep the
  existing assignment flow.
- `GET /audit` implemented (F-32): SUPER_ADMIN only, newest first, `take`
  clamped to 1..500, actor relation included. Plain ADMIN receives 403; the
  sidebar hides the Audit Logs link for them and the page shows an explicit
  message if opened directly.

### Tests added (unit)

- `payments.service.spec.ts` — tab filter + counts mapping, unknown status
  ignored, and a reversal suite: reason required, non-approved rejected, access
  removed vs kept when a second approval exists, already-reversed idempotent,
  lost-race, not-found.
- `users.service.spec.ts` — isActive / departmentId / combined filters; admin
  program rejected on assignment and creation; teacher assignment still works.
- New `audit.service.spec.ts` — ordering, actor include, take clamping.

### Automated results (actual)

| # | Command (cwd) | Result |
|---|---|---|
| 1 | `npx jest --silent src/modules/payments/payments.service.spec.ts src/modules/users/users.service.spec.ts src/modules/audit/audit.service.spec.ts` — `apps/api` | **3 suites / 76 tests PASS** |
| 2 | `npm test` — `apps/api` | **16 suites / 197 tests PASS** (exit 0) |
| 3 | `npx tsc --noEmit` — `apps/api` | **exit 0** |
| 4 | `npm run build` — `apps/api` (`nest build`) | **exit 0** |
| 5 | `npx eslint` on the changed API files | no findings in the new/changed code; two spec files carry pre-existing findings on untouched lines from the earlier sprint |
| 6 | `npx eslint` on the four changed web files | **exit 0** |
| 7 | `npm run build` — `apps/web` | **exit 0** (all 35 routes, incl. `/admin/payments`, `/admin/users`, `/admin/audit`) |
| 8 | search for `window.(alert\|confirm\|prompt)` in `apps/web/src` | only the explanatory comment in `confirm-dialog-provider.tsx` |
| 9 | `npm run e2e` — `apps/web` | **15 passed / 1 skipped** (opt-in auth test) in a 4-worker parallel run, 8.9 s. An earlier same-day run failed 7 tests because the live `next start` process was serving a `.next` directory that had been rebuilt underneath it (stale chunk/HTML mismatch); after restarting the server against the fresh build, every runnable test passes. No functional failure found. |

### Live end-to-end harness — 30/30 PASS

Temporary fixture script (throwaway student/teacher/admin accounts,
subscriptions, approved payments; every fixture deleted afterwards — 0
leftovers), executed against the local stack after `nest build` + API restart.
Full output captured; key evidence:

- `GET /audit`: 401 anonymous, 200 SUPER_ADMIN (rows + actor), 403 plain ADMIN.
- Users: `meta.total=15`; `isActive` partition 15+0=15; `departmentId` filter
  returned 2 rows, all matching; `role=STUDENT&isActive=true` returned 7 rows,
  all matching.
- Payments: `{payments, counts}` shape; PENDING tab only pending rows; unknown
  status ignored (rows = counts sum = 15); REVERSED tab accepted.
- Reversal (SUPER_ADMIN): `200 "Payment reversed and subscription access
  removed"`; DB row `REVERSED` with reason/by/at; subscription `CANCELLED`;
  student notification; audit row with actor + reason; Reversed count 0 → 1;
  second call idempotent.
- Second-approval branch: reversing one of two approved payments returns
  `accessRemoved: false` and the subscription stays ACTIVE.
- Guards: plain ADMIN reverse **403**; plain ADMIN audit **403**; empty reason
  **400**; admin program assignment **400** ("Program assignment does not apply
  to admin accounts"); teacher program assignment **200**; creating an ADMIN
  with a program **400**.

### Still NOT VERIFIED live

- Browser interactions: status switching, toolbar search and opening the
  reverse dialog are now script-verified on the live build (see the Rev 8
  follow-up below). Submitting
  a reversal through the browser UI itself was still not driven — the reversal
  contract is covered by the API harness and the service tests.
- A live end-to-end student re-pay after reversal (unit-tested: the
  `assertNoActiveSubscription` gate only blocks ACTIVE, unexpired
  subscriptions, and the reversal sets CANCELLED).
- Reversal of a Chapa webhook-approved row in the wild (same service path; no
  live Chapa reversal executed).

### Rev 8 follow-up (2026-10-20, late) — dialog readability, payments filter toolbar, scripted visual check

- The reverse-payment dialog rendered transparent: its base classes
  (`bg-popover`, `text-popover-foreground`, `ring-foreground/10`) are not
  mapped in `tailwind.config.ts`, so the dialog had **no background at all**.
  A first attempt through the project's `.glass-panel` utility still let page
  text through (the backdrop blur is not reliable here), so the dialog now
  uses the exact recipe of the app-wide confirm dialog — `border
  border-default bg-surface p-5 text-primary` plus the matching title /
  description / footer overrides. Opaque, theme-token based (dark and light).
- The payments filter is now a literal "Option A" toolbar, matching the
  admin-users filter row control-for-control: a search input (student name,
  email or phone), a status select whose option labels carry the per-status
  counts, and a Clear-filters button that appears only while a filter is
  active. The page opens on the full queue, all statuses newest-first, and
  narrows only when a filter is chosen; receipt/QR uploads still never count
  as approval. Server-side: `GET /payments/admin` gained a
  `search` parameter (trimmed, capped at 100 chars, `mode: "insensitive"` on
  fullName / email / phoneNumber); the list and the counts run on the same
  base filter **and the same search term**, so a count always equals what
  selecting that status would list; omitting `status` (the page's ALL view)
  returns every row in the queue, ordered `createdAt desc` (unchanged
  ordering). Covered by two new service tests (search
  scoping of list + counts; whitespace-only term dropped) —
  `payments.service.spec` **57 passed**.
- Visual verification is now scripted, not assumed: temporary Playwright
  specs (deleted after the run) signed in through `/admin-login` on the live
  production build, switched statuses, typed into the toolbar search, opened
  the reverse dialog **without submitting**, and captured screenshots (kept
  under `%TEMP%\opencode\shots` on the dev machine). Confirmed: dialog fully
  opaque and readable; toolbar matches the users-page controls; select labels
  carry live counts (`All payments (15)`, `Pending (0)`, `Approved (6)`,
  `Rejected (8)`, `Reversed (1)`) that re-scope with the search term
  (`Approved (6)` → `Approved (1)` for "wend" → `Approved (0)` for a no-match
  term, showing the "No payments match the search." empty state). A follow-up
  pass confirmed the default view: the page opens on **All payments (15)** =
  0 + 6 + 8 + 1, one newest-first list mixing APPROVED and REJECTED rows, and
  Clear filters returns to that ALL view. Web eslint + production build
  clean; full e2e suite **16 passed** after the change.
- Found while verifying: `e2e/auth.spec.ts` asserted `toHaveURL(/\/admin/)`,
  which also matches `/admin-login` itself — the opt-in auth smoke could pass
  without a real sign-in. Tightened to `/\/admin(?:\/|\?|$)/` and re-run with
  `E2E_RUN_AUTH=1` and real credentials: **1 passed** (2.6 s).
- After the toolbar change: API `tsc` and `nest build` clean, web eslint
  clean, web production build clean, and the full Playwright e2e suite
  **16 passed** on the rebuilt apps (watchdog disabled during the rebuild,
  re-enabled after both services were up).

### Phone / LAN access (2026-10-20)

- Root cause: `apps/web/.env.local` pinned
  `NEXT_PUBLIC_API_URL=http://localhost:4000`, so the browser called the API
  absolutely and a phone on the LAN would have called its own localhost. The
  Next rewrite (`/api/v1/*` -> API) already existed but was bypassed.
- Fix: `apps/web/src/lib/api.ts` now defaults to a same-origin base
  (`/api/v1`) when `NEXT_PUBLIC_API_URL` is unset, so API traffic and cookies
  go through the Next server (first-party cookies, no CORS). `.env.local` has
  the variable commented for local builds; deployments that host the API
  separately keep setting it and get the previous absolute behaviour.
- Verified from a phone-sized Chromium profile against the LAN origin
  (`http://192.168.1.6:3000`, viewport 390x844): admin sign-in succeeds, the
  payments page loads through `/api/v1` (HTTP 200), shows `All payments (15)`,
  and reports **0 px horizontal overflow**. Full e2e suite **16 passed**
  after the rebuild.
- Caveats: the LAN IP is DHCP and can change (`ipconfig`); the Windows Wi-Fi
  profile here is Public, but the Node.js inbound firewall rule already allows
  Public. The payments table is desktop-first - at 390 px the row grid is
  cramped (status/action columns overlap) even though the page does not
  scroll sideways; a responsive row layout is a follow-up.
- Off-LAN option: a quick tunnel to the **web**
  (`cloudflared tunnel --url http://localhost:3000`) works now because API
  calls are same-origin; the existing tunnel on :4000 serves the API only
  (Chapa webhooks), not the UI.
- Re-run later the same day (LAN IP had moved to `192.168.1.2`): full e2e
  suite **16 passed** (13.3 s) and the phone-sized LAN pass **1 passed**
  (6.4 s) - sign-in, `All payments` list and 0 px horizontal overflow again
  confirmed. The DHCP lease kept changing (.5 -> .6 -> .2), so always read the
  current IP before opening the phone URL.

### iPhone / Safari mobile fixes (2026-10-20, Rev 9)

Reported from a real iPhone: the login/signup screens worked, but everything
inside the app appeared "cooked". Reproduced with Playwright WebKit 26.5
(webkit v2311, iPhone 13 profile) against the production build.

Root causes found and fixed:

1. **The mobile bottom nav was student-only for every role.**
   `components/layout/mobile-nav.tsx` hardcoded `/dashboard`, `/courses`,
   `/ai-tutor`, `/quiz`, `/profile`. Admins and teachers who tapped it were
   bounced straight back to `/admin` or `/teacher` by the layout role gate, so
   every tap looked like a no-op. The nav is now role-aware: admins get
   Overview / Users / Payments / Courses / Plans, teachers get Home / Courses /
   Forum / Analytics / Profile, students are unchanged. Active state uses an
   exact match for the root routes (`/admin`, `/dashboard`, `/teacher`) and a
   prefix match elsewhere.
2. **The topbar hamburger had no handler.** `(app)/layout.tsx` rendered
   `<Topbar />` without `onMenuToggle`, so the button was rendered but did
   nothing. Removed the dead control; the role-aware bottom nav is the mobile
   navigation. *(Superseded in Rev 10: the burger is back and now opens the
   full PC sidebar as a drawer.)*
3. **Admin list rows were fixed 12-column grids at every width.** At 390 px
   the payments and users rows overlapped (status badges over action links,
   role selects over the Active button) and audit actions truncated to
   `AUTH...` / `PAYM...`. Payments and users now render as stacked two-column
   cards below `md` and keep the original 12-column grid from `md` up; audit
   moves the actor/date under the action on phones. Desktop markup/behaviour is
   unchanged.
4. **A tap before hydration could native-submit the login form as GET.**
   WebKit reproduced it: `/admin-login?email=...&password=...` - credentials in
   the URL/history. The submit button on `/admin-login`, `/login` and
   `/register` is now disabled until React has mounted, and the forms declare
   `method="post"` as a fallback so a stray native submit cannot put the
   password in the query string.
5. **The topbar avatar was another dead control, and logout was desktop-only.**
   The avatar had `cursor-pointer` but no click target, and the only Logout
   button lives in the desktop sidebar - so a phone session could neither open
   Profile nor sign out. The avatar now opens a small account menu (name/email,
   Profile, Log out) that closes on outside click, Escape, or navigation.

Verification (all actual, on the rebuilt production build):

- WebKit iPhone 13 matrix, admin account, 9 pages (`/admin`, users, payments,
  plans, courses, banks, audit, notifications, profile): every page HTTP 200,
  expected `h1`, **0 px horizontal overflow**, and the bottom nav was
  `Overview / Users / Payments / Courses / Plans` on all nine. **2 passed**
  (32.7 s).
- Pre-hydration guard: with all `_next/static` JS blocked, the submit button
  reported disabled; clicking it and pressing Enter produced **no navigation
  request** and the URL stayed `http://localhost:3000/admin-login` (no
  `email=` / `password=`). Pass.
- `npx tsc --noEmit` -> exit 0; `npm run build` (Turbopack) -> exit 0.
- Full committed e2e suite with `E2E_RUN_AUTH=1` (real admin sign-in):
  **16 passed** (12.3 s), including the tightened `/admin(?:\/|\?|$)` auth
  assertion (re-run after the account-menu change).
- LAN smoke on the rebuilt app: `http://192.168.1.8:3000/admin-login` -> 200
  and `http://192.168.1.8:3000/api/v1/health` -> 200 with the API ready JSON.
- LAN/WebKit account-menu check on `http://192.168.1.8:3000`: admin sign-in,
  the avatar menu shows Profile + Log out, Profile navigates to `/profile`,
  and the page reports **0 px horizontal overflow**. The only console noise is
  the expected 401 from the logged-out `/me` probe on `/admin-login`.
- Temporary WebKit config/spec and `test-results/` were deleted after the run;
  no credentials were written to the repo. (The pre-hydration test uses a
  throwaway value, not the real password.)

Caveat: the PC's DHCP lease is still unstable (observed `.5 -> .6 -> .2 ->
.8` during this work). A phone session loaded from an old IP dies as soon as
the lease moves; set a DHCP reservation or use a web tunnel for longer
sessions.

### Mobile sidebar drawer + AI retry recovery (2026-10-20, Rev 10)

Follow-up from the phone: *"the pc sidebars are not coming - use burger button
or something"*, plus the **"CKD ditection"** material showing
`FAILED` with
`Invalid tx.flashcardSet.create() ... Unique constraint failed on the fields:
("aiContentId")`.

**Full sidebar on mobile.** The topbar burger is back and wired: it opens a
fixed drawer that renders the same role-aware `Sidebar` as desktop, so every
section is reachable (admin: including Payment banks, Moderation and Audit
Logs), not just the five bottom-nav shortcuts. It closes on navigation (even
tapping the current page), backdrop tap, Escape, the X button, and the
sidebar's Collapse button. The topbar title now truncates and its right-hand
controls stay fixed, so long titles do not overflow at 390 px. Desktop is
unchanged: permanent sidebar at `lg`, burger hidden.

**AI failure root cause.** `FlashcardSet` and `QuizBank` are one-per-
`AiContent` (`aiContentId` unique). The old save transaction had committed the
16 flashcards and 8 questions for "CKD ditection", but a later step marked the
content FAILED. Every retry then called `flashcardSet.create()` and hit the
unique constraint before it could recover. `apps/api/src/modules/ai/
ai.processor.ts` now:

- upserts `AiContent` by `materialId` (race-safe for duplicate jobs);
- upserts the flashcard set and quiz bank by `aiContentId`;
- only calls `createMany` for cards/questions when the existing container is
  empty;
- marks COMPLETED only after those saves commit.

Existing cards/questions are reused, and student reviews/attempts are never
deleted or recreated.

Verification (all actual, on the rebuilt production build):

- Live retry of the real failed record via
  `POST /api/v1/materials/:id/ai-regenerate` with a super-admin session:
  `PENDING -> PROCESSING -> COMPLETED` in about 2.5 minutes. The same
  flashcard-set id (`cmveed6ue0005rwtyt4t4smpv`, **16 cards**) and quiz-bank
  id (`cmveed6w3000mrwty1js3qht0`, **8 questions**) were reused; the 2
  pre-existing `FlashcardReview` rows are still present; `error` is null.
- WebKit 26.5, iPhone 13 profile, real admin sign-in: burger visible; drawer
  shows all 8 admin links (Overview, Users, Payments, Payment banks, Plans,
  Courses, Moderation, Audit Logs); tapping Payment banks navigates and closes
  the drawer; Escape, backdrop tap and X each close it; **0 px horizontal
  overflow**; at 1280 px the burger is hidden and the permanent sidebar is
  visible. **1 passed** (8.4 s).
- New `apps/api/src/modules/ai/ai.processor.spec.ts`: **2 passed** (existing
  set/quiz reused with no duplicate `createMany`; empty set/quiz filled).
  Full API unit suite: **201 passed / 17 suites** (8.8 s).
- `npx tsc --noEmit` (web) and `npm run build` (web, Turbopack) -> exit 0;
  API `npm run build` -> exit 0.
- Full web e2e with `E2E_RUN_AUTH=1` (real super-admin sign-in):
  **16 passed** (10.1 s).
- LAN smoke on the rebuilt app: `http://192.168.1.5:3000/admin-login` ->
  200 and `http://192.168.1.5:3000/api/v1/health` -> `ok`.
- Temporary WebKit config/spec and `test-results/` were removed after the
  run; no credentials were written to the repo. The material title still
  reads "CKD ditection" (the uploader's spelling); only its AI status changed.

Caveat: the DHCP lease is still unstable; always read the current IP before
opening the phone URL.

### Size-aware AI study notes (2026-10-20, Rev 11)

Follow-up: *"the summary is too short - make a good amount of note and based
on the size of the document, bullets and short notes."*

**Prompt and input changes** in
`apps/api/src/modules/ai/gemini.service.ts`:

- The PDF text cap moved from **40,000 to 100,000 characters**. The CKD PDF
  is 57,627 characters, so the old cap silently dropped roughly a third of the
  document before Gemini ever saw it.
- New `notesLengthTarget(sourceChars)` scales the requested summary:
  - `<5k`: 200-350 words (8-12 bullets)
  - `5k-15k`: 350-600 words (12-20 bullets)
  - `15k-30k`: 600-950 words (20-32 bullets)
  - `30k-60k`: 1,000-1,500 words (32-48 bullets)
  - `60k-100k`: 1,400-1,900 words (45-60 bullets)
  - `>=100k`: 1,700-2,200 words (55-75 bullets)
- The prompt now asks for actual revision notes in Markdown: a 2-4 sentence
  overview, `##`/`###` section headings, and `-` bullets containing short
  self-contained facts (definitions, mechanisms, classifications, clinical
  clues, investigations, management points and exam pearls). Key terms are
  bold, tables/code/references are excluded, and the model is told to cover
  the whole document without padding or inventing facts.
- Storage/API shape is unchanged: `summary` remains a string in the existing
  column and the study page renders it through the existing `<Markdown>`
  component (headings, bullets, bold all supported). No migration.

**Live refresh of "CKD ditection"** (controlled regeneration; the material
was temporarily reset to PENDING, then the normal regenerate endpoint was
used):

- before: **640 chars**, one paragraph, 0 headings, 0 bullets.
- after: **7,091 chars / 915 words / 9 headings / 36 bullets**,
  status COMPLETED, `error: null`.
- The 16 flashcards, 8 quiz questions, 2 flashcard reviews and both
  container ids were preserved exactly (no duplicates, no deletions).
- Note: that PDF is actually an **EthioCKD-Agent project report** (offline
  screening tool), not a clinical CKD chapter; the notes correctly follow
  the source material (architecture, preprocessing, models, experiments,
  limitations) rather than inventing medical content.

Verification:

- New `gemini.service.spec.ts` (length scaling boundaries) plus the AI
  processor retry spec: **4 passed / 2 suites**.
- Full API unit suite: **203 passed / 18 suites** (22.6 s).
- API `npm run build` and `npx tsc --noEmit` -> exit 0; API restarted on the
  rebuilt bundle.
- Live Gemini run: PENDING -> PROCESSING -> COMPLETED in **63 s**.
- No web rebuild was needed (existing Markdown renderer). Temporary DB
  inspection scripts were deleted; changes remain uncommitted.

Caveat: only the CKD material was refreshed here. Other already-completed
summaries keep their old text until they are regenerated; any new PDF upload
gets the new size-aware format automatically.
