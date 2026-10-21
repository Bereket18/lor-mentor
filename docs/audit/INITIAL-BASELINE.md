# LOR MENTOR — INITIAL BASELINE AUDIT REPORT

**Phase:** One — Repository Discovery and Baseline  
**Date:** October 2026  
**Auditor:** Principal Software Engineer / Technical Auditor  
**Branch:** `main` (HEAD `f7a0584`)  
**Status:** Evidence-based. Every claim is sourced from a file read or command output. Inferences are marked.

---

## 1. Repository and Architecture Summary

### Monorepo Structure

```
lor-mentor/                       ← npm workspaces root
├── apps/
│   ├── api/                      ← NestJS 11 backend (TypeScript)
│   └── web/                      ← Next.js 16 frontend (TypeScript + React 19)
├── services/
│   └── receipt-verifier/         ← Python 3 / FastAPI micro-service
├── docs/                         ← Audit docs, sprint notes, deploy guides
├── deploy/                       ← Nginx config and deployment scripts
├── .github/workflows/ci.yml      ← Single CI workflow (Node + Python jobs)
├── docker-compose.prod.yml       ← Production Docker Compose stack
└── package.json                  ← npm workspaces root (node >=20, npm >=10)
```

**Monorepo tool:** npm workspaces (no Turborepo/Nx). Root `package.json` defines `apps/*` and `packages/*` workspaces. The `packages/` directory is declared but does not currently exist — no shared library packages.

### Confirmed Tech Stack (versions from package.json files)

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | v25.2.1 (installed), engine requires ≥20 |
| Package manager | npm | 11.19.0 |
| Backend framework | NestJS | ^11.0.1 |
| Backend language | TypeScript | ^5.7.3 |
| Database | PostgreSQL 16 | (Docker image) |
| ORM | Prisma | ^7.9.0 (Prisma 7 — adapter-based API) |
| DB adapter | @prisma/adapter-pg | ^7.9.0 |
| Frontend framework | Next.js | ^16.2.11 |
| Frontend language | TypeScript | ^5 |
| React | react + react-dom | 19.2.4 |
| UI styling | Tailwind CSS | ^3.4.19 |
| State/data fetching | TanStack React Query | ^5.101.0 |
| HTTP client | axios | ^1.17.0 |
| Auth | JWT (HttpOnly cookies) + Passport | @nestjs/jwt ^11.0.2 |
| Queue/jobs | BullMQ | ^5.79.0 |
| In-memory store | Redis | (Docker: redis:7-alpine) |
| AI integration | Google Gemini 2.5 Flash | @google/generative-ai ^0.24.1 |
| Email | nodemailer + Resend SMTP | ^9.0.3 |
| File upload | multer | ^2.1.1 |
| PDF parsing | pdf-parse | ^2.4.5 |
| PDF generation | pdfkit | ^0.19.1 |
| Error tracking | Sentry | @sentry/node ^10.65.0 |
| E2E tests | Playwright | ^1.61.1 |
| Unit tests | Jest | ^30.0.0 |
| Receipt verifier | Python 3.12 / FastAPI | (services/receipt-verifier) |

### Entry Points

- **API:** `apps/api/src/main.ts` — bootstraps NestJS on port 4000 (default). Sets up Helmet, CORS, cookie parser, global ValidationPipe, global prefix `/api/v1`, Sentry (optional), graceful shutdown.
- **Web:** `apps/web/src/app/layout.tsx` — Next.js App Router root layout. Wraps `QueryProvider` (TanStack) and `ThemeProvider` (next-themes).
- **Receipt verifier:** `services/receipt-verifier/main.py` — FastAPI app on port 8000. Health at `GET /health`, extraction at `POST /extract`.

### Router / Architecture Pattern

- **Backend:** NestJS module-per-domain. 20 feature modules. Guards applied per-controller and per-route. Global rate limiting (ThrottlerGuard), global exception filter (AllExceptionsFilter). No GraphQL — REST only.
- **Frontend:** Next.js 15/16 App Router. Route groups: `(app)/` (authenticated area with sidebar/topbar layout) and public routes (`/login`, `/register`, `/pricing`, etc.). Next.js rewrites proxy `/api/v1/*` to the NestJS API server.
- **Authentication:** HTTP-only cookies carrying JWT access tokens (15 min) and refresh tokens (7 days). Refresh tokens have JTI and are individually revocable via Redis denylist. JWT strategy reads from `access_token` cookie. `JwtAuthGuard` wraps Passport AuthGuard. Brute-force lockout: 5 failed attempts → 15-minute lock.

### Database

- **ORM:** Prisma 7 with `@prisma/adapter-pg` (new adapter-based Prisma 7 API — not the classic engine approach).
- **Schema file:** `apps/api/prisma/schema.prisma`
- **Client output:** `node_modules/.prisma/client` (monorepo root node_modules — correct for workspaces)
- **Connection:** Configured via `prisma.config.ts` (Prisma 7 style) reading `DATABASE_URL` from env, not inline in the schema `datasource` block.

---

## 2. Environment Variables Inventory

### API (`apps/api/.env`) — Keys Present

