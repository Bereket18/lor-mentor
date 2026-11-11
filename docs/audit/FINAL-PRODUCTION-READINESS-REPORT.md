# LOR MENTOR — FINAL PRODUCTION READINESS REPORT

**Revision 3 — 2026-10-18 (continuation pass).** Supersedes Rev 2 (2026-10-17). Rev 2 executed the full `TEST-PLAN.md` against real infrastructure (local Postgres 18 + Redis, disposable DB, live test-mode Chapa/Resend/Gemini calls) and applied the remaining low-risk fixes (B-5, DR-3, DR-4). Rev 3 completes the memory-blocked gates: **T-06 PASS**, **T-44 PASS 16/16** (incl. opt-in auth), **T-45 PARTIAL**, and re-checks F-2/F-7. All raw evidence is in `TEST-RESULTS.md` (Rev 3).

**Revision 4 — 2026-10-18 (live manual-verification session).** The operator exercised the app in a browser; four reported issues were root-caused with live probes (see `TEST-RESULTS.md` §5): **F-2 resolved** (valid key + the deprecated `gemini-2.5-flash` replaced by `gemini-3.8-flash`), **F-10/F-11 fixed**, **F-8/F-9 recorded** (email sending-domain verification; Chapa's MX email rule); **F-12/F-13 recorded** (payment page omits the receiving account details; CBE receipt-system coverage needs a real-FT validation). S-2 secret rotation remains the top launch action. F-7 recurred (latest `explorer.exe` PID 7820). Same evening: a live browser Chapa checkout completed end-to-end (payment APPROVED, subscription ACTIVE, receipt issued) — T-33 upgraded to PASS.

**Revision 5 — 2026-10-18 (live payment-path validation + fixes).** The operator supplied a real CBE FT; the legacy CBE lookup was validated end-to-end for current receipts (**F-13 closed for the legacy system**) and the exercise surfaced two payment-path bugs, both fixed and unit-tested the same session: **F-14** (collapsed CBE account masks such as `1****3036` failed the receiver-account match, which would have *rejected genuine payments*) and **F-15** (the CBE-Birr "VAT Invoice" layout mis-parses `Reference No.` as `VAT`; the wrong reference was stored and later same-format payments would be falsely blocked as duplicates). **F-12 fixed**: the payment page now displays the college receiving accounts (new public `GET /payments/bank-accounts` + copy buttons). Evidence: `TEST-RESULTS.md` §5.8. The Rev 4 verdict is unchanged — AMBER; blockers remain F-8 and S-2. Addendum (same session): the operator completed the CBE instant flow live in the UI with the real FT — auto-approved and DB-verified (payment APPROVED, subscription ACTIVE, receipt issued); and CBE's new receipt generation (`mbreciept` short links) plus legacy link pastes are now supported end-to-end in the verifier + subscribe page (unit-tested; live short-link validation pending one real link — the token is signed and cannot be constructed).

**Revision 6 — 2026-10-18 (final defect sprint).** The four reported defect areas were investigated and closed per the sprint brief (details: `FINAL-DEFECT-SPRINT-REPORT.md`, raw evidence: `REGRESSION-TEST-RESULTS.md`): **Issue A fixed** — teacher creation now accepts `courseIds` and assigns them atomically inside the account transaction (admin UI course picker; live E2E 20/20 incl. login, dashboard, taken-course rejection with no partial account, unassign, 403 authorization); **Issue B implemented** — Cheki is now the primary automated receipt-verification source via a new Nest adapter (server-side only; only `verified === true` can auto-approve; every Cheki failure falls through to the unchanged local verifier; feature flag `CHEKI_ENABLED`; redacted logs; cache/timeout/size guards) — proven live through the running API (real Cheki call + duplicate gate, `400`, no row; fresh-receipt live auto-approval remains unit-only = NOT VERIFIED); **Issue C enforced & documented** — server-side plan price, underpay REJECT, **new non-ETB currency REJECT**, injection fields rejected by the DTO whitelist; **Issue D verified** — no regressions (API 14 suites/132 tests, payments 67/67, verifier 20/20, live E2E 20/20). No new blockers; verdict unchanged (F-8, S-2). New findings added below: **F-16** (teacher course-assignment gap) and **F-17** (payment hardening + Cheki integration).

**Revision 7 — 2026-10-18 (receipt screenshot OCR + admin-managed banks).** Uploaded receipt screenshots are now scanned server-side via Cheki OCR and, when the QR resolves to a bank-confirmed receipt, auto-verify through the same approval pipeline (the QR remains a lookup hint only). The “enter reference” bank list is now admin-managed on `/admin/banks`: Cheki’s 31-bank catalog, 6 enabled by default, server-side rejection of disabled banks, and manual-review routing for banks without an automated lookup (never auto-approved from student input). The transfer-accounts panel is scoped to the reference flow only. Evidence: API 14 suites/**152** tests, payments **87/87**, cheki **26/26**, live OCR E2E **12/12**, live bank-management E2E **18/18**; API + web rebuilt/restarted, health ready. Verdict unchanged: **AMBER** — F-8 (Resend domain) and S-2 (secret rotation) remain the launch blockers.

**Revision 8 — 2026-10-18 (live follow-up: overpayment, receiving accounts, camera).** The operator’s live test exposed a real amount-policy defect: a 250 ETB Quarter plan auto-approved a bank-confirmed **792 ETB** receipt because only underpayment was rejected. Fixed: overpayment now creates a **PENDING manual-review** payment (with the verified amount and a review note) and never auto-approves; underpayment remains a hard reject with a “upload the selected plan amount or contact the college” message. Admins can now set the **college receiving account per adopted bank** on `/admin/banks` (full account stored; CBE last 8 / BOA last 5 are derived Cheki lookup rules; legacy `COMPANY_BANK_ACCOUNTS` remains a fallback). The upload view now offers **camera capture** (`getUserMedia`) feeding the same server-side OCR path; camera access needs HTTPS/localhost and permission, and was **not** live-tested in a real browser. Evidence: API **14 suites / 159 tests**, payments **5 suites / 94 tests**, cheki 26/26, API + web builds exit 0, live receiving-account E2E **8/8**; migrations applied and API/web restarted/healthy. Verdict unchanged: **AMBER** — F-8 and S-2 remain the launch blockers. The original 792 ETB payment remains APPROVED pending an explicit operator decision (leave as overpayment, apply to a larger plan, or reverse/refund); it was not silently changed.

**Revision 9 - 2026-10-19 (operator UX + payment-queue fixes).** The operator's browser test surfaced four UX/payment defects, all fixed: the transfer panel now lists **only receiving accounts explicitly set on `/admin/banks`** (legacy `COMPANY_BANK_ACCOUNTS` remains matching-only and is never shown); **BOA asks for a reference**, with the last 5 Cheki lookup digits derived server-side from the configured BOA account; initialized/abandoned **Chapa checkouts are excluded from the admin payment queue** and no longer block a manual transfer with "already have a payment awaiting review"; and every native `window.confirm()` was replaced by a themed in-app `ConfirmDialogProvider` (admin user deletion, bank/account removal, material deletion in admin/teacher, forum thread/reply removal). The subscribe page now has a direct **Back to dashboard** link and states that nothing reaches the college until Chapa confirms. Evidence: API **14 suites / 164 tests**, payments **5 suites / 99 tests**, API + web builds exit 0; live after restart BOA reports `input:"ref"`, `/payments/bank-accounts` returns only DB-set accounts, `/health/ready` is ready, web `/` is 200, and 16 real unconfirmed CHAPA rows were absent from the admin queue (approved and Chapa-confirmed rows were kept); the PENDING row was also absent from the student's history. New doc: `UX-ALERT-POLICY.md`; details in `REGRESSION-TEST-RESULTS.md` §11. Verdict unchanged: **AMBER** - F-8 and S-2 remain the launch blockers. Live BOA-reference verification and a full browser click-through of every dialog are **NOT VERIFIED**; Chapa's own hosted-page close prompt cannot be removed by this app.

**Revision 10 - 2026-10-19 (operator decisions + return-state/branding).** Three operator decisions from the live session were executed. (1) The legacy 792 ETB payment **`cmve8ob3k00066cty2a9niikj` is now REJECTED** and its linked subscription **CANCELLED**; the user received a "Payment reversed" notification and a `PAYMENT_REVERSED` audit row records the reason, previous status, plan price and cancellation. Its receipt evidence is retained for audit, the document endpoint refuses non-approved payments, and no other approved payment for that user existed. (2) The real **BOA reference** test now passes the intended secure path: the form asks for a BOA transaction reference, not a receiver account or URL, and the payment is queued for **manual review** after Cheki HTTP 422 + local `URL_REQUIRED` (BOA receipts do not expose the beneficiary account); the super-admin later rejected that test row, with its evidence retained. (3) The **"Back to dashboard" back-arrow control moved to `/pricing`** (browser click verified `/dashboard`), and the subscribe page now has only "Back to pricing"; the Pay Now button is reset on bfcache `pageshow`, proven live by clicking Pay, reaching Chapa, pressing browser Back, and finding an enabled `Pay 250 ETB now` button with no overlap. The attached **LORCAN logo** was added as full/mark assets plus browser/apple icons and is used in the sidebar, login/register, admin login, pricing and auth utility pages. Evidence: API **164/164** (14 suites), payments **99/99** (5 suites), web **lint exit 0**, web **build exit 0**, `/health/ready` ready after restart; final read-only UI check of `/pricing` (back link `/dashboard`, logo, no console errors) and `/pricing/subscribe` (`Back to pricing`, enabled Pay button, no console errors). Verdict unchanged: **AMBER** - F-8 and S-2 remain the launch blockers. Remaining open items: destructive-dialog browser click-through, fresh unused receipt auto-approval, live `mbreciept`/geoblock/new-bank lookups, F-8/S-2, S-1 (local Redis is 5.0.14.1, below BullMQ's recommended 6.2.0, and a prior-run log showed a `MISCONF` persistence error while the readiness ping stayed up), real receiving accounts for every college bank, co-teaching sign-off and T-45 manual AI retry. Details in `REGRESSION-TEST-RESULTS.md` §12.

**Revision 11 - 2026-10-19 (S-1 fail-closed + env preflight + watchdog).** Three operator-approved hardening items were implemented. (1) **S-1 posture decided and shipped:** `TokenDenylistService` now fails **closed** when Redis is unreachable — a refresh token whose revocation state cannot be proven is denied rather than allowed. `REDIS_FAIL_MODE=closed` is the documented default and the only production value; `open` is an explicit local-debug escape hatch. (2) **Env preflight hardened:** production now rejects placeholder `DATABASE_URL`/`SMTP_PASS`, invalid or `resend.dev` `SMTP_FROM`, and unknown `REDIS_FAIL_MODE` values; legacy `COMPANY_BANK_ACCOUNTS` is validation-optional and matching-only, because public receiving accounts come from the database. A new `npm run check:env -- .env.production --strict` detects duplicate keys and placeholders without printing values, and the root local `.env` duplicate `GEMINI_API_KEY` was removed (last-wins preserved). (3) **F-8 probe added:** `npm run check:f8-email -- --email <non-owner>` drives the reset trigger and warns when `SMTP_FROM` still uses `resend.dev`; it cannot read a mailbox, so F-8 remains open until the non-owner inbox and Resend log both show delivery. A local watchdog (`scripts/local-stack-watchdog.ps1`, scheduled task `LorMentorStackWatchdog`, every 2 minutes) restarts API/web/verifier/Studio/tunnel if they die; recovery was proven by stopping the verifier and watching the watchdog bring it back to `200`. The runbooks `RESEND-DOMAIN-VERIFICATION.md` and `docs/deployer/90-SECRET-ROTATION.md` were added. Evidence: API **15 suites / 177 tests PASS**, verifier **20/20 PASS**, API build exit 0; live restart confirmed API/web/verifier/Studio healthy. Verdict unchanged: **AMBER** — F-8 and S-2 remain the launch blockers, and T-30 is now code-ready but still not outage-drilled.

**Revision 12 - 2026-10-19 (local compose gates: T-30/T-49/T-51/T-52 PASS; T-50/T-53 PARTIAL).** The environment-limited gates that do not need a public host were executed against the production compose file with a staging-only env. **T-51 PASS** (5/5 containers healthy, 11/11 migrations, readiness 200, web 200, verifier ok), **T-52 PASS** (12/12 smoke checks), **T-30 PASS** (Redis stop → readiness 503 → refresh 401 with a real signed cookie, fail-closed → recovery 200), and **T-49 wrapper PASS** (backup script + restore, 30/30 tables matched, throwaway DB dropped). **T-53 PARTIAL**: HSTS/helmet headers and uploads-volume persistence across an API recreate pass, but public TLS/domain is still unproven. **T-50 PARTIAL**: the API and web images built and tagged; the full verifier Chromium image build was cancelled on the laptop's stalled Debian mirror and moved to the Hostinger VPS — T-51/T-52/T-53/T-49/T-30 do not exercise BOA extraction, so a slim verifier sufficed for the local gates. The staging env and volumes were deleted afterwards; the local dev stack and watchdog were restored. Tally is now **47 PASS / 4 PARTIAL / 2 NOT VERIFIED**; verdict remains **AMBER** because F-8 and S-2 are non-waivable and T-46/T-47 plus real-host TLS remain open.

**Revision 13 - 2026-10-19 (deployment playbook; F-8/S-2 deferred to deployment by operator decision).** The operator decided that Resend domain verification (F-8) and secret rotation (S-2/F-6) will be completed **during deployment** on the Hostinger VPS rather than on this laptop, and that Chapa goes live at deployment too. Both remain open, **non-waivable** launch blockers — the decision changes *when and where* they are fixed, not the gate. A single operational document, `docs/deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md`, was added: deploy steps and deltas (full Chromium verifier image build, real TLS/HSTS), the S-2 "generate fresh values at deploy, never reuse dev secrets" checklist, Resend domain verification at deployment, Chapa KYC/test→live keys + webhook setup, a plain-language explanation of how a Chapa payment is actually verified at runtime (HMAC-verified webhook on the raw body, server-side re-verify, amount policy, idempotent finalize; the browser redirect is never trusted), the remaining gate procedures T-46 (load, with the 120 req/min throttler caveat), T-47 (kill API mid-AI-job), T-48 (provider outage matrix), the T-45 evidence-note template, and the AMBER→GREEN checklist. No code changed; no gate status changed.

**Auditor stance:** evidence-based. PASS means a command produced output; unverifiable checks are marked NOT VERIFIED. No result is fabricated.

---

## 1. Executive Summary

The codebase is **materially production-grade and now largely evidence-verified**. Of the 53 plan checks: **47 PASS**, **4 PARTIAL** (T-45 manual frontend — automated portion passed and payment/account items now live-verified; T-48 outage matrix — Gemini/SMTP simulated, Chapa outage untested; T-50 — API/web images built but the full Chromium verifier image is a VPS step; T-53 — HSTS/headers and uploads persistence proven locally, public TLS pending), **2 NOT VERIFIED** (T-46 load, T-47 kill-mid-AI-job — environment-limited), **0 PENDING**. Every executable build, type-check, lint, unit/e2e test, migration, seed, and smoke gate passes — including the web production build and the full Playwright suite. Live API tests confirmed auth hardening (lockout, rotation, revocation replay), payment security (signature tampering rejected; forged “success” webhooks cannot approve — server re-verifies with Chapa), subscription gating (403s + no answer leakage), delete-cascade integrity, AI-pipeline plumbing, and a working backup/restore procedure including the production wrapper script (**T-49 PASS**). The same-day live session completed a browser Chapa checkout (payment APPROVED + subscription ACTIVE — T-33) and super-admin account creation for the test student used in that checkout.

**Blocker status (updated Rev 4):**

1. **F-2 — RESOLVED (2026-10-18).** The new `GEMINI_API_KEY` is valid; the live "AI internal server error" was root-caused to the deprecated hardcoded model `gemini-2.5-flash` (Google now requires `gemini-3.8-flash` for this key). Code fixed, API rebuilt, REST + SDK verified (`TEST-RESULTS.md` §5.1/§5.6). Pending only the operator's UI retry (T-42 full run / T-45 AI items).
2. **F-8 (new, HIGH — launch)** — the Resend sending domain is not verified: `onboarding@resend.dev` delivers only to the account owner address, so public sign-up / password-reset email fails with SMTP 550 for every other recipient until a domain is verified at resend.com/domains (`TEST-RESULTS.md` §5.2). Operator procedure is ready in `RESEND-DOMAIN-VERIFICATION.md`; the `check:f8-email` probe and the `SMTP_FROM` placeholder/`resend.dev` boot checks are live. **Deferred to deployment** per operator decision (2026-10-19) — step-by-step in `docs/deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md` §3.
3. **S-2 — secret rotation** (JWT, DB password, SMTP, Chapa, verifier token, super-admin) remains an operator action; one DB password was additionally exposed to a local session log during this audit and is definitely on the rotation list (F-6). Operator procedure is ready in `docs/deployer/90-SECRET-ROTATION.md`; `npm run check:env -- .env.production --strict` is the preflight. **Deferred to deployment** (2026-10-19): the checklist is to generate all-new values on the VPS and revoke the old provider keys — `docs/deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md` §2.
4. **S-1 — Redis desynchronization (RESOLVED for deployment, 2026-10-19)** — fail-closed code is shipped and the T-30 outage drill now **PASSES** against the compose stack (Redis stop → readiness 503 → refresh 401 → recovery 200). Production compose pins `redis:7-alpine`, above BullMQ's recommended 6.2. The local dev Redis `5.0.14.1` is a dev-environment note only.

The previously memory-blocked gates are now executed: **T-06 PASS** (web production build), **T-44 PASS 16/16** (Playwright incl. a real admin sign-in), **T-45 PARTIAL** (automated mobile/a11y/theme/auth coverage passes; authenticated manual items — sidebar/nav, PDF viewer, AI-tutor streaming — are exercised once F-2 is fixed).

Environment note (F-7, dev host only): the session-0 `explorer.exe` ~4.7 GB memory leak recurs after restarts (PID 7524 again on 2026-10-18); kill it from an admin shell (`taskkill /F /PID 7524`) before heavy builds. It does not affect the shipped product.

Also found and fixed: **F-1 — a migration that was corrupted at HEAD** (fresh DB could not bootstrap; restored byte-identical from git with a checksum match against the existing dev DB → zero drift).

### Verdict: **AMBER — all executed gates green; F-8 (email domain) and S-2 (secret rotation) are the two launch blockers.** Formal GREEN still requires F-8 and S-2 (both non-waivable), the remaining T-46/T-47 gates, real-host TLS/domain (T-53), the full verifier image build (T-50), and T-45's exact evidence notes. (Rev 12: local compose T-30/T-49/T-51/T-52 PASS, T-50/T-53 PARTIAL; tally 47 PASS / 4 PARTIAL / 2 NOT VERIFIED. Rev 11: S-1 fail-closed code shipped. Rev 6: no new blockers; Issues A–D closed per `FINAL-DEFECT-SPRINT-REPORT.md`.)

Notable new findings for the backlog: F-3 (49 npm vulnerabilities: 10 moderate / 34 high / 5 critical), F-4 (`Material.uploadedBy` is NOT NULL with no FK → dangles after user deletion), F-5 (one Jest worker leaks a handle).

---

## 2. What Was Executed This Pass (detail in `TEST-RESULTS.md`)

| Area | Outcome |
|---|---|
| Install / generate / typecheck / build / lint (API) | All PASS (host prerequisites for T-02..T-11, T-13..T-15) |
| Web typecheck / lint / build | PASS; **`next build` PASS** (T-06 — Turbopack, 32 routes, standalone output verified) |
| Unit + e2e tests | 11 suites / 76 tests PASS; e2e placeholder 3/3; **Playwright web suite 16/16 PASS** (T-44, single worker on this host) |
| Migrations on fresh DB | PASS **after fixing F-1**; drift “No difference detected”; status up-to-date; seed idempotent; 16 indexes present |
| Smoke script | **12/12 PASS** |
| Auth flow (register→verify→lockout→refresh rotation→logout→reset) | PASS, including rollback when mail send fails |
| Payments (manual + Chapa) | Upload validation, approval idempotency (1 notification / 1 audit row), PDF + image delivery, signature tamper/missing rejection, forged-webhook no-op — PASS |
| Gating (subscription, cross-department, answer leakage, expired) | PASS (403s where required; quiz payload carries no `correctOption`) |
| Delete cascade (both endpoints) | PASS; finding F-4 |
| AI pipeline plumbing | PASS (retries + FAILED-with-reason path verified); **blocked by invalid key (F-2)** |
| Backup/restore | PASS (local equivalent of `pg-backup.sh`; identical row counts) |
| Deployment (compose build/up, TLS) | NOT VERIFIED (no server; heavy builds deferred) |

Remaining fixes applied this pass: **B-5** (dead `useAuth().register()` deleted after a full call-site search — zero callers), **DR-3** (web compose healthcheck added; compose config validates), **DR-4** (readiness now checks Redis; verified live `{"status":"ready","database":"up","redis":"up"}` plus 4/4 unit tests).

---

## 3. Verification Confidence

| Category | Confidence |
|---|---|
| Static code correctness | **High** |
| Builds / typecheck / lint (API) | **Verified** |
| Builds / lint (web) | Typecheck + lint + **production build verified (T-06)** |
| Unit tests | **Verified** (76 pass) |
| Database: migrations, seed, indexes, drift | **Verified on disposable DB** |
| Auth / payments / gating / delete flows | **Verified live (API level)** |
| Payments end-to-end (completed Chapa checkout) | **Verified live** (2026-10-18, dev DB): browser checkout → payment APPROVED + subscription ACTIVE + receipt (T-33). Production-mode checkout / real bank receipt still unverified |
| Frontend E2E (Playwright) | **Verified (T-44 — 16/16, incl. admin sign-in)**; manual frontend items partial (T-45) |
| Load testing, outage drills, deployment | **Not verified** (environment-limited; see `TEST-RESULTS.md` §1) |

---

## 4. Findings

### 4.1 Fixed
| ID | Sev | Fix |
|---|---|---|
| B-1 | P2 | FK-safe cascade for inactive-account sweep (verified live by T-20) |
| B-2 / B-3 / B-4 / B-11 | P3 | Dead code removed; audit log added; debug log removed |
| B-7 | P2 (perf) | Additive indexes (migration applied + verified on fresh DB) |
| B-5 | LOW | Dead `useAuth().register()` deleted (zero call sites; tsc + eslint clean) |
| F-1 | **Critical** | Corrupted migration restored byte-identical; fresh bootstrap verified |
| DR-3 | LOW | `web` compose healthcheck added (config validated) |
| DR-4 | LOW | `/health/ready` now checks Redis (live-verified + unit-tested) |
| F-2 | **Critical (ops)** | Valid key confirmed; deprecated `gemini-2.5-flash` replaced with `gemini-3.8-flash` (both call sites); REST + SDK verified (Rev 4, §5.1) |
| F-10 | LOW | Chapa field-keyed validation errors now stringified (rejection reason + client message readable; no more `[object Object]`) |
| F-11 | LOW | `API_PUBLIC_URL` dead quick-tunnel replaced with `http://localhost:4000` for local dev |
| F-12 | MEDIUM (UX) | Payment page now displays the college receiving accounts (public `GET /payments/bank-accounts` in the manual-transfer section, copy buttons, CBE labelled) — the bank-transfer method is completable from the app (Rev 5, §5.8) |
| F-13 | MEDIUM (verify) | Real-FT probe resolved on the legacy CBE endpoint (current receipts resolve) and the instant flow was then completed live in the UI (auto-approved + subscribed, DB-verified); CBE's new `mbreciept` receipt generation is now supported via pasted short links (public JSON API; unit-tested - live validation pending one real short link) (Rev 5, §5.8) |
| F-14 | **High (payments)** | Collapsed CBE masks (`1****3036`, 4 stars hiding 8 digits) failed the positional receiver-account match → genuine CBE payments would have been rejected. Fixed with collapsed-mask handling + tests; compiled dist verified (Rev 5, §5.8) |
| F-15 | **High (payments)** | CBE-Birr "VAT Invoice" layouts mis-parse `Reference No.` as `VAT` → wrong reference stored and later same-format payments falsely blocked as duplicates. Fixed in the verifier (FT-pattern validation, lookup-reference fallback) + tests; live re-probe clean (Rev 5, §5.8) |
| F-16 | **High (workflow)** | Teacher accounts could not be given courses at creation (empty dashboards until a separate per-course assignment). Fixed: `courseIds` on `create-staff` (validated up front, assigned atomically in the account transaction) + admin UI course picker with search/dept filter/taken-course states. Unit 10/10 + live E2E verified (Rev 6, `TEACHER-COURSE-RELATIONSHIPS.md`) |
| F-17 | MEDIUM (payments hardening) | Non-ETB receipt currency was not rejected (amount check only). Fixed: currency mismatch → REJECT; DTO tamper-proofing locked in by tests. Bundled with the Cheki-primary integration (bank-confirmed-only trust rules, fallback to the local verifier, redacted logs, cache/timeout/size guards, `CHEKI_ENABLED` kill switch) — live Cheki call + duplicate gate verified; fresh-receipt live auto-approval unit-only (Rev 6, `CHEKI-INTEGRATION-STRATEGY.md`, `SUBSCRIPTION-PRICE-VALIDATION.md`) |

### 4.2 Open
| ID | Sev | Finding | Owner action |
|---|---|---|---|
| F-8 | **HIGH (launch)** | Resend sending domain not verified → sign-up/reset email only reaches the account owner | Procedure ready in `RESEND-DOMAIN-VERIFICATION.md`; verify domain, update `SMTP_FROM`, run `check:f8-email`, re-test non-owner inbox |
| F-9 | MEDIUM (ops) | Chapa requires MX-capable payer email domains → test accounts with fake domains cannot start checkout | Use deliverable emails for tests; document for launch ops |
| S-2 / F-6 | **HIGH** | Secrets to rotate (JWT, DB, SMTP, Chapa, verifier, super-admin); DB password additionally exposed in a local session log | Run `docs/deployer/90-SECRET-ROTATION.md`; preflight with `check:env --strict`; record completion |
| S-1 | MEDIUM (RESOLVED for deployment) | Redis denylist previously failed **open** | **Code fixed + outage-proven:** fail-closed default, `REDIS_FAIL_MODE` validation, unit tests, and T-30 PASS on compose (503 → 401 → recovery 200); production compose pins Redis 7. Local dev Redis 5.0.14.1 is dev-only. |
| F-3 / S-6 | MEDIUM | `npm ci` → 49 vulns (10 mod / 34 high / 5 critical) | `npm audit` remediation pass before launch |
| DR-1 | MEDIUM | `uploads` volume not backed up | Archive receipts/PDFs off-box (DB backup wrapper + restore verified equivalent, T-49 PASS; uploads still need off-box archiving) |
| F-4 | MEDIUM | `Material.uploadedBy` NOT NULL, no FK → dangles after user deletion | Add constraint/detach strategy in a migration |
| DR-2 / DR-5 / DR-6 | MEDIUM | Backup not scheduled by stack; no deploy job; migrations not in CI | Runbook/CI items |
| F-5 | LOW | Jest worker leaks a handle (warning only) | Investigate open handles when convenient |
| B-6 / B-8 / B-9 / S-3 / S-4 / S-5 | LOW | Structural/cosmetic hardening items | Gradual |

---

## 5. Deployment Decision

### **AMBER — all executed gates green; NOT YET production-approved.**

The exit criteria (`TEST-PLAN.md` §11) require all 53 checks PASS (or waived) **and** secrets rotated. Rev 12: T-30/T-49/T-51/T-52 are now PASS from the local compose run, and T-50/T-53 are PARTIAL (full verifier image + real TLS remain VPS steps); T-46/T-47 remain NOT VERIFIED, T-45 needs the operator's exact notes, and F-8/S-2 remain the launch actions. Rev 5 fixed the live payment-path findings (F-12/F-14/F-15) and closed F-13 for the legacy CBE system; no new blockers.

### Path to GREEN (Rev 12 status)

GREEN requires every `T-01..T-53` check to **PASS or be explicitly waived**, and
**S-2 secrets rotated** (`TEST-PLAN.md` §11). The app is not RED: builds, lint,
unit/integration tests, live payment checks and health are green. The remaining
gaps are operational and evidence gaps, not a failing product test.

**Treat as non-waivable for production**

1. **S-2/F-6 — rotate and deduplicate secrets.** Follow
   `docs/deployer/90-SECRET-ROTATION.md`: rotate JWT access/refresh, DB password,
   SMTP/Resend key, Chapa secret + webhook secret, verifier token, Gemini key
   and the super-admin password; update `.env`/`.env.production`, redeploy, and
   invalidate old sessions/tokens. Run
   `npm run check:env -- .env.production --strict` first; one DB password was
   exposed to a local session log, so it is definitely on the list.
2. **F-8 — verify a Resend sending domain.** Follow
   `RESEND-DOMAIN-VERIFICATION.md`: add the domain at resend.com/domains,
   publish SPF/DKIM/DMARC records, set `SMTP_FROM` to that domain, run
   `npm run check:f8-email -- --email <non-owner>`, then confirm the non-owner
   inbox and the Resend `Emails` log for registration + password reset.
3. **S-1/T-30 — done on compose; keep Redis 7 on the VPS.** The code fails
   **closed** by default, `REDIS_FAIL_MODE` is validated, and T-30 PASSES
   (readiness 503 → refresh 401 → recovery 200) against the compose stack's
   Redis 7. Remaining: confirm the VPS stack uses `redis:7-alpine` and record
   the same drill against the staging host during deployment. The local dev
   Redis 5.0.14.1 is dev-only.

**Evidence gates**

4. **T-42/T-45 — operator UI run.** The operator confirmed the AI tutor,
   PDF→AI generation, PDF viewer and the destructive-dialog **Cancel** path on
   2026-10-19. Capture the exact page/step evidence in
   `REGRESSION-TEST-RESULTS.md` §13; this closes the last PARTIAL test once the
   operator's notes are attached.
5. **Staging/outage gates — remaining T-46, T-47, T-48, T-50 full, T-53.** The
   local compose run already PASSes the T-49 wrapper, T-51 up/migrations, T-52
   smoke and T-30, and proves the T-53 headers/uploads half. Remaining on the
   Hostinger VPS: build the full Chromium verifier image (T-50), issue TLS and
   run T-53 against the public host, then run the load (T-46), kill-mid-AI-job
   (T-47) and full outage matrix (T-48). If a gate truly cannot be executed,
   record an explicit waiver with rationale — the exit criteria allow that, but
   production deployment gates should normally be run.
6. **Residual live payment/UX proofs.** Fresh unused exact-amount receipt
   auto-approval, live `mbreciept`, Telebirr/M-Pesa geo-block, newly mapped bank
   lookups, real receiving accounts for every college bank, co-teaching sign-off,
   and the destructive-dialog click-through.
7. **Final re-run.** API **177/177**, payments **99/99**, verifier **20/20**,
   web lint/build, `deploy/smoke-test.sh`; attach output, update the audit docs,
   then re-audit and change the verdict to GREEN.

### Hard stops
Any failing build/lint/test/migration, an un-rotated or invalid secret in production, or any real access-control/payment failure keeps the project below GREEN. The remaining unexecuted gates (T-45 exact evidence; T-50 full verifier build; T-53 real-host TLS; T-46/T-47/T-48) remain stops under the exit criteria until completed or waived.

---

## 6. Deliverables Index

| Document | Contents |
|---|---|
| `INITIAL-BASELINE.md` | Baseline + static re-verification, defects B-1..B-10 |
| `FEATURE-VERIFICATION.md` | 34-feature UI→API→DB matrix |
| `DATABASE-AUDIT.md` | Schema, constraints, FK gaps, indexes, migrations, seed, backups |
| `FRONTEND-AUDIT.md` | Routes, auth/edge guard, API client, findings |
| `BACKEND-API-AUDIT.md` | Bootstrap, endpoint inventory, patterns, findings |
| `SECURITY-AUDIT.md` | AuthN/AuthZ, uploads, payments, secrets (execution addendum appended) |
| `TEST-PLAN.md` | 53 executable checks with pass criteria |
| `TEST-RESULTS.md` | **Rev 6 — full execution evidence, statuses T-01..T-53, findings F-1..F-7; §5 live-session addendum (Rev 4/5); §6 final-defect-sprint addendum (Rev 6)** |
| `PERFORMANCE-RELIABILITY-AUDIT.md` | Indexes, query patterns, AI pipeline, caching, ops |
| `CLEANUP-REPORT.md` | All applied changes incl. B-5/DR-3/DR-4 (this pass) |
| `DEPLOYMENT-READINESS.md` | Compose/Docker/Nginx/backup, gaps DR-1..DR-8 (DR-3/DR-4 now fixed) |
| `FINAL-PRODUCTION-READINESS-REPORT.md` | This document (Rev 6) |
| `LOCAL-DEV-RUNBOOK.md` | How to start the full stack locally (services, API/web/Studio, tests) — added 2026-10-18 |
| `FINAL-DEFECT-INVESTIGATION.md` | Rev 6 sprint — Issues A–D investigation, root causes, fixes, statuses |
| `TEACHER-COURSE-RELATIONSHIPS.md` | Teacher↔course model, creation contract, transaction semantics, live E2E evidence, limitations |
| `PAYMENT-RECEIPT-VERIFICATION.md` | Receipt pipeline, trust rules, failure taxonomy, duplicate protection |
| `CHEKI-INTEGRATION-STRATEGY.md` | Cheki primary-source decision, API mapping, fallback matrix, config/ops |
| `SUBSCRIPTION-PRICE-VALIDATION.md` | Amount/currency enforcement chain, policy decision & change path |
| `REGRESSION-TEST-RESULTS.md` | Sprint regression commands + results (132/67/18/10 API, 20 Python, builds, live E2E 20/20) |
| `PROACTIVE-IMPROVEMENTS.md` | Proactive hardening/UX/verification improvements + backlog candidates |
| `FINAL-DEFECT-SPRINT-REPORT.md` | Sprint executive summary — per-issue verdicts, evidence map, next actions |
| `RESEND-DOMAIN-VERIFICATION.md` | F-8 operator procedure: Resend domain, DNS/SPF/DKIM/DMARC, SMTP env, non-owner delivery tests |
| `docs/deployer/90-SECRET-ROTATION.md` | S-2/F-6 operator procedure: rotation order, env keys, verification, rollback |
| `STAGING-GATE-RUNBOOK.md` | Staging host setup + exact T-30/T-46–T-53 commands, local-Docker limits, the 2026-10-19 rehearsal results and Hostinger VPS notes |
| `docs/deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md` | Deployment deltas (full verifier build, TLS/HSTS), deferred S-2/F-8/Chapa-at-deploy checklists, how Chapa verification works, T-46/T-47/T-48 procedures, T-45 evidence template, AMBER→GREEN checklist |

---

*No secret values are reproduced in this report or in `TEST-RESULTS.md`. PASS/PARTIAL/NOT VERIFIED reflect actual command output only.*
