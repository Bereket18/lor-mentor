# LOR MENTOR — TEST PLAN

**Date:** 2026-10-17
**Purpose:** define exactly what must be executed to move the project from a static audit to a verified production decision. Every item below is currently **NOT RUN** in this environment (no shell — see `INITIAL-BASELINE.md` R2.1); the plan is written so it can be run on CI, a dev machine, or staging and pasted back into `TEST-RESULTS.md`.

## 0. How to use this plan

Each row has an **ID**, the exact **command/step**, and the **pass criterion**. Record actual output (not a summary) in `TEST-RESULTS.md`. Do not mark a row PASS based on prior-pass claims.

## 1. Static / build gates (must all pass)

| ID | Command (working dir) | Pass criterion |
|---|---|---|
| T-01 | `npm ci` (root) | Installs with no errors |
| T-02 | `npx prisma generate` (`apps/api`) | Client generated |
| T-03 | `npx tsc --noEmit` (`apps/api`) | 0 errors (incl. spec files — known Jest-30 `jest.fn` generics were fixed; verify) |
| T-04 | `npx tsc --noEmit` (`apps/web`) | 0 errors |
| T-05 | `npm run build` (`apps/api`, = `nest build`) | Builds |
| T-06 | `npm run build` (`apps/web`, = `next build`) | Builds; `.next/standalone` produced |
| T-07 | `npm run lint` (`apps/api`) | 0 errors |
| T-08 | `npx eslint .` (`apps/web`) | 0 errors (currently report-only in CI — read the actual count) |
| T-09 | `npx prisma validate` (`apps/api`) | Schema valid |
| T-10 | `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <tmp>` | No drift (schema matches migrations) |

## 2. Unit tests

| ID | Command | Pass criterion |
|---|---|---|
| T-11 | `npx jest --ci` (`apps/api`) | All suites pass (prior pass: 11 suites / 76 tests) |
| T-12 | `npx jest --coverage` (`apps/api`) | Coverage recorded; note gaps (courses/materials/forum/quiz/ai/tutor/users have none) |
| T-13 | `python -m py_compile normalize.py` (`services/receipt-verifier`) | Compiles |
| T-14 | `python test_normalize.py` (`services/receipt-verifier`) | Passes |
| T-15 | `python test_security.py` (`services/receipt-verifier`) | Passes |

## 3. Database

| ID | Step | Pass criterion |
|---|---|---|
| T-16 | Bring up a disposable Postgres; `npx prisma migrate deploy` | All migrations incl. `20261017120000_add_performance_indexes` apply with no error |
| T-17 | `npx prisma migrate status` | "Database schema is up to date" |
| T-18 | `npm run db:seed` (with SUPER_ADMIN_* set) | Departments/years/semesters + 1 super admin created; re-run is idempotent |
| T-19 | Inspect indexes: `\d "Course"`, `\d "Material"`, … | New indexes present |
| T-20 | Delete-flow probe: create a student with a quiz attempt, forum post, payment, subscription, then call `DELETE /users/:id` **and** `DELETE /users/inactive` | Both succeed with no FK error (regression test for B-1) |

## 4. API integration / smoke

| ID | Command | Pass criterion |
|---|---|---|
| T-21 | Run API + Redis; `bash deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000` | PASS count = total, FAIL = 0 |
| T-22 | `npx jest --config ./test/jest-e2e.json` (`apps/api`) | Passes (currently only a placeholder spec) |
| T-23 | Health: `curl /api/v1/health`, `/api/v1/health/ready` | 200 / 200 |

## 5. Auth flow (manual or scripted)