```
TZ
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
NODE_ENV
PORT
CORS_ORIGIN           ← APPEARS TWICE (duplicate key — last value wins)
GEMINI_API_KEY
SUPER_ADMIN_EMAIL
SUPER_ADMIN_PASSWORD
SUPER_ADMIN_NAME
API_PUBLIC_URL
WEB_PUBLIC_URL        ← APPEARS TWICE (duplicate key — last value wins)
CHAPA_SECRET_KEY
CHAPA_WEBHOOK_SECRET
CHAPA_BASE_URL
COLLEGE_NAME
APP_NAME
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
RECEIPT_VERIFIER_URL
RECEIPT_VERIFIER_TOKEN
COMPANY_BANK_ACCOUNTS
```

⚠️ **VERIFIED ISSUE:** `CORS_ORIGIN` and `WEB_PUBLIC_URL` appear twice in `apps/api/.env`. The last entry wins. This is a maintenance hazard — a developer editing one may miss the other. The file needs deduplication.

**Missing from API .env vs .env.example:** `REDIS_HOST`, `REDIS_PORT` — these are absent from the api `.env` file. The code defaults `REDIS_HOST` to `localhost` and `REDIS_PORT` to `6379` in both `app.module.ts` and `token-denylist.service.ts`, so development will use default Redis on localhost. **INFERRED:** Redis must be running locally for auth (logout, token refresh) and AI queuing to work in development.

### Web (`apps/web/.env.local`) — Keys Present

```
NEXT_PUBLIC_API_URL
```

Only one key. This is sufficient for the browser-side API client.

### Root `.env` — Keys Present

```
NODE_ENV, APP_URL, API_URL, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, SMTP_HOST, SMTP_PORT, SMTP_USER,
SMTP_PASS, GEMINI_API_KEY, NEXT_PUBLIC_API_URL, REDIS_HOST, REDIS_PORT, GEMINI_API_KEY
```

⚠️ `GEMINI_API_KEY` appears twice in root `.env`. The root `.env` is not used by either app directly in production — each app reads its own `.env`. This root file appears to be a developer convenience file. **INFERRED:** The presence of REDIS_HOST/REDIS_PORT here but not in `apps/api/.env` may cause confusion about which file is actually loaded.

### Missing from production that would fail `validateEnv()` if `NODE_ENV=production`

The following are required in production by `env.validation.ts` but have empty/placeholder values that env.validation.ts would reject:

| Key | Status |
|---|---|
| `CHAPA_SECRET_KEY` | Present in .env but may be empty — validation requires both Chapa keys if either is set |
| `CHAPA_WEBHOOK_SECRET` | Same as above |
| `COMPANY_BANK_ACCOUNTS` | Required when `RECEIPT_VERIFIER_URL` is set; check if populated |
| `RECEIPT_VERIFIER_TOKEN` | Required when `RECEIPT_VERIFIER_URL` is set |

### Hardcoded Credentials

**VERIFIED:** No hardcoded passwords, API keys, or secrets found in `.ts` or `.tsx` source files. `grep` search across all TypeScript source files for credential patterns returned zero matches. All secrets are read via `ConfigService` or `process.env`.

---

## 3. Existing Checks: Results

### 3.1 Git State

**Command:** `git -C ... status`  
**Exit code:** 0  
**Result:**
```
On branch main
Your branch is up to date with 'origin/backup-local-main'.
Changes not staged for commit:
  modified: .gitignore
```

Only `.gitignore` is modified and unstaged. No application code uncommitted.

**Command:** `git log --oneline -20`  
**Exit code:** 0  
**Recent commits:**
```
f7a0584 (HEAD -> main) chore: ignore .claude and .kilo folders
f6f98ac Initial Commit
557faa0 fix: teacher dashboard shows error state instead of 'no courses' on API failure
6900e1d fix(payments): secure manual receipt review
3f0d63a feat: harden verification and payment deployment flows
96965b7 fix(payments): allow retry after failed Chapa checkout
a12348d docs: preserve TLS when opening production access
fcc2179 test: harden production workflows and expand QA coverage
1841234 feat(api): gate paid quiz/flashcard content behind SubscriptionGuard
7e4275c feat(auth): server-side logout + Sentry error tracking
a58c9d6 feat(ci): add CI workflow for Node.js and Python services
```

### 3.2 Node / npm Versions

**Command:** `node --version; npm --version`  
**Exit code:** 0  
**Result:** Node v25.2.1, npm 11.19.0. Both exceed minimum engine requirements.

### 3.3 TypeScript Compilation — API (`apps/api`)

**Command:** `npx tsc --noEmit` (from `apps/api`)  
**Exit code:** 2 (FAIL)  
**Errors: 4 errors in 3 files — ALL in test spec files, zero in production code**

```
src/modules/auth/auth.service.spec.ts:15
  TS2743: No overload expects 1 type arguments, but overloads do exist that
          expect either 0 or 2 type arguments.

src/modules/payments/chapa.service.spec.ts:29 and :30
  TS2743: Same error — jest.fn<(args: T) => U>() — 1-arg generic form not
          accepted in Jest 30 which changed jest.fn type signatures.

src/modules/payments/payments.service.spec.ts:30
  TS2743: Same error.
```

**Root cause:** Jest 30 changed its TypeScript generic signature for `jest.fn<T>`. The 1-argument form `jest.fn<(arg: T) => U>()` is no longer valid; it now requires `jest.fn<U, [T]>()` (explicit return type + parameter tuple). This is a **test-only TypeScript error** — the production code compiles cleanly.

