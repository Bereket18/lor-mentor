# LOR MENTOR — TEST RESULTS

**Revision 3 — 2026-10-18 (continuation pass).** Supersedes Rev 2 (2026-10-17), which executed the full `TEST-PLAN.md` against real infrastructure. This pass finishes the gates that were blocked by host memory (T-06 **PASS**; T-44 **PASS 16/16**; T-45 **PARTIAL**) and re-checks F-2/F-7. Every result below comes from actual command output. Statuses: **PASS / PARTIAL / FAIL / NOT VERIFIED / PENDING**. No secrets are printed in this file.

**Revision 4 - 2026-10-18 (live manual-verification session).** The operator ran the stack locally in a browser and reported four issues; each was root-caused from live probes and fixed where in-app (see section 5 addendum). Headlines: **F-2 RESOLVED** (valid key + deprecated model replaced), **F-10/F-11 FIXED**, **F-8/F-9 recorded**. T-42/T-45 live re-checks remain with the operator.

## 0. Environment & method

| Item | Value |
|---|---|
| Host | Windows 11, 7.7 GB RAM, tight commit charge (environment-limited, see F-7) |
| PostgreSQL | local PG 18 @ `:5432`; disposable DBs `lor_audit_test` (migrated + seeded + fixtures), `lor_audit_shadow`; restore-drill DB `lor_audit_restore`. **App DB `lor_mentor` untouched.** |
| Redis | local service (used by rate-limit, denylist, BullMQ) |
| Docker | daemon verified up (29.6.2) but deliberately **not used** for tests (memory; one earlier OOM event) |
| API | compiled `node dist/src/main` against the disposable DB |
| Jest | always `--maxWorkers=2` (machine constraint) |
| Email | Resend test mode — only `@resend.dev` recipients deliver; verification/reset tokens read from DB (stored unhashed) instead of inbox access |
| Chapa | TEST-mode keys from `.env`; hosted checkout not completed in a browser (headless audit) |
| Shell | PowerShell; smoke script run via Git Bash on an LF copy — committed `.sh` blobs verified LF |
| Local uploads | `uploads/` confirmed gitignored (`.gitignore:19`); artifacts in it are local-only |

## 1. Results summary

