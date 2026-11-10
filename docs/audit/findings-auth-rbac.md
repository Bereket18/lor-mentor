# Auth & RBAC Audit Findings

**Audit date:** 2025-10-15  
**Auditor:** Kiro autonomous audit agent  
**Scope:** Feature 1 — Authentication · Feature 2 — Role-Based Access Control  
**Codebase root:** `apps/api` (NestJS/Prisma) · `apps/web` (Next.js)

> **Partially superseded.** Sections 1a–1b describe the email-verification design
> as it stood on the audit date: a 64-hex token in `User.emailVerifyToken`,
> emailed as a link, looked up by `findByVerifyToken`. That flow has since been
> replaced by a six-digit code stored as a bcrypt hash in the `VerificationCode`
> table. Everything else in this document still describes the code as it is.
> The record below is left as the dated finding it is — see `SECURITY.md` §3 and
> `docs/audit/CURRENT_ARCHITECTURE.md` for the current design.

---

## Feature 1: Authentication

---

### 1a. Registration (student vs staff paths)

**Status: PARTIAL**

**Frontend:**
- `apps/web/src/app/register/page.tsx` — single public form collects `fullName`, `email`, `password`, `phoneNumber`, `departmentId`, `academicYearId`; POSTs to `POST /api/v1/auth/register`; on success redirects to `/verify-email?email=…`
- `apps/web/src/app/admin-login/page.tsx` — separate login portal for admin/SUPER_ADMIN; no separate admin *registration* page — staff accounts are created by an admin via `POST /api/v1/users/create-staff`

**API Route:** `POST /api/v1/auth/register` in `apps/api/src/modules/auth/auth.controller.ts:AuthController.register`  
Throttle: 5 requests / 60 s per IP via `@Throttle`.

**Service:** `apps/api/src/modules/auth/auth.service.ts:AuthService.register`

Execution path:
1. Duplicate email check (`usersService.findByEmail`)
2. Department existence + `isArchived` check
3. Academic year cross-department validation (departmentId/academicYearId pair must match — prevents client-side tampering)
4. `bcrypt.hash(password, 12)`
5. `usersService.create(...)` — role defaults to `STUDENT` (Prisma schema `Role @default(STUDENT)`)
6. `crypto.randomBytes(32)` verification token, 24-hour expiry stored in DB
7. Verification email sent; if either step (6 or 7) throws the user row is hard-deleted (rollback)

**DB tables affected:** `User`, `Department` (read), `AcademicYear` (read)

**Staff registration path:**  
There is **no public staff registration route**. Staff accounts (`TEACHER`, `ADMIN`, `SUPER_ADMIN`) are created exclusively via:
- `POST /api/v1/users/create-staff` — `apps/api/src/modules/users/users.service.ts:UsersService.createStaffAccount` (older method, role limited to `TEACHER`/`ADMIN`)
- `POST /api/v1/users/create-staff` resolved through `UsersController.createUser` → `UsersService.createUser` — broader: SUPER_ADMIN can create any role; ADMIN can create STUDENT or TEACHER
- Staff accounts are created with `isEmailVerified: true` and `isActive: true` — no email verification step

**Gaps / Issues:**
1. **`RegisterResponse` type in `apps/web/src/types/index.ts:22` declares a `verifyToken: string` field** with comment `// Remove in production`. The actual API response only returns `{ message }` — the token is never in the response body. This is a dead type field but signals a removed-but-not-cleaned-up debug artefact.
2. **`RegisterDto` has no `@IsString()` guard on `phoneNumber`** — only `MinLength`/`MaxLength`. A non-string value that satisfies length constraints would pass validation (minor, mitigated by `ValidationPipe` `transform: true`).
3. **No password complexity rule** beyond `MinLength(8)` — no uppercase, digit, or symbol requirement.
4. **No email domain allow-list** — any valid email format is accepted; institutional email enforcement (e.g. `@lorcan.edu.et`) is absent.

---

### 1b. Email Verification Flow

**Status: VERIFIED**