**Impact on production:** None. The `tsconfig.build.json` (used by `nest build`) excludes spec files. The production build succeeds.  
**Impact on CI:** The `npx jest --ci` step in CI does **not** run `tsc --noEmit` on spec files separately — it uses ts-jest which has its own diagnostics (and may be more lenient). The tests pass (see 3.5), suggesting ts-jest does not surface these specific errors as test failures. However, running `tsc --noEmit` as a strict CI check would fail — this is a latent defect.

### 3.4 TypeScript Compilation — Web (`apps/web`)

**Command:** `npx tsc --noEmit` (from `apps/web`)  
**Exit code:** 0 (PASS)  
**Result:** Zero TypeScript errors in the web application.

### 3.5 ESLint — API (`apps/api`)

**Command:** `npm run lint`  
**Exit code:** 0 (PASS)  
**Result:** No ESLint errors. (Note: the lint script runs with `--fix`, so any auto-fixable issues are already corrected.)

### 3.6 ESLint — Web (`apps/web`)

**Command:** `npx eslint src`  
**Exit code:** 1 (FAIL)  
**Errors: 1 error**

```
apps/web/src/app/(app)/admin/users/page.tsx line 120
  react-hooks/set-state-in-effect  (error)
  Avoid calling setState() directly within an effect
  
  Code: if (!assignDeptId) { setAssignYears([]); return; }
```

**Root cause:** The ESLint rule `react-hooks/set-state-in-effect` flags synchronous `setState` calls inside `useEffect`. The pattern is: when `assignDeptId` is empty/null, immediately clear the `assignYears` state. While this is functionally correct, the linter rule requires it be restructured (e.g., derive state or use `useMemo`).

**Impact:** This error is the reason the CI workflow marks web lint as `continue-on-error: true` with a comment "report-only for now". It does not block builds. However, it should be fixed.

### 3.7 Unit Tests — API (`apps/api`)

**Command:** `npx jest --passWithNoTests --forceExit`  
**Exit code:** 0 (PASS — all 76 tests passed)

```
Test Suites: 11 passed, 11 total
Tests:       76 passed, 76 total
Snapshots:   0 total
Time:        10.799s
```

**Test suites run:**
1. `src/common/utils/bank-account-match.spec.ts` — 10 tests ✅
2. `src/config/env.validation.spec.ts` — (part of 13 after suite 1) ✅
3. `src/common/guards/subscription.guard.spec.ts` ✅
4. `src/modules/payments/receipt-verifier.service.spec.ts` ✅
5. `src/app.controller.spec.ts` ✅
6. `src/common/guards/roles.guard.spec.ts` ✅
7. `src/common/utils/image-magic-bytes.spec.ts` ✅
8. `src/modules/subscriptions/subscriptions.service.spec.ts` ✅
9. `src/modules/payments/chapa.service.spec.ts` ✅
10. `src/modules/payments/payments.service.spec.ts` ✅
11. `src/modules/auth/auth.service.spec.ts` ✅

**Notable test behaviors (from output — expected failures that confirm correct error handling):**
- `ReceiptVerifierService`: "Verifier unreachable: request aborted" — correct behavior when the external verifier service is offline.
- `ChapaService`: Error and warning logs from test cases simulating Chapa failures — all pass as designed.
- `AuthService`: Rollback on email failure and resend failure logged — all pass.

**Warning:** `--forceExit` was required because `ioredis` and BullMQ leave async handles open after tests. This is a known issue with Redis-dependent test suites and is not a functional defect, but it means proper teardown should be added.

### 3.8 npm Security Audit

**Command:** `npm audit --audit-level=high` (from root)  
**Exit code:** -1 (TIMEOUT — command timed out after 120 seconds)  
**Result:** Could not complete. The npm audit endpoint was unresponsive within the timeout window. This is a network/environmental limitation. **INFERRED:** No audit result available. Should be run manually when network access to the npm registry is available.

---

## 4. Schema Summary

**Source:** `apps/api/prisma/schema.prisma` (17,727 bytes — read in full)

### All Database Models (28 total)

| Model | Purpose |
|---|---|
| `User` | Core user record — all roles |
| `SubscriptionPlan` | Plan tiers (name, price, duration) |
| `Subscription` | A user's current subscription (one per user via `@unique userId`) |
| `Payment` | Payment records (MANUAL or CHAPA) |
| `Department` | Academic department |
| `AcademicYear` | Year within a department (e.g. "Year 2") |
| `Semester` | Semester within an academic year |
| `Course` | Course within a semester |
| `Material` | Learning resource (PDF, IMAGE, YOUTUBE) |
| `AiContent` | AI-generated summary/topics per material |
| `FlashcardSet` | Flashcard deck linked to `AiContent` |
| `Flashcard` | Individual flashcard in a set |
| `FlashcardReview` | Student's per-card review state |
| `QuizBank` | AI-generated question bank per `AiContent` |
| `Quiz` | Takeable quiz (linked to `QuizBank` or standalone) |
| `Question` | Question (belongs to `Quiz` and/or `QuizBank`) |
| `QuizAttempt` | A student's quiz attempt |
| `QuizAnswer` | Individual answer within an attempt |
| `AiHistory` | Chat log for the AI tutor |
| `ForumSection` | Forum area per course |
| `ForumPost` | Forum post |
| `ForumReply` | Reply to a forum post |
| `Notification` | In-app notification |
| `ProgressRecord` | Material view tracking (upsert on access) |
| `Announcement` | Course announcement |
| `AuditLog` | Admin audit trail |
| `Reaction` | Like/love/etc. on post or reply |
| `Report` | Moderation report on post or reply |

