# LOR MENTOR — SECURITY AUDIT

**Phase:** Four — Security
**Date:** 2026-10-17
**Pass:** static (file-read). No penetration test, dependency scan, or live probe was executed — `npm audit`, `curl`, and the smoke test were **NOT run** (see `INITIAL-BASELINE.md` R2.1).
**Secrets:** this document contains **no secret values**. Live credentials in `apps/api/.env` / `.env.production` were deliberately **not read** this pass.

## 1. Authentication

| Control | Implementation | Verdict |
|---|---|---|
| Password storage | bcrypt, cost 12 | Good |
| Session transport | JWT in `httpOnly` cookies (`access_token` 15m, `refresh_token` 7d); `secure` in prod; `sameSite: lax` | Good |
| Token forgery prevention | `jwt.strategy.ts` throws at construction if `JWT_ACCESS_SECRET` missing — **no empty-key fallback** | Good |
| Access vs refresh secrets | Separate secrets; production requires ≥32 chars, differing, non-placeholder (`env.validation.ts`) | Good |
| Refresh rotation | `refresh` verifies → checks denylist → **burns the presented `jti`** → reissues; reuse of a rotated token is rejected | Good |
| Logout | Server-side revoke of the refresh `jti` (Redis denylist), not just cookie clear | Good |
| Brute-force lockout | 5 failures → 15-minute lock; counter resets on success; each failure logged to `AuditLog` with IP | Good |
| Email verification | Login blocked until verified; verify token random 32 bytes, 24h expiry; register rolls back if email send fails | Good |
| Password reset | 32-byte token, 1h expiry, **atomic single-statement claim** (fixes the old TOCTOU bug) | Good |

### S-1 — Redis denylist fails **closed** (posture fixed, outage drill PASSED 2026-10-19)
Originally `TokenDenylistService.isDenied` caught Redis errors and returned `false` (allow), so an unreachable Redis silently weakened token revocation. That is now fixed:
- The service defaults to **fail-closed**: on a Redis error it logs the failure and returns `true` (deny), so a refresh token cannot be rotated or refreshed while its revocation state is unprovable.
- `REDIS_FAIL_MODE=closed` is documented in `.env.production.example`; `open` is an explicit local-debug escape hatch only. `env.validation.ts` rejects any other value.
- Unit coverage: `token-denylist.service.spec.ts` proves deny-on-error, allow-only-with-open, normal allow/deny, TTL, and destroy.
- The readiness probe still reports Redis separately, so infrastructure sees the dependency failure.
- **Outage-proven (2026-10-19):** the T-30 drill ran against the compose stack's Redis 7 — stop → readiness 503 → `POST /auth/refresh` **401** with a real signed cookie → start → readiness 200 (`scripts/t30-redis-drill.ps1`). Production compose pins `redis:7-alpine`; the local dev Redis `5.0.14.1` is dev-only.

## 2. Authorization