**What triggers the verification email:**  
`AuthService.register` (step 7 above) calls `MailService.sendEmailVerification(user.email, verifyUrl)` immediately after saving the token. URL shape: `${WEB_PUBLIC_URL}/verify-email?token=<hex>&email=<encoded>`.

Resend endpoint: `POST /api/v1/auth/resend-verification` (`AuthController.resendVerification`) — uses `ForgotPasswordDto` (email only). Throttle: 3 / 60 s.

**Route handling the click:**  
`apps/web/src/app/verify-email/page.tsx` — on mount, if `?token=` is present in the URL a `POST /api/v1/auth/verify-email` is fired automatically via `queueMicrotask`. The user can also paste a token manually.

Backend: `POST /api/v1/auth/verify-email` → `AuthService.verifyEmail(token)`:
1. `usersService.findByVerifyToken(token)` — searches `User.emailVerifyToken`
2. Expiry check: `user.emailVerifyExpiry < new Date()` → `BadRequestException('Verification link has expired. Please request a new one.')`
3. `usersService.markEmailVerified(userId)` — sets `isEmailVerified=true`, nulls `emailVerifyToken`/`emailVerifyExpiry`

**What happens if token is expired:**  
`BadRequestException` → HTTP 400 with message `"Verification link has expired. Please request a new one."`. The frontend displays this error and provides a resend form.

**Gaps / Issues:**
1. **`POST /api/v1/auth/verify-email` accepts a plain string `token` via `@Body('token')`** — no DTO class, so `ValidationPipe` cannot validate its length or format. A missing or empty body sends `undefined`, which will cause `findByVerifyToken(undefined)` to likely return `null` (safely rejected), but there is no explicit "token required" validation message.
2. Resend rollback logic (`resendVerification`) correctly attempts to restore the old token if the new email fails to send, but **the restore uses `updateMany` matching on the new token value** — a narrow race window remains if two concurrent resends fire simultaneously. Risk is low.

---

### 1c. Login (all roles)

**Status: VERIFIED**

**Route:** `POST /api/v1/auth/login` in `AuthController.login`  
Throttle: 5 / 60 s per IP.

**Password comparison:** `bcrypt.compare(dto.password, user.passwordHash)` — `apps/api/src/modules/auth/auth.service.ts:AuthService.login`

**Login checks in order:**
1. User exists (anti-enumeration: same error for bad email or bad password)
2. Account locked (`user.lockoutUntil > new Date()`)
3. Account active (`user.isActive`)
4. Email verified (`user.isEmailVerified`)
5. Password match (bcrypt)

**JWT payload shape:**
```json
{ "sub": "<userId>", "email": "<email>", "role": "<role>" }
```
Signed with `JWT_ACCESS_SECRET`, expires per `JWT_ACCESS_EXPIRES_IN` env var (default `"15m"`).  
Source: `AuthService.generateTokens` — `apps/api/src/modules/auth/auth.service.ts:333`

Refresh token payload: `{ "sub": "<userId>", "jti": "<uuid>" }` — no `role` or `email`.  
Signed with `JWT_REFRESH_SECRET`, expires per `JWT_REFRESH_EXPIRES_IN` (default `"7d"`).

**Cookie settings:**
```typescript
// Both tokens:
httpOnly: true
secure:   NODE_ENV === 'production'  // plain HTTP allowed in dev
sameSite: 'lax'
path:     '/'

// access_token maxAge: 15 * 60 * 1000  (15 min)
// refresh_token maxAge: 7 * 24 * 60 * 60 * 1000  (7 days)
```
Source: `cookieOptions()` helper — `apps/api/src/modules/auth/auth.controller.ts:19`

**Response body:** `{ message, user: { id, email, fullName, role } }` — tokens are **not** in the body.