### All Enums (8 total)

| Enum | Values |
|---|---|
| `Role` | GUEST, STUDENT, TEACHER, ADMIN, SUPER_ADMIN |
| `MaterialType` | PDF, IMAGE, YOUTUBE |
| `SubscriptionStatus` | PENDING, ACTIVE, EXPIRED, CANCELLED |
| `PaymentStatus` | PENDING, APPROVED, REJECTED |
| `PaymentMethod` | MANUAL, CHAPA |
| `AiStatus` | PENDING, PROCESSING, COMPLETED, FAILED |
| `NotificationType` | PAYMENT_APPROVED, PAYMENT_REJECTED, SUBSCRIPTION_EXPIRING, SUBSCRIPTION_EXPIRED, NEW_CONTENT, NEW_ANNOUNCEMENT, FORUM_REPLY, AI_COMPLETE |
| `ReactionType` | LIKE, LOVE, TARGET, FIRE |
| `ReportReason` | SPAM, OFFENSIVE, OFF_TOPIC, OTHER |
| `ReportStatus` | PENDING, ACTIONED, DISMISSED |

(Note: 10 enum values counted but 8 distinct named enums — ReactionType and ReportReason/ReportStatus are listed above.)

### Notable Constraints and Indexes

- `User.email` — `@unique` + `@@index([email])`
- `User.role` — `@@index([role])`
- `Subscription.userId` — `@unique` (one subscription per user enforced at DB level)
- `Payment.txRef` — `@unique` (Chapa idempotency key, anti-replay)
- `Payment.bankReference` — `@unique` (manual bank transfer anti-replay guard)
- `Payment.receiptNumber` — `@unique` (human-facing receipt number)
- `FlashcardReview` — `@@unique([userId, cardId])` (one review state per card per user)
- `Reaction` — `@@unique([userId, postId, type])` and `@@unique([userId, replyId, type])`
- `ProgressRecord` — `@@unique([userId, materialId])`
- `AiContent.materialId` — `@unique` (one AI generation per material)
- `FlashcardSet.aiContentId` — `@unique`
- `QuizBank.aiContentId` — `@unique`
- `Quiz.quizBankId` — `@unique` (at most one quiz per bank)
- `ForumSection.courseId` — `@unique` (one forum per course)
- `Notification` — `@@index([userId, isRead])`
- `AuditLog` — `@@index([actorId])`, `@@index([action])`, `@@index([createdAt])`
- `Reaction` — `@@index([postId])`, `@@index([replyId])`
- `Report` — `@@index([status])`, `@@index([postId])`, `@@index([replyId])`
- `Payment` — `@@index([userId, status])`, `@@index([status])`

### Notable Schema Issues Identified

1. **`Question` belongs to both `Quiz` and `QuizBank` via optional FKs** — a `Question` row can have both `quizId` and `quizBankId` set, or either, or neither. This is ambiguous ownership. Application code must enforce the invariant, which the schema alone cannot.

2. **`AcademicYear` has no `updatedAt`** — inconsistent with `Department` which has `updatedAt`. Minor but worth standardizing.

3. **`Semester` has no `updatedAt`** — same as above.

4. **`Flashcard` has no timestamps at all** — no `createdAt` or `updatedAt`. Acceptable for a leaf entity but prevents audit-trail queries.

5. **`AiHistory` references `courseId` and `materialId` as optional strings with no FK constraint** — these are not Prisma relations, just raw string fields. If a course or material is deleted, the history rows become orphaned with no cascade or constraint to detect it.

6. **`Announcement` has no `updatedAt`** — minor.

### Migration Count and Sync Status

**8 migration directories found:**
```
20260611063236_init
20260618104412_add_department_year_to_user
20260628120000_add_quiz_quizbank_link
20260628130000_add_forum_reactions_reports
20260629120000_add_chapa_payments
20260629140000_add_login_lockout
20260630120000_aicontent_error
20260701120000_add_bank_receipt_verification
```

**INFERRED (not verified — database not running):** Migration history aligns with schema features present. The schema includes all features implied by the migration names. Whether the live database is in sync with the schema cannot be verified without a running database connection.

---

## 5. Test Coverage Summary

### Test Frameworks Present

| Framework | Location | Purpose |
|---|---|---|
| Jest 30 + ts-jest | `apps/api` | Unit tests |
| Playwright 1.61 | `apps/web/e2e/` | End-to-end / smoke tests |
| Jest (e2e config) | `apps/api/test/` | API end-to-end (no spec files present) |
| Python unittest | `services/receipt-verifier/` | Normalizer unit tests |

### Unit Tests (API) — 11 spec files, 76 tests

| Spec File | Domain | Coverage |
|---|---|---|
| `auth.service.spec.ts` | Registration, login, lockout, email verification, forgot/reset password | Good (happy + error paths) |
| `chapa.service.spec.ts` | Chapa initialize, verify, webhook | Good |
| `payments.service.spec.ts` | Manual payment submit, admin review, receipt auto-verify | Good |
| `receipt-verifier.service.spec.ts` | External verifier HTTP calls, timeout, auth | Good |
| `subscriptions.service.spec.ts` | Active check, staff bypass | Good |
| `subscription.guard.spec.ts` | Guard allow/deny | Good |
| `roles.guard.spec.ts` | Role enforcement | Good |
| `env.validation.spec.ts` | Env var validation | Good |
| `bank-account-match.spec.ts` | Account number matching utility | Good |
| `image-magic-bytes.spec.ts` | File magic-byte validation | Good |
| `app.controller.spec.ts` | Health endpoint | Minimal |

