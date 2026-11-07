# Handover

What is being transferred, who owns each piece afterwards, and what the college
must do to run Lor Mentor without the original developer.

Read this alongside [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) — the
checklist is the gate, this document is the ownership map.

---

## 1. The three roles

| Role | Who | Owns |
|---|---|---|
| **Coding agent** | The development engagement that built the platform | Source code, migrations, documentation, tests, known-issue list |
| **College representative** | The college's appointed owner (registrar, IT lead or principal) | Accounts, money, policy decisions, content sign-off |
| **Deployment engineer** | Whoever operates the VPS | The server, containers, backups, TLS, monitoring |

One person may hold more than one role — for example a college IT officer may be
both representative and deployment engineer. What matters is that **every row
below has a named person** before go-live.

---

## 2. Responsibility matrix

Legend: **P** primary · **S** supports · **—** not involved.

### 2.1 Accounts and credentials

| Task | Coding agent | College rep | Deployment engineer |
|---|:---:|:---:|:---:|
| Register/purchase the domain | — | **P** | — |
| Control DNS zone (registrar or Hostinger) | — | **P** | S |
| Add A records for web and API | — | P | **P** |
| Create Resend account and verify sending domain | — | **P** | S |
| Create Google AI Studio key | — | **P** | S |
| Create Chapa merchant account and complete KYC | — | **P** | — |
| Configure Chapa webhook URL | — | — | **P** |
| Generate JWT / verifier / database secrets | S | — | **P** |
| Fill and protect `.env.production` | S | — | **P** |
| Store credentials in the password manager | — | **P** | S |
| Rotate a leaked credential | S | S | **P** |

### 2.2 Server and deployment

| Task | Coding agent | College rep | Deployment engineer |
|---|:---:|:---:|:---:|
| Provision the Hostinger VPS | — | S | **P** |
| Install Docker, Compose, nginx, Certbot | — | — | **P** |
| Harden SSH, firewall, non-root deploy user | — | — | **P** |
| Build images and start the stack | — | — | **P** |
| Apply migrations | S | — | **P** (automatic at boot) |
| Run the seed and create the first admin | S | — | **P** |
| Issue TLS certificates | — | — | **P** |
| Renew certificates | — | — | **P** (automatic; verify) |
| Deploy application updates | S | — | **P** |
| Decide whether staging exists | — | **P** | S |

### 2.3 Operations

| Task | Coding agent | College rep | Deployment engineer |
|---|:---:|:---:|:---:|
| Schedule the nightly database backup | S | — | **P** |
| Copy backups off the server | — | — | **P** |
| Back up the uploads volume | — | — | **P** |
| Run the restore drill before go-live and quarterly | S | S | **P** |
| Uptime and error monitoring | — | — | **P** |
| Respond to an outage | S | S | **P** |
| Respond to a security incident | S | **P** (decides, notifies) | **P** (contains, rotates) |
| Notify affected students of a breach | — | **P** | S |

### 2.4 Product, content and policy

| Task | Coding agent | College rep | Deployment engineer |
|---|:---:|:---:|:---:|
| Approve subscription prices and plans | — | **P** | — |
| Configure receiving bank accounts (`/admin/banks`) | — | **P** | — |
| Faculty review of anatomy content | — | **P** | — |
| Approve publishing the urinary system | — | **P** | — |
| Resolve the BodyParts3D licence question (DBCLS) | S | **P** | — |
| Decide the project's own licence | S | **P** | — |
| AI data-sharing policy (Gemini) | S | **P** | — |
| Student data retention and deletion policy | — | **P** | S |
| Day-to-day support for students | — | **P** | — |

### 2.5 Engineering

| Task | Coding agent | College rep | Deployment engineer |
|---|:---:|:---:|:---:|
| Fix application bugs | **P** (during engagement) | — | — |
| Add features | **P** (during engagement) | — | — |
| Patch dependencies / respond to CVEs | **P** (during engagement) | — | S (deploys) |
| Change the database schema safely | **P** (during engagement) | — | — |
| Keep the documentation current | **P** (during engagement) | — | S |
| Take over development after handover | — | **P** (decides who) | S |

The coding agent's obligations end at the handover date. Rows marked "during
engagement" become the college's responsibility unless a maintenance agreement
is signed.

---

## 3. What is handed over

### 3.1 Code and history

