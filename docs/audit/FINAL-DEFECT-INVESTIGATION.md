# LOR MENTOR — FINAL DEFECT INVESTIGATION

**Date:** 2026-10-18 (final defect sprint) · **Scope:** the four reported production
issues (A–D) plus regression evidence · **Method:** reproduce → trace → smallest
safe fix → unit-test → live-verify against the running stack (dev DB + live Cheki).

**Auditor stance:** every status below reflects actual command output or live API
responses. Anything not exercised end-to-end is marked **NOT VERIFIED**. No result
is fabricated.

> **Rev 4 update (same evening):** the Issue C amount policy below (overpayment
> approved) was **superseded** after the operator’s live 250 ETB plan / 792 ETB
> receipt auto-approval. Current policy: exact plan amount for auto-approval,
> underpay → REJECT, overpay → PENDING manual review. See
> `REGRESSION-TEST-RESULTS.md` §10 and `SUBSCRIPTION-PRICE-VALIDATION.md` §4.

---

## 1. Issue map

| # | Issue (as reported) | Root cause found | Fix | Status |
|---|---|---|---|---|
| A | Teacher creation / course assignment broken — teacher accounts end up with no courses | Creation flow had **no way to assign courses**; assignment existed only as a separate per-course action | `courseIds` on `POST /users/create-staff` (atomic, validated) + course picker in the admin UI | **FIXED — live E2E verified** |
| B | Cheki must be the primary receipt-verification source | Not integrated; local Python verifier was the only automated path | Nest `ChekiService` adapter; Cheki tried first, local verifier as fallback; only bank-confirmed data can auto-approve | **IMPLEMENTED — unit-verified + live-proven for liveness & duplicate gate** (fresh-receipt auto-approval NOT VERIFIED live; unit-tested) |
| C | Subscription amount enforcement | Amount/price/duration were already server-side, but enforcement was undocumented and currency was unchecked; overpayment was not checked | Exact-plan amount for auto-approval; underpay → REJECT; overpay → PENDING review; non-ETB rejected; tamper-proofing locked in by tests (Rev 4 supersedes the original overpay-approved policy) | **ENFORCED — unit-verified** (live fresh-receipt case NOT VERIFIED) |
| D | Payment/subscription/access correctness | Duplicate protection, single approval path, and F-14/F-15 issues from the earlier sessions | Consolidated verification; no regressions found this sprint | **VERIFIED — regression suite + live E2E green** |

Details for each area: `TEACHER-COURSE-RELATIONSHIPS.md` (A),
`CHEKI-INTEGRATION-STRATEGY.md` + `PAYMENT-RECEIPT-VERIFICATION.md` (B/D),
`SUBSCRIPTION-PRICE-VALIDATION.md` (C), `REGRESSION-TEST-RESULTS.md` (all).

---

## 2. Issue A — teacher creation / course assignment

### 2.1 Investigation
- Traced `POST /users/create-staff` → `UsersService.createUser` → Prisma.
  The endpoint accepted only account fields (name, email, role, department/year,
  phone). **No course input existed**, so a freshly created teacher necessarily
  had zero courses.
- Teacher course lists come from `Course.teacherId` (`GET /courses/mine` →
  `findByTeacher`). Assignment was only reachable via the course page
  (`PATCH /courses/:id { teacherId }`) — a second manual step the admin UI never
  guided the user through after creation.
- Reproduced live: created a teacher exactly as the UI did → `/courses/mine`
  returned `[]`.

### 2.2 Root cause
Missing capability in the creation contract, not data corruption: the account and
its course assignment were two disconnected workflows.

### 2.3 Fix (smallest safe change)
- **API** — `CreateUserDto.courseIds: string[]` (≤100, teacher-only). `createUser`
  now validates the whole selection up front (courses exist, not archived, not
  already owned) and performs user-create **and** course assignment inside one
  Prisma transaction with `updateMany({ teacherId: null })`; a count mismatch
  (concurrent double-assignment) rolls the transaction back — no partial account.
- **Web** — `admin/users` create panel: for the TEACHER role it loads the admin
  course catalog and offers a department filter + title search; taken courses are
  disabled and labelled with the current teacher; the success banner reports the
  assigned count. Selection resets on role/department change.