### E2E Tests (Web) — 5 Playwright spec files

| Spec File | What it tests |
|---|---|
| `smoke.spec.ts` | Page loads, navigation |
| `auth.spec.ts` | Login flow (opt-in — requires live servers) |
| `accessibility.spec.ts` | WCAG axe checks on key pages |
| `theme.spec.ts` | Dark/light theme toggle |
| `verification.spec.ts` | Email verification page |

**Note:** Playwright e2e tests require both servers running and were **not run** during this audit (no live database or server available).

### API E2E Tests (`apps/api/test/`)

Only a `jest-e2e.json` config file exists. `app.e2e-spec.ts` is present (2,429 bytes). Not run during audit — requires a live database.

### Coverage Gaps

The following modules have **no unit tests at all**:
- `courses`, `departments`, `academic-years`, `semesters` services
- `materials` service (critical — file upload, access control, subscription gating)
- `forum` service
- `flashcards` service
- `quiz` service
- `ai` service / processor / Gemini service
- `tutor` service
- `progress` service
- `notifications` service
- `plans` service
- `users` service
- `mail` service

**Verified:** 11 spec files for approximately 30+ service/controller files. Coverage is concentrated in the security-critical and payment-critical paths. Functional coverage of content delivery, AI pipeline, and forum is zero at the unit test level.

---

## 6. Known Limitations

### External Services Not Reachable During Audit

| Service | Reason not reachable |
|---|---|
| PostgreSQL database | Not running locally during audit — no DB connection |
| Redis | Not verified as running locally |
| Chapa payment gateway | External service (Ethiopian fintech) — not reachable |
| Gemini AI API | Requires live API key and network access |
| SMTP (email) | Requires live SMTP credentials |
| Receipt verifier (Python) | Python FastAPI service — not started |
| Telebirr / CBE / other banks | External Ethiopian banking systems |

### Checks That Could Not Be Run

| Check | Reason |
|---|---|
| `prisma migrate status` | No DB connection — would fail or require credentials |
| `prisma db push` / `prisma validate` | Not run — would require schema-to-DB comparison |
| Production build (`nest build`, `next build`) | Not run — safe but would require generating Prisma client first |
| API e2e tests | Require live PostgreSQL + Redis |
| Playwright e2e tests | Require both servers running |
| `npm audit` | Timed out — npm registry unreachable from this environment |
| Docker image build | Not run — requires Docker daemon |

### Environmental Limitations (Windows / PowerShell)

- Some commands use Unix semantics (e.g., the `npm audit` spinner output filled stderr before timeout)
- `&&` chaining not available in PowerShell; `;` used instead
- No Docker daemon was accessed during audit

---

## 7. Uncommitted Changes

**Source:** `git status` output

| File | Change | Description |
|---|---|---|
| `.gitignore` | Modified (not staged) | Likely adds `.claude` and `.kilo` directories based on the most recent commit message `chore: ignore .claude and .kilo folders` — the commit exists but the `.gitignore` file itself shows as locally modified, suggesting a slight divergence between the committed version and the working copy. |

**Action required:** Stage and commit the `.gitignore` modification, or verify the working copy matches what was intended by the last commit.

---

## 8. Initial Blockers

### Blockers Preventing Production Deployment Right Now

| Severity | Blocker | Details |
|---|---|---|
| 🔴 HIGH | Redis not configured in `apps/api/.env` | `REDIS_HOST` and `REDIS_PORT` absent from the app-level env file. Auth logout and token refresh depend on Redis. BullMQ AI job queue requires Redis. App will crash or degrade without it. |
| 🔴 HIGH | Duplicate keys in `apps/api/.env` | `CORS_ORIGIN` and `WEB_PUBLIC_URL` each appear twice. Last value silently wins. May produce unexpected behavior if keys hold different values. |
| 🟡 MEDIUM | TypeScript errors in 3 spec files | 4 `TS2743` errors in test files due to Jest 30 generic type change. Does not block production build but causes `tsc --noEmit` to fail across the whole project. |
| 🟡 MEDIUM | ESLint error in admin users page | `react-hooks/set-state-in-effect` in `admin/users/page.tsx:120`. CI works around it with `continue-on-error: true`. Should be fixed properly. |
| 🟡 MEDIUM | `AiHistory.courseId`/`materialId` missing FK relations | These are raw strings, not Prisma relations. Orphaned records accumulate silently if courses/materials are deleted. |
| 🟡 MEDIUM | No `REDIS_HOST`/`REDIS_PORT` in `apps/api/.env` | See above — also prevents dev environment from working without knowing the implicit default (localhost:6379). |
| 🟡 MEDIUM | `console.log` debug statements in `courses.service.ts` | Three `console.log` calls at lines for `findByTeacher` and `update` — intended for debugging the teacher dashboard bug fix, not for production. |
| 🟢 LOW | `packages/` directory in workspaces but doesn't exist | `package.json` workspace glob `packages/*` — non-fatal but generates a warning on `npm install`. |
| 🟢 LOW | `MailModule` in AuthModule creates a new transporter per email | `nodemailer.createTransport()` called in `sendMail()` private method on every invocation rather than once in the constructor. Minor inefficiency, not a blocker. |
| 🟢 LOW | No `updatedAt` on `AcademicYear`, `Semester`, `Announcement`, `Flashcard` | Schema inconsistency. Cannot block deployment but may cause issues if these entities ever need audit-trail queries. |

