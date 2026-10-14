# LOR Mentor — Current Architecture (as inspected 2026-09-29)

This document describes the architecture **as it actually exists in the repository**, verified by file inspection. Nothing here is aspirational.

## High-level flow

```
Browser (Next.js 16, React 19, client components)
   │  axios withCredentials → cookies
   ▼
/api/proxy/[...path]  (Next route handler, SSRF-hardened, forwards cookies)
   │  and/or direct calls to NEXT_PUBLIC_API_URL
   ▼
NestJS API  (prefix /api/v1, Helmet, cookie-parser, CORS, global ValidationPipe)
   │  Guards: ThrottlerGuard (global) → JwtAuthGuard (cookie JWT) → RolesGuard (@Roles) → SubscriptionGuard (paid content)
   ▼
Services (per-module: auth, users, courses, materials, payments, subscriptions, ai, tutor, forum, quiz, flashcards, progress, notifications, plans, departments, academic-years, semesters, mail)
   ▼
Prisma 7 (prisma-client-js, pg adapter) → PostgreSQL 16
   + Redis (BullMQ queue "ai-generation" + refresh-token denylist)
   + Python receipt-verifier microservice (bank receipt scraping/normalization, shared-token auth)
```

## Subsystems

### Frontend — `apps/web`
- App Router; almost everything is a **client component** (`"use client"`), fetching via a shared axios instance (`src/lib/api.ts`).
- Auth state: React Query `["me"]` key (`src/hooks/use-auth.ts`) backed by `GET /me` (cookie JWT). Login/logout seed/invalidate the cache.
- Route protection is **client-side only** (`(app)/layout.tsx` `isAllowed()`); no Next.js middleware exists.
- Response interceptor retries once after `POST /auth/refresh` on 401, else redirects to `/login`.
- Playwright is configured (playwright.config.ts) — no test files were found.

### API — `apps/api` (NestJS 11)
- `main.ts`: Sentry (optional, via SENTRY_DSN), helmet, cookie-parser, CORS (comma-separated origins), global ValidationPipe (whitelist + forbidNonWhitelisted + transform), prefix `/api/v1`, graceful shutdown hooks.
- `app.module.ts`: ConfigModule with `validateEnv` (fail-fast), ThrottlerModule 120 req/min/IP global, BullMQ root Redis connection, `AllExceptionsFilter` global.
- Auth: registration with department/year cross-validation, bcrypt cost 12, email verification (32-byte hex token, 24h, DB-stored), login with per-account lockout (5 fails → 15 min) + audit logging, JWT access (15m) + refresh (7d, `jti`), both in HTTP-only SameSite=Lax cookies, refresh rotation with Redis denylist (fails OPEN if Redis is down), anti-enumeration on forgot-password/resend-verification.
- RBAC: `Role` enum GUEST/STUDENT/TEACHER/ADMIN/SUPER_ADMIN; `@Roles()` + `RolesGuard`; service-level hierarchy checks in `users.service.ts` (not fully read in this pass).
- Materials: uploads to `process.cwd()/uploads/materials` with random hex filenames; multer MIME filter + magic-byte validation post-write (`image-magic-bytes.ts`); serving via `GET /materials/:id/file` with academic-year + subscription + published-course checks; `filePath` stripped from all API responses.
- Payments: three flows — MANUAL receipt image upload (admin approves), bank-transfer auto-verification via receipt-verifier (unique `bankReference` anti-replay, receiver-account match, amount check, REVIEW vs APPROVE vs REJECT decision matrix), Chapa (tx_ref per attempt, server-verified callback + HMAC webhook + amount mismatch guard, idempotent `finalizeApproval` with atomic PENDING→APPROVED claim, subscription activation + receipt PDF + notification in one transaction).
- AI: PDF upload enqueues BullMQ job; `AiProcessor` extracts text (pdf-parse), calls Gemini 2.5 Flash once for summary/keyTopics/flashcards/quiz (JSON mode), saves in a Prisma transaction, notifies uploader. Tutor endpoint is subscription-gated, per-user throttled (20/min), prompt-injection fenced, history persisted.
- Quiz/flashcards: server-side grading, `correctOption` never sent to client on fetch.

### Receipt verifier — `services/receipt-verifier` (Python, Docker)
HTTP service behind `x-verifier-token`; normalizes bank receipts; policy decisions live in the API, not here.

## Deployment shape
- `docker-compose.prod.yml`: postgres 16 + redis 7 + verifier + api + web on an internal network; api/web published on 127.0.0.1 only; host Nginx (`deploy/nginx/lor-mentor.conf`) terminates TLS; nightly `pg_dump` script with retention.
- CI (`.github/workflows/ci.yml`): npm workspaces install, prisma generate, API build + jest, web lint (report-only) + web build, Python verifier compile + tests.

## Security boundaries (actual)
1. Browser → API: cookie JWT (HTTP-only). The `/api/proxy` route is the only path that forwards cookies server-side; it validates the target origin.
2. API → DB: single Prisma connection string.
3. Public endpoints (no JWT): `/courses`, `/courses/:id` (published), all `/auth/*`, `/payments/chapa/callback|webhook`, `/health*`.
4. Subscription boundary: `SubscriptionsService.ensureActiveForStudent` — staff bypass; enforced in materials file serving, tutor, quiz fetch/submit, flashcard content, and via `SubscriptionGuard`.