### 2.4 Verification
| Check | Result |
|---|---|
| Unit — `users.service.spec.ts` (validation, transaction, rollback) | **10/10 PASS** |
| Live — create teacher with 2 courses in 2 different departments | **PASS** (both `teacherId` persisted) |
| Live — teacher login with the returned temporary password | **PASS** (HTTP 200) |
| Live — `GET /courses/mine` immediately lists both courses | **PASS** |
| Live — re-using an already-assigned course → 400 | **PASS** (+ no partial account created) |
| Live — unassign via `PATCH { teacherId: null }` → dashboard updates | **PASS** |
| Live — teacher blocked from the admin catalog (403) | **PASS** |

Full raw output: `REGRESSION-TEST-RESULTS.md` §4.

### 2.5 Residual limitations (documented, not defects)
- The schema models **one teacher per course** (`Course.teacherId`); co-teaching is
  not supported. Re-assignment of a taken course goes through the course page.
- Course assignment is available at creation and via the course page — there is no
  bulk re-assignment screen.

---

## 3. Issue B — Cheki as the primary verification source

### 3.1 Investigation
- Cheki's public API was read first (`cheki.et/llms.txt` + `/api/banks`) and probed
  live before any code was written.
- Live probe (real FT receipt): `POST /api/verify {bank:"cbe", reference, accountNumber}`
  → `{success:true, verified:true, amount, currency:"ETB", reference, receiverAccount:"1****3036",
  receiverName, senderName, date, bankCode:"cbe", sourceUrl, cached:false}` — **fields at the
  top level** (docs also describe a `result` wrapper; the adapter accepts both).
- Live negative probe (fabricated CBE short link) → HTTP 502
  `{"success":false,"error":"[Commercial Bank of Ethiopia] CBE receipt service unavailable. Try again."}`
  — handled as a normal failure (fallback), never as an approval or a hard rejection.
- Existing pipeline re-read: one decision path in `PaymentsService.verifyAndSubmit`
  → `assessReceipt` → approve/review/reject. The local Python verifier stays the
  fallback; **zero changes to it**.

### 3.2 Fix
New `apps/api/src/modules/payments/cheki.service.ts` adapter (fetch + normalize
only — it holds **no approval policy**), wired into `verifyAndSubmit`:

1. Cheki first — only `verified === true` yields a receipt.
2. All other outcomes (`DECODED_ONLY`, `RATE_LIMITED`, `FALLBACK_REQUIRED`,
   `UNREACHABLE`, `HTTP_ERROR`, `MALFORMED`, `DECLINED`, `UNSUPPORTED_BANK`) fall
   through to the local verifier, then to the same assessment rules.
3. The assessment step (`assessReceipt`) is the single decision authority:
   receiver-account match (admin DB accounts + env fallback), exact-plan amount
   (underpay REJECT, overpay REVIEW), ETB currency, bank-status checks,
   duplicate-reference guard.

Safety properties: server-side only; 20 s default timeout (AbortController); 256 KB
response cap; redacted log lines; caches only definitive answers (VERIFIED /
DECODED_ONLY, 5 min, ≤200 entries) — failures are never cached, so recoveries are
not masked. Feature flag `CHEKI_ENABLED` (default on) + `CHEKI_BASE_URL` /
`CHEKI_TIMEOUT_MS` documented in `.env` and `.env.production.example`.

### 3.3 Verification
| Check | Result |
|---|---|
| Unit — adapter spec (18 cases: response shapes, errors, links, cache, redaction) | **18/18 PASS** |
| Unit — pipeline spec (Cheki auto-approve path, reject matrix, fallback matrix, duplicate, race) | **PASS** (within 67 payments tests) |
| Live — real consumed FT receipt through the **running API**: Cheki called live, `verified` → reference re-checked → `400 "This receipt has already been submitted."` | **PASS** — log line `[ChekiService] Cheki verified cbe FT26…12 chars` |
| Live — no payment row created by the blocked duplicate attempt | **PASS** (count 0) |
| Live — Cheki health reachable; honest 502 handling for unknown receipts | **PASS** (probes) |

**NOT VERIFIED live:** a *fresh, unused* real receipt being auto-approved through
the Cheki path end-to-end (no unused real receipt available in this environment;
the approval branch is deterministically covered by the unit suites). Same for a
real `mbreciept` short link (token is signed; cannot be constructed) and the
Telebirr/M-Pesa geo-block path (`fallbackUrl` → local fallback/review, unit-tested).