### What Does NOT Block Deployment

- All 76 unit tests pass.
- Web TypeScript compilation: zero errors.
- API TypeScript compilation: zero errors in production code (errors are spec-file only).
- API ESLint: clean.
- Security architecture: JWT secrets validated at boot; empty/weak secrets refused. No hardcoded credentials found in source code.
- Subscription gating: enforced at both API guard level and material access level.
- File upload security: magic-byte validation implemented and tested.
- CORS: properly configured with `credentials: true`.
- Rate limiting: global ThrottlerGuard + per-endpoint overrides on auth routes.

---

## 9. Next Steps — Prioritized Audit Phases

### Immediate (before proceeding to Phase Two)

1. **Fix `apps/api/.env` duplicate keys** — deduplicate `CORS_ORIGIN` and `WEB_PUBLIC_URL`; add `REDIS_HOST` and `REDIS_PORT`.
2. **Fix Jest 30 type errors in 3 spec files** — update `jest.fn<(arg: T) => U>()` to `jest.fn<U, [T]>()` pattern.
3. **Fix ESLint error in `admin/users/page.tsx`** — refactor the `setState` call out of the effect body.
4. **Remove debug `console.log` statements** from `courses.service.ts`.

### Phase Two — Requirements and Feature Inventory

- Trace each feature end-to-end: UI → API → DB → response
- Verify: registration/login/email-verify/password-reset flow
- Verify: subscription purchase flow (manual bank transfer + Chapa paths)
- Verify: content access control (subscription gate on materials, quiz, flashcards)
- Verify: AI pipeline (PDF upload → BullMQ queue → Gemini → flashcards + quiz generation)
- Verify: AI tutor chat flow
- Verify: admin payment review flow
- Verify: forum CRUD + moderation
- Classify each feature: Implemented and Verified / Partial / Broken / Missing

### Phase Three — Database and Relationship Audit

- Inspect N+1 query risks in `findByCourse` + `withUploaderNames` pattern
- Resolve `Question` dual-FK ambiguity (`quizId` + `quizBankId` both optional)
- Evaluate `AiHistory` orphan risk (non-relational foreign keys)
- Check cascade behaviors on delete for `Course`, `Material`, `AiContent`, `FlashcardSet`, `QuizBank` chain
- Verify migration files match schema exactly

### Phase Four — Security Audit

- Test brute-force lockout behavior
- Verify token refresh reuse-detection (stolen token replay)
- Verify file access control: can a student access another department's materials by guessing a material ID?
- Verify admin-only routes cannot be reached by students or teachers
- Review receipt upload path traversal guards
- Verify Chapa webhook HMAC signature verification
- Check `forbidNonWhitelisted: true` on ValidationPipe is not causing legitimate requests to fail

### Phase Five — Performance and UX

- Audit React Query `staleTime` / `cacheTime` configuration (currently none set — defaults to 0/5min)
- Check for N+1 queries in forum (posts + replies + reactions + author)
- Verify `ProgressRecord` upsert does not cause contention under concurrent access
- Audit BullMQ AI processor retry behavior on Gemini failure

### Phase Six — DevOps and Deployment Certification

- Verify Docker build succeeds (API + Web Dockerfiles)
- Verify `docker-compose.prod.yml` service dependencies and health checks
- Verify Nginx configuration for TLS termination and proxy headers
- Verify `prisma migrate deploy` runs correctly in the `docker-entrypoint.sh`
- Verify Sentry integration is wired and capturing errors
- Run `npm audit` from a networked environment
- Final go/no-go recommendation

---

## Appendix: File Tree Snapshot

### API modules (`apps/api/src/modules/`)
```
auth/           courses/        departments/    academic-years/
semesters/      materials/      plans/          payments/
subscriptions/  ai/             forum/          flashcards/
quiz/           tutor/          progress/       notifications/
users/          mail/
```

### Web pages (`apps/web/src/app/`)
```
(app)/                    ← Authenticated area (sidebar/topbar layout)
  dashboard/page.tsx
  courses/[id]/page.tsx
  courses/[id]/study/page.tsx
  courses/page.tsx
  ai-tutor/page.tsx
  flashcards/page.tsx
  quiz/page.tsx
  forum/page.tsx
  progress/page.tsx
  profile/page.tsx
  notifications/page.tsx
  teacher/page.tsx
  teacher/courses/page.tsx
  teacher/analytics/page.tsx
  admin/page.tsx
  admin/users/page.tsx
  admin/courses/page.tsx
  admin/payments/page.tsx
  admin/plans/page.tsx
  admin/moderation/page.tsx
  admin/audit/page.tsx

login/page.tsx
register/page.tsx
admin-login/page.tsx
forgot-password/page.tsx
reset-password/page.tsx
verify-email/page.tsx
pricing/page.tsx
pricing/subscribe/page.tsx
pricing/payment/callback/page.tsx
api/proxy/[...path]/route.ts    ← SSRF-hardened file proxy for PDF/image serving
```

---