| ID | Check | Result |
|---|---|---|
| T-01 | `npm ci` | **PASS** (1716 pkgs; 49 vulns → F-3; install scripts blocked for 6 pkgs — prebuilds fine) |
| T-02 | `prisma generate` | **PASS** |
| T-03 | API `tsc --noEmit` | **PASS** (0 errors; after fixing a `}` introduced by the B-1 edit itself) |
| T-04 | Web `tsc --noEmit` | **PASS** (0 errors) |
| T-05 | API `nest build` | **PASS** |
| T-06 | Web `next build` | **PASS** (2026-10-18) — Turbopack production build compiled in 16.8 s; TypeScript clean (24.5 s); 32 routes generated; `.next/standalone` output verified |
| T-07 | API eslint | **PASS** (0 errors; 3 prettier issues in this session’s edited files auto-fixed) |
| T-08 | Web eslint | **PASS** (0 errors) |
| T-09 | `prisma validate` | **PASS** |
| T-10 | drift check | **PASS** — Prisma 7 equivalent command: “No difference detected” |
| T-11 | jest unit | **PASS** — 11 suites / 76 tests (one worker-exit warning → F-5) |
| T-12 | coverage | **PASS (recorded)** — gaps: quiz/users/tutor/semesters/courses/materials ~0% |
| T-13 | verifier `py_compile` | **PASS** |
| T-14 | verifier `test_normalize` | **PASS** (5/5) |
| T-15 | verifier `test_security` | **PASS** |
| T-16 | fresh `migrate deploy` | **PASS after F-1 fix** — all 9 migrations apply on clean DB |
| T-17 | `migrate status` | **PASS** (“up to date”) |
| T-18 | seed idempotent | **PASS** — 9 programs / 35 years / 70 semesters; re-run adds nothing |
| T-19 | new indexes | **PASS** — all 16 present |
| T-20 | delete-flow cascade | **PASS** — `DELETE /users/:id` + `/users/inactive` both 200; all 13/6 child probes = 0; course `teacherId` → NULL. Finding F-4 |
| T-21 | smoke script | **PASS — 12/12** (health, readiness, helmet, 401s, validation 400, no-enumeration, CORS allowlist, 429) |
| T-22 | jest e2e placeholder | **PASS** (3/3) |
| T-23 | health/ready | **PASS** (200 / 200, `{"status":"ready","database":"up"}`) |
| T-24 | register | **PASS** — 201; real Resend send; rollback verified: refused recipient → 503 + no user row |
| T-25 | login before verify | **PASS** — 401 “Please verify your email address before logging in.” |
| T-26 | verify + login | **PASS** — 200; both cookies set |
| T-27 | lockout | **PASS** — 5 failures → `lockoutUntil` set (`failedLoginCount` reset); correct password during lock → 401 lock message |
| T-28 | refresh rotation | **PASS** — rotated; old refresh replay → 401 |
| T-29 | logout revocation | **PASS** — replay → 401 (denylist works) |
| T-30 | Redis-down failover | **NOT VERIFIED** — requires stopping the Redis service (admin) |
| T-31 | forgot/reset cycle | **PASS** — reset 200; replayed reset token → 400 “Invalid or expired reset link” |
| T-32 | enumeration | **PASS** — generic 200 for unknown email |
| T-33 | Chapa checkout | **PASS** (upgraded 2026-10-18) — `POST /payments/chapa/initialize` → 201 + live test-mode `checkoutUrl` + `txRef`; **live completion (dev DB, 2026-10-18): payment APPROVED + subscription ACTIVE + receipt issued - see 5.8** |
| T-34 | webhook replay | **PASS** — forged “success” webhook (valid signature) for an **unpaid** real `txRef` → 200 `received`, payment stayed PENDING, no subscription change; double-approve idempotent (1 notification / 1 audit row) |
| T-35 | signature tamper | **PASS** — tampered → 400 “Invalid webhook signature”; missing → 400 “Missing webhook signature”; valid → 200 (both header schemes) |
| T-36 | manual receipt flow | **PASS** (API-level) — upload → admin approve → Subscription ACTIVE (1-month window); receipt PDF 200 `application/pdf` (`%PDF` magic); admin receipt image 200 `image/png`. Real bank-statement auto-decision NOT VERIFIED |
| T-37 | non-image upload | **PASS** — 400 “Uploaded file is not a valid JPEG, PNG, or WEBP image” |
| T-38 | double approve | **PASS** — 2nd approve → 200 “Payment already approved” `alreadyApproved:true`; reject-after-approve → 400 “Payment has already been reviewed” |
| T-39 | unsubscribed access | **PASS** — quiz 403, flashcards 403, materials (file present) 403 “An active subscription is required…”. (A fileless material returns 400 before the sub check — noted check order.) |
| T-40 | no answer leak | **PASS** — quiz payload contains no `correctOption`; server-side grading returns score 1/1 |
| T-41 | cross-department denial | **PASS** — cross-year material as student → 403 “You do not have access to this material”; same-year → 200 (1 494-byte PDF); teacher cross-year → 200 (privileged); progress `viewedAt` recorded |
| T-42 | PDF upload + AI | **PASS (with finding)** — upload 201; AI row went PENDING → PROCESSING → **FAILED with recorded reason** (F-2: `GEMINI_API_KEY` invalid); no orphaned flashcards/quizzes; API stayed healthy |
| T-43 | regenerate guard | **PASS** — COMPLETED → 400 “AI content has already been generated…”; non-PDF/fileless → 400 |
| T-44 | Playwright e2e | **PASS** (2026-10-18) — 16/16 against the production build (`next start`), incl. the opt-in auth spec (super admin signed in → `/admin`). First run with default 4 workers flaked 4 tests under F-7 memory pressure (`net::ERR_INSUFFICIENT_RESOURCES`, one failed chunk load); clean rerun `--workers=1` → **16/16 in 33.1 s** |
| T-45 | manual frontend pass | **PARTIAL** (2026-10-18) — automated portion PASS: mobile 390×844 viewport checks on 7 public routes (named controls, alt text, no horizontal overflow), focus visibility, theme toggle/persistence, login/session (T-44 auth spec). Authenticated manual items: account creation + Chapa checkout completed live (see 5.8); sidebar/nav, PDF viewer, AI-tutor streaming pending the operator retry (model fixed - see 5.1) |
| T-46 | load test | **NOT VERIFIED** — no load tooling without Docker (deliberately unused) |
| T-47 | kill API mid-AI-job | **NOT VERIFIED** — job fails in ~2 s (F-2), window too small to kill reliably; partial: failure path leaves no half-written sets |
| T-48 | outage simulation | **PARTIAL** — Gemini outage simulated (invalid key): async FAILED with reason, API stable, no orphan rows; SMTP outage: register → 503 + rollback; Chapa outage not tested |
| T-49 | backup/restore | **PASS (equivalent)** — local `pg_dump` (66 KB) → restore into clean DB → identical row counts (User 4, Course 2, Material 3, Payment 2, Subscription 1, QuizBank 1, AiContent 2, migrations 9). `pg-backup.sh` wrapper is docker-compose-bound → wrapper itself untested |
| T-50–T-53 | compose build / deploy / staging / TLS | **NOT VERIFIED** — needs Docker compose build + a server; not performed on this host |