**Gaps / Issues:**
1. **`LoginDto` has no `@MinLength` or `@MaxLength` on `password`** — any non-empty string passes validation. This is intentional for the login path (existing users may have older passwords) but means a 0-length password string would be accepted by the DTO before reaching bcrypt (bcrypt returns `false` for a blank password vs any hash, so it fails safely, but a 400 would be cleaner).
2. **`sameSite: 'lax'`** is appropriate for cookie-based auth with redirect flows but does not protect against CSRF on same-site POST requests from top-level navigations. No explicit CSRF token mechanism exists. The impact is low for API-only usage but worth noting.
3. **`secure` is `false` in non-production** — tokens are sent over plain HTTP in development/staging. Acceptable for local dev, but staging environments should also set `NODE_ENV=production`.

---

### 1d. Logout

**Status: VERIFIED**

**Route:** `POST /api/v1/auth/logout` in `AuthController.logout`

**Cookie clearing:** Both `access_token` and `refresh_token` cookies are cleared via `res.clearCookie(name, options)` using the same `cookieOptions()` helper as login — ensuring `path`, `httpOnly`, `sameSite`, and `secure` match (mismatched `path` would silently fail to clear the cookie).

**Server-side token invalidation:**  
`AuthService.revokeRefreshToken(token)` is called before clearing cookies:
1. Decodes and verifies the refresh token JWT
2. Extracts `jti` and `exp`
3. Calls `TokenDenylistService.deny(jti, ttl)` — stores `denylist:refresh:<jti> = '1'` in Redis with TTL = remaining token lifetime

On `/auth/refresh` the denylist is checked via `assertRefreshTokenActive(jti)` before issuing new tokens. A copied/stolen refresh token is revoked immediately at logout.

**Gaps / Issues:**
1. **Access tokens are not invalidated server-side** — only the cookie is cleared. If an attacker copies the `access_token` cookie before logout they can still call the API for up to 15 minutes. This is standard JWT behaviour but is worth documenting. Mitigation requires an access-token denylist (not currently implemented).
2. **`revokeRefreshToken` silently ignores errors** (`catch {}`) — if the token is already expired or malformed, revocation is skipped. This is intentional (no functional regression) but means tampered tokens are silently discarded rather than logged.

---

### 1e. Password Reset (forgot + reset)

**Status: VERIFIED**

**Forgot password:**  
Route: `POST /api/v1/auth/forgot-password` → `AuthService.forgotPassword(email)`  
Throttle: 3 / 60 s per IP.

- If email not found: **returns the same generic message** `"If that email exists, a reset link has been sent."` — anti-enumeration is correct.
- If found: `crypto.randomBytes(32).toString('hex')` token, 1-hour expiry, stored via `usersService.saveResetToken`, email sent via `MailService.sendPasswordReset`.
- If email send fails: error is logged but the method **still returns the generic success message** — the token is left in the DB but the user never received the email. They can retry (throttled to 3/min).

**Reset:**  
Route: `POST /api/v1/auth/reset-password` → `AuthService.resetPassword(token, newPassword)`  
Throttle: 5 / 60 s per IP.

Uses `UsersService.claimResetToken(token, passwordHash)`:
```sql
UPDATE User
SET passwordHash=?, failedLoginCount=0, lockoutUntil=NULL,
    passwordResetToken=NULL, passwordResetExpiry=NULL
WHERE passwordResetToken=? AND passwordResetExpiry > NOW()
RETURNING count
```
Atomic single-UPDATE — eliminates TOCTOU race. Returns `false` if no row matched (expired or invalid token) → `BadRequestException('Invalid or expired reset link')`.

Also resets `failedLoginCount` and `lockoutUntil` — a locked user can unlock by resetting their password.

**Gaps / Issues:**
1. **`ResetPasswordDto.token` has no length or format validation** — `@IsString()` only. A very long string is not rejected before hitting the DB query. Low risk (parameterized query prevents injection) but could waste DB resources.
2. After a successful reset, **active sessions (cookies) are not invalidated** — a user who resets their password while logged in on device A keeps their session on device A. The refresh token on device A remains valid until expiry (up to 7 days).

---

### 1f. Token Refresh

**Status: VERIFIED**

**Route:** `POST /api/v1/auth/refresh` in `AuthController.refresh`