*Report generated by automated audit pass. All findings are evidence-based from file reads and command outputs as documented in Section 3. No source code was modified during this audit phase.*

---

# REVISION 2 — re-baseline (2026-10-17)

> This revision re-established the baseline for a new audit pass. **The previous
> revision above is preserved unchanged** (it is not overwritten). This pass was
> performed under a hard environmental limitation, documented below, which
> changes what can be *proven* versus what can be *read*.

## R2.1 Environmental limitation (BLOCKING for verification)

During this pass **no command could be executed on this machine**:

| Tool | Status | Evidence |
|---|---|---|
| Shell (`powershell`) | **BROKEN** | Repeated calls fail with `The type initializer for 'System.Net.ServicePointManager' threw an exception.` at host startup — before any command runs. |
| `glob` (file search) | **BROKEN** | `ripgrep archive did not contain executable: ...ripgrep-15.1.0-...-msvc\rg.exe` |
| `grep` (content search) | **BROKEN** | Same ripgrep failure. |
| Code-mode tool catalog | **No exec/shell tool** | Searched the full catalog: only `browser.*` and `opencode.*` tools exist. No command/process/terminal tool. |

**Consequence:** `tsc`, `eslint`, `jest`, `nest build`, `next build`, `prisma
validate`/`migrate`, `npm ci`, `npm audit`, Docker, Playwright, and the Python
verifier tests **could not be run in this session**. The successful checks quoted
in the previous revision (76 unit tests passing, clean web `tsc`, etc.) are
**NOT re-verified here** — they remain the prior pass's claims. Everything in
this revision is therefore **static (file-read) evidence only**, and every
execution-dependent item is marked **NOT VERIFIED**.

All tooling available this pass: `read`, `edit`, `write`. Everything below is
based on reading the actual files.

## R2.2 Repository state (static evidence)

- `.git/HEAD` → `ref: refs/heads/main`.
- `.git/packed-refs` → local `refs/heads/main` = **`f7a0584`**, which matches the
  prior revision's HEAD. `refs/remotes/origin/main` = `fbe3ee0` (ahead of local)
  and `refs/remotes/github-old/main` = `6900e1d`.
- **Cannot** determine uncommitted changes this pass (no `git status`).
  Previous revision recorded only `.gitignore` modified.
- Working tree is a large npm-workspaces monorepo: `apps/api` (NestJS),
  `apps/web` (Next.js), `services/receipt-verifier` (Python), `deploy/`,
  `docs/`, plus `.github/workflows/ci.yml`.

## R2.3 Static verification of prior key claims (this pass)

Read and confirmed present/correct in the working tree:

| Claim | File(s) read | Result |
|---|---|---|
| Env fail-fast validation (JWT entropy, prod-only rules, Chapa all-or-nothing, SMTP, non-localhost URLs, verifier token/accounts) | `apps/api/src/config/env.validation.ts` | **Confirmed.** Logic is thorough; requires ≥32-char differing JWT secrets in prod, rejects placeholders/repeated-char, requires SMTP + real URLs, validates verifier token/accounts/timeout. |
| No empty JWT fallback | `apps/api/src/common/strategies/jwt.strategy.ts` | **Confirmed.** Throws if `JWT_ACCESS_SECRET` missing; `ignoreExpiration:false`; reads `access_token` cookie. |
| `forbidNonWhitelisted: true` | `apps/api/src/main.ts` | **Confirmed** (prior backlog item P1 is already done). |
| Global rate limiting | `apps/api/src/app.module.ts` | **Confirmed.** `ThrottlerGuard` global (120/min); `AllExceptionsFilter` global. |
| Chapa webhook raw-body HMAC support | `apps/api/src/main.ts` | **Confirmed** `rawBody: true`. |
| Refresh rotation + denylist (fail-open) | `auth.controller.ts`, `token-denylist.service.ts` | **Confirmed.** Rotation burns jti before reissue; denylist fails OPEN on Redis error (logged) — still a (documented) trade-off. |
| Subscription guard fail-closed when no user | `subscription.guard.ts` | **Confirmed.** |
| Health liveness + DB readiness probes | `app.controller.ts` | **Confirmed.** `/health` and `/health/ready` (`SELECT 1`). |
| Centralized `RequestUser`, `PRIVILEGED_ROLES` | `common/types/request-user.ts`, `common/constants/roles.ts` | **Confirmed.** Prior "shared AuthUser / role constants" cleanup is done. |
| Single-flight refresh queue | `apps/web/src/lib/api.ts` | **Confirmed.** Concurrent 401s share one refresh; auth/pricing pages excluded from refresh loop. |
| Edge auth redirect via Next 16 "proxy" | `apps/web/src/proxy.ts` + `lib/route-access.ts` | **Confirmed.** Presence-only cookie check at edge; role gates centralized. |
| React Query `["me"]` shared cache | `apps/web/src/hooks/use-auth.ts` | **Confirmed.** |
| CI runs API build + jest; web lint report-only | `.github/workflows/ci.yml` | **Confirmed.** Web lint is `continue-on-error: true`; API build + jest + web build are gates. |