| ID | Step | Pass criterion |
|---|---|---|
| T-24 | Register a real user (dept+year+phone) | 201/200, email received, `User.isEmailVerified=false` |
| T-25 | Login before verifying | 401 "verify your email" |
| T-26 | Verify via emailed link | 200; login now succeeds and sets both cookies |
| T-27 | 6 wrong passwords | 5th failure logs `AUTH_LOGIN_FAILED`, 6th locks (`AUTH_ACCOUNT_LOCKED`); correct password during lock → 401 |
| T-28 | Let a token expire; trigger a 401 | Exactly **one** `/auth/refresh` in the network log; request replays |
| T-29 | Logout, then replay the old refresh cookie | 401 (revoked) — proves denylist |
| T-30 | Stop Redis, replay a revoked token | Observe behaviour; confirm the documented fail-open/closed choice (S-1) |
| T-31 | Forgot-password → reset → login with new password | Works; old reset token cannot be reused |
| T-32 | Request forgot-password for a non-existent email | Generic 200 (no enumeration) |

## 6. Payments (Chapa TEST mode + manual)

| ID | Step | Pass criterion |
|---|---|---|
| T-33 | Chapa **test** checkout end-to-end | Payment APPROVED, Subscription ACTIVE |
| T-34 | Replay the Chapa webhook for the same `txRef` | No duplicate approval/subscription |
| T-35 | Tamper the webhook signature | Rejected, no state change |
| T-36 | Manual: upload a real receipt image → admin approve | Subscription ACTIVE; PDF receipt generated and downloadable by owner |
| T-37 | Upload a non-image renamed to `.jpg` | Rejected (magic-byte check) |
| T-38 | Approve the same manual payment twice (race) | Idempotent (atomic claim) |

## 7. Content & subscription gating

| ID | Step | Pass criterion |
|---|---|---|
| T-39 | As an **unsubscribed** student, `GET /quizzes/:id`, `/flashcards/:setId`, `/materials/:id/file` | 403 (SubscriptionGuard) |
| T-40 | Confirm `GET /quizzes/:id` response contains no `correctOption` | Not present |
| T-41 | As a student in department A, fetch a material of a course in department B by id | Denied by ownership check |
| T-42 | Upload a PDF material as teacher | 200; if AI enabled, `AiContent` goes PENDING→PROCESSING→COMPLETED (or FAILED with reason) |
| T-43 | Regenerate a COMPLETED material | 400 (refuses to clobber) |

## 8. Frontend E2E (Playwright)

| ID | Command | Pass criterion |
|---|---|---|
| T-44 | `npm run e2e` (`apps/web`) with web+API up | smoke/theme/accessibility/verification pass; auth spec passes when opted in |
| T-45 | Manual: mobile viewport, sidebar/nav, PDF viewer, AI tutor chat streaming | No console errors; core actions work |

## 9. Performance / reliability

| ID | Step | Pass criterion |
|---|---|---|
| T-46 | Load test courses/materials/forum endpoints | p95 within target; no N+1 blow-up |
| T-47 | Kill the API mid-AI-job; restart | BullMQ job re-processed or marked FAILED; no half-written flashcard/quiz set |
| T-48 | Simulate Gemini/Chapa/SMTP outage | Graceful errors (503), no crash; Sentry events appear if `SENTRY_DSN` set |
| T-49 | Restore a `pg-backup.sh` dump into a clean DB | Restore succeeds; row counts match |

## 10. Deployment

| ID | Step | Pass criterion |
|---|---|---|
| T-50 | `docker compose -f docker-compose.prod.yml build` | Both images build |
| T-51 | `docker compose -f docker-compose.prod.yml --env-file .env.production up -d` | All services healthy; migrations applied on API boot |
| T-52 | Run `deploy/smoke-test.sh https://api.<domain> https://<domain>` against staging | PASS, FAIL=0 |
| T-53 | Confirm TLS, HSTS/headers, `uploads` volume persists across a redeploy | As expected |

## 11. Exit criteria

Production **GREEN** requires T-01..T-53 all PASS (or explicitly waived with rationale) **and** secrets rotated (S-2). Any failing build/lint/test/migration is a hard stop. Any RED result must be recorded even if the reason is environmental.