**Validation flow:**
1. Read `refresh_token` cookie — 401 if absent
2. `AuthService.verifyRefreshToken(token)` — full JWT signature + expiry check against `JWT_REFRESH_SECRET`
3. `AuthService.assertRefreshTokenActive(payload.jti)` — Redis denylist lookup; **fails OPEN** if Redis is down (logged, token allowed)
4. `AuthService.revokeRefreshPayload(payload)` — immediately burns the presented `jti` in Redis (rotation)
5. `AuthService.refreshTokens(payload.sub)` — loads user from DB, issues new access + refresh token pair
6. New tokens written to cookies; old cookies replaced

**DB lookup:** Yes — `usersService.findById(payload.sub)` in `refreshTokens` verifies the user still exists and is active (via `JwtStrategy.validate` pattern replicated in service).

**Rotation (reuse detection):** Yes — step 4 burns the presented jti before issuing new tokens. A stolen refresh token presented after the legitimate client has already rotated it will be in the denylist and rejected with 401.

**Gaps / Issues:**
1. **`assertRefreshTokenActive` fails OPEN** when Redis is unreachable — a revoked token (e.g. post-logout) would be accepted if Redis is down. This is a documented design choice (avoid locking out all users during a Redis outage) but is a security degradation window.
2. **No `@UseGuards` on `/auth/refresh`** — intentional (the guard would reject unauthenticated requests before the refresh logic runs), but it is worth noting the route has no JwtAuthGuard.

---

### 1g. Brute-Force Lockout

**Status: VERIFIED**

**Constants:** `MAX_FAILED_LOGINS = 5`, `LOCKOUT_MINUTES = 15`  
Source: `apps/api/src/modules/auth/auth.service.ts:27–28`

**Trigger:** On each failed password comparison, `recordFailedLogin(userId, currentCount, ip)` is called:
- Increments `User.failedLoginCount` in DB
- When `nextCount >= 5`: resets counter to 0, sets `User.lockoutUntil = now + 15 min`
- Writes an `AuditLog` row with action `AUTH_LOGIN_FAILED` or `AUTH_ACCOUNT_LOCKED`, IP address, and attempt count

**Lockout check:** At login step 2, before password comparison: `user.lockoutUntil && user.lockoutUntil > new Date()` → 401 with human-readable message. Locked users are told to wait or reset password.

**Storage:** DB fields `failedLoginCount INT` and `lockoutUntil DATETIME` on the `User` model — no Redis involved.

**Reset:** Counter and lockout are cleared on any successful login (step 6 in `AuthService.login`). They are also cleared by `claimResetToken` (password reset) and `updatePassword`.

**Additional rate limiting:** Global `ThrottlerGuard` (120 req/min/IP) + per-route `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on `POST /auth/login`. Both layers are active.

**Gaps / Issues:**
1. **Per-account lockout, not per-IP lockout** — a distributed credential-stuffing attack across many accounts would not trigger lockout on any single account. The per-IP throttler (5 req/60 s on the login route) partially mitigates this.
2. **No progressive delay** between failed attempts — the lockout is binary (5 failures → 15 min lock). An attacker gets 4 free guesses per 15-minute window indefinitely.
3. **`recordFailedLogin` is not called when the account is already locked** — step 2 returns early before step 5, so the counter does not accumulate during the lockout period. This is correct behaviour.

---

### 1h. Session Persistence

**Status: VERIFIED**

**Frontend session check on page load:**  
`apps/web/src/hooks/use-auth.ts:fetchMe` — called by React Query with key `["me"]` on every component that calls `useAuth()`. Fires `GET /api/v1/me` (routed through Next.js rewrite proxy to `http://localhost:4000/api/v1/me`). Returns `null` on any error (401, network failure) — treated as logged-out state.

**Backend route:** `GET /api/v1/me` in `apps/api/src/app.controller.ts:AppController.getMe` — guarded by `JwtAuthGuard`. Returns `{ message, user }` where `user` is the `RequestUser` shape (no passwordHash).