## R2.4 New/confirmed defects found this pass (static)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| B-1 | P2 | **`UsersService.deleteInactiveUsers()` will fail with a FK violation** for most real (inactive) students: it only deletes `progressRecord`, `notification`, `aiHistory` then `user.deleteMany`, but does **not** remove `flashcardReview`, `quizAttempt`/`quizAnswer`, `reaction`, `report`, `payment`, `subscription`, or `auditLog` rows that reference the user. Unlike `deleteUser()` (which cleans all of them in a transaction). | `apps/api/src/modules/users/users.service.ts:230-269` vs `:467-570` |
| B-2 | P3 | **Dead code:** `UsersService.createStaffAccount()` is never called by any controller (controller uses `createUser`); it also lacks role-hierarchy checks and returns a plaintext temp password. | `users.service.ts:674-716` |
| B-3 | P3 | **Dead type field:** `RegisterResponse.verifyToken` with `// Remove in production`; API never returns it. | `apps/web/src/types/index.ts:21-24` |
| B-4 | P3 | `UsersService.changeStatus(userId, isActive, _actorId)` ignores the actor and writes **no `AuditLog`** for account activate/deactivate. | `users.service.ts:366-380` |
| B-5 | P3 | `useAuth().register()` posts only `{fullName,email,password}` while `RegisterDto` requires `departmentId`/`academicYearId` + `phoneNumber` — the hook's `register` will 400 if used; register page must call `api` directly. Needs confirming the page doesn't use the hook. | `use-auth.ts:63-66` vs `auth/dto/register.dto.ts` |
| B-6 | P3 | `AiHistory.courseId`/`materialId` are **raw strings with no FK** (not Prisma relations) → orphaned rows if a course/material is deleted; no cascade. | `prisma/schema.prisma:395-405` |
| B-7 | P2 | **Missing hot-path indexes** on `Material.courseId`, `Course.semesterId`, `Course.teacherId`, `QuizAttempt.userId`, `Payment.createdAt`. | `prisma/schema.prisma` (Material/Course/QuizAttempt/Payment models) |
| B-8 | P2 | `Question` has **two optional owners** (`quizId` + `quizBankId`); nothing at the DB level enforces exactly-one. Ambiguous ownership must be enforced in code. | `schema.prisma:354-367` |
| B-9 | P3 | `AcademicYear`, `Semester`, `Announcement`, `Flashcard` have **no `updatedAt`** (inconsistent with the rest). | `schema.prisma` |
| B-10 | INFO | `apps/api/.env` reportedly contains duplicate keys and live-looking secrets (prior R1). **NOT re-verified this pass** (deliberately not read, to avoid re-exposing secrets into the transcript). Treat as unresolved until rotated and validated. | R1 §2 |

Static **positives** re-confirmed: no hardcoded credentials in `.ts` source
(consistent with R1); consistent error envelope; ownership checks exist in
`users.service.ts`; the schema's cardinalities/unique constraints are sound.

## R2.5 Baseline status

- **Repository readiness:** code appears materially production-grade at the
  static level (consistent with the prior "READY FOR STAGING" verdict).
- **Verification readiness:** **BLOCKED** — nothing executable in this
  environment. No build, test, lint, type-check, migration, or dependency scan
  result can be produced here.
- **Deployment verdict from this pass:** cannot be GREEN. See Phase Twelve.

## R2.6 Next steps

1. Restore a working shell + ripgrep, or run the check suite on CI/manually, and
   attach raw output.
2. Rotate all secrets in `apps/api/.env` and `.env.production` (R1 S-1).
3. Fix the P2 defects B-1, B-7 and the P3 cleanups B-2..B-6, B-9.
4. Re-run `tsc`, `eslint`, `jest`, `nest build`, `next build`, `prisma migrate
   deploy` against a disposable DB, `npm audit`, and the CI workflow.

## R2.7 Safe fixes applied this pass (2026-10-17)

Applied during the same session, using only `read`/`edit`/`write`. Not compiled
or executed — see `CLEANUP-REPORT.md` for full detail and risk notes.

| ID | Change | File(s) |
|---|---|---|
| B-1 | `deleteInactiveUsers()` now uses the full FK-safe cascade (extracted to a shared private `cascadeDeleteUser(tx, userId)`) instead of throwing a FK error | `users.service.ts` |
| B-2 | Removed dead, hierarchy-unchecked `createStaffAccount()` | `users.service.ts` |
| B-4 | `changeStatus()` now writes an `AuditLog` (`USER_ACTIVATED`/`USER_DEACTIVATED`) | `users.service.ts` |
| B-11 | Removed debug `console.log` from `CoursesService.update` | `courses.service.ts` |
| B-3 | Removed dead `RegisterResponse.verifyToken` field | `apps/web/src/types/index.ts` |
| B-7 | Added additive FK indexes (new migration `20261017120000_add_performance_indexes` + matching `@@index`) | `schema.prisma`, `prisma/migrations/...` |

Not changed (documented, need a decision/owner action): B-5 (dead `useAuth.register` mismatch), B-6 (`AiHistory` non-relational FKs), B-8 (`Question` dual owner), B-9 (missing `updatedAt`), B-10/secrets (rotation is an operator action).

Deliverables written this pass: `FEATURE-VERIFICATION.md`, `DATABASE-AUDIT.md`,
`FRONTEND-AUDIT.md`, `BACKEND-API-AUDIT.md`, `SECURITY-AUDIT.md`, `TEST-PLAN.md`,
`TEST-RESULTS.md`, `PERFORMANCE-RELIABILITY-AUDIT.md`, `CLEANUP-REPORT.md`,
`DEPLOYMENT-READINESS.md`, `FINAL-PRODUCTION-READINESS-REPORT.md`.
