# LOR Mentor — Final Audit Reconciliation, Release Preparation & VPS Handover Report

**Branch:** `integration/anatomy-hardening`
**Date of verification:** 2026-11-01
**Scope:** Phases A–H reconciliation against the current repository, completion of the
previously approved outstanding fixes (two in the first pass, six security items in the
final engineering remediation pass), security re-verification, Docker/VPS readiness review,
and the deployment handover package.
**Nothing in this report was committed, pushed, merged, rebased, or deployed** by the two
passes described here. A later consolidation pass (2026-11-02) committed and pushed a
consolidation branch under a separate lane; see **§L**, which records what changed and which
statements above it supersedes.

**Two passes are recorded here.** Pass 1 (§B.1 rows 30–32, §C.1) covered the two approved
fixes plus one critical defect found during reconciliation. Pass 2 — the *final engineering
remediation* authorised on 2026-11-01 — closed six further items (verifier authentication,
session revocation on password reset, temporary-staff-password exposure, the `verify-email`
DTO, CSRF, and financial-record retention) and is recorded in **§B.2** and **§C.3**. Where a
pass-1 row is superseded, the row itself is updated and marked **[pass 2]**.

---

## A. Executive verdict

> ## CONDITIONALLY READY FOR VPS HANDOFF

The repository is internally consistent, builds, and is documented well enough for the
deployment engineer to configure and deploy the stack on the Hostinger VPS without
rediscovering the architecture. Every outstanding application-code finding from the audit
reconciliation is now closed: the two approved fixes in pass 1, a high-severity privilege
escalation found during that reconciliation, and six further security items in the final
remediation pass — verifier authentication, session revocation on password reset, temporary
password exposure, the `verify-email` DTO, cross-origin request control, and the destruction
of financial history. **Nothing in the application code is knowingly left open.**

It is **not** unconditionally ready, because three conditions must be satisfied by people
other than the code — none of them can be closed by further code changes on this branch:

1. **Anatomy model licensing (BodyParts3D / DBCLS) is unresolved.** The 3D assets must not be
   redistributed until the licence and attribution requirements are confirmed in writing.
   This is a production blocker for the anatomy feature, not for the stack.
2. **A container image build has never been executed in this environment** (deliberate: no
   local Docker builds were run, per the standing constraint on disk space). Every Docker
   statement in this report is *static* verification only. The first build on the VPS is an
   unproven step and is the single largest execution risk.
3. **Credentials that exist in Git history are compromised** and must be rotated before the
   VPS is exposed to the internet. See §E and §I.

One policy decision is also still owed — the financial-record retention rule (§I, decision B)
— but nothing is being destroyed while it is pending, so it does not block the handoff.
**And none of this work is committed:** it lives in the working tree only (§J).

---

## B. Phase A–H reconciliation

### B.0 Important framing correction

**There is no Phase A–H report series in this repository.** Earlier work used a *numbered*
scheme (One–Six), plus one section literally titled "Phase F" and one document titled
"Phase H". No reports exist for Phases A–E or G under those names. Rather than invent
findings to fill an A–H grid, the register below reconciles **every finding that actually
exists in the on-disk reports** and the items raised during this pass. Provenance is stated
per row.

Source documents reconciled:

| Source | Finding namespace |
| --- | --- |
| `docs/audit/AUDIT_REPORT.md` | `B-n`, `DR-n` |
| `docs/audit/findings-auth-rbac.md` | `CC-n` |
| `docs/audit/CLEANUP-REPORT.md` | `C-n` (fixes for `B-n` / `DR-n`) |
| `docs/audit/DATABASE-AUDIT.md` | `D-n`, `B-n` |
| `docs/audit/FRONTEND-AUDIT.md` | prose sections |
| `docs/audit/DEPLOYMENT-READINESS.md` | `DR-n` |
| `docs/audit/PERFORMANCE-RELIABILITY-AUDIT.md` | prose sections |
| `docs/deploy/DOCKER-READINESS.md` | §2.1–2.7, §7 ("Phase F deltas") |
| `docs/audit/PHASE-H-VALIDATION.md` | §4 NOT TESTED |
| `docs/audit/SECRET-ROTATION-RUNBOOK.md` | rotation items |
| This pass (2026-11-01) | `NEW-n` |

Status vocabulary (exactly one per row): **FIXED AND VERIFIED** · **FIXED BUT NOT VERIFIED** ·
**STILL OPEN** · **PARTIALLY RESOLVED** · **BLOCKED BY EXTERNAL ACTION** · **DEFERRED WITH
REASON** · **NO LONGER APPLICABLE**.

### B.1 Register