- The full Git repository (branch `integration/anatomy-hardening`, to be merged
  to `main`).
- All migrations, seeds, tests and asset validators.
- The documentation set listed in [README.md](README.md).

Obtain it with `git clone`. **Not** a zip, and not a copy that rewrites line
endings — three migrations depend on their CRLF bytes
([DATABASE_AND_BACKUPS.md §3.3](DATABASE_AND_BACKUPS.md)).

### 3.2 Access to transfer

| Item | From | To | Notes |
|---|---|---|---|
| Git repository ownership | Development account | College org | Transfer, do not share a password |
| VPS root / sudo access | Development | College IT lead | New SSH keys; remove the old ones |
| Domain and DNS zone | — | College | Usually already theirs |
| Resend account | — | College | Create under a college-owned address |
| Google AI Studio / Cloud project | — | College | Must be a shared institutional account |
| Chapa merchant account | — | College | Created directly by the college |
| `.env.production` values | — | Password manager | Never by email or chat |
| Sentry project (if used) | — | College | — |

### 3.3 What must **not** be transferred in plain text

JWT secrets, provider keys, database passwords, admin passwords, and the
contents of `.env.production`. Put them in the college's password manager and
share access to the vault, not the values.

---

## 4. Operating model after handover

| Recurring task | Frequency | Time | Owner |
|---|---|---|---|
| Check backups ran | Daily (or alert) | 1 min | Deployment engineer |
| Check uptime / error monitor | Continuous | — | Deployment engineer |
| Review `AuditLog` for anomalies | Monthly | 15 min | College rep |
| Reconcile payments against Chapa | Monthly | 30 min | College rep |
| Restore drill | Quarterly | 1 h | Deployment engineer |
| Dependency and security updates | Quarterly | 2–4 h | Whoever develops |
| Certificate renewal check | Quarterly | 5 min | Deployment engineer |
| Review provider billing | Monthly | 10 min | College rep |

### Runbook index