**`JwtStrategy.validate`** (called on every authenticated request):
1. Looks up `usersService.findById(payload.sub)` — live DB hit per request
2. If user not found → 401
3. If `!user.isActive` → 401

**Token refresh on 401:** `apps/web/src/lib/api.ts` axios interceptor — on any 401 (except on auth pages and the refresh request itself), fires `POST /api/v1/auth/refresh`. Concurrent 401s share one refresh call (queue mechanism). On refresh failure, redirects to `/login`.

**Gaps / Issues:**
1. **`JwtStrategy.validate` makes a DB query on every single authenticated API call** — there is no caching layer. At scale this is N DB reads per second per active user. Acceptable for current scale, but worth noting for future optimisation.
2. **React Query has no explicit `staleTime` configured** for the `["me"]` query, meaning it uses the default (0 ms) — every component mount refetches `/me`. A `staleTime` of 30–60 s would reduce redundant requests.

---

## Feature 2: Role-Based Access Control

---

### 2a. Role Assignment

**Status: VERIFIED**

**At registration:** `UsersService.create` is called without a `role` field — the Prisma schema sets `role Role @default(STUDENT)`. All self-registered users are always `STUDENT`. There is no way to self-register as any other role.

**Admin role change:**  
Route: `PATCH /api/v1/users/:id/role` in `UsersController.changeRole`  
Guards: `JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN', 'SUPER_ADMIN')`  
Service: `UsersService.changeRole` → `role.util.ts:canChangeRole`:
- `SUPER_ADMIN` can change any role to any role
- `ADMIN` cannot touch ADMIN/SUPER_ADMIN users; can only assign `STUDENT` or `TEACHER`
- Actor cannot change their own role (`userId === actorId` → 403)

Role hierarchy is the single source of truth at `apps/api/src/modules/users/role.util.ts`.

**Staff account creation:**  
`POST /api/v1/users/create-staff` → `UsersController.createUser` → `UsersService.createUser`  
ADMIN can create STUDENT or TEACHER; SUPER_ADMIN can create any role.  
Staff accounts: `isEmailVerified: true`, `isActive: true`, temporary random password (returned in response body — see gap below).

**Gaps / Issues:**
1. **Temporary password is returned in the API response body** (`UsersService.createUser` returns `{ user, temporaryPassword }` and `createStaffAccount` returns `{ ..., temporaryPassword }`). A TODO comment acknowledges this (`// TODO Sprint 7: email the temp password instead of returning it`). This exposes the credential in access logs, browser network tabs, and any response-logging middleware.
2. **`UsersService.createStaffAccount` (the older method) is still in the codebase** alongside `createUser` — both create staff accounts but with different validation. The controller only wires `createUser`; `createStaffAccount` is dead code but could create confusion and is not role-hierarchy-aware.

---

### 2b. Backend Guards

**Status: VERIFIED**

**Guards inventory:**

| File | Guard | Purpose |
|---|---|---|
| `common/guards/jwt-auth.guard.ts` | `JwtAuthGuard extends AuthGuard('jwt')` | Validates access-token cookie via `JwtStrategy`; attaches `RequestUser` to `req.user` |
| `common/guards/roles.guard.ts` | `RolesGuard implements CanActivate` | Reads `ROLES_KEY` metadata set by `@Roles(...)` decorator; checks `req.user.role` against allowed roles; passes (allows all) when no `@Roles` decorator is present |
| `common/guards/subscription.guard.ts` | `SubscriptionGuard implements CanActivate` | Gates content routes behind an active subscription; delegates to `SubscriptionsService.ensureActiveForStudent`; staff roles bypass |

**Global guards registered in `AppModule`:**  
Only `ThrottlerGuard` is global. `JwtAuthGuard` and `RolesGuard` are **not** global — they must be applied per-controller or per-route.

