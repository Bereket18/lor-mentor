# LOR MENTOR — FINAL DEFECT SPRINT REPORT

**Date:** 2026-10-18 · **Scope:** final production defect investigation,
verification & improvement sprint (Issues A–D + proactive) · **Verdict:
AMBER — unchanged; blockers are operator actions, not code.**

> **Rev 4 follow-up (same evening):** the operator found that a 250 ETB Quarter
> plan accepted a 792 ETB bank-confirmed receipt (auto-approved). Root cause and
> fix are in `PAYMENT-RECEIPT-VERIFICATION.md` §1e and
> `REGRESSION-TEST-RESULTS.md` §10: overpayments now go to **manual review**,
> underpayments remain hard rejects with a correct-amount message. Admins can now
> set a **receiving account per adopted bank** (full account stored; CBE last 8 /
> BOA last 5 are derived Cheki lookup rules), and the web upload view has a
> **camera capture** button that feeds the same server OCR path. Tests: API
> **159/159**, payments **94/94**; live account E2E **8/8**. The original 792 ETB
> payment remains approved pending an operator decision (do not silently revoke).
>
> **Rev 5 follow-up (2026-10-19):** payment-page UX fixes after operator testing.
> The transfer panel now lists **only accounts explicitly set on `/admin/banks`**
> (legacy env accounts remain matching-only); BOA asks for a **reference** and the
> last 5 lookup digits are derived server-side; unconfirmed/abandoned Chapa
> checkouts and failed initializations (no `chapaRef`) are excluded from the
> admin queue and no longer block manual payments; the student's own payment
> history hides the same attempts. Approved Chapa rows and Chapa-confirmed
> underpayments remain visible. Every native `confirm()` was replaced with a
> themed in-app dialog.
> Tests: API **164/164**, payments **99/99**; web and API builds exit 0. Details
> in `REGRESSION-TEST-RESULTS.md` §11. Live BOA-reference and browser dialog
> click-through remain **NOT VERIFIED**.

---

## 1. Executive summary

All four reported defect areas were investigated against the running stack and
live services, fixed or verified, and covered by tests:

| Issue | Outcome | Strongest evidence |
|---|---|---|
| **A — Teacher creation / course assignment** | **Fixed.** `courseIds` accepted at creation, validated, assigned atomically; admin UI course picker. | Live E2E (20/20 checks): teacher with 2 cross-department courses created → login → dashboard shows both immediately; taken-course reuse → 400 with no partial account; unassign works; 403 authorization intact |
| **B — Cheki as primary verification** | **Implemented.** Nest adapter, Cheki-first with local verifier fallback; only bank-confirmed data may auto-approve. | Live Cheki call through the running API (`Cheki verified cbe FT26…12 chars`), live duplicate gate (400, no row); 18-case adapter suite; pipeline matrix |
| **C — Subscription amount enforcement** | **Enforced & documented.** Server-side plan price; underpay → REJECT; overpay → PENDING manual review (Rev 4); non-ETB → REJECT; input-injection rejected by DTO whitelist. | DTO + assessment specs; `HEAD`-diff confirming the currency rule is new; overpay tests in §10 |
| **D — Payment/subscription/access correctness** | **No open defects.** One decision path, duplicate protection, review/reject routing, idempotent finalization. | 132/132 API tests; 20/20 Python tests; live E2E; prior live Chapa + real-FT approvals unchanged |

**No fabricated results:** every PASS above maps to a command output or live
response in `REGRESSION-TEST-RESULTS.md`; environment-limited items are marked
**NOT VERIFIED** (fresh-receipt live auto-approval, live Telebirr/M-Pesa, live
`mbreciept` link, staging-only gates).

The production verdict is **AMBER**, unchanged from Rev 5: the remaining blockers
are **F-8** (Resend sending-domain verification) and **S-2** (secret rotation),
both operator actions — no new code blockers were introduced by this sprint.

## 2. What changed (all uncommitted, staged for review)

- **API:** `cheki.service.ts` (new adapter + 18 tests), `payments.service.ts`
  (Cheki-first pipeline, guard, `chekiCode`, currency check), `payments.module.ts`,
  `users.service.ts` + `create-user.dto.ts` (course pre-assignment) +
  `users.service.spec.ts` (10 tests), `verify-receipt.dto.spec.ts` (new),
  `.env` / `.env.production.example` (CHEKI_* docs).