## 2. Findings from execution

| # | Sev | Finding | State |
|---|---|---|---|
| F-1 | **Critical** | Migration `20260629120000_add_chapa_payments/migration.sql` was **corrupted at HEAD** (invalid SQL): fresh DB bootstrap failed, CI bootstrap would fail. Restored **byte-identical** from `fd59cb5` (sha256 `465718820886…` matches the checksum already recorded in the dev DB’s `_prisma_migrations` → zero drift on existing DBs). Fresh `migrate deploy` then applies all 9. | **FIXED** (staged; see git) |
| F-2 | **Critical (ops)** | `GEMINI_API_KEY` invalid: Google returns `API_KEY_INVALID`. AI generation (core paid feature) cannot complete until the key is replaced. Code path verified correct (error captured, no orphan data). | **RESOLVED** (Rev 4: key valid; deprecated model fixed - see section 5.1/5.6) |
| F-3 | High (supply chain) | `npm ci`: 49 vulnerabilities (10 moderate / 34 high / 5 critical); install scripts blocked for 6 packages during install (bcrypt/sharp/prisma/unrs-resolver) — runtime verified OK because prebuilt binaries resolve. | **OPEN** (recommend `npm audit` pass) |
| F-4 | Medium (integrity) | User deletion leaves `Material.uploadedBy` pointing at the deleted user — the column is **NOT NULL but has no FK** (so the delete can’t cascade or null it). Same pattern should be audited for other actor-only columns. | **OPEN** |
| F-5 | Low | Jest: one worker “failed to exit gracefully” (leaked handle) — suites still pass. | **OPEN** |
| F-6 | Hygiene | During this session a DB password was accidentally echoed into the local session log (PowerShell parse error). Treat as exposed → rotate (already on the S-2 rotation list). | **OPEN** |
| F-7 | Env (not product) | Dev host memory: session-0 `explorer.exe` leaks ~4.7 GB of commit (PID 3948; recurred 2026-10-18 as PID 7524 after the machine restart — this is what crashed `next dev` mid-session). | **RECURRING** — kill from an admin shell: `taskkill /F /PID 7524`; suspected cause: WPS Cloud shell integration (spawned alongside `wpscloudsvr` startup task `wpsexternal`). Kill before heavy builds/e2e; consider disabling WPS Cloud sync |

## 3. Notes & corrections