**Application pattern:**  
- Controller-level: `@UseGuards(JwtAuthGuard)` on the controller class (e.g., `UsersController`, `FlashcardsController`, `QuizController`, `ForumController`, `ProgressController`, `SubscriptionsController`, `NotificationsController`) — all routes in those controllers require auth.
- Route-level: For controllers that mix public and protected routes (e.g., `CoursesController`, `MaterialsController`, `DepartmentsController`, `AcademicYearsController`, `PaymentsController`), `@UseGuards(JwtAuthGuard, RolesGuard)` is applied per handler.
- `RolesGuard` is always applied **after** `JwtAuthGuard` (either both on same `@UseGuards(...)` call, or `JwtAuthGuard` at class level and `RolesGuard` at method level).

**Decorator:** `@Roles(...roles: string[])` in `common/decorators/roles.decorator.ts` — `SetMetadata(ROLES_KEY, roles)`.

**Gaps / Issues:**
1. **`RolesGuard` passes through when no `@Roles()` decorator is present** — if `RolesGuard` is applied to a controller class without a corresponding `@Roles()`, any authenticated user of any role can access it. This is by design but creates a footgun: adding `@UseGuards(JwtAuthGuard, RolesGuard)` to a route and forgetting `@Roles(...)` silently grants access to everyone.
2. **`@UseGuards(RolesGuard)` without a preceding `JwtAuthGuard` would not work correctly** — `RolesGuard` reads `req.user`, which only exists after `JwtAuthGuard` runs. The pattern is consistent in the codebase (always paired), but there is no compile-time enforcement of this ordering.

---

### 2c. Frontend Role Restriction

**Status: VERIFIED**

**Two-layer defence:**

**Layer 1 — Edge redirect (`proxy.ts`):**  
`apps/web/src/proxy.ts` — Next.js "proxy" convention (formerly middleware). On every request matching the protected URL matchers, checks for presence of either `access_token` or `refresh_token` cookie. If absent → immediate redirect to `/login?redirect=<path>`. Does **not** verify the JWT signature (edge runtime cannot import `jsonwebtoken`).

**Layer 2 — Client-side role gate (`(app)/layout.tsx`):**  
`apps/web/src/app/(app)/layout.tsx` — `useEffect` on `{ user, loading, pathname }`:
- `user === null` → `router.push('/login')`
- `user && !isAllowed(pathname, user.role)` → `router.replace(homeFor(user.role))`

`isAllowed` and `homeFor` are defined in `apps/web/src/lib/route-access.ts` (single source of truth for both proxy and layout):
- `/admin` → only `ADMIN` or `SUPER_ADMIN`
- `/teacher` → only `TEACHER`
- `/forum` → only `STUDENT` or `TEACHER`
- `/profile`, `/notifications` → any authenticated user
- Student content routes (`/dashboard`, `/courses`, `/ai-tutor`, etc.) → only `STUDENT`

**`useAuth` hook:** Exposes `user.role`, plus convenience booleans `isLoggedIn`, `isSuperAdmin`, `isAdmin`, `isTeacher`, `isStudent`. Used for conditional rendering throughout the UI.

**Conditional rendering examples:**
- `apps/web/src/components/layout/sidebar.tsx` — menu items filtered by role
- `apps/web/src/app/(app)/admin/page.tsx` — admin-only dashboard
- `apps/web/src/app/(app)/teacher/page.tsx` — teacher-only dashboard

**Gaps / Issues:**
1. **The proxy/edge layer only checks cookie *presence*, not validity.** An expired `access_token` cookie with no `refresh_token` would pass the edge check, enter the app shell, and then the layout's `useAuth` would fire `/me` which would 401 → axios interceptor fires `/auth/refresh` which would also fail → redirect to `/login`. The net result is correct but there is a flash of the protected page shell before the redirect.
2. **`isAllowed` does not check `GUEST` role** — there is no explicit guard for a user with `role: 'GUEST'`. A GUEST falls through all role-specific checks (not ADMIN, not TEACHER, not STUDENT) and would be allowed by `return true` at the bottom of `isAllowed` for `/profile` and `/notifications`. The API guards still protect data, but the frontend would render these pages for a GUEST.

---

### 2d. GUEST User Access

**Status: PARTIAL**

**What GUESTs can see (backend):**