- `JwtStrategy.validate` reloads the user from the DB and returns the **live** role (not the token's role), rejects missing users, and rejects `isActive:false` — so deactivating an account or changing a role takes effect immediately without waiting for token expiry. Good.
- `RolesGuard` + `@Roles` gate admin/teacher routes; `role.util.ts` centralises the hierarchy (`canCreateRole`/`canChangeRole`/`canDeleteRole`) and is enforced in the service as well as the route.
- Every delete/read of user-owned data is scoped by the authenticated `user.id`.
- **Fixed this pass:** `UsersService.changeStatus` now records an `AuditLog` (was unlogged). `deleteInactiveUsers` now uses the full FK-safe cascade (was partially broken).

## 3. Input Validation & Injection

- Global `ValidationPipe{ whitelist:true, forbidNonWhitelisted:true, transform:true }` — unknown fields rejected.
- All DB access goes through Prisma parameterised queries — no string-concatenated SQL found.
- `GET /health/ready` uses a fixed `SELECT 1` (no interpolation).
- Frontend PDF proxy (`api/proxy/[...path]/route.ts`) blocks `..`, `\`, `@`, and embedded `http(s):` and re-asserts the upstream origin (SSRF hardening).

## 4. File Upload Security

- **Materials** (`materials.controller.ts`): MIME allow-list (PDF/JPEG/PNG/WEBP) + stored under a random 16-byte filename keeping only the caller's extension + 25 MB cap. `image-magic-bytes.ts` provides **content-based** validation (`assertValidPdfFile` / `assertValidImageFile`) that deletes the file and throws on mismatch — mitigates MIME spoofing. Covered by `image-magic-bytes.spec.ts`.
- **Payment receipts** (`payments.controller.ts`): image-only allow-list (JPEG/PNG/WEBP) + random filename + 10 MB cap. Confirm `PaymentsService.submit` calls `assertValidImageFile` (it is imported/used in the service per the prior pass; **NOT re-verified this pass**).
- Serving: files are streamed by id **after** an authorization check (`getFilePathForStudent`, `getReceiptPath`, `getReceiptDocumentPath`) — never served from a public static directory. `Content-Disposition: inline`.
- **Residual (LOW):** keep-alive is not a concern; consider re-validating magic bytes on receipt upload too, and add a `Content-Security-Policy` for the inline-viewed PDFs.

## 5. Payments / Webhook Security

- Chapa webhook is **public** but verifies an HMAC signature over the raw body (`rawBody:true`) using `CHAPA_WEBHOOK_SECRET`; the browser callback does **not** trust callback query params — it re-verifies the tx with Chapa before marking paid.
- `Payment.txRef`/`bankReference` unique constraints prevent replay; approval uses an atomic `PENDING→APPROVED` claim.
- `env.validation.ts` enforces Chapa all-or-nothing and a ≥32-char verifier token in prod.

## 6. Transport, Headers, CORS

- `helmet()` sets standard headers; Nginx adds `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and terminates TLS.
- CORS is an explicit allow-list with `credentials:true`; unknown origins are not reflected (asserted by `deploy/smoke-test.sh`).
- **CSRF:** cookies are `sameSite:lax` and state-changing routes are JSON `POST/PATCH/DELETE` (which trigger CORS preflight), so classic CSRF is largely mitigated. **Residual (LOW):** no CSRF token / Origin check on state-changing routes; consider asserting `Origin` server-side for defence in depth.

## 7. Rate Limiting

- Global `ThrottlerGuard` 120/min/IP; tighter per-route limits on `login`/`register` (5/min), `forgot-password`/`resend-verification` (3/min), `reset-password` (5/min), Chapa initialize/verify (10/min); AI tutor uses a **per-user** throttler (20/min). Good coverage.

## 8. Secret Management & Configuration

- No hardcoded credentials found in `.ts`/`.tsx` source (consistent with the prior pass).
- `env.validation.ts` is thorough: fail-fast on missing JWT/DB; production entropy/placeholder checks; SMTP required; public URLs must not be localhost; verifier token/accounts validated.
- **Outstanding (BLOCKER):** the prior audit flagged that `apps/api/.env` contains live-looking secrets and duplicate keys (`CORS_ORIGIN`, `WEB_PUBLIC_URL`). This pass **did not read that file** to avoid re-exposing secrets. Treat all secrets as compromised/locally-scoped until **rotated** (Gemini key, Chapa secret + webhook secret, SMTP password, verifier token, DB password, JWT secrets, super-admin password) and deduplicated. See `DEPLOYMENT-READINESS.md`.

## 9. Error Handling & PII

- `AllExceptionsFilter` returns one envelope; unhandled errors become a generic 500 (stack logged server-side, not sent to the client). 5xx reported to Sentry when configured.
- **Observation (LOW):** Sentry `captureException` for unhandled errors includes `extra.body` — ensure request bodies that may contain passwords/phone numbers are scrubbed via `beforeSend`.

## 10. Dependency & Supply Chain

- Lockfiles present; CI runs `npm ci`. **`npm audit` was NOT run** (prior attempt timed out). Must be run in a networked environment before production.

## 11. Security Findings Summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| S-1 | MEDIUM (RESOLVED for deployment) | Redis denylist fails open + `REDIS_HOST` not required in prod | Fail-closed default + `REDIS_FAIL_MODE` validation + unit tests + **T-30 outage drill PASS** on compose (503/401/recovery); production pins Redis 7 |
| S-2 | HIGH | Secrets in `apps/api/.env` likely need rotation + dedup | Open — rotate before prod |
| S-3 | LOW | No CSRF token / Origin assertion on state-changing routes | Open — consider Origin check |
| S-4 | LOW | Sentry `extra.body` may capture sensitive fields | Open — add scrubbing |
| S-5 | LOW | No CSP for inline-viewed PDFs | Open |
| S-6 | MEDIUM | Dependency vulnerabilities unknown | NOT VERIFIED — run `npm audit` |
| — | — | `deleteInactiveUsers` FK bug | **Fixed** |
| — | — | `changeStatus` unlogged admin action | **Fixed** |

## 12. Verdict

The authentication/authorization/payment/upload design is materially strong and shows evidence of prior hardening (fail-fast env, rotation, HMAC, magic bytes, lockout). The remaining sign-off blockers are **operational, not architectural**: (1) live secrets must be rotated and the `.env` deduplicated, and (2) the remaining staging gates (T-46..T-53) must be run — the Redis fail-closed posture is now shipped **and outage-proven** (T-30 PASS, see §15). Nothing here can be called "passed" without execution - all dynamic security tests remain **NOT VERIFIED**.

---

## 13. Execution-pass addendum (Rev 2 — 2026-10-17)

Dynamic security tests were executed this pass (raw evidence in `TEST-RESULTS.md`). Verified live:

- **Webhook signature enforcement:** missing → 400 "Missing webhook signature"; tampered → 400 "Invalid webhook signature"; valid → 200 (both the `x-chapa-signature` payload-HMAC and `chapa-signature` constant-HMAC schemes).
- **Forged success cannot approve:** a correctly-signed webhook claiming `status:success` for an **unpaid** real Chapa `tx_ref` returned 200 `received` but the payment stayed PENDING (server re-verifies with Chapa: "Chapa verify not successful … pending"). No subscription change.
- **Approval idempotency / no double side-effects:** double approve → exactly 1 notification + 1 audit row; reject-after-approve → 400.
- **Upload validation:** non-image renamed `.jpg` → 400 (magic-byte check); failed uploads are cleaned up.
- **Access control:** unsubscribed student → 403 on quizzes/flashcards/materials; expired subscription → 403 again; cross-department material → 403; unpublished course → 403 (even for teachers); course teacher → 200.
- **No answer leakage:** quiz payload contains no `correctOption`; grading is server-side (score returned correctly after submission).
- **Auth hardening:** lockout after 5 failures (correct password during lock → 401); refresh rotation (old token replay → 401); logout revocation replay → 401; reset-token replay → 400; registration rolls back (+503) when the mail send fails; no email enumeration (generic 200).
- **Delete cascade:** both delete endpoints → 200 with every child probe at 0; `course.teacherId` → NULL; peer data intact. New finding **F-4**: `Material.uploadedBy` is NOT NULL with no FK → dangles after user deletion.
- **Secrets:** one DB password was inadvertently echoed into a local session log during scripting (**F-6**) → treat as exposed and rotate (already on the S-2 list).
- **F-2 (NEW — critical, operational):** the `GEMINI_API_KEY` is invalid (`API_KEY_INVALID`). AI generation fails cleanly (FAILED with reason, no orphaned data), but the feature cannot complete until the key is replaced.
- **Dependency audit (S-6):** `npm ci` → **49 vulnerabilities** (10 moderate / 34 high / 5 critical) — remediation backlog (F-3). Install scripts were blocked for 6 packages; runtime verified unaffected.

Updated statuses: **S-1** Open (readiness now surfaces a dead Redis — DR-4 fixed; fail-open posture still needs an owner decision). **S-2** Open + **F-6**. **S-6 → VERIFIED (49 vulns)**. The verdict stands: **operational items (rotation + invalid key) are the security blockers, not architecture.**

## 14. Rev 3 addendum (2026-10-19) — fail-closed posture shipped

- **S-1 code posture fixed.** `TokenDenylistService` now fails **closed** by default: a Redis error denies the refresh token instead of allowing it. `REDIS_FAIL_MODE=closed|open` is validated by `env.validation.ts`; `closed` is the documented production value. Unit tests cover deny-on-error, explicit-open, normal paths, TTL and shutdown.
- **Env validation hardened.** Production now rejects placeholder `DATABASE_URL`/`SMTP_PASS`, invalid or `resend.dev` `SMTP_FROM`, and unknown `REDIS_FAIL_MODE` values. Legacy `COMPANY_BANK_ACCOUNTS` is optional and matching-only; DB receiving accounts are primary.
- **Duplicate-key preflight added.** `npm run check:env -- .env.production --strict` detects duplicate keys and placeholders without printing values; the root local `.env` was deduplicated (last-wins preserved).
- **F-8 probe added.** `npm run check:f8-email -- --email <non-owner>` drives the reset trigger and warns when `SMTP_FROM` still uses `resend.dev`. Real delivery proof still requires the non-owner inbox and Resend `Emails` log.
- **Still open:** S-2/F-6 secret rotation, F-8 domain verification, T-46..T-53 staging gates (T-30 is now PASS; see §15).

## 15. Rev 4 addendum (2026-10-19) — T-30 outage drill executed

The Redis fail-closed posture is now outage-proven, not just unit-proven. On the
production compose stack (Redis 7, staging-only env), `scripts/t30-redis-drill.ps1`
performed:

1. login as the seeded super admin → 200;
2. `docker compose stop redis`;
3. `/api/v1/health/ready` → **503** (dependency surfaced);
4. `POST /api/v1/auth/refresh` with a real signed refresh cookie → **401**
   (deny because the denylist is unreadable — fail-closed);
5. `docker compose start redis` → `/api/v1/health/ready` → **200**.

The drill's only quirk: `NODE_ENV=production` marks the refresh cookie `Secure`,
so a .NET cookie jar will not replay it over the local plain-HTTP URL; the script
extracts the cookie value from `Set-Cookie` for the drill only. Production
clients keep standard cookie behavior over HTTPS.

Also in the same compose pass: T-51 up/migrations PASS, T-52 smoke 12/12 PASS,
T-49 backup wrapper + restore PASS (30/30 tables), T-53 headers/uploads PARTIAL
(public TLS pending), T-50 PARTIAL (full Chromium verifier image deferred to the
Hostinger VPS). Evidence: `REGRESSION-TEST-RESULTS.md` §13.7.