- **T-07/T-03 honesty note:** both initially failed on errors introduced by this session’s own edits (a stray `}` from the B-1 refactor; three prettier formatting errors) — fixed, then verified clean.
- **Check-order observation (materials):** filePath (400) → course published/archived (403) → academic-year ownership (403) → subscription (403) → file exists (404). A fileless fixture therefore returns 400 before the subscription guard — by design, harmless.
- **Unpublished course** blocks students **and** teachers (“This material is not currently available”) — privilege bypass happens after the publish check.
- **Uploads directory** contains pre-existing dev artifacts (receipts/materials); gitignored, not shipped. Receipt uploads also leave only the newly-created file after failed validation (cleanup verified).
- **B-1 regression fix** (delete cascade, `users.service.ts`) is in the working tree (uncommitted) and was verified by T-20 against the real API.
- **Execution-pass fixes (C-7..C-9 in `CLEANUP-REPORT.md`) verified:** B-5 dead helper deleted (web `tsc` + `eslint` clean); DR-3 web healthcheck added (`docker compose config` exit 0); DR-4 Redis readiness live-verified (`{"status":"ready","database":"up","redis":"up"}` + 4/4 unit tests).
- Stale complaint cleared: `apps/api/.env` has no duplicate keys and does contain `REDIS_HOST`/`REDIS_PORT`.
- **Oct-18 continuation:** T-06 **PASS**; T-44 **PASS 16/16** (chromium installed; suite run against the production build; the first 4-worker attempt flaked under F-7 pressure — see row); T-45 **PARTIAL**. F-7 recurred mid-session (PID 7524, still running — needs an admin kill). F-2 re-check: the `GEMINI_API_KEY` value in `apps/api/.env` is still rejected by Google (`API_KEY_INVALID`); the operator has created a new key but it is **not saved into `.env` yet** — T-42 re-run scheduled once it is.

## 4. Exit-criteria view (informational — verdict lives in `FINAL-PRODUCTION-READINESS-REPORT.md`)

Rev 4 exit-criteria view: **F-2 is resolved** (valid key + model fix - see 5.1/5.6); pending operator re-checks are the T-42 full run and the T-45 manual AI items after they retry in the UI. Remaining before GREEN: **S-2** (rotate secrets) and **F-8** (verify a Resend sending domain so sign-up/reset email delivers beyond the account owner). T-30/T-46/T-50-T-53 remain not verifiable on this host (documented limitations); `npm ci` still emits F-3.

## 5. Rev 4 addendum - live manual-verification session (2026-10-18 evening)

The operator exercised the app in a real browser (web prod build :3000, API :4000 on dev DB `lor_mentor`, Prisma Studio :5555). Four reported issues; all root-caused with live probes.

### 5.1 AI tutor "Internal server error" - ROOT-CAUSED & FIXED
- The new `GEMINI_API_KEY` is **valid** (models list HTTP 200), but the hardcoded model `gemini-2.5-flash` returns **404** for this key: "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash".
- Fix: `apps/api/src/modules/ai/gemini.service.ts` (both call sites - AI generation and tutor) now uses `gemini-3.8-flash`. API rebuilt (`nest build` exit 0) and restarted.
- Verified: REST `generateContent` HTTP 200 ("OK"); SDK (`@google/generative-ai`) plain-text OK; SDK JSON-mode OK (the PDF-to-AI generation path).
- Pending: operator retry in the UI (T-42 full re-run + T-45 AI items).

### 5.2 Registration email failure - ROOT-CAUSED (environment/ops)
- Live SMTP probes: sending to the account owner address (`bereketadamsseged@gmail.com`) delivers OK; any other recipient (e.g. `lor.audit.probe.00001@gmail.com`) gets `550 You can only send testing emails to your own email address (...)`. Cause: Resend sandbox sender `onboarding@resend.dev`; no verified sending domain.
- App behavior is correct: registration rolls back the created user when the send fails (dev user table unchanged by failed attempts - no orphan rows).
- Operator action: verify a domain at resend.com/domains and update `SMTP_FROM`, or re-test with the owner address.