Public API routes (no `JwtAuthGuard`):
- `GET /api/v1/health` — liveness probe
- `GET /api/v1/health/ready` — readiness probe
- `GET /api/v1/departments` — public department list (used by registration form)
- `GET /api/v1/departments/:id` — individual department
- `GET /api/v1/academic-years?departmentId=...` — academic years (used by registration form)
- `GET /api/v1/academic-years/:id`
- `GET /api/v1/courses?semesterId=...` — published courses list
- `GET /api/v1/courses/:id` — individual course
- `GET /api/v1/plans` — subscription plans (pricing page)
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/payments/chapa/callback` (Chapa browser callback — intentionally public)
- `POST /api/v1/payments/chapa/webhook` (Chapa webhook — verified by HMAC signature)

**`AppModule` global guard config:** Only `ThrottlerGuard` is registered globally. There is **no global `JwtAuthGuard`** — each route/controller opts in.

**Gaps / Issues:**
1. **`GET /api/v1/courses/:id` is public** — a GUEST can fetch full course metadata. Whether this is intentional (marketing preview) is not documented, but it exposes teacher ID and other metadata. Materials are gated by auth.
2. **`GET /api/v1/academic-years/:id` is public** — returns full year details. Consistent with departments being public (needed for registration), but worth confirming intent.
3. **The `GUEST` role exists in the Prisma schema** (`enum Role { GUEST ... }`) and in the frontend types (`types/index.ts`) but there is **no code path that assigns `GUEST` to a newly created user** at registration (default is `STUDENT`) and no documented way for a user to have `GUEST` role. It appears to be a reserved/unused role for future use.

---

### 2e. Unauthorized Route Handling

**Status: VERIFIED**

**Frontend — unauthenticated user hits protected page:**
1. Edge layer (`proxy.ts`): if no auth cookie → immediate `302` redirect to `/login?redirect=<path>` before any React renders.
2. If somehow the cookie is present but expired: app shell renders, `useAuth` fetches `/me` → 401 → axios interceptor fires `/auth/refresh` → fails → `window.location.href = '/login'` (hard redirect, clears state).
3. `(app)/layout.tsx`: if `user === null` after loading → `router.push('/login')`.

**Backend — unauthenticated request to guarded endpoint:**  
`JwtAuthGuard.handleRequest` throws `UnauthorizedException('You must be logged in to access this resource')`.  
`AllExceptionsFilter` catches it and returns:
```json
{
  "statusCode": 401,
  "error": "UnauthorizedException",
  "message": "You must be logged in to access this resource",
  "path": "/api/v1/...",
  "timestamp": "..."
}
```

**Backend — authenticated but wrong role:**  
`RolesGuard.canActivate` throws `ForbiddenException('Access denied. Required role: <roles>')`.  
`AllExceptionsFilter` returns HTTP 403 with same envelope.

**Gaps / Issues:**  
None material. The error envelope is consistent (`AllExceptionsFilter` applied globally). Stack traces are not exposed — unhandled errors become generic 500s.

---

## Cross-Cutting Issues

### CC-1 — Missing auth guard: `GET /api/v1/courses`, `GET /api/v1/courses/:id` are public

**File:** `apps/api/src/modules/courses/courses.controller.ts:33,45`  
These routes have no `@UseGuards(...)`. Any unauthenticated client can enumerate published courses and fetch course metadata (including `teacherId`). This is likely intentional for guest previewing, but it is undocumented and teacher IDs are exposed.

### CC-2 — Temporary staff password returned in response body

**File:** `apps/api/src/modules/users/users.service.ts:UsersService.createUser` and `createStaffAccount`  
TODO comment present. The plain-text temporary password is returned in the JSON response and likely written to access logs. Should be emailed instead.

### CC-3 — No DTO validation on `POST /api/v1/auth/verify-email` token field

**File:** `apps/api/src/modules/auth/auth.controller.ts:AuthController.verifyEmail`  
`@Body('token') token: string` — extracted directly, not via a DTO class. No `@IsString()`, `@MinLength()`, or `@IsNotEmpty()`. Sending an empty body results in `undefined` being passed to the service (safely handled but no proper 400 validation error).

### CC-4 — `RegisterResponse` type references a `verifyToken` field that no longer exists in the API response

**File:** `apps/web/src/types/index.ts:22`  
`verifyToken: string; // Remove in production` — the API does not return this field. Dead type field; indicates a debug artefact was removed from the API but not from the TypeScript types. No runtime impact (axios receives a response without the field and TypeScript does not enforce it at runtime), but misleads future developers.

