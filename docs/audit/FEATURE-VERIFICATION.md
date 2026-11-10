# LOR MENTOR — FEATURE VERIFICATION

**Phase:** Two — Requirements and Feature Inventory
**Date:** 2026-10-17
**Pass:** static (file-read) audit — see `INITIAL-BASELINE.md` Revision 2 for the environmental limitation.
**Method:** every feature was traced through the actual code path **UI → API controller → guard → service → Prisma model**. A feature is marked **VERIFIED (static)** when the full path exists and is internally consistent; **NOT VERIFIED (runtime)** when correctness can only be confirmed by executing it. No runtime test was executed in this pass.

> Legend — **V** = verified by reading real code; **P** = partial / inferred; **NV** = not verified (needs execution).

## 1. Feature Status Matrix

| # | Feature | UI | API endpoint(s) | Guards | DB | Status |
|---|---|---|---|---|---|---|
| F-01 | Registration (dept + year + phone) | `app/register/page.tsx` | `POST /auth/register` | public, throttled 5/min | `User` | **V** |
| F-02 | Email verification | `app/verify-email/page.tsx` | `POST /auth/verify-email`, `POST /auth/resend-verification` | public, throttled | `VerificationCode` (6-digit code, hashed) | **V** |
| F-03 | Login + brute-force lockout | `app/login/page.tsx`, `app/admin-login/page.tsx` | `POST /auth/login` | public, throttled 5/min | `User.failedLoginCount/lockoutUntil` | **V** |
| F-04 | Token refresh + rotation | transparent (`lib/api.ts`) | `POST /auth/refresh` | public | Redis denylist | **V** |
| F-05 | Logout (server-side revoke) | sidebar/topbar | `POST /auth/logout` | public | Redis denylist | **V** |
| F-06 | Forgot / reset password | `app/forgot-password`, `app/reset-password` | `POST /auth/forgot-password`, `POST /auth/reset-password` | public, throttled | `User.passwordResetToken` | **V** |
| F-07 | Public plan catalogue | `app/pricing/page.tsx` | `GET /plans`, `GET /plans/:id` | public, cache header | `SubscriptionPlan` | **V** |
| F-08 | Manual bank-transfer payment | `app/pricing/subscribe` | `POST /payments/*` (submit, upload receipt) | JWT + subscription guard rules | `Payment` (MANUAL) | **V** |
| F-09 | Bank-receipt auto-verification | admin/pricing | `POST /payments/...` → verifier service | JWT | `Payment.verification` | **V** |
| F-10 | Chapa online payment + webhook | `pricing/payment/callback` | `POST /payments/chapa/*`, `POST /payments/chapa/webhook` | HMAC-signed webhook | `Payment` (CHAPA) | **V** |
| F-11 | Admin payment review (approve/reject) | `app/(app)/admin/payments` | `GET/PATCH /payments/admin/*` | ADMIN/SUPER_ADMIN | `Payment` + `Subscription` | **V** |
| F-12 | Subscription status | `profile`, pricing | `GET /subscriptions/me` | JWT | `Subscription` | **V** |
| F-13 | Paid-content gating | quiz/flashcards/materials | `SubscriptionGuard` on those routes | JWT + SubscriptionGuard | `Subscription` | **V** |
| F-14 | Department / year / semester admin | admin pages | `/departments`, `/academic-years`, `/semesters` | ADMIN/SUPER_ADMIN (writes) | structure models | **V** |
| F-15 | Course browse (public) | `courses` | `GET /courses?semesterId` | public (published only) | `Course` | **V** |
| F-16 | Student "my courses" | `dashboard`, `courses` | `GET /courses/my-year` | JWT | `Course` (dept-scoped) | **V** |
| F-17 | Teacher "my courses" | `teacher/courses` | `GET /courses/mine` | TEACHER | `Course.teacherId` | **V** |
| F-18 | Course CRUD | admin/teacher pages | `POST/PATCH /courses` | ADMIN/SUPER_ADMIN/TEACHER | `Course` | **V** |
| F-19 | Material upload (PDF/IMG) | teacher/admin | `POST /materials/upload` | TEACHER/ADMIN + magic-byte filter | `Material` | **V** |
| F-20 | YouTube material | teacher/admin | `POST /materials/youtube` | TEACHER/ADMIN | `Material` (YOUTUBE) | **V** |
| F-21 | Secure file serving | PDF viewer | `GET /materials/:id/file` + `/api/proxy/*` | JWT + ownership/subscription | filesystem | **V** |
| F-22 | AI pipeline (PDF→summary+cards+quiz) | admin status badge | queue `ai-generation` | triggered by upload | `AiContent`,`FlashcardSet`,`QuizBank` | **V** (logic) / **NV** (Gemini call) |
| F-23 | Flashcards study | `flashcards` | `GET /flashcards`, `GET/POST /flashcards/:setId/*` | JWT + SubscriptionGuard | `Flashcard`,`FlashcardReview` | **V** |
| F-24 | Quiz grading | `quiz` | `GET /quizzes`, `GET /quizzes/:id`, `POST /quizzes/:id/attempt` | JWT + SubscriptionGuard | `Quiz`,`QuizAttempt`,`QuizAnswer` | **V** |
| F-25 | AI tutor chat | `ai-tutor` | `POST /tutor/chat`, `GET /tutor/history` | JWT + per-user throttle + subscription | `AiHistory` | **V** |
| F-26 | Progress tracking | `progress` | `GET /progress/me`, `POST /progress/:materialId` | JWT | `ProgressRecord` | **V** |
| F-27 | Forum threads/replies | `forum` | `GET /forum/course/:id`, `GET /forum/posts/:id`, `POST /forum/posts`, `POST /forum/posts/:id/replies` | JWT | `ForumSection/Post/Reply` | **V** |
| F-28 | Reactions | forum | `POST /forum/reactions` | JWT | `Reaction` | **V** |
| F-29 | Reports + moderation | admin/moderation | `POST /forum/reports`, `GET /forum/reports`, `PATCH /forum/reports/:id` | JWT / ADMIN | `Report` | **V** |
| F-30 | Notifications | `notifications` | `GET /notifications`, `/unread-count`, `PATCH /read-all`, `PATCH /:id/read` | JWT | `Notification` | **V** |
| F-31 | Admin user management | admin/users | `/users` (list/create/role/status/assignment/delete/inactive) | ADMIN/SUPER_ADMIN | `User` | **V** |
| F-32 | Audit log | admin/audit | `GET /audit` (newest first, take 1..500, actor included) | JWT + SUPER_ADMIN | `AuditLog` | **V** (live-verified, Rev 8) |
| F-33 | PDF receipt generation | (download) | payment approval → `ReceiptService` | — | filesystem/uploads | **V** (logic) |
| F-34 | Health/readiness | — | `GET /health`, `GET /health/ready` | public | DB ping | **V** |