- **Web:** `admin/users/page.tsx` (course picker).
- **Rev 3 addendum (same evening):** `bank-catalog.ts` (new — 31 Cheki-listed
  banks with input mode + auto-verify flag), `payments.service.ts` /
  `payments.controller.ts` (enabled-bank gate, manual-only routing, admin CRUD,
  public picker feed), `cheki.service.ts` (M-Pesa/Siinqee/eBirr/ZamZam mapping),
  `AcceptedBank` model + migration (+ seed of the six current banks),
  `admin/banks/page.tsx` + sidebar entry, subscribe page (dynamic picker, manual
  hint, receiving-accounts panel only in the reference flow) and +4 pipeline
  tests (payments 87/87, API 152/152).
- **Rev 4 follow-up:** `AcceptedBank` account columns + migration
  `20261018200000_add_bank_receiving_accounts`, account CRUD on
  `payments.controller.ts` / inline editor in `admin/banks/page.tsx`,
  amount overpay → REVIEW in `payments.service.ts` (+2 tests), account unit tests
  (+5), camera capture in `pricing/subscribe/page.tsx`. Payments **94/94**, API
  **159/159**, API + web builds exit 0, live account E2E **8/8**.
- **Unchanged on purpose:** the Python fallback verifier (zero changes), all
  existing decision/monitoring semantics. The Rev 3 schema line above is
  superseded by the additive Rev 4 account columns.

## 3. Deliverables index (this sprint)

| Document | Contents |
|---|---|
| `FINAL-DEFECT-INVESTIGATION.md` | Issue A–D investigation, root causes, fixes, statuses |
| `TEACHER-COURSE-RELATIONSHIPS.md` | Relationship model, creation contract, transaction semantics, live E2E matrix, limitations |
| `PAYMENT-RECEIPT-VERIFICATION.md` | End-to-end receipt pipeline, trust rules, failure taxonomy, hardening |
| `CHEKI-INTEGRATION-STRATEGY.md` | Cheki decision, API mapping, fallback matrix, config/ops, rollout |
| `SUBSCRIPTION-PRICE-VALIDATION.md` | Threat model, enforcement chain, policy decision & change path |
| `REGRESSION-TEST-RESULTS.md` | Raw commands + results (159/94/26/10/20 suites, builds, live E2E incl. §10 Rev 4) |
| `PROACTIVE-IMPROVEMENTS.md` | Hardening, UX, verification improvements + backlog candidates |
| `FINAL-DEFECT-SPRINT-REPORT.md` | This report |

Existing documents updated, not replaced: `FINAL-PRODUCTION-READINESS-REPORT.md`
(Rev 6 addendum; adds F-16/F-17 rows and this index) and `TEST-RESULTS.md`
(§6 sprint addendum). Prior conclusions remain authoritative.

## 4. Operations notes

- API + web were rebuilt and restarted for the live runs; the cloudflared tunnel
  and Python verifier were not touched.
- Cheki kill switch: `CHEKI_ENABLED="false"` + restart → fallback-only mode.
- The E2E harness is re-runnable: `node %TEMP%\lor-logs\sprint-e2e.cjs` (it
  self-cleans all fixtures; do not run it against a production database).

## 5. Recommended next actions

1. **F-8** — verify a Resend sending domain; update `SMTP_FROM`; re-test sign-up/reset.
2. **S-2** — rotate JWT/DB/SMTP/Chapa/verifier/super-admin secrets; record completion.
3. **S-1** — decide the Redis denylist posture (recommendation: fail-closed).
4. Owner sign-off on the **Rev 4 amount policy** (exact selected-plan amount for
   auto-approval; underpay reject; overpay manual review), a decision on the
   already-approved 792 ETB/250 plan payment, and the **co-teaching limitation**.
5. When a fresh unused real receipt is available, run one live auto-approval
   through Cheki (closes the last NOT VERIFIED item of Issue B).
6. Trim the sprint diff into reviewable commits (code / tests / docs) before merge.
