# LOR MENTOR — PROACTIVE IMPROVEMENTS

**Date:** 2026-10-18 · Beyond the four reported issues, what was found,
hardened, or made safer during the final defect sprint (and the immediately
preceding live sessions that feed the same code paths).

---

## 1. Hardening that directly reduces production risk

| # | Improvement | Why it matters | Evidence |
|---|---|---|---|
| P-1 | **Non-ETB receipt currency → REJECT** (new `assessReceipt` rule) | Closes a real gap: a foreign-currency receipt could previously pass the amount check numerically | Unit tests in `payments.service.spec.ts`; confirmed the rule did not exist at HEAD |
| P-2 | **Defensive Cheki response parsing** (top-level *or* `result` wrapper; anything else → MALFORMED → fallback) | The live API returns fields at the top level while the docs describe a wrapper — guessing one shape would silently break verification on either change | `cheki.service.spec.ts` 18 cases |
| P-3 | **Cache only definitive answers; never failures** | A transient Cheki outage must not be “remembered” — retries must be able to recover immediately | Adapter unit tests + code (`writeCache` drops FAILED) |
| P-4 | **Response size cap (256 KB) + AbortController timeout (20 s)** on every Cheki call | A hung or malformed upstream can no longer pin an API worker/pool connection | Unit tests (timeout/oversize) |
| P-5 | **Log redaction** for receipt references (`FT26…12 chars`) | Operators can triage without leaking full receipt data into log files (which get shared in debugging) | Log-format assertion in the adapter spec; observed live |
| P-6 | **`chekiCode` recorded in review metadata** (DECODED_ONLY / failure code) | Admins reviewing pending payments see *why* automated verification did not decide — faster, safer triage | Code + payments spec assertions |
| P-7 | **Feature flag `CHEKI_ENABLED` + documented env** (`.env`, `.env.production.example`) | A kill switch for the new primary path without a deploy; controlled rollout possible | Env files; validation accepts the keys |

## 2. Workflow & UX improvements

| # | Improvement | Why it matters |
|---|---|---|
| P-8 | Admin **course picker at teacher creation** (search, department filter, taken-courses shown disabled with the current teacher’s name, selection reset on context change, success banner with assigned count) | Makes the correct flow the easy flow; prevents the two-step “create then hunt for courses” trap |
| P-9 | **Actionable 400s** on assignments (“already has a teacher assigned. Reassign it from the course page instead.”) | Errors now tell the admin exactly what to do next |
| P-10 | **E2E harness** (`%TEMP%\lor-logs\sprint-e2e.cjs`) that provisions and cleans its own fixtures | Repeatable end-to-end verification for teacher flows + payment duplicate gates; safe against the live dev DB (self-cleaning) |

## 3. Verification-side improvements

| # | Improvement | Why it matters |
|---|---|---|
| P-11 | New `users.service.spec.ts` (10 cases incl. transaction rollback) | The teacher flow previously had **no** service-level tests |
| P-12 | New `verify-receipt.dto.spec.ts` | Locks in the anti-tampering surface (amount/price/duration injection) |
| P-13 | New `cheki.service.spec.ts` (18 cases) | The new primary path is covered for every documented failure mode |
| P-14 | Python verifier suite made re-runnable (`pytest` in the project venv, 20 tests) | The fallback service’s behavior is regression-guarded |

## 4. Open improvement candidates (backlog, not blocking)

1. **Cheki batch reconciliation tool** — periodic `/api/verify/batch` (≤20) audit
   of APPROVED payments for fraud drift (design in `CHEKI-INTEGRATION-STRATEGY.md` §8).
2. **Health monitoring for Cheki** — auto-fallback flag flips on sustained
   `GET /api/health` failures; today the health check is manual only.
3. **Admin UI surfacing of verification provenance** — show `source` /
   `chekiCode` / `verifierCode` in the review queue (already stored in the
   payment verification JSON).
4. **Many-to-many co-teaching** — the single-teacher `Course.teacherId` model
   blocks shared courses; schema + guards + UI change if the college needs it.
5. **Exact-amount payment policy** — one-predicate change if the college prefers
   strict matching over the documented ≥ rule (`SUBSCRIPTION-PRICE-VALIDATION.md` §6).
6. **S-1 Redis denylist posture** — choose fail-closed vs documented fail-open
   (still awaiting the owner’s decision; recommendation: option C fail-closed).
7. **Pre-existing launch items unchanged** — F-8 (Resend domain), S-2 (secret
   rotation), F-3/S-6 (npm vulnerabilities), DR-1 (uploads backups), F-4
   (`Material.uploadedBy` FK), F-5 (jest open handle).