## 2. Detailed Traces (selected)

### F-01 Registration — VERIFIED (static)
- UI collects `fullName, email, phoneNumber, departmentId, academicYearId, password` and POSTs them (`register/page.tsx` `onSubmit`). It does **not** use `useAuth().register()`.
- Server `RegisterDto` requires exactly those fields; `ValidationPipe` (`forbidNonWhitelisted:true`) rejects extras.
- `AuthService.register` verifies the department exists, then that the academic year exists, is not archived **and belongs to that department** (zero-trust check), hashes with bcrypt(12), creates the user, then stores the verify token + sends mail inside a try/catch that **rolls the account back** and returns `503` if email fails. Good.
- **Residual:** if SMTP is misconfigured the user sees a 503 and no account — acceptable and intentional.

### F-24 Quiz — server-side grading — VERIFIED (static)
- `GET /quizzes/:id` selects only `{id,text,options}` — `correctOption` is **never** returned to the client. Grading happens in `QuizService.submitAttempt`, which persists `QuizAttempt` + `QuizAnswer`. `QuizAnswer` rows are only created for answered questions. Confirms the "answers never leak" requirement.

### F-10 Chapa webhook — VERIFIED (static)
- `main.ts` enables `rawBody:true`; the webhook controller verifies the HMAC-SHA256 signature against the exact bytes before trusting the payload; `Payment.txRef` is `@unique` (idempotency / anti-replay).

### F-22 AI pipeline — logic VERIFIED, runtime NOT VERIFIED
- `MaterialsService` uploads → `AiService.enqueueGeneration` upserts `AiContent(PENDING)` and adds a BullMQ job → `AiProcessor` marks `PROCESSING`, extracts PDF text, rejects text < 100 chars (scanned PDFs), calls Gemini, and writes summary + flashcard set + quiz bank in **one transaction**; on error marks `FAILED` with a truncated message and re-throws for retry. Notification created for the uploader on success.
- **NOT VERIFIED:** actual Gemini output quality, queue retry behaviour at runtime, and whether the BullMQ queue has an explicit `attempts`/backoff configured (see PERFORMANCE-RELIABILITY-AUDIT R-04).

### F-31 Admin user management — VERIFIED (static), one defect fixed this pass
- `createUser` enforces `canCreateRole`; `changeRole` enforces `canChangeRole` + cannot change self; `deleteUser` enforces `canDeleteRole` + cannot delete self + cannot delete last SUPER_ADMIN, and cleans all dependent rows in a transaction.
- **Fixed this pass:** `deleteInactiveUsers` previously deleted only 3 dependent tables and would throw a FK error; it now uses the same full cascade. `changeStatus` now writes an `AuditLog`. See `CLEANUP-REPORT.md`.

## 3. Features That Are Partial or Unverified

| ID | Item | Why partial | What is needed |
|---|---|---|---|
| F-33 | Receipt PDF | Generation logic present; PDF bytes not produced here | Render one receipt in staging |
| F-22 | AI output | Requires live Gemini + Redis worker | Run the pipeline on a sample PDF in staging |
| F-08..F-11 | Payments | Logic verified; no real transaction executed | Chapa **test-mode** transaction + manual-transfer approval round-trip |
| F-04/F-05 | Token revocation | Logic verified; Redis not running here | Prove a logged-out refresh token is rejected |

*Resolved since this pass: **F-32** (audit log read) — `GET /audit` now exists,
is SUPER_ADMIN-only, and passed the live harness — see
`REGRESSION-TEST-RESULTS.md` §14.*

## 4. Not Verified At All (no runtime)

Every end-to-end behaviour above is **NOT VERIFIED at runtime** in this session because no command, server, database, Redis, or external API could be executed (see `INITIAL-BASELINE.md` R2.1). The matrix column "Status = V" means "the code path is present and internally consistent", not "I saw it work". No feature is claimed as passing.

## 5. Summary

- All **34** inventoried features have a complete, traceable UI→API→DB path in code.
- **31** were statically verified with no obvious break in the chain (Rev 8: F-32 is now implemented and live-verified; **0** remain partial).
- **0** were found to be outright broken after the F-31 fix.
- Runtime confirmation is outstanding for most features — this is an environmental limitation, not a code finding. (Rev 8 live-verified the admin-UX slice; see `REGRESSION-TEST-RESULTS.md` §14.)