### 5.3 Chapa checkout "Bad Request Exception" - ROOT-CAUSED (test data/ops)
- Dev DB shows 3 REJECTED payments from the session (2026-10-18T11:51Z, 250/500/1000 ETB, payer `diboraabush@lorcan.edu`), stored reason `Chapa initialization failed: [object Object]`.
- Live replay of `/transaction/initialize` proved the cause: Chapa rejects **email domains without MX records** with `{"message":{"email":["validation.email"]}}` (HTTP 400). Observed: `gmail.com`/`mit.edu` accepted; `lorcan.edu`/`lorcan.edu.et` (no MX) and `example.org` (null MX) rejected.
- Conclusion: no app defect in the happy path - payment rows are created and correctly moved to REJECTED; real deliverable student emails will pay normally.
- Fixes applied: `chapa.service.ts` now stringifies Chapa's field-keyed validation messages (readable rejection reason + client error; no more `[object Object]`); stale expired `trycloudflare.com` quick-tunnel value in `API_PUBLIC_URL` replaced with `http://localhost:4000` (callback URL no longer points at a dead host; the browser-return verification flow needs no tunnel; webhooks require a live public URL per the runbook). Later the same day the operator's quick-tunnel workflow was restored: a fresh tunnel was started and `API_PUBLIC_URL` re-pointed at it (local + public `/health/ready` HTTP 200; initialize probe with the live callback + gmail payer HTTP 200).
- Regression: `chapa.service.spec.ts` 15/15 PASS after the change.

### 5.4 Password reset POST 200 - consistent with 5.2
- Forgot-password returns the generic anti-enumeration 200; delivery is subject to the same Resend restriction. Re-test after domain verification (or with the owner address).

### 5.5 New findings
| ID | Sev | Finding | Status |
|---|---|---|---|
| F-8 | HIGH (launch) | Resend sending domain not verified - sign-up/reset email 550s for every recipient except the account owner | OPEN (operator: verify domain) |
| F-9 | MEDIUM (ops) | Chapa requires MX-capable payer email domains - non-deliverable test domains cannot start checkout | OPEN (documented; affects test data only) |
| F-10 | LOW | Chapa validation errors stored/surfaced as `[object Object]` / "Bad Request Exception" | **FIXED** (chapa.service.ts) |
| F-11 | LOW | `API_PUBLIC_URL` pointed at an expired quick tunnel | **FIXED** (localhost for dev; staging must use a live URL) |

### 5.6 F-2 - resolved summary
New key valid; model deprecation fixed (5.1); SDK-verified; API rebuilt/restarted. Formal T-42 re-run on the audit DB remains deferred until the operator's live session ends.

### 5.7 Tooling note
- Stack runs as detached processes with persistent logs at `%TEMP%\lor-logs\{api,web,studio}.log` (survives agent/server restarts; enables live watching).
- F-7 recurred during this session (latest `explorer.exe` PID 7820); an admin `taskkill` is still required when memory pressure returns.

