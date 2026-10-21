# LOR MENTOR — CLEANUP REPORT

**Date:** 2026-10-17
**Scope:** low-risk, reversible fixes applied during the audit (static pass C-1..C-6; execution pass C-7..C-9). Architecture was **not** rewritten; no behaviour of a verified working flow was intentionally changed except to remove a defect.
**Rev 2 note:** the execution pass compiled, linted, unit-tested, and (where possible) live-verified the changes — T-03..T-11 all PASS, T-20 regression PASS, DR-3/DR-4 verified live (see `TEST-RESULTS.md`). Only `next build` (T-06) remains pending on host memory.

## 1. Changes Applied

### C-1 — `UsersService.deleteInactiveUsers()` FK-safe cascade (fixes B-1) — *highest value*
- **File:** `apps/api/src/modules/users/users.service.ts`
- **Before:** the 12-month inactive-account sweep deleted only `progressRecord`, `notification`, and `aiHistory`, then `user.deleteMany`. Any inactive student with a quiz attempt, forum post/reply, reaction, report, payment, subscription, or audit log would trigger a **foreign-key violation** and the entire sweep would fail.
- **After:** the full FK-safe cleanup used by `deleteUser()` was extracted into a private `cascadeDeleteUser(tx, userId)` and is now run for each inactive id inside a single `$transaction`.
- **Risk:** low. No public API change; same ordering `deleteUser` already used.

### C-2 — Remove dead `createStaffAccount()` (fixes B-2)
- **File:** `apps/api/src/modules/users/users.service.ts`
- **Before:** an unused method (no controller route, no caller) that also skipped the role-hierarchy check and returned a plaintext temporary password.
- **After:** removed. The live path is `createUser()` at `POST /users/create-staff`, which enforces `canCreateRole`.
- **Risk:** low (dead code). `crypto` import is still used by `createUser`.

### C-3 — Audit log on account activate/deactivate (fixes B-4)
- **File:** `apps/api/src/modules/users/users.service.ts`
- **Before:** `changeStatus(userId, isActive, _actorId)` ignored the actor and wrote no audit entry.
- **After:** writes an `AuditLog` with `action = USER_ACTIVATED | USER_DEACTIVATED`, `entityType = User`, `entityId = userId`, `meta = { isActive }`, alongside the existing auth audit entries.
- **Risk:** very low.

### C-4 — Remove debug `console.log` from course update (fixes B-11)
- **File:** `apps/api/src/modules/courses/courses.service.ts`
- **Before:** `update()` logged the course id, whole DTO, and actor on every call.
- **After:** removed.
- **Risk:** very low (pure deletion).

### C-5 — Remove dead `RegisterResponse.verifyToken` (fixes B-3)
- **File:** `apps/web/src/types/index.ts`
- **Before:** interface advertised a `verifyToken` field the API never returns.
- **After:** `RegisterResponse` is `{ message: string }`.
- **Risk:** very low (runtime unaffected; the field never existed on the wire).

### C-6 — Additive performance indexes (fixes B-7)
- **Files:** `apps/api/prisma/schema.prisma` (added `@@index` on the models below) + new migration `apps/api/prisma/migrations/20261017120000_add_performance_indexes/migration.sql`
- **Added:** `Course(semesterId, teacherId)`, `Material(courseId)`, `Question(quizBankId, quizId)`, `QuizAttempt(userId, quizId)`, `QuizAnswer(attemptId, questionId)`, `ForumPost(sectionId, authorId)`, `ForumReply(postId, authorId)`, `Announcement(courseId)`, `Report(reporterId)`, `AiHistory(userId)`.
- **Risk:** low. Only `CREATE INDEX IF NOT EXISTS` (idempotent, data-preserving). Applied automatically by the API entrypoint's `prisma migrate deploy` on the next deploy. **Verified applied on a fresh disposable DB (T-16/T-19).**

### C-7 — Remove dead `useAuth().register()` (fixes B-5)
- **File:** `apps/web/src/hooks/use-auth.ts`
- **Before:** a helper that POSTed only `{fullName,email,password}` while `RegisterDto` requires `departmentId`/`academicYearId`/`phoneNumber` — a latent 400 if ever wired up.
- **After:** removed, along with its entry in the hook's returned object. A full call-site search confirmed **zero callers** (the register page posts the full body directly via `api.post`).
- **Risk:** very low. **Verified:** web `tsc --noEmit` 0 errors; `eslint` clean.

### C-8 — `web` compose healthcheck (fixes DR-3)
- **File:** `docker-compose.prod.yml`
- **After:** a `healthcheck` on the `web` service (HTTP fetch `http://127.0.0.1:3000/`, 20s interval, 30s start period), mirroring the `api` service style.
- **Risk:** low. **Verified:** `docker compose config` exit 0.

### C-9 — Redis in the readiness probe (fixes DR-4)
- **Files:** `apps/api/src/common/redis/redis-health.service.ts` (new), `app.controller.ts`, `app.module.ts`, `app.controller.spec.ts`
- **After:** `/health/ready` checks the DB **and** Redis (dedicated fail-fast client; `ping()` never throws); returns 503 with per-dependency status if either is down.
- **Risk:** low. **Verified:** live `{"status":"ready","database":"up","redis":"up"}`; unit tests 4/4; API `tsc` + `eslint` clean.

## 2. Deliberately NOT changed (documented instead)

| Item | Why not changed |
|---|---|
| ~~`useAuth().register()` payload mismatch (B-5)~~ | **Applied in Rev 2 as C-7** — a full call-site search confirmed zero callers, so the dead helper was deleted. |
| `AiHistory.courseId/materialId` non-relational (B-6) | Requires a schema/relation decision and a data migration; not a low-risk edit. |
| `Question` dual owner (B-8) | Requires a DB CHECK constraint decision; current code is consistent. |
| Missing `updatedAt` on 4 models (B-9) | Cosmetic; do it when touching those tables. |
| Redis denylist fail-open (S-1) | A security posture decision (availability vs. revocation strictness) — needs owner sign-off. |
| Secrets rotation in `apps/api/.env` (S-2) | Credential operation; agent should not do this. |
| `apps/api/.env` not read | Avoided re-exposing secrets into the transcript. |

## 3. Verification of the changes

- Each file was re-read after editing. `users.service.ts` region reads confirm: `deleteInactiveUsers` → `$transaction` → `cascadeDeleteUser`; `deleteUser` → `$transaction` → `cascadeDeleteUser`; `changeStatus` writes `auditLog`; the class now ends cleanly after `changePassword` (dead method gone).
- The new migration uses only `CREATE INDEX IF NOT EXISTS`.
- **Rev 2:** all compile/lint/test gates executed — `prisma generate`, API + web `tsc`, `nest build`, `eslint`, `jest` (11 suites / 76 tests + the extended `app.controller.spec` 4/4), fresh-DB `prisma migrate deploy` (T-16), smoke 12/12, and the T-20 delete-cascade regression. Only `next build` (T-06) is pending (host memory).

## 4. Summary

Nine small, reversible changes across both passes: one real bug fix (inactive-account deletion), two audit/observability improvements, three cleanups (incl. the dead `useAuth().register()`), one additive migration, plus the `web` healthcheck and Redis readiness additions. The cascade refactor (largest functional risk) passed the live regression test T-20; every gate that could be executed is green (see `TEST-RESULTS.md`).
