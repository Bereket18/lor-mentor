# LOR MENTOR — BACKEND / API AUDIT

**Phase:** Four (part) — Backend API
**Date:** 2026-10-17
**Stack:** NestJS 11 + TypeScript 5.7 + Prisma 7 (`@prisma/adapter-pg`) + BullMQ + Redis + Passport-JWT + class-validator
**Pass:** static — `nest build`, `jest`, `eslint`, and every live call were **NOT run** (see `INITIAL-BASELINE.md` R2.1). Execution-dependent items are **NOT VERIFIED**.

## 1. Bootstrap & Cross-Cutting Concerns (`main.ts`, `app.module.ts`)

| Concern | Implementation | Assessment |
|---|---|---|
| Env validation | `ConfigModule.forRoot({ validate: validateEnv })` | Fail-fast; strong prod rules (see SECURITY-AUDIT) |
| Security headers | `helmet()` | Present |
| CORS | `enableCors({ origin: CORS_ORIGIN.split(','), credentials: true })` | Allow-list, cookie-compatible |
| Body validation | Global `ValidationPipe{ whitelist, forbidNonWhitelisted, transform }` | Strict, rejects unknown fields |
| Global prefix | `/api/v1` | Consistent |
| Global rate limit | `ThrottlerGuard` 120/min/IP | Present |
| Error envelope | Global `AllExceptionsFilter` → `{statusCode,error,message,path,timestamp}` | Uniform; 5xx logged + Sentry; internals not leaked |
| Raw body | `NestFactory.create(..., { rawBody:true })` | Required for Chapa HMAC — present |
| Graceful shutdown | `enableShutdownHooks()` | Drains Prisma/BullMQ on SIGTERM |
| Sentry | Initialized only if `SENTRY_DSN` set | Optional, correct |

## 2. Modules & Endpoints

| Module | Notable routes | Guards |
|---|---|---|
| auth | `POST /auth/{register,verify-email,login,refresh,logout,forgot-password,reset-password,resend-verification}` | public, per-route `@Throttle` |
| users | `GET /users`, `POST /users/create-staff`, `PATCH /users/:id/{role,status,assignment}`, `DELETE /users/:id`, `DELETE /users/inactive`, `GET /users/me[/full]`, `PATCH /users/me/{profile,password}` | JWT + Roles(ADMIN/SUPER_ADMIN) on admin routes |
| departments | CRUD + archive/restore | public reads; ADMIN writes |
| academic-years | CRUD | public reads; ADMIN writes |
| semesters | CRUD | public reads; ADMIN writes |
| courses | list/`my-year`/`mine`/admin CRUD/archive | public reads; ADMIN create; ADMIN+TEACHER update (service checks teacher owns course) |
| materials | upload/youtube/list/get/file/update/delete/ai-status/ai-regenerate | JWT; TEACHER/ADMIN writes; **SubscriptionGuard** on AI status; ownership checks in service |
| plans | public list/get; admin list/create/update | public reads; ADMIN writes; cache header on public reads |
| payments | manual submit + receipt upload, Chapa init/verify/webhook, admin review | JWT; ADMIN review; HMAC webhook |
| subscriptions | `GET /subscriptions/me` | JWT |
| quiz | list, get (no answers), attempts, submit | JWT + SubscriptionGuard on get/submit |
| flashcards | list, get, review | JWT + SubscriptionGuard on get/review |
| tutor | `POST /chat`, `GET /history` | JWT + per-user `UserThrottlerGuard` (20/min) + subscription |
| progress | `GET /me`, `POST /:materialId` | JWT |
| forum | sections/posts/replies/reactions/reports + admin moderation | JWT; ADMIN on reports list/resolve; author-or-privileged on delete |
| notifications | list, unread-count, read-all, mark-read | JWT (scoped to `user.id`) |
| app | `GET /health`, `GET /health/ready`, `GET /me` | public / JWT |

## 3. Patterns That Are Correct

- **Zero-trust inputs:** registration re-validates that the academic year belongs to the chosen department; services re-check ownership rather than trusting IDs/roles from the client.
- **Server-side grading:** quiz answers are graded and persisted server-side; `correctOption` is never serialized to the client.
- **Idempotent payments:** `Payment.txRef`/`bankReference` unique constraints plus an atomic `PENDING→APPROVED` claim in the approval path make approve/reject safe against double-submits and racing webhooks.
- **Consistent ownership helpers:** `role.util.ts` (`canCreateRole`/`canChangeRole`/`canDeleteRole`) centralise the role hierarchy; guard + service both enforce it (defence in depth).
- **Resource scoping:** notifications/progress/payments are always filtered by the authenticated `user.id`, never a client-supplied id.

## 4. Findings

### Fixed this pass
- **B-11** — removed a leftover debug `console.log` (with the whole DTO/actor) from `CoursesService.update`.
- **B-1** — `UsersService.deleteInactiveUsers()` did not delete all dependent rows and would throw a FK error; it now runs the same FK-safe cascade as `deleteUser()` inside one transaction, via a shared private `cascadeDeleteUser(tx, userId)`.
- **B-2** — removed dead, unused, hierarchy-unchecked `createStaffAccount()` (the controller uses `createUser`).
- **B-4** — `changeStatus()` now writes an `AuditLog` (`USER_ACTIVATED` / `USER_DEACTIVATED`) with actor, target, and new state.

### Open (not fixed — need a decision)
- **R-API-1 (low):** `MailService.sendMail()` constructs a new nodemailer transporter on **every** email instead of once in the constructor. Correctness is fine; it opens a new SMTP connection per send. Acceptable at current volume; refactor later.
- **R-API-2 (low):** `AiService.enqueueGeneration` calls `queue.add('generate', {...})` with **no `attempts`/backoff options**, so a transient Gemini failure is not retried by policy (the processor re-throws, but with default attempts=1 the job dies). Confirm whether retries are intended (see PERFORMANCE-RELIABILITY-AUDIT R-04).
- **R-API-3 (info):** `GET /users/me` (app controller) and `GET /users/me` (users controller) both exist under different route bases (`/me` vs `/users/me`) — intentional, just be aware.
- **R-API-4 (info):** No API e2e specs are present (`apps/api/test/` has only `jest-e2e.json` + `app.e2e-spec.ts`); functional coverage rests on unit tests.

## 5. NOT VERIFIED

`nest build` (tsc for production code), `jest`, `eslint`, Prisma client generation, and every live request. Prior pass reported 76/76 unit tests passing and a clean production build; that is **not re-verified** here.