| # | Source | Finding | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | AUDIT_REPORT B-1 | `deleteInactiveUsers()` failed with FK violations for users owning quiz attempts, posts, payments | FIXED AND VERIFIED | `users.service.ts:266-281` wraps a per-user `cascadeDeleteUser` in one `$transaction`; `users.service.ts:598+` deletes in FK-safe order |
| 2 | AUDIT_REPORT B-2 / CC-8 | Dead code `UsersService.createStaffAccount` | FIXED AND VERIFIED | `grep -rn createStaffAccount apps/api/src` → no matches |
| 3 | AUDIT_REPORT B-3 / CC-4 | `RegisterResponse.verifyToken` referenced a field the API no longer returns | FIXED AND VERIFIED | Type removed; no `verifyToken` in `apps/web/src/lib` types |
| 4 | AUDIT_REPORT B-4 | No audit trail on account activate/deactivate | FIXED AND VERIFIED | `@Audit` decorator on the admin user routes (`common/decorators/audit.decorator.ts`), exercised by `auth.controller.spec.ts` |
| 5 | AUDIT_REPORT B-5 / C-7 | Dead `useAuth().register()` client method | FIXED AND VERIFIED | Not present in the web auth context |
| 6 | AUDIT_REPORT B-6 / D-2 | `AiHistory.courseId` / `materialId` are raw strings without FKs | DEFERRED WITH REASON | `DATABASE-AUDIT.md` §3 D-2; AI history is a log of a generation event, not a relational link; adding FKs requires a data-backfill migration and is out of release scope |
| 7 | AUDIT_REPORT B-7 | Missing hot-path indexes | FIXED AND VERIFIED | Additive indexes added in `C-6`; present in `schema.prisma` and in the migration set |
| 8 | AUDIT_REPORT B-8 / D-3 | `Question` has two optional owners (ambiguous ownership) | DEFERRED WITH REASON | `DATABASE-AUDIT.md` §3 D-3; documented, non-blocking, requires a product decision on question provenance |
| 9 | AUDIT_REPORT B-9 / D-5 | Missing standard columns on some models | DEFERRED WITH REASON | Low; documented in `DATABASE-AUDIT.md` §5 |
| 10 | AUDIT_REPORT B-11 / C-4 | Debug `console.log` in the course update path | FIXED AND VERIFIED | No `console.log` in `courses.service.ts` |
| 11 | DEPLOYMENT-READINESS DR-3 / C-8 | `web` service had no healthcheck | FIXED AND VERIFIED | `docker-compose.prod.yml` web service healthcheck present alongside api/postgres/redis/verifier |
| 12 | DEPLOYMENT-READINESS DR-4 / C-9 | Readiness probe ignored Redis | FIXED AND VERIFIED | `apps/api/src/app.controller.ts:39-44` — `Promise.all([db, this.redisHealth.ping()])`, readiness fails if either is down |
| 13 | findings-auth-rbac CC-1 | `GET /courses` and `GET /courses/:id` are public | NO LONGER APPLICABLE | Deliberate public catalogue. `courses.controller.ts:26` is commented `PUBLIC (published only)`; `courses.service.ts:21-23` filters `isArchived: false, isPublished: true`. Drafts are reachable only via `admin-semester` / `admin`, both `JwtAuthGuard + RolesGuard` |
| 14 | findings-auth-rbac CC-2 | Temporary staff password returned in the response body | **FIXED AND VERIFIED [pass 2]** | No plaintext password is generated, logged or returned anywhere. `users.service.ts:createUser` stores an unusable random hash plus a single-use 48-hour setup token and emails an invitation; the response carries `invitationSent` (and a `setupUrl` fallback only when the mail send failed). Covered by 2 new tests in `users.service.spec.ts` |
| 15 | findings-auth-rbac CC-3 | No DTO validation on the `verify-email` token field | **FIXED AND VERIFIED [pass 2]** | New `apps/api/src/modules/auth/dto/verify-email.dto.ts` (trim → `@IsString`/`@IsNotEmpty`/`@MinLength(16)`/`@MaxLength(256)`), used as `@Body() dto: VerifyEmailDto`. Because a class metatype now exists, the global `ValidationPipe` applies and unexpected fields are rejected rather than ignored. 7 tests in `verify-email.dto.spec.ts` |
| 16 | findings-auth-rbac CC-5 | Redis denylist failed **open** | FIXED AND VERIFIED | `token-denylist.service.ts:47-63` returns `!allow` — fail **closed** by default; `REDIS_FAIL_MODE` validated to `closed\|open` (`env.validation.ts:188-196`); `=closed` in both env templates; dedicated spec "fails OPEN only when REDIS_FAIL_MODE=open is explicit" |
| 17 | findings-auth-rbac CC-6 | `isAllowed()` has no explicit GUEST handling | NO LONGER APPLICABLE [pass 2] | `grep -rn "isAllowed" apps/api/src` matches only `isAllowedImageBuffer` (`common/utils/image-magic-bytes.ts`), an unrelated MIME-sniffing helper. The role helper the report referred to no longer exists; RBAC is now `RolesGuard` + `@Roles()`, which the anatomy/admin specs exercise |
| 18 | findings-auth-rbac CC-7 | No CSRF token mechanism | **FIXED AND VERIFIED [pass 2]** — second layer added | `SameSite=Lax` was never sufficient on its own (it does not stop same-site-but-cross-origin writes, and it depends on browser behaviour). A global `OriginGuard` (`APP_GUARD`, `apps/api/src/common/guards/origin.guard.ts`) now rejects state-changing requests whose `Origin` is present and not allow-listed, with the same label-aware list as CORS. 8 tests in `origin.guard.spec.ts`. A dedicated CSRF token remains deliberately **not** implemented — see §B.2 item E for why it is unnecessary in this topology |
| 19 | findings-auth-rbac CC-9 | `LoginDto.password` lacks `@IsNotEmpty()` / `@MinLength()` | NO LONGER APPLICABLE | `login.dto.ts` uses `@IsString()`, which rejects `undefined` and non-strings under the global `ValidationPipe`; an empty string simply fails the bcrypt comparison. No exploitable path |
| 20 | DOCKER-READINESS §2.1 | Secrets were scoped into every service in the prod compose file | FIXED AND VERIFIED | Only `api` (and `verifier` for its own shared token) receive the sensitive variables; postgres/redis/web no longer inherit the application secret block |
| 21 | DOCKER-READINESS §2.2 | nginx read timeout raced the payment path | FIXED AND VERIFIED | `deploy/nginx/*.conf` — `proxy_read_timeout 180s` |
| 22 | DOCKER-READINESS §2.3 | No log rotation / resource limits | FIXED AND VERIFIED | json-file driver capped `max-size: 10m`, `max-file: "3"`; per-service CPU/memory limits present |
| 23 | DOCKER-READINESS §2.4 | Verifier image ran as root | FIXED AND VERIFIED | `services/receipt-verifier/Dockerfile` creates and switches to a non-root user |
| 24 | DOCKER-READINESS §2.5 | Build context was ~185 MB | FIXED AND VERIFIED | `.dockerignore` excludes `node_modules`, `.next`, `dist`, model assets not needed for the image, and local files |
| 25 | DOCKER-READINESS §2.6 | `.env.production.example` incomplete | FIXED AND VERIFIED | Template now covers every variable the API validator requires, including `REDIS_FAIL_MODE`, `COOKIE_DOMAIN`, `NEXT_PUBLIC_API_URL`; no real credentials present |
| 26 | DOCKER-READINESS §2.7 | Backup script fragility | FIXED AND VERIFIED | `deploy/backup/pg-backup.sh` reads credentials from the environment/`PG*` vars, never from literals; `set -euo pipefail` |
| 27 | PHASE-H §4 | "NOT TESTED" list from Phase H | PARTIALLY RESOLVED | Items 1 and 4 (production URL/config, web build in deployment shape) were re-executed this pass and pass. Items concerning a real container build and a live restore drill remain unexecuted — see §D.4 |
| 28 | SECRET-ROTATION | Credentials in Git history must be treated as compromised | BLOCKED BY EXTERNAL ACTION | See §E. Rotation requires the college's external accounts (Chapa, Resend, Google AI) and VPS access; history rewriting is prohibited by standing instruction |
| 29 | Anatomy licensing | BodyParts3D/DBCLS redistribution terms unconfirmed | BLOCKED BY EXTERNAL ACTION | `THIRD_PARTY_LICENSES.md` / `THIRD_PARTY_NOTICES.md` record attribution; written confirmation of redistribution rights is still owed. **Do not publish the model assets until it is obtained** |
| 30 | **NEW-1** | **Mass-assignment / privilege escalation on `PATCH /users/me/profile`** | **FIXED AND VERIFIED** | The route declares `@Body() body: { fullName?: string }` — a *type-only* annotation. Nest's global `ValidationPipe({whitelist, forbidNonWhitelisted})` only strips/rejects for **DTO classes**; with no class metatype it skips validation, so the raw body reached `prisma.user.update`. A caller could send `{"fullName":"x","role":"SUPER_ADMIN"}` and promote themselves. Fixed with an explicit allow-list in `users.service.ts:updateProfile` (`- data,` → `+ data: update`), covered by `update-profile.spec.ts` (4 tests). It was the only inline-typed `@Body` in the codebase |
| 31 | **NEW-2** | **Approved fix A — `NEXT_PUBLIC_API_URL` empty string bypassed the fallback** | **FIXED AND VERIFIED** | New `apps/web/src/lib/api-base.ts` (`resolveApiOrigin`): empty/unset → dev fallback, production error; non-absolute, non-http(s), path/query/hash-carrying and loopback/private destinations all rejected in production. Enforced at build time (`next.config.ts` → `next build` fails) and at runtime (`/api/proxy` resolves once at module load and answers **503** with a server-side log; the reason is never returned to the client). `ALLOW_LOCAL_API_ORIGIN=1` is a documented local escape hatch. 25 web unit tests |
| 32 | **NEW-3** | **Approved fix B — `COOKIE_DOMAIN` not enforced for the split-host topology** | **FIXED AND VERIFIED** | `env.validation.ts` adds `hostnameOf()` + `cookieDomainCovers()` with **label-boundary** matching (`host === bare \|\| host.endsWith('.' + bare)`) — explicitly *not* a bare `endsWith()`, so `.example.com` cannot be satisfied by `notexample.com`. Three production rules: error when the web/API hosts differ and `COOKIE_DOMAIN` is unset; error when it has fewer than two labels; error when it fails to cover either host. Mirrored in `scripts/check-env.mjs`. 8 new API tests + 4 `check-env.mjs` fixtures |
| 33 | **NEW-4** | Refresh-token replay after rotation | FIXED AND VERIFIED | `auth.controller.ts:112-116` — `assertRefreshTokenActive(jti)` then `revokeRefreshPayload(payload)` before issuing new tokens; covered by `auth.controller.spec.ts` |
| 34 | **NEW-5** | Approved-payment double-processing race | FIXED AND VERIFIED | Atomic claim `tx.payment.updateMany(...)` at `payments.service.ts:1316` and `:1574` inside `$transaction`, with idempotent `alreadyApproved` early returns at `:1295` / `:1374` |
| 35 | **NEW-6** | Password-reset TOCTOU ("new password doesn't work") | FIXED AND VERIFIED | `users.service.ts:133-148` `claimResetToken` is one `updateMany` matching token **and** unexpired, nulling the token and clearing lockout; `result.count === 1` |
| 36 | **NEW-7** | Receipt path traversal from a poisoned row | FIXED AND VERIFIED | `payments.service.ts:1658-1659` — `path.basename(payment.receiptPath) !== payment.receiptPath` rejects any path carrying a separator |
| 37 | **NEW-8** | Verifier auth fails **open** when its shared token is unset | **FIXED AND VERIFIED [pass 2]** | The `if SHARED_TOKEN and ...` short-circuit is gone. `security.load_shared_token()` runs at import time and raises when `VERIFIER_SHARED_TOKEN` is missing, empty or whitespace-only, so the process never serves a request in that state; `security.is_authorized()` then re-checks every `/extract` call with `hmac.compare_digest`. Compose additionally refuses to start the verifier without `RECEIPT_VERIFIER_TOKEN` (`${VAR:?...}`). 18 tests in `test_security.py`, including a subprocess startup-gate test with the extractor package stubbed |
| 38 | **NEW-9** | Receipt-verifier SSRF surface | PARTIALLY RESOLVED [pass 2] | Now `security.validate_receipt_url` (`security.py`), still parsing and allow-listing the bank's host before use; pass 2 added an explicit unknown-bank guard so a bank outside `SUPPORTED_BANKS` returns **400 `UNSUPPORTED_BANK`** instead of a `KeyError`/500. The API aborts the call on a timeout (`receipt-verifier.service.ts:88`). Outbound redirect and response-size limits inside the extractor package remain **not verified** |
| 39 | **NEW-10** | Financial rows destroyed on account deletion | **PARTIALLY RESOLVED — destructive delete prevented [pass 2]** | No approved retention policy exists, so the destructive behaviour was stopped without inventing one. `users.service.ts:deleteUser` now counts `Payment`/`Subscription` rows and throws `ConflictException` ("Deactivate the account instead — financial records must be retained."); `deleteInactiveUsers` pre-queries the candidate ids and retains any account with financial history, returning `{ deleted, retained }`. **No schema change and no data migration.** The policy itself — for how long, and what replaces deactivation — is still a college decision (§I) |
| 40 | **NEW-11** | Password reset does not invalidate existing sessions | **FIXED AND VERIFIED [pass 2]** | `resetPassword` claims the token atomically, then writes a per-user revocation marker (`revoked:user:<id>` = epoch seconds, TTL = refresh TTL + 1 day) through the existing `TokenDenylistService`. `AuthService.assertRefreshTokenActive` rejects any refresh token whose `iat` predates the marker, so tokens minted after the reset keep working while older ones die. Fails closed on Redis errors and on an unparseable marker. 5 tests in `password-reset-sessions.spec.ts` + 9 in `token-denylist.service.spec.ts` |
| 41 | **NEW-12** | Public bank-accounts endpoint | NO LONGER APPLICABLE | `payments.controller.ts:150` `GET /bank-accounts` is public by design, documented in-code as the remediation of audit finding F-12 (account numbers are printed on every bank receipt). No secrets are exposed |
| 42 | **NEW-13** | Material download authorization | FIXED AND VERIFIED | `materials.service.ts:205-232` — academic-year match required unless the caller is ADMIN/SUPER_ADMIN/TEACHER, plus `ensureActiveForStudent` for STUDENTs |
| 43 | **NEW-14** | `/api/proxy` SSRF and cookie forwarding | FIXED AND VERIFIED | Route rejects `..`, `\`, `@` and scheme-bearing segments, asserts `target.origin === API_ORIGIN`, and forwards the `cookie` header so the httpOnly `access_token` reaches the API |

**Totals after pass 2:** 43 register rows — **FIXED AND VERIFIED 31** · NO LONGER APPLICABLE 4 ·
PARTIALLY RESOLVED 3 · **STILL OPEN 0** · DEFERRED WITH REASON 3 · BLOCKED BY EXTERNAL
ACTION 2. (Rows overlap where one source's finding was closed by another's fix; each is
listed once against its primary source.)

Three rows are *not* fully closed and are labelled `PARTIALLY RESOLVED` rather than fixed:
row 27 (container build and restore drill never executed), row 38 (redirect and
response-size limits live inside the third-party extractor package) and row 39 (the delete
is prevented, but the retention policy itself is undecided). Two rows are blocked on people
outside engineering (rows 28, 29). Nothing in the application code is left knowingly open.

### B.2 Final engineering remediation pass (2026-11-01)

Six items were authorised as required fixes, plus one investigation and one policy item.
Each is recorded with what actually changed and how it was verified. **No item below is
marked verified on the strength of code inspection alone**; each names the test that
executed the behaviour.

| Item | Requirement | What was changed | Verified by | Status |
| --- | --- | --- | --- | --- |
| **A** | Verifier `/extract` must not accept unauthenticated calls; must not depend on API-side validation or network isolation | New `services/receipt-verifier/security.py` (`load_shared_token`, `is_authorized`, `validate_receipt_url`, `reference_hint`); `main.py` loads the token at import (raises when missing/blank) and authenticates every `/extract` request with `hmac.compare_digest`; `docker-compose.prod.yml` adds `${RECEIPT_VERIFIER_TOKEN:?...}` | `test_security.py` — 18 tests: missing configured token, empty configured token, whitespace-only configured token, missing presented credential, empty presented credential, incorrect credential, correct credential, non-ASCII credential (must not raise `TypeError`), plus subprocess startup-gate tests proving `main.py` refuses to boot without a token and boots with one. The API→verifier path was re-read end to end: `ReceiptVerifierService` still sends `x-verifier-token` from `RECEIPT_VERIFIER_TOKEN`, and `env.validation.ts` still requires ≥32 chars and a non-placeholder value in production | **FIXED AND VERIFIED** (unit + startup-gate). *Not executed:* a live API→verifier HTTP round trip — needs the running stack |
| **B** | Password reset must revoke existing refresh sessions, using the existing Redis denylist, concurrency-safe, without breaking login/refresh | `TokenDenylistService.revokeUserSessions()` / `isSessionRevoked()` (epoch marker `revoked:user:<id>`); `AuthService.resetPassword` writes the marker only for the account that actually claimed the token; `assertRefreshTokenActive(jti, uid, iat)` checks it before the jti denylist; `auth.controller.ts` passes `sub`/`iat` on refresh; TTL derived from `JWT_REFRESH_EXPIRES_IN` + 1 day | `password-reset-sessions.spec.ts` — 5 tests driving the real `TokenDenylistService` against a fake Redis: the full four-step flow (login → reset → **old refresh rejected** → new password authenticates and its fresh refresh token is accepted), hash re-verified with `bcrypt.compare`, invalid token revokes nothing, another account is unaffected, and the pre-existing jti denylist still works. Plus 9 tests in `token-denylist.service.spec.ts` (marker TTL, before/after/same-second `iat`, no marker, unpositionable token, Redis down → deny, corrupt marker → deny) | **FIXED AND VERIFIED** |
| **C** | Never return or log a plaintext temporary password; prefer a one-time expiring setup flow | `UsersService.createUser` generates an unusable random hash, stores a 32-byte single-use setup token with a 48-hour expiry, and sends a staff invitation email (`MailService.sendStaffInvitation`); the response is `{ user, invitationSent, setupUrl? }` — the link is returned **only** as a fallback when the email could not be sent. Admin UI updated to match | `users.service.spec.ts` — 2 new tests (an invitation is sent and **no password field appears in the result**; the fallback path yields a working setup link and the failure is logged without the secret). `grep -rn temporaryPassword apps/api/src apps/web/src` matches only two negative assertions in that spec — **no production code generates, logs or returns such a field** | **FIXED AND VERIFIED** (unit). *Not executed:* a real delivery through Resend — external service |
| **D** | `verify-email` must use a class-validator DTO under the global pipe conventions, rejecting missing/malformed/unexpected fields | New `dto/verify-email.dto.ts`; `auth.controller.ts` `verifyEmail(@Body() dto: VerifyEmailDto)` → `dto.token`. The class metatype is what makes the global `ValidationPipe` apply at all | `verify-email.dto.spec.ts` — 7 tests run through the **exact pipe configured in `main.ts`**: valid token accepted, missing token rejected, empty/whitespace/non-string/array rejected, too-short and too-long rejected, leading/trailing whitespace trimmed, and unexpected fields (`role`, `isVerified`) rejected with `forbidNonWhitelisted` | **FIXED AND VERIFIED** |
| **E** | CSRF — investigate, implement if needed; `SameSite=Lax` alone is not proof of protection | Investigation: `SameSite=Lax` blocks the classic cross-site form POST, but it is a browser-side control and does nothing for a same-site origin that is not ours. Implementation: global `OriginGuard` (registered as `APP_GUARD` after `ThrottlerGuard`) rejecting state-changing requests whose `Origin` header is present and absent from the allow-list built from `CORS_ORIGIN` + `WEB_PUBLIC_URL` + `API_PUBLIC_URL` | `origin.guard.spec.ts` — 8 tests: `GET`/`HEAD`/`OPTIONS` pass, allow-listed origins pass (including case differences and a trailing slash), a foreign origin is forbidden, a request with **no** `Origin` passes (server-to-server, webhooks, and the web app's `/api/proxy`), an unconfigured allow-list does not brick the API, and a repeated header uses the first value | **FIXED AND VERIFIED** (unit). Compatibility with the frontend was checked by inspection of the proxy route, which forwards no `Origin` header. *Not executed:* a browser-level CSRF probe |
| **3** | Financial retention — implement only if a policy exists; otherwise prevent destructive deletion, preserve integrity, document the outstanding decision | No approved policy exists, so only the destructive path was closed: `deleteUser` refuses when payments/subscriptions exist; `deleteInactiveUsers` retains those accounts and reports `{ deleted, retained }`. Deactivation remains fully available. **No migration, no schema change, no data touched** | `delete-user-retention.spec.ts` — 6 tests: refuses for a user with payments, refuses for a user with a subscription, still deletes a clean account, keeps the self-delete guard, the sweep retains financial accounts and deletes the rest, and the sweep deletes nothing when every candidate is retained | **PARTIALLY RESOLVED — delete prevented and verified; retention policy itself STILL A COLLEGE DECISION** |
| **4** | Re-check the original critical privilege-escalation findings | Re-verified rather than assumed: `updateProfile` still allow-lists; `grep` for inline `@Body` annotations across the API found only `users.controller.ts:151`, which is protected by the service-level allow-list; `RolesGuard`/`@Roles` still gate the admin operations; material access still requires the academic-year match plus an active subscription; payment approval is still an atomic `updateMany` claim inside a transaction | The existing regression specs were re-run as part of the full suite (34 suites / 447 tests). No new defect was found in this area | **FIXED AND VERIFIED — no regression** |
| **CI** | `verifier:test` failing with `ModuleNotFoundError: No module named 'ethiobank_receipts'` | `test_security.py` imported `main.py`, which imports the heavy extractor package that CI deliberately does not install. Root cause fixed by restructuring rather than by installing Selenium/Chromium: the pure helpers moved into `security.py`, which both `main.py` and the tests import. `.gitlab-ci.yml` `before_script` now installs the minimal `requests fastapi`, and `py_compile` covers `normalize.py cbe_links.py security.py main.py`; the same steps were mirrored into `.github/workflows/ci.yml` | `py_compile` of all four modules and all three test files executed in the service venv with only `requests`/`fastapi`/`pydantic` available — **18/18** in `test_security.py`, exit 0. See §B.3 | **FIXED AND LOCALLY VERIFIED** — the CI job itself has not been run (no push authorised) |

### B.3 The CI failure, explained

`verifier:test` failed with `ModuleNotFoundError: No module named 'ethiobank_receipts'`
because `test_security.py` did `from main import ...`, and `main.py` imports
`ethiobank_receipts` at module scope. The original CI comment ("tests import pure helpers
only") was true when written; the test file was added later and quietly invalidated it.

Two adjustments were possible, and the project structure was chosen over the `before_script`:

- **Rejected:** installing `ethiobank-receipts` in CI. It pulls Selenium and a Chromium
  toolchain into a job whose purpose is to check ~400 lines of pure logic, and it is exactly
  the kind of heavyweight, flaky dependency that makes a security job untrustworthy.
- **Chosen:** move every helper the tests need into `security.py` — a module with no
  extractor import — and have both `main.py` and `test_security.py` import from it. The
  `before_script` then only needs
  `pip install requests fastapi` (`uvicorn` was dropped; nothing in the job starts a server).
  The one behaviour that genuinely requires `main.py` — that the process refuses to start
  without a token — is still covered, by a subprocess test that stubs `ethiobank_receipts`
  into a temporary `sys.path` entry.

Result: `python test_security.py` now runs in a dependency-light environment, the startup
gate is covered rather than skipped, and CI needs no Chromium. The same install/compile/test
steps are mirrored in `.github/workflows/ci.yml`, which previously ran only
`test_cbe_links.py`.

---

## C. Files changed

All changes are **uncommitted working-tree changes**. Nothing was staged, committed,
pushed, or merged.

### C.1 Changed by this pass (fixes A, B and NEW-1)

| File | Change |
| --- | --- |
| `apps/web/src/lib/api-base.ts` | **New.** `resolveApiOrigin()` + `isLocalOrPrivateHostname()` — the single source of truth for the API origin (fix A) |
| `apps/web/src/app/api/proxy/[...path]/route.ts` | Resolves the origin once at module load; 503 + server-side log when invalid; import made **relative** so the route is importable by the test runner |
| `apps/web/next.config.ts` | Build-time fail-fast on an invalid `NEXT_PUBLIC_API_URL` |
| `apps/web/src/app/pricing/page.tsx` | Uses the resolved origin instead of reading `process.env` directly |
| `apps/web/e2e-unit/api-origin.spec.ts` | **New.** 24 tests — fallback, production requirements, 11 loopback/private hosts, escape-hatch semantics |
| `apps/web/e2e-unit/proxy-runtime.spec.ts` | **New.** Runtime 503 behaviour with the log spy installed before the module load |
| `apps/web/playwright.unit.config.ts` | **New.** Browser-free config for pure-module tests |
| `apps/web/package.json` | Adds `test:unit` |
| `apps/api/src/config/env.validation.ts` | `hostnameOf()`, `cookieDomainCovers()`, three production `COOKIE_DOMAIN` rules (fix B) |
| `apps/api/src/config/env.validation.spec.ts` | 8 new cookie-domain tests; fixture corrected |
| `apps/api/src/modules/users/users.service.ts` | `updateProfile` allow-list (NEW-1) |
| `apps/api/src/modules/users/update-profile.spec.ts` | **New.** 4 regression tests for the mass-assignment fix |
| `scripts/check-env.mjs` | Mirrors the split-host cookie rules with label-boundary matching |
| `ENVIRONMENT_VARIABLES.md` | The three enforced cookie rules, `ALLOW_LOCAL_API_ORIGIN`, the `NEXT_PUBLIC_API_URL` behaviour table, split-host guidance |
| `.env.example` | Documents strict validation; commented `ALLOW_LOCAL_API_ORIGIN` |
| `README.md` | `npm run test:unit --workspace=apps/web`; the build note with both commands |
| `HANDOVER.md` | Items 6 and 10 closed; item 9 corrected; new rows 12 (credential) and 13 (build requires `NEXT_PUBLIC_API_URL`) |
| `docs/audit/FINAL-HANDOVER-REPORT.md` | **New.** This report |

### C.2 Changed by the final remediation pass (items A–E, 3, CI)

| File | Change |
| --- | --- |
| `services/receipt-verifier/security.py` | **New.** `load_shared_token()`, `is_authorized()`, `validate_receipt_url()`, `reference_hint()`, `ExtractRequest` — extracted so `main.py` and the tests share one implementation, and so the tests no longer import the extractor package |
| `services/receipt-verifier/main.py` | Loads the shared token at import time (**raises** when unset/blank → refuses to boot); authenticates every `/extract` with a constant-time compare; imports the helpers from `security` |
| `services/receipt-verifier/test_security.py` | Rewritten to import from `security`; 18 tests including the subprocess startup-gate tests |
| `services/receipt-verifier/README.md` | Documents fail-closed auth, the module layout, the CI cause, and the test commands |
| `.gitlab-ci.yml` | `verifier:test` `before_script` → `pip install requests fastapi`; `py_compile` covers all four modules; comment corrected to explain the split |
| `.github/workflows/ci.yml` | Same install/compile steps; adds `test_cbe_links.py` and `test_security.py` |
| `docker-compose.prod.yml` | Verifier `VERIFIER_SHARED_TOKEN` uses `${RECEIPT_VERIFIER_TOKEN:?...}` so compose fails fast |
| `apps/api/src/common/redis/token-denylist.service.ts` | `revokeUserSessions()`, `isSessionRevoked()`, `userKey()` |
| `apps/api/src/modules/auth/auth.service.ts` | `parseDurationSeconds()`; revocation TTL from `JWT_REFRESH_EXPIRES_IN`; `assertRefreshTokenActive(jti, userId, iat)`; `resetPassword` revokes sessions after the atomic claim |
| `apps/api/src/modules/auth/auth.controller.ts` | Passes `sub`/`iat` on refresh; `verifyEmail` takes a DTO |
| `apps/api/src/modules/auth/dto/verify-email.dto.ts` | **New.** The DTO that makes the global `ValidationPipe` apply |
| `apps/api/src/common/guards/origin.guard.ts` | **New.** Global origin allow-list for state-changing requests |
| `apps/api/src/app.module.ts` | Registers `OriginGuard` via `APP_GUARD` |
| `apps/api/src/modules/users/users.service.ts` | `createUser` no longer returns a password (invitation + single-use setup token); `deleteUser` refuses to destroy financial history; `deleteInactiveUsers` retains such accounts; `claimResetToken` returns the owner id |
| `apps/api/src/modules/mail/mail.service.ts` | `sendStaffInvitation()` |
| `apps/api/src/modules/users/users.module.ts` | Imports `MailModule` |
| `apps/web/src/app/(app)/admin/users/page.tsx` | Success banner shows the invitation result / fallback setup link instead of a password |
| `ENVIRONMENT_VARIABLES.md` | Verifier token now mandatory on both sides; `CORS_ORIGIN` documented as the state-changing origin allow-list |
| **New specs** | `apps/api/src/modules/users/delete-user-retention.spec.ts` (6), `apps/api/src/common/guards/origin.guard.spec.ts` (8), `apps/api/src/modules/auth/verify-email.dto.spec.ts` (7), `apps/api/src/modules/auth/password-reset-sessions.spec.ts` (5) |
| **Updated specs** | `token-denylist.service.spec.ts` (+9), `users.service.spec.ts` (password assertion replaced with 2 invitation tests; constructor updated), `update-profile.spec.ts` (constructor updated) |

Nothing was deleted, moved or renamed. All pass-1 and pre-existing work is preserved
byte-for-byte apart from the specific edits listed above.

**Lint hygiene:** after the last functional edit, a read-only `npx eslint --no-fix` over the 20
files this pass created or changed reported 27 errors — 22 of them introduced by this pass
(missing final newlines in the new files, Prettier line folding in the new specs, an `any` leak
in the denylist spec, three `require-await` fakes). **All 22 were fixed by hand, file by file,
without ever running `--fix`.** The 5 that remain are pre-existing errors in
`users/users.service.spec.ts` and were deliberately left alone. Full accounting in §D.3.

### C.3 Pre-existing uncommitted changes carried into this handover

The branch already contained modified `.dockerignore`, `.env.example`,
`.env.production.example`, `DEPLOYMENT.md`, `README.md`, both Dockerfiles, `next.config.ts`,
`package.json` (web), the proxy route, the pricing page, `pg-backup.sh`, both nginx configs,
both compose files, `check-env.mjs`, the verifier `.dockerignore`/`Dockerfile`/`requirements.txt`,
`users.service.ts`, `env.validation.ts` (+ spec), and the untracked documentation set
(`HANDOVER.md`, `DATABASE_AND_BACKUPS.md`, `ENVIRONMENT_VARIABLES.md`, `INTEGRATIONS.md`,
`PRODUCTION_CHECKLIST.md`, `THIRD_PARTY_LICENSES.md`, the `docs/audit/*` and `docs/deploy/*`
files). These are preserved byte-for-byte; nothing was reset, stashed or reverted.

---

## D. Test results

### D.1 Executed and passed

| Gate | Command | Result |
| --- | --- | --- |
| API unit/integration suite | `npx jest --silent` (apps/api) | **34 suites / 447 tests passed**, 0 failed, exit 0 (final run 38.8 s; earlier warm-cache run 8.8 s) |
| API e2e suite | `npx jest --config ./test/jest-e2e.json --silent` (apps/api) | **1 suite / 3 tests passed**, exit 0, 21 s |
| API typecheck | `npx tsc --noEmit` | exit 0 |
| Web unit suite | `npm run test:unit` (apps/web) | **25 passed**, exit 0 |
| Web typecheck | `npx tsc --noEmit` | exit 0 |
| Verifier byte-compile | `.venv/Scripts/python.exe -m py_compile normalize.py cbe_links.py security.py main.py` | **exit 0** — the exact CI step, same four files |
| Verifier security tests | `.venv/Scripts/python.exe test_security.py` | **all 18 passed, exit 0** |
| Verifier normalizer tests | `.venv/Scripts/python.exe test_normalize.py`, `test_cbe_links.py` | **all passed, exit 0** each |
| Web production build | `NEXT_PUBLIC_API_URL=https://api.example.com npm run build:web` | **Success — 56/56 pages**, `standalone` output ≈33 MB |
| Env validation script | `node scripts/check-env.mjs` | **exit 1 — `FAIL: .env.production does not exist`.** This is the script's correct fail-fast behaviour with no configured environment; it is *not* a test failure and not a pass. The mirrored split-host cookie rules are covered by the 8 unit tests in `env.validation.spec.ts`, which do run in the suite. A real `check-env` run is the VPS pre-flight (§F.3 step 0) |
| Prisma schema ↔ migrations | directory listing + `schema.prisma` review | 18 migrations; `20261031120000_add_anatomy_faculty_review` **intact** |
| Lint, files created or changed by this pass | read-only `npx eslint --no-fix` on all 20 of them | **Every file created by this pass is clean; the 22 errors this pass had introduced were found and fixed by hand.** The only errors left in a touched file are 5 pre-existing ones in `users/users.service.spec.ts` — see §D.3 |

The API suite logs one expected `TokenDenylistService … Denylist check failed (allowing token)`
line; that is the deliberate `REDIS_FAIL_MODE=open` fail-open spec asserting the escape hatch,
not a failure.

The suite grew from 30/400 (pass 1) to **34/447**: the four new pass-2 spec files (6 + 8 + 7 + 5),
the nine additions to `token-denylist.service.spec.ts`, two to `users.service.spec.ts`, and the
rewritten `test_security.py`. The three `TokenDenylistService` lines above are the fail-open
spec plus the two new fail-closed assertions firing deliberately.

The verifier tests were run with the service's own virtual environment
(`services/receipt-verifier/.venv`, pydantic 2.13.4 / fastapi 0.140.0). The **system** Python on
this machine has no `pydantic`, so `security.py` cannot be imported there. That is expected and
does not affect CI: `security.py` needs only `pydantic`, and the `before_script`'s
`pip install requests fastapi` pulls it in transitively (fastapi requires pydantic). Nothing in
the test path needs the extractor package. The interpreter is stated explicitly because a bare
`python test_security.py` on a machine without pydantic fails with
`ModuleNotFoundError: No module named 'pydantic'` — a missing local dependency, not a code
defect, and the opposite of the failure this pass set out to remove.

### D.2 Executed and failed

None. No gate failed at the end of either pass. Every command in §D.1 that is expected to
succeed exited 0; the one exception is deliberate — `scripts/check-env.mjs` exits 1 when no
`.env.production` exists, which is the intended behaviour of a pre-flight check with nothing to
check.

Failures that occurred **during** the passes and were resolved — recorded for honesty, because
a test that was wrong and a test that was right look identical in a green summary:

1. `env.validation.spec.ts` → *"rejects a cookie domain that does not cover the web host"*
   did not throw — the fixture used hosts the configured cookie domain legitimately covered.
   The **test** was wrong, not the implementation; the fixture was corrected to
   `COOKIE_DOMAIN=.api.lormentor.com` with split hosts. Suite then 29/29, later 30/30.
2. `proxy-runtime.spec.ts` → the `console.error` spy was installed after the dynamic import
   and missed the module-load log. Spy moved before the import. 25/25 after.
3. `verify-email.dto.spec.ts` → `toThrow(/role/)` never matched. Nest's
   `BadRequestException.message` is the generic `"Bad Request Exception"`; the field detail
   lives in the response body. A `rejectionReason()` helper reading `getResponse()` was added,
   and the assertion made specific (`/should not exist/`). 7/7 after.
4. `users.service.ts` typecheck → `TS2322`: `passwordResetToken` is not `@unique`, so it
   cannot be used in `findUnique`. Changed to `findFirst`; `tsc --noEmit` then exit 0.
5. `users.service.ts` typecheck → `TS1117`: my `deleteInactiveUsers` rewrite briefly left both
   a `deleted: removable.length` and the original `deleted: ids.length` in one object literal.
   The stale property was removed.
6. Three jest suites failed once with `UNKNOWN: unknown error, read` from jest's
   `FileCache` on `node_modules` — an environment-level file-cache error, not an assertion.
   An immediate re-run passed 34/34, and the final verification run in this report also
   passed 34/34, so it is reported as a flake and not as a fix.

A local web build **without** `NEXT_PUBLIC_API_URL` now fails by design (`next build` always
runs as `NODE_ENV=production`, so the build is subject to production validation). This is the
intended consequence of fix A, not a defect. Every CI path already sets the variable
(`.github/workflows/ci.yml:66`, `.gitlab-ci.yml:124,182`, `docker-compose.prod.yml:154,161`).

### D.3 Lint debt (measured fresh at the end of pass 2)

| Scope | Errors | Files |
| --- | --- | --- |
| `apps/api/src` | **67** (44 auto-fixable, 0 warnings) | 14 files: `payments/cheki.service.spec.ts` (21), `payments/payments.service.spec.ts` (14), `payments/payments.service.ts` (6), `ai/ai.processor.spec.ts` (5), `users/users.service.spec.ts` (5), `payments/cheki.service.ts` (4), `payments/chapa.service.spec.ts` (3), `payments/dto/verify-receipt.dto.spec.ts` (3), `anatomy/anatomy-review.service.ts` (1), `payments/bank-catalog.ts` (1), `payments/chapa.service.ts` (1), `payments/dto/manage-bank.dto.ts` (1), `payments/payments.controller.ts` (1), `common/utils/bank-account-match.spec.ts` (1) |
| `apps/web` (`src` + `e2e-unit`) | **5** (0 warnings) | `app/(app)/layout.tsx`, `app/admin-login/page.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `components/layout/topbar.tsx` |

**None of these 72 errors was introduced by either pass.** They are overwhelmingly Prettier
line-wrapping and unnecessary type assertions in pre-existing code.

**How this was kept honest.** A read-only `npx eslint --no-fix` over the files pass 2 created
or touched found **27 errors in 10 files**. Twenty-two of them *were* mine — missing final
newlines, Prettier line folding in the new specs, an `any` leak in the denylist spec and three
`require-await` fakes — and all 22 were fixed **by hand**, file by file. No `--fix` was ever
run, and the API `lint` script (which embeds `--fix`) was never invoked. The remaining 5 are
the pre-existing errors in `users/users.service.spec.ts` (lines 237, 241 ×2, 507, 544 — the
course-assignment `where` clause and two `any` assertions), which this pass left alone rather
than reformat other people's code. **Every file this pass created lints clean.**

The API total moved from 65 (pass 1) to 67 because the branch received new commits between the
two measurements, one of which touched `anatomy/anatomy-review.service.ts`; the file list grew
by that file, not by anything in this remediation. The previously reported 6 formatting errors
in the anatomy-review files remain **no longer reproducible** (`HANDOVER.md` item 9).

### D.4 NOT EXECUTED — do not read as a pass

| Not executed | Why | Owed to |
| --- | --- | --- |
| Any `docker build` / `docker compose build` | Deliberate: no local image builds in this environment (disk constraint) | Deployment engineer, on the VPS |
| `docker compose up` and container healthchecks | Same | Deployment engineer, on the VPS |
| `prisma migrate deploy` against a real database | No production-like DB available; running it locally would touch the throwaway `lor_mentor_phaseh` | Deployment engineer, on the VPS |
| Backup **restore** drill | A backup is not "recoverable" until a restore succeeds | Deployment engineer + college, per `docs/deploy/BACKUP-RESTORE.md` |
| Any test against live Chapa / Resend / Google AI | External paid services; test credentials only | College + deployment engineer |
| Browser/device UI testing of the 3D viewer on real hardware | No browser automation for WebGL assets in this environment | Deployment engineer, after first boot |
| Verifier outbound redirect/size limits | Inside the extractor package, outside the reviewed surface | Follow-up |
| Live API→verifier HTTP round trip with the new auth | Needs the running stack; the API-side token send and the verifier-side check were each verified separately | Deployment engineer, on the VPS (step 9 of §H) |
| Real staff-invitation email delivery | External service (Resend) | Deployment engineer, after Resend is live |
| A browser-level CSRF probe against `OriginGuard` | Needs a browser and a deployed origin | Deployment engineer |

### D.5 Anatomy Explorer — what was and was not verified

Verified: the faculty-review flow (approved content can publish, drafts stay hidden, the
urinary system remains unpublished), the Prisma migration is intact, the models are served
from the expected production URL, and nginx serves GLB with the right MIME type, immutable
caching and `gzip model/gltf-binary`.

**Not claimed:** no test in this pass asserts *anatomical correctness*. Canvas/DOM rendering
tests cannot and do not establish that a model is anatomically right — that is faculty review,
not automated testing.

---

## E. Security status

**Overall: no unpatched critical or high-severity defect is known to remain in the
application code, and no medium-severity defect remains open either.** Pass 1 found and fixed
one high-severity defect (NEW-1, privilege escalation via mass assignment). Pass 2 closed the
four medium items that were still open at the end of pass 1 — verifier authentication, session
revocation on password reset, temporary-password exposure and cross-origin writes — plus two
low items, and stopped the destructive financial delete without inventing a retention policy.

### E.1 Closed in pass 2

| Item | Severity | What actually changed |
| --- | --- | --- |
| Verifier `/extract` accepted anonymous calls when its shared token was unset | **High** (was rated Medium) | Two independent fail-closed gates: the process refuses to start without a non-blank `VERIFIER_SHARED_TOKEN`, and every request is compared in constant time. Rating raised because "unset" was the *default* for anyone running the service outside Compose, which made it a real anonymous-invocation path rather than a theoretical one |
| Password reset left stolen refresh tokens working for up to 7 days | Medium | Per-user revocation marker checked against the token's `iat`; fails closed |
| Temporary staff password transited a response body | Medium | No password is generated, returned or logged; a single-use 48-hour setup link is emailed instead |
| No server-side control over cross-origin writes | Medium | Global `OriginGuard` on state-changing methods, layered under `SameSite=Lax` |
| `verify-email` accepted any body containing `token` | Low | DTO + the global `ValidationPipe`, so unexpected fields are now rejected |
| `deleteUser` destroyed payment and subscription history | Medium | Refuses to delete an account with financial records; the sweep retains them |

### E.2 Open

| Item | Severity | Note |
| --- | --- | --- |
| Verifier redirect / response-size limits | Low | Inside the third-party extractor package; not verified here |
| Financial-retention policy undecided | Policy, not code | The destructive path is closed; the college still has to choose the retention period and whether archival replaces deactivation |
| Anatomy licensing | Blocker | Not a code defect — see §I |

Closed in **pass 1**: privilege escalation on `PATCH /users/me/profile` (high),
`NEXT_PUBLIC_API_URL` misconfiguration (medium) and `COOKIE_DOMAIN` enforcement (medium).

### E.3 Credentials — compromised and requiring rotation

A survey across **all 544 tracked files** found that every credential-shaped string is a
placeholder **except one**: the file `aicheck.mjs` at the repository root contains a **real
local development database password**. It is still tracked by Git, and the value is therefore
present in Git history and must be treated as **compromised**. The value is deliberately not
reproduced in this report.

Mitigations already in place: `.dockerignore` excludes the file from every build context, so it
never enters an image.

Action taken: **none** — removing a tracked file changes Git state and history rewriting is
prohibited by standing instruction. Rotation is the correct and sufficient remedy.

### E.4 Credential rotation checklist

Perform **before** the VPS is exposed to the internet. Generate secrets with a CSPRNG
(`openssl rand -base64 48`) and never reuse a value between environments.

**Generated by the team (internal secrets — rotate immediately, no external party needed):**

| # | Credential | Where it lives | Action |
| --- | --- | --- | --- |
| 1 | Local development DB password | `aicheck.mjs`, local `DATABASE_URL` | Treat as compromised. Change the local Postgres role password and update local `.env` only |
| 2 | Production DB password | `.env.production` on the VPS (`POSTGRES_PASSWORD` / `DATABASE_URL`) | Generate fresh; never reuse the dev value |
| 3 | `JWT_ACCESS_SECRET` | `.env.production` | Generate fresh, ≥48 bytes |
| 4 | `JWT_REFRESH_SECRET` | `.env.production` | Generate fresh, **different** from the access secret |
| 5 | `RECEIPT_VERIFIER_TOKEN` | `.env.production` + verifier service | Generate fresh; also set `VERIFIER_SHARED_TOKEN` in the verifier container |
| 6 | Super-admin initial password | Seeded account | Generate fresh; force a change at first login |

**Rotated by the external account owner (college / provider admin console — the team cannot
rotate these):**

| # | Credential | Owner console | Note |
| --- | --- | --- | --- |
| 7 | Chapa secret key (test and production) | Chapa dashboard | Separate values per environment |
| 8 | Resend API key | Resend dashboard | Domain must stay verified |
| 9 | Google AI / Gemini API key | Google AI Studio | Restrict to the server's egress if the console allows it |
| 10 | VPS SSH access material | Hostinger hPanel | Not a repository secret; confirm key-only login and no stale keys |

A fuller procedure exists in `docs/audit/SECRET-ROTATION-RUNBOOK.md`. **No credential value
appears in this report, in any commit message, or in terminal output.**

### E.5 Other security posture confirmed

- Verifier `/extract` authenticated on every request, fail-closed at startup, constant-time
  comparison, token never logged or echoed.
- Password reset revokes every refresh token issued before it, via the Redis denylist.
- Cross-origin state-changing requests rejected by a global `OriginGuard` (second layer under
  `SameSite=Lax`); `GET`/`HEAD`/`OPTIONS` and `Origin`-less server-to-server calls unaffected.
- No plaintext staff password is created, returned or logged at any point.
- `verify-email`, like every other body, passes through the global `ValidationPipe` with
  `whitelist` + `forbidNonWhitelisted`.
- Accounts holding payment or subscription history cannot be hard-deleted or swept.
- Split-host cookie scoping enforced with label-boundary matching.
- Refresh-token rotation with replay denial via the Redis denylist, fail-closed by default.
- Per-IP and per-account throttling on all auth routes (5/10/5/3/5/3 per minute) plus
  `UserThrottlerGuard` on tutor and anatomy controllers.
- Atomic, idempotent payment approval inside a transaction.
- Receipt file serving guarded against traversal from a poisoned row.
- `/api/proxy` hardened against SSRF and asserted same-origin.
- Material downloads require an academic-year match plus an active subscription.
- `AuditLog` retains the actor when a user row is deleted (`ON DELETE SET NULL`).

---

## F. Docker / VPS readiness (static verification only)

**No image build was executed.** Everything below is static inspection of the compose files,
Dockerfiles, nginx configs and scripts. Treat the first build on the VPS as an unproven step.

### F.1 Confirmed statically

| Area | Finding |
| --- | --- |
| Services | `postgres`, `redis`, `verifier`, `api`, `web` — five, each with a healthcheck, `restart: unless-stopped` and `security_opt: no-new-privileges:true` |
| Exposure | Only `api` and `web` publish ports, and both bind `127.0.0.1` — nginx terminates public traffic |
| Networks | A single internal network; postgres/redis/verifier are not reachable from outside the stack |
| Volumes | `pgdata` → `/var/lib/postgresql/data`, `redisdata` → `/data`, `uploads` → `/app/apps/api/uploads` (uploaded receipts and materials survive redeploys) |
| Logging | json-file driver, `max-size: 10m`, `max-file: "3"` on every service |
| Images | Base images are **digest-pinned** for reproducibility |
| Startup order | `depends_on` with `condition: service_healthy` for postgres/redis before api; api before web |
| Migrations | The api image entrypoint runs `prisma migrate deploy` — never `migrate dev`. The Dockerfile deliberately does not prune the Prisma CLI |
| Non-root | api, web and verifier run as non-root users |
| nginx | GLB served with correct MIME and immutable caching; `client_max_body_size 30m`; `proxy_read_timeout 180s`; `gzip` includes `model/gltf-binary` |

### F.2 Completions and risk notes

- **First build is the top execution risk.** The compose file does not use BuildKit-only
  features, so `docker compose build` on a standard Docker Engine should succeed — but this is
  a prediction, not a result.
- Disk: the images are large (api and web carry `node_modules` and the web `standalone`
  bundle). Confirm free space on the VPS before building; `docker system prune` afterwards is
  the deployment engineer's call.
- `NEXT_PUBLIC_API_URL` is passed both as a **build arg** and as a **runtime env**; both must
  be set (see the checklist).
- Postgres data lives in a named volume, so `docker compose down` without `-v` is safe;
  `down -v` **destroys** the database.
- A container build, migrate, boot and restore drill are **unexecuted** (see §D.4).

### F.3 First build and first boot commands

Run from the repository root on the VPS, as the deploy user, with `.env.production` populated:

```bash
# 0. Pre-flight: the configuration must pass validation before anything is built
cp .env.production.example .env.production    # then fill in real values
node scripts/check-env.mjs                    # must pass
# RECEIPT_VERIFIER_TOKEN must be non-empty: the verifier container now refuses
# to start without it, and compose refuses to create it (${VAR:?...}).
openssl rand -hex 32                          # paste into RECEIPT_VERIFIER_TOKEN

# 1. First build (no cache, so nothing stale is reused)
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache

# 2. First boot (detached)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 3. Confirm every service is healthy and the migrations actually ran
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api   # expect "migrate deploy" output
curl -fsS http://127.0.0.1:4000/api/v1/health/ready             # expect ready + db + redis

# 4. Seed the initial data (super admin, colleges, academic years)
docker compose -f docker-compose.prod.yml exec api npm run db:seed
```

After the first successful boot, subsequent releases may use
`docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.
`DEPLOYMENT.md` §"First deployment" and `docs/deploy/GO-LIVE.md` carry the fuller runbook.

---

## G. College responsibilities

Code cannot discharge these; they are prerequisites for a production launch.

1. **Anatomy asset licensing.** Obtain written confirmation from the rights holder (BodyParts3D
   / DBCLS) of the redistribution, attribution and derivative-work terms for the 3D models,
   then record the outcome in `THIRD_PARTY_LICENSES.md`. **Until then the models must not be
   published to the public internet.** If the terms are unacceptable, the alternative is to
   commission or licence replacement assets.
2. **Rotate the externally-owned credentials** (Chapa test and production, Resend, Google AI)
   and issue the new values to the deployment engineer through a secure channel — never by
   email or chat.
3. **Chapa production onboarding**: confirm the merchant account is live and supply the
   production secret key plus the webhook/return URLs for the real domain.
4. **Resend domain verification**: confirm SPF/DKIM records for the sending domain so
   verification and reset emails are deliverable.
5. **Provide the real values** for the organisation-specific variables: `COMPANY_*` bank
   details, `COOKIE_DOMAIN`, `WEB_PUBLIC_URL`, `API_PUBLIC_URL`, `CORS_ORIGIN`, and the
   accepted-bank list.
6. **Content readiness**: decide which courses, materials and anatomy systems are published at
   launch. Drafts are hidden automatically (`isPublished: false`), and the urinary system must
   stay unpublished until its review completes.
7. **Approve the financial-retention policy** for user deletion (§I, decision B). No financial
   record can be destroyed while the decision is pending — the delete is refused and the
   inactive-account sweep retains such accounts — so this is a policy question, not an outage
   risk. The college must decide the retention period and whether archival replaces
   deactivation; a full implementation would need a migration.
8. **Own the backup regime**: confirm the schedule, the off-site destination, and perform a
   restore drill before go-live. A backup that has never been restored is not proven.
9. **Provide the initial super-admin identity** and the process for handing the account to the
   responsible administrator.

---

## H. Deployment engineer instructions

Full procedures live in `DEPLOYMENT.md`, `PRODUCTION_CHECKLIST.md`,
`docs/deploy/SERVER-PREREQUISITES.md`, `docs/deploy/NGINX-SETUP.md`,
`docs/deploy/BACKUP-RESTORE.md` and `docs/audit/LOCAL-DEV-RUNBOOK.md`. Summary of the path:

1. **Server prerequisites** — install Docker Engine + Compose v2, nginx, certbot, git and
   Node 20+ (for `scripts/check-env.mjs`). Follow
   `docs/deploy/SERVER-PREREQUISITES.md`; do not skip the firewall step.
2. **Clone the repository** to the deployment path and check out the intended branch. `main`
   is protected on GitLab — deploy from the reviewed branch or a tagged release, never by
   force-pushing.
3. **Create `.env.production`** from `.env.production.example`. Every variable the API requires
   is documented in `ENVIRONMENT_VARIABLES.md`; the API validates them at boot and refuses to
   start on an invalid set. Three configuration traps to get right:
   - `NEXT_PUBLIC_API_URL` must be the bare public API origin (`https://api.<domain>`) — no
     trailing path, no `localhost`, and it is needed at **both** build and run time;
   - on a split host (`<domain>` + `api.<domain>`) `COOKIE_DOMAIN` **must** be the shared
     parent (`.example.com`), or browsers will never send the session cookie to the web host;
   - `REDIS_FAIL_MODE` must stay `closed`.
4. **Validate before building**: `node scripts/check-env.mjs`.
5. **Build and boot** with the commands in §F.3. This is the first time the images are ever
   built — watch the output; do not assume success.
6. **Confirm health**: all five services healthy, `api` logs showing migrations applied,
   `/api/v1/health/ready` reporting database and Redis reachable. This endpoint is the
   readiness gate — a container that is "up" is not necessarily ready.
7. **Seed** the initial data, then create or confirm the super-admin account and change its
   password.
8. **nginx + TLS**: apply `deploy/nginx/lor-mentor.conf` (staging:
   `lor-mentor-staging.conf`), obtain certificates with certbot, and verify the GLB route
   returns the correct MIME type. `docs/deploy/NGINX-SETUP.md` has the exact steps.
9. **Verify the application end-to-end** in a browser: registration, email verification (if
   Resend is live), login for each role, course and material access, the payment and receipt
   upload flow, and the 3D viewer loading its models from the production URL. Three behaviours
   changed in this pass and are worth confirming on the live stack:
   - submit a receipt for verification and confirm the **API→verifier** call succeeds (a 401
     there means `RECEIPT_VERIFIER_TOKEN` and `VERIFIER_SHARED_TOKEN` disagree);
   - reset a password in one browser while signed in in another, then confirm the second
     session is rejected on refresh and the new password works;
   - create a staff account from `/admin/users` and confirm an invitation email arrives with
     a working set-password link, and that no password is displayed on screen.
10. **Install the backup cron** from `deploy/backup/pg-backup.sh`, confirm a backup file is
    produced, and perform a restore drill into a scratch database before go-live.
11. **Do not** run `prisma migrate dev` anywhere near production. Production uses
    `prisma migrate deploy`, which the api entrypoint already runs. **Never** run
    `docker compose down -v` — it destroys the Postgres volume.
12. **Report back** with: build output, `docker compose ps`, the migration log lines, the
    readiness response, and the results of the end-to-end checks in step 9.

---

## I. Remaining blockers

### Critical (must be closed before public launch)

| # | Blocker | Owner | Status |
| --- | --- | --- | --- |
| 1 | BodyParts3D/DBCLS redistribution terms unconfirmed | College | BLOCKED BY EXTERNAL ACTION |
| 2 | Credentials in Git history are compromised; rotation not yet performed | College + engineer | BLOCKED BY EXTERNAL ACTION |

### High

| # | Blocker | Owner | Status |
| --- | --- | --- | --- |
| 3 | No container image has ever been built; the first build is unproven | Deployment engineer (VPS) | NOT EXECUTED |
| 4 | No backup restore drill has succeeded; backups are unproven | Deployment engineer + college | NOT EXECUTED |
| 5 | End-to-end application verification against live services (Chapa, Resend) | Deployment engineer | NOT EXECUTED |

### Non-blocking (should be scheduled)

| # | Item | Register row |
| --- | --- | --- |
| 6 | Verifier redirect/response-size limits unverified (third-party package) | 38 |
| 7 | 72 pre-existing lint errors (67 API / 5 web), none introduced by this work | §D.3 |
| 8 | Verifier auth token must be rotated *together with* `RECEIPT_VERIFIER_TOKEN`; a mismatch makes the API's receipt checks fail with 401 | §E.4 #5 |

Items that were on this list at the end of pass 1 — verifier fail-open, financial rows,
password-reset sessions, temporary staff password, `verify-email` DTO, `isAllowed()` — are
now closed; see §B.2.

### Decisions still needed (not taken unilaterally)

| # | Decision | Why it needs you | Current state |
| --- | --- | --- | --- |
| A | Whether to remove `aicheck.mjs` from Git tracking | Changes Git state; history stays compromised either way, so rotation is the real fix | Unchanged — file untouched |
| B | **Financial-retention policy for deleted accounts** | Product/legal policy: how long payment and subscription records must be kept, and what replaces hard deletion | **Partially implemented without a policy**: the destructive delete is now blocked and the sweep retains such accounts, so no financial history can be lost while the decision is pending. A full implementation (archival, anonymisation, or a retention window) still needs both the policy and a migration |
| C | ~~Whether to revoke sessions on password reset~~ | — | **Done** (item B, §B.2). It changes user-visible behaviour: everyone signed in on an old refresh token is signed out by a reset. This is the intended security outcome, but it is your call to reverse |
| D | ~~Whether to make the verifier fail closed~~ | — | **Done** (item A, §B.2). Local development now **requires** `VERIFIER_SHARED_TOKEN` to be set before the verifier will start; set the same value in `apps/api/.env` |
| E | Publish or defer the anatomy feature pending licensing | Business/legal call | Unchanged — still the top launch blocker |
| F | Whether to add a real CSRF token as well as `OriginGuard` | Only matters if the topology ever needs `SameSite=None` or a cross-origin frontend | Not implemented; `OriginGuard` + `SameSite=Lax` is the current posture |

### Explicitly out of scope / requires your authorisation

- Committing, pushing, merging or changing branches (`main` is protected on GitLab).
- Rewriting Git history.
- Dropping the throwaway database `lor_mentor_phaseh` or any other destructive DB operation.
- Deploying to production or modifying external production infrastructure.
- Rotating externally-owned credentials.

---

## J. Final Git status

**Branch:** `integration/anatomy-hardening`
**HEAD:** `3d4c315 docs: record admin reviewer-access verification`
**Tracking:** `origin/integration/anatomy-hardening` — **in sync** (`git rev-list --left-right
--count` → `0 0`). No fetch, pull, push, merge or rebase was performed in either pass; this
reflects the remote-tracking ref as of the last fetch, not a fresh query of the server.

> **Correction to pass 1:** the earlier version of this section reported "ahead 7, behind 1"
> with `5fdfba6` as the tip. The reflog explains why that is no longer true: at
> **12:38–12:41 on 2026-11-01** the branch history changed — an aborted rebase
> (`12:37:45`), then `git pull origin integration/anatomy-hardening --rebase`
> (`12:38:19`–`12:38:21`), then further rebase picks finishing at `12:41:52`. The seven local
> commits were replayed on top of the pulled remote commits and the tip moved from `5fdfba6`
> to `3d4c315`. **Neither pass of this work ran any of those commands** — they were performed
> outside it — and no part of the remediation was involved. The figures below were re-measured
> rather than carried forward, because the pass-1 reading was taken before that pull.
>
> **A stash entry exists and must not be dropped casually.** `git stash list` shows
> `stash@{0}` — *WIP on integration/anatomy-hardening: 5d1afd7*, created **2026-11-01
> 12:27:04 +0300**, containing 23 files that correspond to the pass-1 change set (the
> `.dockerignore`/env/Dockerfile/compose/nginx/proxy work). It predates every edit in this
> remediation, **was not created, applied, modified or dropped by either pass**, and the
> working tree already contains that work plus the pass-2 changes. It is recorded here so that
> whoever commits this branch knows it is there and reviews it rather than assuming it is
> disposable.

**No commit was created, nothing was staged, and the working tree was never reset, cleaned,
stashed or reverted.** An accidental `npm run lint --workspace=apps/api` early in pass 1
(unintended: the script embeds `--fix`) crashed on exit 134 before writing anything;
`git status --porcelain` was compared against the session-start snapshot immediately after and
was byte-identical, and `git status --porcelain apps/api/src/modules/anatomy/` was empty — no
file was modified. Read-only `npx eslint` was used for all lint measurement thereafter.

**Remotes:**

| Remote | URL |
| --- | --- |
| `origin` | `https://gitlab.com/bereketadamsseged/lor-mentor-edu.git` |
| `github-old` | `https://github.com/Bereket18/lor-mentor.git` |

**Most recent commits (unchanged by either pass — none of these is mine):**

```text
3d4c315 docs: record admin reviewer-access verification
ff923ca feat(api,web): let admins manage anatomy reviewer access
d4ecc8d fix(ci): update verifier job and remove entrypoint from nginx-syntax
728d143 docs: record all-teacher reviewer policy and local verification
37651b9 feat(web): show anatomy attribution, audit area filter and notification links
```

**Working tree at the end of pass 2:** **63 status entries — 37 modified tracked files and 26
untracked files/directories.** The repository tracks **546** files.

Of the 37 modified files, **36 were already modified before pass 2 began** and pass 2 changed
the contents of the subset listed in §C.2. Exactly one file entered the modified state during
pass 2: `services/receipt-verifier/README.md`, updated by this pass to document the new
fail-closed authentication, the module split and the test commands. **No file was deleted,
renamed or moved.** (Pass 1's count of "42 entries / 544 tracked files" was also re-measured
and corrected here.)

The untracked files added by pass 2 are `services/receipt-verifier/security.py`,
`apps/api/src/common/guards/origin.guard.ts` (+ spec),
`apps/api/src/modules/auth/dto/verify-email.dto.ts` (+ spec) and
`apps/api/src/modules/auth/password-reset-sessions.spec.ts`. All pre-existing untracked work —
including the anatomy feature, the migration `20261031120000_add_anatomy_faculty_review`, the
model assets and the audit/deploy docs — is preserved exactly as found.

### J.1 Change-control statement

| Constraint | Status |
| --- | --- |
| `git reset` / `git clean` / `git stash` / `git checkout --` / revert | **Not run** |
| Deletion of any untracked file | **Not done** |
| `git rebase` / `git merge` / `git pull` / `git switch` / branch change | **Not run by either pass** — the rebase and `pull --rebase` visible in the reflog at 12:37–12:41 were performed outside this work |
| `git stash` (create / pop / apply / drop) | **Not run by either pass** — `stash@{0}` predates the remediation and is untouched |
| `git add` / staging of any file | **Not run** — index untouched (`git diff --cached` is empty) |
| `git commit` / `git push` | **Not run** |
| Deployment, `docker build`, `docker compose up` | **Not run** |
| Database drop/reset, destructive DB operation | **Not run** — the throwaway `lor_mentor_phaseh` database was not touched |
| External credential rotation | **Not done** — requires the account owners |
| Force-push / history rewrite | **Not run** |
| Modification of unrelated functionality | **None** — the changes are confined to the six authorised items plus their tests and docs |

Every entry was re-checked against `git status` / `git log` / `git reflog` immediately before
this report was written. The only commands executed against the repository were read-only
(`git status`, `git log`, `git reflog`, `git stash list`, `git diff --cached`, `grep`, `ls`)
plus test/typecheck/build commands that write only to `node_modules`, `.next` and `dist`.

**Reminder for whoever deploys:** `main` is protected on GitLab. Confirm the correct branch or
tag with the technical lead before deploying — **and note that neither pass has committed
anything.** All of the security remediation described in this report exists only in the
working tree; it will not reach the VPS until someone reviews and commits it. That commit
requires your explicit approval and has not been made.

---

## K. Final recommendation

**Proceed to VPS handoff in a controlled first deployment, with the licensing and credential
blockers cleared first.**

The engineering work is done and is in the strongest state this branch has been in. After the
final remediation pass: **493 automated tests pass** (447 API unit/integration + 3 API e2e +
25 web + 18 verifier security), typechecking is clean on both apps, the production build
succeeds, the phase-report findings have been reconciled item by item against the source
rather than taken on trust, and **not one application-code finding is knowingly left open** —
31 of 43 register rows are fixed and verified, 4 are no longer applicable, 3 are partially
resolved with the remainder named and owned, and 2 are blocked on people rather than code.

The remediation closed, in order of severity: verifier `/extract` failing open (the most
serious of the pass), refresh sessions surviving a password reset, no server-side control over
cross-origin writes, plaintext staff passwords transiting a response body, the unvalidated
`verify-email` body, and the destruction of financial history on account deletion. It also
fixed the `verifier:test` `ModuleNotFoundError` in the CI definition by restructuring the
service rather than by installing a Chromium toolchain into a unit-test job.

Recommended sequence:

1. **Now:** the college confirms the anatomy licensing position and begins credential rotation.
   Neither is a code task; the licensing answer determines whether the 3D feature ships at
   launch. The one policy decision still owed is the **financial-retention rule** — nothing is
   being destroyed in the meantime, so it is not urgent.
2. **Then:** the deployment engineer performs the first build, boot, migration and readiness
   check on the VPS — the first real execution of the Docker path, and the highest-risk
   remaining step. Report the output back before proceeding.
3. **Then:** nginx + TLS, seed data, super-admin handover, and the end-to-end application
   checks including the three changed behaviours listed in §H step 9, a live payment attempt
   and a backup restore drill.
4. **Finally:** a limited go-live, with the anatomy feature published only once licensing is
   confirmed in writing.

Two things to keep in mind before the branch is committed: **nothing in this report or in the
working tree has been staged or committed**, so the security work described here exists only
locally; and the branch currently reports as **in sync** with
`origin/integration/anatomy-hardening` as of the last fetch, which means the remote does not
contain it either. The deployment engineer must be told explicitly which branch or tag to
deploy - and that tag must be cut *after* this work is reviewed and committed, or the VPS
will run the unremediated code.

---

## L. Release consolidation verification - 2026-11-02

This section supersedes the parts of this report that are now out of date. It covers a
separate lane: consolidating `integration/anatomy-hardening` into `main` through
`release/consolidation`.

### L.1 What this pass did

| Commit | Change |
| --- | --- |
| `c5140d2` | removed conflict markers committed in `9bb4ddf`; restored three web files to `origin/integration/anatomy-hardening`; single `workflow:` block; honest `audit:npm`; nginx `image:` mapping |
| `db792d5` | `aicheck.mjs` reads `DATABASE_URL` from the environment instead of a hardcoded local DB credential |
| `6fa4c76` | removed the duplicate `VERIFIER_SHARED_TOKEN` key that defeated the `:?` fail-closed guard |
| `686689b` | `api:e2e` gets Postgres/Redis services and runs `prisma migrate deploy` |
| `f59ccde` | new `prisma:validate`, `api:typecheck`, `web:typecheck`, `web:unit` jobs |
| `0aec411` | verifier test dependencies pinned (`requests==2.34.2`, `fastapi==0.140.0`) |
| `0eb75b8` | Trivy uses the pinned official `aquasec/trivy:0.76.1` image |

### L.2 Statements above that this supersedes

- **§E.3 / §E.4 row 1** said "Action taken: none" for the `aicheck.mjs` credential. The
  hardcoded value is now removed from the tree (`db792d5`) and the script fails closed when
  `DATABASE_URL` is unset. The value remains in history (`f6f98ac`) and history rewriting is
  prohibited, so **rotation of that local Postgres password is still the owner's action**.
- **§J** described `integration/anatomy-hardening` at `3d4c315` with nothing committed. The
  consolidation branch is `release/consolidation`; local HEAD is `0eb75b8`; working tree was
  clean at verification time. It is 25+ commits ahead of `origin/main` and 0 behind.
- **§F** compose readiness: `docker-compose.prod.yml` had a duplicate key introduced by
  `c20d228` that made `docker compose config` fail outright. `6fa4c76` removes it. Prod and
  the prod+staging overlay now both pass `docker compose config` with the example env file.
  The staging file is an overlay only; it is expected to fail when used without prod.

### L.3 Executed locally (pass)

| Check | Result |
| --- | --- |
| `npm ci` | 1767 packages |
| `prisma validate` / `generate` | pass |
| New migration `20261031120000_add_anatomy_faculty_review` | additive only: `ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`, FK; no `DROP`, no column `ALTER` |
| API `nest build`, `tsc --noEmit` | pass |
| API Jest | 34 suites, 452 tests pass |
| API e2e | 3/3 pass |
| Web `tsc --noEmit`, `eslint .` | pass, no findings |
| Web unit (Playwright, no browser) | 25/25 pass |
| Web production build | pass |
| Anatomy model validators | heart and urinary pass; orientation check 42 pairs / 4 GLBs |
| Verifier `py_compile` + 32 tests | pass on Python 3.14 and 3.11 |
| `docker compose config` | prod and prod+staging overlay pass |
| Dependency audits (prod) | API 5 (2 moderate, 3 high); web 12 (5 moderate, 6 high, 1 critical); every high/critical is transitive and matches §B/D triage |

### L.4 Still unproven

- Docker daemon was unavailable. No image build, container start, `nginx -t`, or HTTPS smoke
  test was run, so §F remains static verification plus the compose parse above.
- Python 3.12 could not be executed locally (broken launcher path); the verifier suite was
  proven on 3.14 and 3.11 only. The CI job pins 3.12 and is the first real run of that
  interpreter.
- The GitLab pipeline for `release/consolidation` has not run; no pipeline ID or SHA-based
  result exists. Every CI change in §L.1 is validated by local execution and semantic YAML
  assertions, not by a pipeline.

### L.5 Anatomy claim adjudication

| # | Claim | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Schema migration is safe | PASS | additive migration above |
| 2 | Review/publish routes are authenticated and role-gated | PASS | `anatomy-review.controller.ts`: `JwtAuthGuard` + `RolesGuard` + `AnatomyReviewerGuard` + `@Roles('TEACHER')`; lab routes `@Roles('STUDENT','TEACHER')`; audit + notification writes in `anatomy-review.service.ts` |
| 3 | Draft systems are not published | PASS | heart is the only `isPublished: true`; the other 17, including urinary, are `false`; `seed-anatomy.ts` is create-only and `--system` scoped; `publish-anatomy.ts` refuses without mapping doc, teaching text and review |
| 4 | Admin accounts cannot use the lab | PASS (with precision) | the API returns 403 via the role guard; the web app redirects admins rather than rendering the page — `route-access.ts` `isAllowed()` returns false for `/anatomy` |
| 5 | Faculty review precedes publication | PASS, with caveat | publish requires `isReviewed` on every structure plus teaching text; revision, audit and notification rows are written; there is no separately recorded sign-off, and one reviewer can bulk-review then publish |
| 6 | Content is labelled as AI-drafted / not textbook-sourced | PARTIAL | the UI shows "Pending faculty review" (`anatomy-detail-panel.tsx`); the "AI-drafted ... not copied from any textbook" wording exists only in `docs/anatomy/drafts/urinary-teaching-draft.md` — there is no user-facing textbook-sourcing claim |
| 7 | Licensing wording is accurate | PASS, unchanged | the attribution UI says CC BY 4.0; docs record the legacy CC BY-SA 2.1 Japan source headers and the pending DBCLS clarification |
| 8 | Financial retention protection exists in HEAD | PASS | `users.service.ts` delete guards and bulk sweep; `delete-user-retention.spec.ts` |

### L.6 Reviewer policy - decision owed

Any TEACHER account is automatically flagged `isAnatomyReviewer` on creation and on role
change (`users.service.ts`), and `anatomy-reviewer.ts --all-teachers` backfills older accounts.
A flagged reviewer can both review and publish. If that is wider than intended, the options are:
flag reviewers explicitly by name only, require reviewer plus a recorded second sign-off, or
restrict publish to ADMIN while keeping teacher review. No policy change was made.

### L.7 Residual security note

`docs/test-report.md:97` contains a one-use 64-hex email-verification token from a local test
run (24h expiry by design). It was treated as a test artifact, not a deployment credential, and
was not modified by this pass.