| Situation | Document |
|---|---|
| First deployment | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Server prerequisites | [docs/deploy/SERVER-PREREQUISITES.md](docs/deploy/SERVER-PREREQUISITES.md) |
| nginx, TLS, upload limits | [docs/deploy/NGINX-SETUP.md](docs/deploy/NGINX-SETUP.md) |
| Every env variable | [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| Provider accounts | [INTEGRATIONS.md](INTEGRATIONS.md) |
| Migrations, backup, restore | [DATABASE_AND_BACKUPS.md](DATABASE_AND_BACKUPS.md) |
| Secret rotation | [docs/audit/SECRET-ROTATION-RUNBOOK.md](docs/audit/SECRET-ROTATION-RUNBOOK.md) |
| Security incident | [SECURITY.md §10](SECURITY.md) |
| Go/no-go | [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) |
| Licensing | [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) |
| Final validation results (what was and was not executed) | [docs/audit/PHASE-H-VALIDATION.md](docs/audit/PHASE-H-VALIDATION.md) |

---

## 5. Support boundaries

### Covered by the coding agent during the engagement

- Defects in implemented functionality, with reproduction steps.
- Documentation corrections.
- Schema migrations needed to fix a defect.
- Review of security issues in code the agent wrote.

### Not covered

- Hosting, VPS, DNS or certificate operations (deployment engineer).
- Provider account problems — Chapa KYC, Resend suspension, Google billing
  (college).
- Decisions about prices, content accuracy, student policy or data retention
  (college).
- Feature requests after the handover date, unless separately agreed.
- Recovery from changes made directly to the server that are not in the repo.

---

## 6. Open items at handover

These are **known and unresolved**. They do not block a controlled launch but
must be tracked.

| # | Item | Owner | Blocking what |
|---|---|---|---|
| 1 | DBCLS licence confirmation for BodyParts3D | College rep | Publishing the urinary anatomy system |
| 2 | Faculty review of anatomy teaching text | College rep | Marking systems `isReviewed` |
| 3 | Chapa KYC approval | College rep | Online card/Telebirr payments (bank transfer works without it) |
| 4 | Project `LICENSE` decision | College rep | Redistribution clarity only |
| 5 | Production image build and boot never executed in the development environment | Deployment engineer | Go-live — this is the first real build |
| 6 | ~~`COOKIE_DOMAIN` is not enforced at boot~~ — **closed**: the API now refuses to start in production when the web and API hosts differ and no shared parent `COOKIE_DOMAIN` is set (or when it is a single label, or does not cover both hosts on label boundaries); `scripts/check-env.mjs --strict` mirrors it | — | Resolved |
| 7 | `resend` npm dependency is unused | Coding agent (cleanup) | Nothing; cosmetic |
| 8 | Telebirr receipts from a non-Ethiopian server IP fall back to manual review | Deployment engineer (accept) | Automatic Telebirr verification |
| 9 | **Web lint is clean (0 errors)** — the last five were `react-hooks/set-state-in-effect` in `login`, `register`, `admin-login`, the topbar account menu and the app layout. They were fixed at the source, not suppressed: the hydration flags now use `useSyncExternalStore` via a new `hooks/use-hydrated.ts`, and the two "close the menu when the route changes" effects adjust state during render instead. `web:lint` is a **blocking gate** again. The **API still has 67 pre-existing errors**; **do not run `npm run lint --workspace=apps/api` to fix them — the script embeds `--fix` and will rewrite unrelated files** | Coding agent (API lint follow-up) | Nothing functionally |
| 10 | ~~Web reads `NEXT_PUBLIC_API_URL ?? ...`; an empty-string value does not fall back~~ — **closed**: `apps/web/src/lib/api-base.ts` validates the value at build time (`next.config.ts`) and at request time (`/api/proxy` → 503); empty, non-absolute, path-carrying and loopback/private values are errors in production instead of a silent localhost fallback | — | Resolved |
| 11 | Throwaway validation database `lor_mentor_phaseh` left on the development machine | Coding agent / whoever owns the dev box | Nothing; drop manually |
| 12 | `aicheck.mjs` is tracked in Git and embeds a live local database password (masked, never printed). File is excluded from the Docker build context but remains in the repository and in Git history | Deployment engineer / college rep | Credential exposure — rotate the password; history rewrite is an owner decision |
| 13 | Local `npm run build` for the web app now requires `NEXT_PUBLIC_API_URL` (it is a production build by definition). CI already sets it on every path | Anyone building locally | Nothing in a deployment; local build instructions updated |
| 14 | ~~Verifier `/extract` accepted anonymous calls when its shared token was unset~~ — **closed**: the verifier now refuses to **start** without a non-blank `VERIFIER_SHARED_TOKEN` and authenticates every `/extract` request with a constant-time compare; compose refuses to start it without `RECEIPT_VERIFIER_TOKEN` (`${VAR:?...}`). Running the verifier locally now **requires** the variable to be set — set the same value in `apps/api/.env` as `RECEIPT_VERIFIER_TOKEN` | Anyone running the verifier locally | Resolved — behaviour change for local development only |
| 15 | ~~Password reset left existing refresh sessions valid~~ — **closed**: a reset writes a per-user revocation marker in Redis, and any refresh token issued before it is rejected. Everyone signed in on an old refresh token is signed out by a password reset (intended) | — | Resolved |
| 16 | ~~Temporary staff password returned in the API response~~ — **closed**: `POST /admin/users` no longer creates or returns a password; it emails a single-use 48-hour set-password link and returns `invitationSent` (plus a fallback `setupUrl` only if the email could not be sent) | College rep (Resend must be live for the email path) | Resolved |
| 17 | ~~No server-side control over cross-origin writes~~ — **closed**: a global `OriginGuard` rejects state-changing requests (`POST`/`PUT`/`PATCH`/`DELETE`) whose `Origin` header is present and not in `CORS_ORIGIN` / `WEB_PUBLIC_URL` / `API_PUBLIC_URL`. Adding a browser origin that writes to the API now requires adding it to `CORS_ORIGIN` | Deployment engineer | Resolved — new configuration coupling to be aware of |
| 18 | **Financial-retention policy is undecided.** The destructive path is closed (`DELETE /users/:id` refuses when payments/subscriptions exist, and the 12-month sweep retains such accounts), so no financial history can be lost while the decision is pending — but the college still has to choose the retention period and whether archival replaces deactivation | College rep | Nothing yet; a full implementation needs a migration |
| 19 | **Nothing in the final remediation pass is committed.** All of it — verifier auth, session revocation, staff invitations, `verify-email` DTO, `OriginGuard`, financial-delete protection — exists only in the working tree on `integration/anatomy-hardening` | Technical lead (approve the commit) | Go-live: deploying the current tip would ship the unremediated code |
| 20 | ~~`verifier:test` raised `ModuleNotFoundError: No module named 'ethiobank_receipts`~~ — **closed**: the helpers moved to `security.py` and `before_script` installs only `requests fastapi`. Confirmed on the 2026-11-01 pipeline: `verifier:test` is a hard gate, so a green pipeline means it executed and passed | — | Resolved |
| 21 | ~~`docker-build-verifier` failed with `"/requirements.txt": not found`~~ — **closed**: the CI job passed the repo root as the build context while the Dockerfile's `COPY` paths are relative to `services/receipt-verifier`. The job now builds `./services/receipt-verifier`, matching `docker-compose.prod.yml` (`context: ./services/receipt-verifier`) — building from the root also bypassed that service's `.dockerignore`, which ships `test_*.py` into the image | — | Resolved (still `allow_failure` until it builds green on `main`) |
| 22 | ~~`compose-config` failed with `env file .../.env.production not found`~~ — **closed**: `--env-file` only feeds `${VAR}` interpolation; the `api` service also declares a container-level `env_file: .env.production`, which Compose resolves as a real path. The job now materialises `.env.production` from the example (gitignored, and excluded from build contexts by `.dockerignore`) before running `docker compose config` | — | Resolved (still `allow_failure`) |
| 23 | **`audit:npm` still fails and is deliberately left `allow_failure`.** Locked versions are inside the advisory ranges — `tar 6.2.1` (critical, advisory `<=7.5.20`), `fast-uri 3.1.4`, `browserslist 4.28.2`, `postcss 8.5.15`, `brace-expansion 1.1.16`, `postcss-selector-parser 6.1.4`, `follow-redirects 1.16.0`, `baseline-browser-mapping 2.10.35`, `minimatch 3.1.5/9.0.9/10.2.5`. `npm audit fix` (non-breaking) clears part of them but **not** `tar` or the remaining high findings, which need `npm audit fix --force` — i.e. a **major** upgrade of `tar` (pulled in via `canvas` → `@mapbox/node-pre-gyp`) and of the `minimatch` chain. That was not forced: it re-writes ~3,500 lines of `package-lock.json`, including Jest 30.4→30.5 and typescript-eslint 8.61→8.72, and would still leave the job red. **Schedule it as its own change with a full test run**, not as a CI tweak | Coding agent (follow-up) | Nothing at runtime; the audit is report-only |
| 24 | **Payments hardening P0 is implemented on branch `feat/payments-hardening-p0` (not merged, no MR).** Every payment status write now goes through `PaymentStateMachine.transition` (guarded `updateMany` + immutable `PaymentEvent` in one transaction) for approve/reject/reverse/Chapa failure/init failure/webhook/callback. Chapa verify compares `tx_ref`, `currency` (ETB) and the exact `amount` (decimal, no float tolerance); any mismatch, timeout or unknown reference leaves the payment `PENDING` as an admin-queue exception with a `CHAPA_VERIFY_MISMATCH`/`CHAPA_VERIFY_UNREACHABLE` event, and every Chapa call has a timeout (`CHAPA_TIMEOUT_MS`, default 15000 ms). Plan name/duration are snapshotted on new payments (old rows fall back to the live plan, no backfill). Bank receipts: underpay is a hard reject with expected/received/shortfall; overpay is manual review with the excess recorded on the payment. Approving while a subscription is `ACTIVE` extends from its current `endDate` with UTC end-of-month clamping. `INTEGRATIONS.md` §4.5 documents the `lm-<uuid>` reference and the `amount` vs `charge` comparison | Technical lead (review/merge); deployment engineer for go-live | Go-live: ship with the next release; race tests run in `api:test` (real Postgres) and locally against a disposable DB |
| 25 | **Deploy prerequisite for migration `20261106120000_payments_hardening_p0`.** The migration adds a partial unique index allowing at most one `PENDING` payment per user. It checks existing data first and **fails loudly without modifying or deleting rows** if any user has more than one `PENDING` payment. The read-only check on the local dev database found 2 such users (one with 2 `PENDING` rows, one with 7; 9 in total). **Exact steps to clear duplicate PENDING rows before deploying, on the production/staging database:** 1) Run the read-only SELECT below and save the output. 2) For each affected user, open **Admin → Payments → Pending** (`/admin/payments?status=PENDING`), identify the stale attempt(s) (oldest `createdAt`, no `chapaRef`/`bankReference`, or the failed checkout), and **Reject** them with a reason (e.g. "stale duplicate pending attempt — cleared before unique-index migration"). Rejecting — never deleting — keeps the audit trail and writes the `PAYMENT_REJECTED` ledger event. 3) Re-run the SELECT until it returns zero rows. 4) Only then deploy: `npx prisma migrate deploy`. Read-only SELECT to list the duplicates: `SELECT "userId", COUNT(*) AS pending_count, array_agg("id" ORDER BY "createdAt") AS payment_ids FROM "Payment" WHERE "status" = 'PENDING' GROUP BY "userId" HAVING COUNT(*) > 1 ORDER BY pending_count DESC;` | College rep / deployment engineer | Migration cannot apply until resolved; nothing is auto-deleted |
| 26 | **Late Chapa payments after a closed checkout (migration `20261108120000_payments_late_chapa_recovery`).** A payment Chapa verifies as paid and exact (`tx_ref`, ETB, exact amount) after we closed our row is no longer dropped silently: `EXPIRED → APPROVED` and `CANCELLED → APPROVED` are allowed **only** through the verified gateway paths (webhook, callback, verify endpoint, lazy resolution), record the dedicated `PAYMENT_APPROVED_AFTER_EXPIRY` event with the previous status in `reason`, and run the normal subscription extension, receipt and notification flow. Admin manual approval can never revive a closed row. `REJECTED` and `REVERSED` stay terminal; a late exact payment on either records `CHAPA_LATE_PAYMENT_TERMINAL` (full detail in the event/log) for refund review. The additive migration adds nullable `Payment.recoveredFromStatus`; the admin payment queue shows a "Recovered from expired/cancelled" badge. Race tests on disposable Postgres cover expired-then-paid, cancelled-then-paid, reversed-then-late-webhook, late webhook with a newer PENDING checkout, and duplicate late delivery | Technical lead (review/merge) | Additive only; no backfill, no row rewrite |
| 27 | **Chapa integration aligned with developer.chapa.co (branch `feat/payments-hardening-p0`, not merged).** (1) **Mode:** the verified transaction's `mode` must match the environment when present (`live` in production, `test` elsewhere); a mismatch is a `CHAPA_VERIFY_MISMATCH` (field `mode`) for admin review. Production refuses to boot with a `CHASECK_TEST-…` secret key. (2) **Webhook status codes:** `200` only for durably handled or deterministically ignorable events, `5xx` for transient failures (verify timeout/unreachable, DB error) so Chapa retries (every 10 min, up to 10 attempts over 72 h), `400` for a bad signature/malformed body; idempotency unchanged. (3) **Cancel at Chapa:** lazy expiry and student cancel call `PUT /v1/transaction/cancel/<tx_ref>` first. A confirmed dead link allows the local transition; an already-paid checkout runs the normal verify/approve path; an unreachable/refused gateway changes nothing and returns a retry message. (3b) **Cancel-vs-webhook revival race (caught by the disposable-Postgres race suite, not a flake):** `finalizeApproval` wraps its guarded claim in a bounded retry loop (3 attempts), so if a concurrent student/lazy cancel commits between the in-transaction status read and the claim, the next pass re-reads the row (now `CANCELLED`/`EXPIRED`) and revives it via `PAYMENT_APPROVED_AFTER_EXPIRY` — money Chapa confirms as paid can never be silently dropped by a racing cancel. `confirmAndApprove` now answers `RETRY` (webhook → 5xx, so Chapa redelivers) instead of a false `APPROVED` when the row still cannot be claimed; the browser callback/verify endpoint just reports the current status. Covered by the race test 'student cancel at Chapa vs webhook approval' (16/16, verified over 5 consecutive runs against disposable Postgres). (4) **Retry window:** `CHAPA_RETRY_WINDOW_MINUTES` (default 60, documented as matching the Chapa dashboard) replaces the old 30-minute constant; a younger payment is never abandoned, and an older one is expired only after Chapa confirms the link is dead. (5) **Events:** `charge.refunded` (`refunding`/`refunded`), `charge.reversed` and `charge.failed`/`cancelled` always write a `PaymentEvent`; refund/reversal on an `APPROVED` payment flags an admin exception; no subscription is ever auto-cancelled and failed/cancelled changes no state beyond the event. (6) Both documented signature headers stay supported, with the raw-body HMAC and a clear note that the server-side verify is the real control. (7) **Failed status is non-terminal:** a verify call reporting `failed`/`cancelled` once records `CHAPA_ATTEMPT_FAILED` with the reported status and keeps the payment `PENDING` (Chapa's docs do not define verify between attempts); only a confirmed cancel past the retry window expires it, and a terminal outcome from a later verified call may reject it. (8) **Docs:** the Chapa and bank-receipt lifecycles are consolidated in `docs/deploy/payments.md` with a Mermaid sequence diagram for each; `docs/deploy/chapa-production.md` and `docs/deploy/receipt-verifier.md` are redirect stubs. `INTEGRATIONS.md` §4.3–4.7 documents the dashboard webhook URL, secret hash, retry interval and customer-paid-fee setting | Technical lead (review/merge); deployment engineer for go-live | Set `CHAPA_RETRY_WINDOW_MINUTES` to the dashboard checkout timeout; web and API deploy together; no schema change |
| 28 | **Payments adversarial review F1–F7 implemented on branch `feat/payments-hardening-p0`** (seven commits, one per finding, each regression test proven red before the fix; no MR, nothing pushed, nothing merged). **F3** an exact Chapa payment on a terminal non-revivable row (`REJECTED`/`REVERSED`) is no longer dropped: it stamps `chapaRef`, records `CHAPA_LATE_PAYMENT_TERMINAL`, sets `verification.exception = true` and is listed in the admin queue — `adminPaymentWhere` is a De Morgan disjunction (not a Chapa payment / `chapaRef` set / exception flag / status not an unconfirmed attempt), so no row with verified money can be hidden, and the *Exceptions* tab (`exceptions=true`) lists every exception-flagged payment whatever its status or method. **F1** an admin `reverse()` takes the same `pg_advisory_xact_lock(hashtext('payment-activation'), hashtext(userId))` as `finalizeApproval` before counting other `APPROVED` payments, so a concurrent approval can never land between the count and the subscription cancel. **F2** when Chapa verified an exact payment but the row could not be approved in that pass, `chapa/callback` and `chapa/verify/:txRef` answer `confirmationPending: true` with a message telling the student to wait and **not pay again** (plus `CHAPA_VERIFY_NOT_APPROVED` and the exception flag for the admin queue, and `5xx` on the webhook so Chapa redelivers); the callback page shows a "We have your payment" phase and the profile page polls the same state. **F4** a receipt PDF that fails to write after the approval commits records `RECEIPT_GENERATION_FAILED` and is repaired on demand — regenerated from the payment snapshot on the next download or by the admin *Regenerate* action; both write `RECEIPT_REGENERATED`. **F5** receipt and UI dates render in explicit `Africa/Addis_Ababa` time while entitlement stays a UTC instant; no column-type change and no data rewrite. **F6** a redelivered refund/reversal/failed webhook (Chapa repeats it every ~10 min for 72 h, under either accepted signature header) adds no ledger row and repeats no flag: the dedupe key is tx_ref + event type + Chapa's `reference`/`id`/`event_id`, and both signature headers stay accepted. **F7** `chapa/callback` and `chapa/verify/:txRef` are capped at 10 requests/minute per client like the other gateway entry points, while the webhook is deliberately not capped so a redelivery is never dropped. Verified on the branch: `npx prisma validate` valid; full API jest **42 suites / 609 tests / 590 passed / 0 failed** (19 race tests pending without a real Postgres); the disposable-Postgres race suite **19/19** on three consecutive runs; API and web `tsc --noEmit` clean. Full detail in `docs/deploy/payments.md` §1.6 | Technical lead (review/merge) | Go-live: same release as rows 24–27 |

---

## 7. Acceptance

Sign after the checklist is green and access has been transferred.

| Item | Name | Date | Signature |
|---|---|---|---|
| Code and repository received | | | |
| Documentation received | | | |
| Credentials stored in password manager | | | |
| Server access transferred | | | |
| Backup scheduled and restore drill passed | | | |
| Go/no-go checklist signed | | | |

**College representative:** ______________________________  Date: ____________

**Deployment engineer:** _______________________________  Date: ____________

**Coding agent:** ______________________________________  Date: ____________