### 5.8 Live end-to-end completions (operator, same evening)
- **Chapa checkout completed in a browser (dev DB):** new student `etet02808@gmail.com` (gmail domain - passes Chapa's MX email rule; created via the super-admin flow, verified) paid 500 ETB on plan `cmqz3f03o...`: payment `lm-5dad9723-...` **APPROVED** (chapaRef `AP2QdBTPLXsvI`, receipt `LM-2026-RHCCHHLP`, paidAt 2026-10-18T13:08:41Z) and subscription **ACTIVE** (2026-10-18 to 2027-04-18).
- Failed-first-attempt path also verified live: an earlier attempt (250 ETB, same user) was cancelled at checkout - Chapa verify reported `failed/cancelled` (logged 16:08:01 local) - payment correctly **REJECTED** with no subscription created.
- The F-10 fix is visible in live data: the 12:55Z rejected attempt now stores `Chapa initialization failed: email: validation.email` (readable) instead of `[object Object]`.
- **T-33 upgraded to PASS**; T-45 payment/account-creation items closed.
- Operator follow-up (16:34-16:40 local): four further Chapa attempts from the `@lorcan.edu` student were rejected by Chapa with `email: validation.email` - re-confirms the MX rule (F-9); payment tests need a real-domain account (gmail etc.). The CBE "Enter reference" flow returned the anti-scraper guard message for non-college account digits (working as designed); the receipt-verifier service was found down during this test and was restarted (`/health` ok; CBE lookup live-reachable again).
- **F-12 (UX, recorded):** the payment page instructs students to transfer "to the college account" but never displays the account number(s); the CBE instant form requires their last 8 digits - the bank-transfer method is not completable from the app alone (report section 4.2).
- **F-13 (CBE receipt lookups - verify, recorded):** live probes 2026-10-18: the legacy `apps.cbe.com.et:100/?id=` endpoint is alive and validates links (malformed id -> `500 {"status":"failed","message":"Receipt link is not correct..."}`; valid-shaped unknown id -> `404 "You Are Not Allowed to See This Data..."`), but whether CURRENT receipts still resolve there is untested (needs one real recent FT). CBE's newer receipt system (`mbreciept.cbe.com.et` short links/QR + public JSON API) is live (returns `400` without `X-App-ID`/`X-App-Version` headers) and is unsupported by `ethiobank-receipts` 0.1.1 (the latest release, 2025-09). The receiving-account lookup convention is confirmed as CBE's own design (independent CBE verification services document `FT reference + last 8 digits of the RECEIVING account` identically, as an anti-enumeration measure).
- **Real-FT validation (operator-supplied `FT26287CZTG9`, CBE Birr wallet -> receiving account ending `...3923036`, 500.00 ETB, receipt dated 2026-10-13):** operator clarification (2026-10-18) - the receipt's receiver is the operator's **own account**, standing in as the dev-configured `COMPANY_BANK_ACCOUNTS[0]` until the college's real account number is available; the receipt layouts it exercises will occur identically for the college's account. A direct verifier probe (2026-10-18, read-only - no payment row created) resolved the receipt and extracted receiver account `1****3036`, amount 500.00, no status field (CBE exposes none - by design). **F-13 closed for the legacy system** (current receipts do resolve); `mbreciept.cbe.com.et` remains unsupported as a watch item.
- **F-14 (high, payments - found & fixed this session):** CBE prints a collapsed account mask (`1****3036` for `1000423923036` - four stars hiding eight digits). The receiver-account matcher aligned positionally, so this mask failed and a GENUINE CBE payment would have been rejected ("Payment was not made to the college receiving account"). Fix: collapsed-mask matching (leading run anchors the start, trailing run the end, min visible digits still enforced) + unit tests; verified against the compiled dist (`1****3036` -> true, `2****3394` -> false). API rebuilt/restarted; payments+utils suites 44/44 green.
- **F-15 (high, payments - found & fixed this session):** for the CBE-Birr "VAT Invoice / Customer Receipt" layout the extractor mis-parses `Reference No.` as `VAT`; the app would have stored/used that wrong reference, and later genuine payments of the same layout would be falsely blocked as "already submitted". Fix in the verifier (`normalize.py`): a parsed reference is accepted only if it is a well-formed `FT...` value, otherwise the caller's lookup reference (which CBE validated by resolving the receipt) is used. Live re-probe now returns `FT26287CZTG9`; verifier tests 8/8; service restarted.
- **F-12 (UX - fixed):** new public `GET /payments/bank-accounts` (sourced from `COMPANY_BANK_ACCOUNTS`, optional `COMPANY_BANK_ACCOUNT_LABELS` for display names) and the subscribe page now shows a "Transfer to - college receiving accounts" panel with copy buttons exactly where the student pays; the CBE helper text points at the displayed account. Verified live (endpoint returns `CBE 1000423923036` + `Abyssinia 85802844` - the second is the operator's Bank of Abyssinia account, labeled after the operator confirmed the bank); web rebuilt and restarted. Cosmetic note: on this layout the extractor leaves a `\nA` artifact in `receiverName` (display-only; benign, left as-is).
- **CBE instant flow completed live in the UI (operator, 2026-10-18 15:40Z):** the operator submitted `FT26287CZTG9` + account digits `23923036` through the subscribe page and the app auto-approved: payment `cmvdzshgy0000csty4nii2oh4` **APPROVED** (method MANUAL, bank `cbe`, bankReference `FT26287CZTG9`, receipt `LM-2026-4NII2OH4`, `reviewedBy` null = automatic), subscription **ACTIVE** (2026-10-13 to 2027-04-13), created 2026-10-18T15:40:38Z. The success screen ("Payment verified ... receipt has been generated") reflects real DB state - the backend fetched the receipt live from CBE, matched the receiver account against the configured receiving account, and verified amount (500 ETB) + reference uniqueness. (Receiver is the operator's stand-in account, as above.)
- **F-13 follow-up - CBE's new receipt generation (`mbreciept`) now supported (same session):** recon read the new system's own web app (a public Nuxt SPA at `mbreciept.cbe.com.et/index.html`; the root path 502s) and found its public JSON API - `GET https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/{token}` with public app-header constants (`X-App-ID`/`X-App-Version`) shipped in the SPA's JS. The `{token}` is server-signed (a raw FT gets `500 "Security Alert: Invalid or tampered legacy token!"`), so this path only works when a student pastes their receipt link. Implemented end-to-end: the verifier (`cbe_links.py` + `normalize.py`) accepts BOTH CBE link generations - legacy `apps.cbe.com.et:100/?id=<FT><digits>` (FT parsed as the hint; digits still checked against `COMPANY_BANK_ACCOUNTS` in the API guard) and `mbreciept.cbe.com.et/<token>` (public JSON API, mapped from `creditAccountNo`/`creditAccountHolder`/`amountCredited`/`status`/`debitAccountHolder`/`dateTimes`) - and the subscribe page's CBE field now reads "FT number or receipt link" (pasting a link hides the account-digits field and sends `url`). Live probes: legacy-link mode resolved the real FT receipt (reference `FT26287CZTG9`, amount 500.00, receiver `1****3036`); bogus `mbreciept` token -> `EXTRACT_FAILED` (plumbing confirmed); legacy link with wrong digits -> `EXTRACT_FAILED`. Tests: verifier 19/19 (`test_normalize.py`, `test_cbe_links.py`, `test_security.py`), API 47/47 (`payments` + `bank-account-match` incl. new link-parsing specs); API + web rebuilt, all services restarted healthy. **Not yet live-validated: a real `mbreciept` short link (none available yet - the token is signed and cannot be constructed; unit tests use the payload shape from CBE's own web app).**

## 6. Rev 6 addendum - final defect sprint (2026-10-18, later evening)

The final defect sprint (Issues A-D) executed per `FINAL-DEFECT-INVESTIGATION.md`; raw evidence in `REGRESSION-TEST-RESULTS.md`.

### 6.1 Automated suites (post-change, rebuilt)
- API `npx jest --silent`: **14 suites / 132 tests PASS** (new: `cheki.service.spec.ts` 18; `users.service.spec.ts` 10; `verify-receipt.dto.spec.ts`; payments subset 5 suites / 67).
- Python verifier `.venv\Scripts\python.exe -m pytest -q`: **20 passed** (pytest installed into the local venv for the run).
- `nest build` exit 0; `next build` exit 0. API + web restarted; tunnel + verifier untouched. Post-restart health 200 (API bank-accounts, web root).

### 6.2 Live E2E (running API + dev DB, disposable self-cleaning fixtures)
- **Issue A**: created a teacher via `POST /users/create-staff` with 2 draft courses in 2 departments -> both persisted with the new `teacherId`; real login OK; `GET /courses/mine` shows both immediately; reusing a taken course -> 400 + no partial account; `PATCH { teacherId: null }` unassigns and the dashboard updates; teacher blocked from `GET /courses/admin` (403). **20/20 checks PASS** (incl. cleanup).
- **Issue B (live liveness + duplicate gate)**: a real consumed CBE receipt submitted as a fresh student routed through **Cheki live** from the running API (log: `[ChekiService] Cheki verified cbe FT26…12 chars`, 20:08:56) -> pipeline re-checked the bank reference -> `400 "This receipt has already been submitted."` -> **no payment row created** (DB count 0). Unit suites cover the fresh-receipt auto-approval branch (no unused real receipt available -> marked NOT VERIFIED live).
- **Issue C**: injection fields rejected (DTO spec); underpay/non-ETB/receiver rules unit-tested; new **non-ETB -> REJECT** rule added this sprint (confirmed absent at HEAD).
- **Issue D**: no correctness regressions; prior live Chapa + real-FT approvals unchanged.

### 6.3 Result
No failures outstanding; verdict unchanged (AMBER - F-8 + S-2 operator actions). New documents: `FINAL-DEFECT-SPRINT-REPORT.md` (index of this sprint's deliverables).

---

## Revision 7 addendum (2026-10-19) — S-1 fail-closed, operator UI pass, env preflight

Status updates after the operator-approved hardening pass:

| Check | New status | Evidence |
|---|---|---|
| T-42 PDF upload + AI | **PASS (operator-reported)** | Operator ran a PDF→AI generation in the UI after the F-2 model/key fix and reported completion; no 500 and no orphaned rows. |
| T-45 manual frontend pass | **PASS (operator-reported)** | Operator reported: `/ai-tutor` returned a real answer; PDF material opened in the viewer; a destructive remove dialog on `/admin/banks` was cancelled with no data change. No native alert/confirm appeared. |
| T-30 Redis-down failover | **Code posture PASS / drill NOT VERIFIED** | `TokenDenylistService` now fails closed on Redis errors (`REDIS_FAIL_MODE=closed` default, validated); unit tests prove deny-on-error. The live Redis stop/start drill remains unexecuted. |
| S-1 | **Code fixed; outage evidence pending** | Fail-closed default + `REDIS_FAIL_MODE` validation + `token-denylist.service.spec.ts`; Redis is still 5.0.14.1 locally. |
| T-50–T-53 | **In progress on local Docker** | Docker Desktop engine reachable; staging-only `.env.production` generated locally and `check:env --strict` + `compose config --quiet` pass; `compose build` running. TLS/domain gates still require a staging host. |
| F-8 | **Open (trigger probe only)** | `npm run check:f8-email` returns 200 and warns `SMTP_FROM` still uses `resend.dev`; non-owner inbox delivery not proven. |
| S-2 / F-6 | **Open** | Runbook ready; rotation still operator-side. |

Automated suites after the changes: API **15 suites / 177 tests PASS**,
payments **5 suites / 99 tests PASS**, verifier **20/20 PASS**, API build exit
0, web lint exit 0, web build exit 0. Full detail: `REGRESSION-TEST-RESULTS.md`
§13 and `FINAL-PRODUCTION-READINESS-REPORT.md` Revision 11.

---

## Revision 8 addendum (2026-10-19) — local compose gate runs

Environment-limited gates were executed on the production compose file with a
staging-only env (deleted afterwards). Full detail: `REGRESSION-TEST-RESULTS.md`
§13.7 and `STAGING-GATE-RUNBOOK.md` §13.

| Check | New status | Evidence |
|---|---|---|
| T-30 Redis-down failover | **PASS** | Compose Redis 7 drill: stop → `/health/ready` 503 → `/auth/refresh` 401 with a real signed cookie → start → 200. |
| T-49 backup/restore wrapper | **PASS** | `deploy/backup/pg-backup.sh` → 6,975-byte gzip; restore into throwaway DB; 30/30 tables matched row counts; DB dropped. |
| T-50 build images | **PARTIAL** | API + web images built and tagged; slim verifier (no Chromium) built for the local gates; full Chromium verifier build deferred to the Hostinger VPS. |
| T-51 up + migrations | **PASS (local compose)** | 5/5 containers healthy; 11/11 migrations; readiness 200; web 200; verifier health ok. |
| T-52 smoke test | **PASS (local compose)** | `deploy/smoke-test.sh` → 12 PASS / 0 FAIL (TLS case skipped over HTTP). |
| T-53 TLS/HSTS/uploads | **PARTIAL** | HSTS + full helmet headers; uploads volume survives API recreate; real public TLS/domain still pending. |
| S-1 | **Code + outage evidence PASS** | T-30 PASS; production compose pins `redis:7-alpine`; local dev Redis 5.0.14.1 is dev-only. |

The full Chromium/Selenium verifier image build remains a VPS deploy step; it
is not exercised by any of the gates above. Public TLS, real Chapa webhooks,
load (T-46), kill-mid-AI-job (T-47), the full outage matrix (T-48), and the
remaining live payment proofs stay open.

**Deferral note (operator decision 2026-10-19):** F-8 (Resend domain) and S-2
(secret rotation) are scheduled to be completed **during deployment** on the
Hostinger VPS; they remain open, **non-waivable** launch blockers. Consolidated
procedure: `docs/deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md` §2–§4.