Full strategy detail: `CHEKI-INTEGRATION-STRATEGY.md`.

---

## 4. Issue C — subscription amount enforcement

### 4.1 Investigation (enforcement chain)
| Step | Mechanism | Effect |
|---|---|---|
| Input surface | `VerifyReceiptDto` whitelist | `amount`, `price`, `duration`, `isVerified`, `userId`… are **rejected** (`forbidNonWhitelisted`) — proven by `verify-receipt.dto.spec.ts` |
| Price source | `subscriptionPlan.findUnique(dto.planId)` server-side | Client cannot name a price; inactive/unknown plan → 404 |
| Stored amount | `amount: plan.priceETB` (server value) | The payment row can never carry a client-supplied figure |
| Decision | `assessReceipt`: `amount + 0.01 < planPrice → REJECT`; `amount > planPrice + 0.01 → REVIEW` | Underpayment is a confirmed failure; overpayment is reconciled manually and never auto-approves (Rev 4) |
| Currency | **new this sprint**: non-ETB receipt currency → REJECT | Cross-currency payments cannot slip through |
| Duration | Subscription window built from the plan server-side | Client fields cannot extend/shorten access |

### 4.2 Policy (Rev 4 — supersedes the original)
- **Exact plan amount for auto-approval** (0.01 epsilon). Underpayment → REJECT;
  overpayment → **PENDING manual review** (never auto-approve). The original
  “overpayment approved” policy was withdrawn after the live 250 ETB / 792 ETB
  defect; the college needs a human to reconcile money received.
- If the business wants underpay to be reviewable, that is a policy change to the
  underpay branch (documented in `SUBSCRIPTION-PRICE-VALIDATION.md` §6).

### 4.3 Verification
- Unit: underpay → REJECT; overpay (typed and QR upload) → PENDING review;
  currency ≠ ETB → REJECT; receiver mismatch → REJECT; injected
  `amount`/`price`/`duration` in the request → 400. **PASS** (94 payments tests
  include this matrix).
- Live: blocked-duplicate E2E created no payment row; the earlier real-FT approval
  exercised the exact-amount branch. A *live overpaid receipt reaching review*
  needs a fresh real receipt → **NOT VERIFIED** (unit-tested); the original
  792 ETB payment remains approved pending an operator decision.

---

## 5. Issue D — payment / subscription / access correctness

Consolidated regression view of the end-state after all fixes (this sprint +
Rev 5):

| Property | Mechanism | Status |
|---|---|---|
| One decision path | Cheki → local verifier → `assessReceipt` → single approve/review/reject in `PaymentsService` | Verified (code read + suites) |
| Nothing client-supplied can grant access | DTO whitelist; screenshot/OCR/decoded QR/fallback URL never auto-approve; only bank-confirmed data does | Verified (suites + code) |
| Duplicate receipts blocked | pre-check + unique constraint + `P2002` catch → 400, no row | **Live-verified** (this sprint) |
| Rejections only on confirmed failures | wrong receiver / failed status / underpay / non-ETB | Unit-verified (live case NOT VERIFIED) |
| Everything else → manual review | pending payment + verification metadata (incl. `chekiCode`) | Unit-verified |
| Approval finalization idempotent | one shared `finalizeApproval` (payment → subscription → notification) | Verified in earlier sessions (incl. live Chapa + live CBE) |
| No orphan rows | prior delete-cascade tests still green | Verified (regression) |

No new correctness defects were found in this area during the sprint; the
regression suites (`REGRESSION-TEST-RESULTS.md`) are fully green.

---

## 6. Outcome

- Issues A and B are **fixed and live-verified** (A end-to-end; B for liveness +
  duplicate gate + fallback safety).
- Issue C is **enforced and unit-verified**; the policy is documented for owner
  sign-off; live underpay/auto-approve cases remain NOT VERIFIED for lack of real
  receipts.
- Issue D shows **no open correctness defects**; regression evidence green.
- The production verdict is unchanged: **AMBER** — blockers are the pre-existing,
  non-code items **F-8** (Resend sending-domain) and **S-2** (secret rotation);
  see `FINAL-DEFECT-SPRINT-REPORT.md` and `FINAL-PRODUCTION-READINESS-REPORT.md` (Rev 6).
