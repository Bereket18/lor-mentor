# LOR MENTOR — SUBSCRIPTION PRICE VALIDATION

**Date:** 2026-10-18 · **Area:** Issue C — subscription amount enforcement ·
**Companion:** `PAYMENT-RECEIPT-VERIFICATION.md` §1e/§2/§4.

> **Rev 4 update:** the policy changed from `amount ≥ plan price` to
> **exact selected-plan amount for auto-approval**. Underpay → REJECT;
> overpay → PENDING manual review (never auto-approve). Driven by the live
> 250 ETB plan / 792 ETB receipt defect; see `REGRESSION-TEST-RESULTS.md` §10.

---

## 1. Issue as reported

“Subscription purchase must not be manipulable — the price must be enforced
server-side; a user must not be able to pay less (or alter duration/plan) by
tampering with the request.”

## 2. Threat model reviewed

| Attack | Attempt | Defense (verified) |
|---|---|---|
| Client sends a lower `amount`/`price` | `POST /payments/verify {amount: 1}` | DTO whitelist **rejects** the fields entirely (400) — `verify-receipt.dto.spec.ts` |
| Client sends `isVerified: true` / `userId` | injection | Same whitelist → 400 (unit-proven) |
| Client sends `duration` / months | extend access | Same → 400; duration derives from the plan server-side |
| Client references a cheaper/nonexistent plan id | forged `planId` | Server lookup; unknown/inactive → 404 |
| Client pays less in reality | underpaid bank receipt | `assessReceipt`: underpay → **REJECT** (hard failure, admin cannot override) |
| Client pays more than the selected plan | overpaid bank receipt | **Rev 4:** overpay → **PENDING manual review** (never auto-approve) |
| Client pays in another currency | FX arbitrage | Receipt currency non-ETB → **REJECT** |
| Client replays someone’s receipt | duplicate | unique `bankReference` + pre/post checks → 400, no row (live-verified) |

## 3. Enforcement chain (end-state)

1. **DTO** — `VerifyReceiptDto` = `{ planId, bank, reference?, url?, account? }`
   with `forbidNonWhitelisted` → any extra key is a 400, not tolerated.
2. **Plan fetch** — `subscriptionPlan.findUnique(planId)`; `isActive` enforced.
3. **Stored amount** — `amount: plan.priceETB` (the server's number, never the client's).
4. **Assessment** — `amount + 0.01 < planPrice → REJECT`;
   `amount > planPrice + 0.01 → REVIEW`; otherwise continue (epsilon 0.01).
5. **Currency** — `currency` exposed and ≠ ETB → REJECT.
6. **Duration** — subscription window is built from the plan in `finalizeApproval`;
   no request field touches it.
7. **Admin review** — cannot be used to launder an underpay: confirmed underpay
   is never routed to review. An overpay **is** routed to review (never auto-
   approved) because the college has received the money and must reconcile it.

## 4. Policy decision (recorded, Rev 4)

**Auto-approval requires the selected plan's exact amount** (0.01 epsilon).
- Underpayment → REJECT, with a message to upload a receipt for the selected
  plan amount or contact the college. No access; admin cannot override.
- Overpayment → **PENDING manual review**, with a message to contact the college
  or choose the plan matching the payment. The admin review screen shows the
  bank-confirmed amount and the review note before deciding.
- Rationale for the overpay change: the earlier “amount ≥ plan price” rule
  auto-approved a 250 ETB Quarter plan from a 792 ETB receipt (live defect,
  `REGRESSION-TEST-RESULTS.md` §10). The college did receive the money, so a hard
  reject would discard genuine evidence; manual review lets an admin apply the
  difference to a larger plan, request a top-up, or refund.
- 0.01 epsilon absorbs float/rounding noise.

The old live Rev 5 real-FT approval (exact plan amount) remains a valid example
of the approval branch; the Rev 4 defect is the example for the new review branch.

## 5. Verification evidence

| Check | Result |
|---|---|
| `verify-receipt.dto.spec.ts` — injected amount/price/duration/isVerified/userId all 400 | **PASS** |
| `payments.service.spec.ts` — underpay → REJECT (no row, no subscription) | **PASS** |
| `payments.service.spec.ts` — overpay typed reference → PENDING review | **PASS** (Rev 4) |
| `payments.service.spec.ts` — overpay QR upload → PENDING review, screenshot kept, `reviewNote` set | **PASS** (Rev 4) |
| `payments.service.spec.ts` — currency ≠ ETB → REJECT | **PASS** |
| Payments suite (5 suites / 94 tests) | **PASS** |
| Full API suite (14 suites / 159 tests) | **PASS** |
| Live duplicate-block created no payment row (E2E) | **PASS** |

**NOT VERIFIED live:** a real underpaid receipt being rejected end-to-end, a
fresh real overpaid receipt reaching manual review, and a fresh real receipt
auto-approving — all need real bank material with the exact conditions; all are
deterministically unit-tested. The original 250-plan/792-receipt payment remains
APPROVED because it predates this rule; it needs an explicit operator decision.

## 6. Changing the policy (if the business wants it)

- **Underpay as manual review:** change the underpay branch from REJECT to REVIEW
  and update `assertAdminApprovalAllowed`/tests. This would let an admin accept a
  partial payment; it weakens the current hard-fail policy, so ask first.
- **Auto-approve overpay:** NOT recommended. The extra amount buys no extra
  access under the current plan model and hides a reconciliation problem.
- **No overpay tolerance at all is NOT recommended** for receipt-based payments;
  a 0.01 epsilon handles rounding.

## 7. Residual notes

- The plan price lives in `SubscriptionPlan.priceETB`; price changes affect only
  *new* payments — already-created PENDING payments assess against the plan price
  at assessment time (same DB row), which is the intended semantic.
- Currency absence is tolerated (BOA/legacy layouts may not expose it); presence
  is authoritative → REJECT on mismatch. Documented in `assessReceipt`.