### CC-5 — Redis denylist fails OPEN

**File:** `apps/api/src/common/redis/token-denylist.service.ts:TokenDenylistService.isDenied`  
If Redis is unreachable, `isDenied` returns `false` (allows the token). This means revoked refresh tokens (logged-out users) can obtain new access tokens during a Redis outage. Logged but not alarmed. Acceptable trade-off for availability, but should be explicitly documented in runbooks.

### CC-6 — `isAllowed()` has no explicit GUEST role handling

**File:** `apps/web/src/lib/route-access.ts:isAllowed`  
A user with `role: 'GUEST'` would pass through all role-specific guards and be allowed into `/profile` and `/notifications` (returned `true` by the catch-all). The API guards prevent data access, but the frontend would render these page shells. Since GUEST accounts cannot currently be created through any public path, the practical risk is low.

### CC-7 — No CSRF token mechanism

**Files:** `apps/api/src/main.ts`, `apps/api/src/modules/auth/auth.controller.ts`  
Cookies are `sameSite: 'lax'`. This blocks most CSRF vectors (cross-site form POSTs don't carry `lax` cookies on top-level navigations, only on same-site navigations). However, `lax` does not protect against same-site attacks. There is no explicit CSRF token or `double-submit cookie` pattern. Low risk for a non-banking application using `lax` cookies, but worth noting.

### CC-8 — Dead code: `UsersService.createStaffAccount`

**File:** `apps/api/src/modules/users/users.service.ts:UsersService.createStaffAccount`  
This method is never called from any controller (the controller uses `createUser`). It duplicates staff creation logic without the role-hierarchy check. Should be removed to avoid confusion.

### CC-9 — `LoginDto.password` has no `@IsNotEmpty()` or `@MinLength()`

**File:** `apps/api/src/modules/auth/dto/login.dto.ts`  
`@IsString()` only. An empty string `""` passes DTO validation and reaches `bcrypt.compare("", hash)` which returns `false`. No security hole (fails login), but a 400 with a clear validation message would be more correct than a 401 "Invalid email or password".

---

## Summary Table

| Sub-feature | Status | Key Evidence |
|---|---|---|
| 1a. Registration | PARTIAL | Works correctly; minor DTO gaps; no email domain enforcement |
| 1b. Email Verification | VERIFIED | Full flow with rollback; token-field DTO gap |
| 1c. Login | VERIFIED | bcrypt, lockout, httpOnly cookies, JWT shape correct |
| 1d. Logout | VERIFIED | Redis denylist revocation; access token not server-invalidated (by design) |
| 1e. Password Reset | VERIFIED | Atomic token claim closes TOCTOU; no session invalidation on reset |
| 1f. Token Refresh | VERIFIED | Rotation with jti denylist; Redis fails-open |
| 1g. Brute-Force Lockout | VERIFIED | DB-backed, 5 attempts / 15 min; per-account not per-IP |
| 1h. Session Persistence | VERIFIED | React Query + `/me`; axios 401 interceptor; live DB check on every request |
| 2a. Role Assignment | VERIFIED | Default STUDENT; admin-only role changes with hierarchy |
| 2b. Backend Guards | VERIFIED | Three guards; not global; consistently paired |
| 2c. Frontend Role Restriction | VERIFIED | Two-layer (edge + client); GUEST gap in `isAllowed` |
| 2d. GUEST Access | PARTIAL | Role exists but unassignable; public routes intentional but undocumented |
| 2e. Unauthorized Handling | VERIFIED | Consistent 401/403 envelope; no stack leaks |
