# Lor Mentor — Production Readiness Audit & Hardening Plan

> Monorepo at `C:\Users\berek\Desktop\Lor-mentor\lor-mentor` — read-only discovery pass completed 2026-10-04. No source edits made in this phase.

## 1. Goal & Constraints

**Goal:** Take the paused (~1 month) near-production codebase from unknown/regressed state to a stable, secure, tested, maintainable production deployment on Hostinger VPS that real Lorcan Medical College students can use.

**Constraints:**
- Plan mode: no source edits, no mutating commands in this phase.
- Do not rewrite working architecture without evidence — smallest safe change wins.
- Chapa online payments are OPTIONAL at launch; manual bank-transfer + receipt-verifier is primary.
- Must preserve existing data integrity (payments, subscriptions, materials on local disk).

**Non-goals for this plan:** New 3D anatomy features, major UI redesign, horizontal scaling.

---

## 2. Project Structure Overview (Confirmed)

```
lor-mentor/
  package.json (workspaces: apps/*, packages/*)
  apps/web  — Next.js 16.2.11 + React 19.2.4 + TS, Tailwind 3.4, Radix/shadcn, React Query, axios, framer-motion, pdfjs-dist
  apps/api  — NestJS 11, Prisma 7 (adapter-pg), PostgreSQL, Redis+BullMQ, Gemini, nodemailer+resend, helmet, passport-jwt
  services/receipt-verifier — Python (verifier:8000, http://verifier:8000/health)
  prisma/schema.prisma (9 migrations) + seed.ts (9 programs, BSC 5y / TVET 3y)
  docker-compose.prod.yml / docker-compose.staging.yml
  deploy/nginx/lor-mentor.conf + smoke-test.sh + backup/
  docs/, DEPLOYMENT.md, ARCHITECTURE_AUDIT.md, PRODUCTION_READINESS_AUDIT.md (stale — reports empty workspace)
```

Workspace discovery: ~70 NestJS `src` files verified via directory listing, 19 API modules, full web `src/app/(app)` route tree, `proxy.ts` edge guard.

---

## 3. Technology Stack (Confirmed)

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 16 (standalone), React 19, TS 5, Tailwind, next-themes, React Query 5.101, axios 1.17, RHF+zod, sonner | `output:standalone`, `outputFileTracingRoot` monorepo fix, rewrites `/api/v1/*` → `NEXT_PUBLIC_API_URL` |
| Backend | NestJS 11, Prisma 7.9, pg 8.21, ioredis 5.11, BullMQ 5.79, @nestjs/bullmq 11, @google/generative-ai 0.24, pdf-parse 2.4, pdfkit 0.19 | `rawBody:true` for Chapa HMAC, helmet, Throttler 120/min global |
| DB | PostgreSQL 16-alpine, Redis 7-alpine | Volumes `pgdata`, `redisdata`, `uploads` |
| AI | Gemini (GEMINI_API_KEY) via BullMQ `ai-generation` queue, PdfExtractor | Status enum PENDING→PROCESSING→COMPLETED/FAILED |
| Infra | Docker Compose (internal network, healthchecks), Nginx host reverse proxy, Cloudflare Tunnel logs | certbot TLS, `127.0.0.1:4000/3000` only |

---

## 4. Architecture Overview

- **API `AppModule`**: `ConfigModule(validateEnv)`, `ThrottlerModule(120/min)`, `BullModule` shared Redis, `PrismaModule`, 14 domain modules + global `ThrottlerGuard` + `AllExceptionsFilter`.
- **Auth**: JWT in httpOnly cookies (`access_token` 15m, `refresh_token` 7d with `jti`), `JwtStrategy` from cookie, `TokenDenylistService` (Redis `denylist:refresh:{jti}` with TTL, fails open), lockout `5 attempts → 15m`.
- **Guards**: `JwtAuthGuard` + `RolesGuard` (reflector `ROLES_KEY`), `isPrivileged()` helper centralizes ADMIN/SUPER_ADMIN.
- **Payments**: Dual path — MANUAL (upload) + CHAPA (gateway) + BANK-TRANSFER auto-verify (`ReceiptVerifierService` → `isCompanyAccount` matching). Single idempotent `finalizeApproval()` transaction (updateMany claim race), `AuditLog` + `Notification` + PDF (`ReceiptService` via pdfkit) outside tx.
- **Materials**: `filePath` stripped from list responses, magic-bytes validated (`image-magic-bytes.ts`), `getFilePathForStudent` gates by `isPublished/isArchived`, `academicYearId`, subscription `ensureActiveForStudent`.
- **Web**: `proxy.ts` edge redirect for 11 protected prefixes (presence check only), `(app)/layout.tsx` client layout enforces `isAllowed()` per role (ADMIN→/admin, TEACHER→/teacher, STUDENT→dashboard etc.), `useAuth` via React Query `["me"]`, `lib/api.ts` interceptor silent refresh.

---

## 5. Major Features Discovered & Status

| Feature | Expected | Current (code) | Status | Severity |
|---------|----------|----------------|--------|----------|
| Register + email verify + resend | Create user, 24h token, generic resend | `auth.service.ts:44-167` rollback on mail fail, crypto 32B | ✅ Working | — |
| Login + brute-force lockout | 5 fails → 15m lock + AuditLog | `recordFailedLogin` + `lockoutUntil` | ✅ Working | — |
| Refresh rotation + logout denylist | jti rotation, revoke on logout | `auth.controller:85-139`, denylist fails open | ✅ Working (verify Redis prod) | High if Redis down |
| Forgot/reset password | 1h token, anti-enumeration | generic messages | ✅ Working | — |
| Departments/Years/Semesters/Courses | CRUD + archiving, teacher assignment | modules present (not deep-read) | ❓ Cannot verify — Needs verification | Medium |
| Materials upload/list/download | PDF/IMAGE/YOUTUBE, sample gating | magic-bytes + subscription gate | ✅ Working | — |
| AI generation (summary/flashcards/quiz) | PDF→Gemini→sets | `ai.processor.ts` tx + notifications | ⚠️ Partial — Needs verification (Genesis API, PDF text length) | High |
| Payments MANUAL | upload receipt → admin approve | `payments.service.submit` | ✅ Working | — |
| Payments BANK auto-verify | scraper → assess → auto/pending/reject | `verifyAndSubmit` + `assessReceipt` + `bankAccountsMatch` | ✅ Working (needs live verifier test) | Critical |
| Payments CHAPA online | initialize → webhook+callback → verify amount | `chapa.service.ts` HMAC + re-verify + amount guard | ✅ Working | Critical |
| Subscriptions | ACTIVE/EXPIRED check, no double-pay | `assertNoActiveSubscription`, `activateSubscription` | ✅ Working | — |
| Forum + reactions/reports | posts, replies, reactions, reports | `Reaction`/`Report` models, indexes | ❓ Cannot verify | Medium |
| Flashcards/Quiz/Tutor/Progress/Notifications | per schema | modules present | ❓ Cannot verify (QuizBank↔Quiz unique link) | Medium |
| Admin moderation | list payments, approve/reject, view receipt | `payments.controller` admin routes | ✅ Working | — |
| File serving | receipt image vs PDF | `getReceiptPath` basename + disk check | ✅ Working | — |

---

## 6. Current State Assessment

**What is solid (keep):** env validation fail-fast (`env.validation.ts` 153 lines, 32-char entropy, Chapa all-or-nothing, COMPANY_BANK_ACCOUNTS), helmet + CORS comma-split, `whitelist+forbidNonWhitelisted`, global `AllExceptionsFilter`+Sentry, Throttler global+per-route, magic-bytes not MIME, basename traversal guard, idempotent payment claim (`updateMany where PENDING`), amount mismatch guard, bank wildcard matching, React Query `useAuth`, `proxy.ts`+`layout.tsx` dual guard.

**What is stale:** `PRODUCTION_READINESS_AUDIT.md` claims empty workspace (0/100) — contradicts actual codebase; superseded by this plan. `ARCHITECTURE_AUDIT.md` P1+P2 backlog partially addressed since 2026-06-29 (forbidNonWhitelisted now `true`, magic-bytes added, lockout added, exception filter added, shared `RequestUser` type — but verify remaining items).

**What was not inspected in this pass (read-only limit):** `test/` suites, `deploy/backup/`, `services/receipt-verifier` Python code, web `src/app/(app)/*` page implementations in detail, `libs/packages/*` if any.

---

## 7. Regression Analysis — 1-Month Pause Risks

| Risk | Hypothesis | Verify |
|------|------------|--------|
| Dependency drift | Next 16.2, React 19.2, Prisma 7.9 — cutting-edge; `npm install` may pull patch breaking changes | Needs verification: run `npm ci`, `apps/api` build, `apps/web` build locally; snapshot `package-lock.json` diff |
| Node version | engines `>=20` but Hostinger VPS may be on 18/20 mismatch | Check VPS `node -v`, Docker base image |
| Env drift | `.env.production` not committed; new required keys (`RECEIPT_VERIFIER_TOKEN` 32char, `COMPANY_BANK_ACCOUNTS`, `CORS_ORIGIN` no-localhost) added since pause | Ask operator to compare live `.env.production` against `.env.production.example` |
| Chapa API change | `/transaction/initialize` → `checkout_url` shape, webhook header names `chapa-signature` vs `x-chapa-signature` | Verify against live Chapa docs + sandbox test |
| Gemini API deprecation | `@google/generative-ai 0.24` deprecated → `@google/genai` | Check Gemini changelog; test `gemini.service.ts` |
| Prisma 7 adapter | `prisma.config.ts` + `PrismaPg` adapter; `migrate deploy` vs `db push` confusion | Test `prisma migrate status` on staging |
| Cookie sameSite | `sameSite:lax` + `secure:production` — cross-subdomain (`api.lormentor.com` vs `lormentor.com`) needs `credentials:true` + correct `CORS_ORIGIN` | Manual login → refresh → 401 recovery flow on staging |
| Redis persistence | `redis-server --save 60 1 --appendonly yes` — denylist TTL on restart | Reboot redis, test logout revoke |
| Uploads volume | `uploads:/app/apps/api/uploads` — `app.module` Redis still reads `process.env.REDIS_HOST` not `ConfigService` | Confirm volume mounts survive `docker compose down` |
| Hardcoded localhost | `lib/api.ts` fallback `http://localhost:4000`, `next.config rewrites` fallback, `publicApiBase()` fallbacks | Grep confirmed but gated by env.validation in prod — still audit previews |

---

## 8. Security Audit (What → Why → Risk → Fix → Verify)

**Already mitigated (confirmed):** Forgeable JWT fallback fixed (no `?? ''`), Throttler global 120/min + 5-10/min auth/payments, Chapa HMAC `timingSafeEqual` + re-verify, magic-bytes, basename traversal, forbidNonWhitelisted `true`, helmet, cookie httpOnly.

**Remaining / needs hardening:**

1. **Denylist fails OPEN on Redis error** (`token-denylist.service.ts:49`) — logout revoke lost if Redis blips → stolen refresh usable until expiry. Risk: Medium. Fix: Alert on Redis error metric; consider DB fallback. Verify: fault-inject Redis down.
2. **`process.env` direct reads** in `app.module.ts` (REDIS_HOST/PORT), `auth.controller cookieOptions()`, `payments.controller uploadDir` — bypasses `ConfigService` validation. Risk: Low. Fix: Migrate to `ConfigService` via `BullModule.forRootAsync` + factory.
3. **No CAPCHA on register/forgot** — email bomb still possible at 3-5/min. Risk: Low. Fix: Add Turnstile/hCaptcha after launch (P2).
4. **Receipt verifier exposure** — verifier service trusts `x-verifier-token` but NETWORK is internal only (good); ensure no public port publish. Verify: `docker ps --format` no `0.0.0.0:8000`.
5. **CORS origin reflection** — `enableCors` with comma list; verify no `*` in prod. Already gated by env.validation.

---

## 9. Payment System Audit

**Manual flow:** ✅ price snapshot, pending duplicate guard, `assertNoActiveSubscription`, magic-bytes, orphan file cleanup (451s on fail), admin `finalizeApproval` with evidence check (rejects Chapa or empty verification).

**Bank auto-verify:** ✅ `@unique bankReference` anti-replay (DB + pre-check), `COMPANY_BANK_ACCOUNTS` required when verifier enabled, CBE account restricted to our accounts, `assessReceipt` REJECT (wrong receiver/underpay/failed status) vs REVIEW (BOA missing receiver), `buildVerification` does not persist raw CBE digits (`submittedAccountMatched:true`).

**Chapa:** ✅ fresh `lm-<uuid>` per init (no reuse), webhook HMAC over `secret` and `rawBody` with `timingSafeEqual`, `confirmAndApprove` idempotent + amount guard (`settled+0.01 < expected` → no approve), browser `verifyByTxRef` ownership check, `handleCallback` prefix `lm-` guard.

**Gaps:** No duplicate `txRef` webhook replay test; no `paidAt` clock-skew test; PDF generation outside tx (correct) but no retry if pdfkit fails. No refund/cancellation flow (out of scope).

---

## 10. File Upload & Storage Audit

- Receipts: `uploads/receipts` (random 16B hex + ext), 10MB, JPEG/PNG/WEBP magic, `getReceiptPath` admin-only, served via `sendFile`.
- Materials: `uploads/materials` (not under `/public`), PDF `%PDF-` header, image magic, `stripFilePath` hides internal name, `getFilePathForStudent` checks `isPublished/isArchived` + `academicYearId` + subscription.
- Backups: `deploy/backup/` exists — verify not checked in this pass; needs `pg_dump` cron + upload volume snapshot (S3/R2 future P2).
- Recommendation: Keep local disk for launch (simplest, encrypted VPS volume), migrate to R2/S3 with signed URLs when scaling (P3).

---

## 11. UX/UI Audit (Product Lens)

**Strengths:** Glass topbar + animated radial gradients, sidebar collapsed state persisted, role-based `homeFor()` + `isAllowed()` — student cannot manually navigate to /admin, `proxy.ts` instant bounce before React.

**Issues:**
- Duplicate guard (`proxy.ts` vs `layout.tsx`) — maintain single source `PROTECTED_PREFIXES` vs `isAllowed` (drift risk) → centralize constant file.
- Loading state in `(app)/layout.tsx:77` shows generic spinner for all guards — needs per-role skeleton (P2).
- `lib/api.ts` interceptor redirects on 401 even during concurrent requests → race (second 401 may trigger double refresh). Needs dedup lock (`isRefreshing` flag).
- Toast system uses `sonner` but previous audit claimed `alert()` — verify no `alert()` remains (grep).
- Material PDF viewer (`pdfjs-dist 4.4.168`) heavy — should be `next/dynamic` with `ssr:false`.

---

## 12. Performance Audit

- **DB:** Indexes present `Payment(userId,status)`, `Notification(userId,isRead)`, `AuditLog(createdAt)`; no N+1 spotted in `findByCourse` (does extra query for uploader names — acceptable, but could be join). Check `Course → Semester → AcademicYear` eager loads on publish checks.
- **API:** Global throttler protects brute force; BullMQ isolates AI; no HTTP cache headers on `plans` GET — add `Cache-Control: public, max-age=60` (P2).
- **Web:** `useAuth` now React Query shared (29 → 1 `/me`), but `next.config standalone` + bundle-analyzer present — run `ANALYZE=true npm run build:web` to verify bundle. `framer-motion` site-wide — scope to animated components only.

---

## 13. Code Quality & Maintainability

Keep architecture (verdict: **KEEP**). Strengths: single `finalizeApproval` source of truth, `bank-account-match.ts` isolated, `RequestUser` shared type, `PrismaService` adapter.

Debt to track:
- `interface AuthUser {id;role}` redefined per controller — already partially fixed via `RequestUser` but grep for stragglers.
- Magic role strings — `isPrivileged()` centralizes but `Roles('ADMIN','SUPER_ADMIN')` still literal; introduce `Role` enum import from Prisma.
- `apps/api/.env` vs repo `.env` duplication — document precedence.

---

## 14. Testing & QA

**Current:** `jest` + `test:e2e`, `playwright` e2e in web, specs `auth.service.spec.ts`, `chapa.service.spec.ts`, `payments.service.spec.ts`, `subscriptions.service.spec.ts`, `receipt-verifier.service.spec.ts`.

**Production checklist (prioritized by risk):**
1. Smoke (`deploy/smoke-test.sh` 8 checks): health, headers, TLS, auth 401, whitelist 400, forgot generic, CORS, 429.
2. Auth: register→verify→login→refresh→logout→reuse revoked refresh should 401.
3. Payments: MANUAL submit→approve→PDF download; BANK verify (live scraper) → auto-approved vs pending; CHAPA init→webhook HMAC→verify amount→idempotent replay.
4. Materials: upload PDF→AI queued→COMPLETED→student without subscription 403, with subscription 200, wrong academicYear 403.
5. Role: STUDENT hitting /admin → bounce to /dashboard; TEACHER hitting /admin → bounce.
6. Resilience: Redis down → login still works, denylist fails open (log), BullMQ job retry.

---

## 15. Production Deployment Audit

**App:** `output:standalone` present, `NEXT_PUBLIC_API_URL` build-arg in `docker-compose.prod.yml:100`, `DATABASE_URL` host`postgres` internal, `REDIS_HOST redis`, `RECEIPT_VERIFIER_URL http://verifier:8000`.

**Server:** Nginx `lor-mentor.conf` proxies `lormentor.com→:3000`, `api→:4000`, `client_max_body_size 12m`, gzip, forwarded proto. Verify `certbot --nginx` adds :443 + HSTS.

**Domain:** `WEB_PUBLIC_URL https://lormentor.com`, `API_PUBLIC_URL https://api.lormentor.com`, `CORS_ORIGIN https://lormentor.com` — all validated no-localhost in prod.

**Pipeline:** `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`, healthchecks 40s start, `prisma migrate deploy` before `db:seed` (seed is idempotent but never overwrites existing password). No zero-downtime yet — add `deploy --wait` + smoke before switching.

---

## 16. Preliminary Production Readiness Score

| Category | Score | Rationale |
|----------|------:|-----------|
| Functionality | 78 | Core flows built; forum/quiz/flashcards not verified |
| Architecture | 88 | Modular Nest + Next standalone, single approval path, BullMQ isolation |
| Security | 82 | JWT/helmet/throttle/HMAC/magic-bytes solid; Redis fail-open + env direct reads remain |
| Database | 85 | Schema well-indexed, adapter correctly wired, seed idempotent; needs migration dry-run |
| Performance | 70 | React Query fixed /me storm; no caching headers, heavy pdfjs/motion unoptimized |
| UX/UI | 72 | Role gates + glass design good; interceptor race + duplicate guard + generic skeletons |
| Testing | 55 | Unit specs exist, Playwright configured, but no staging run proof |
| Deployment | 75 | Compose+Nginx+healthchecks ready; TLS+backup unproven on live VPS |
| Maintainability | 80 | Types/roles centralizing, clear layering; small remaining magic-string debt |
| **Overall** | **76** | **Not yet safe to deploy — needs Phase 1 blockers cleared + staging smoke pass** |

Previous `PRODUCTION_READINESS_AUDIT.md: 0/100` is obsolete.

---

## 17. 🚨 Production Blockers

1. **No proven staging build** — `docker compose build` + `prisma migrate deploy` never run on VPS since pause. Why: migrations (8 since init) may conflict, `prisma.config.ts` path. Fix: `docker compose -f docker-compose.prod.yml config` + staging deploy. Verify: `smoke-test.sh https://api.staging…`.
2. **Live `.env.production` may be stale** — new keys (`RECEIPT_VERIFIER_TOKEN≥32`, `COMPANY_BANK_ACCOUNTS`, `CORS_ORIGIN`) added after pause. Why: boot fails in prod if missing. Fix: Diff against `.env.production.example`. Verify: `node -e "require('./apps/api/src/config/env.validation').validateEnv(process.env)"`.
3. **Chapa webhook unreachable in production** — `API_PUBLIC_URL` must be public HTTPS; tunnel logs suggest prior Cloudflare tunnel use. Why: payments stuck PENDING. Fix: Set DNS `api.lormentor.com`, Nginx, certbot, register webhook in Chapa dashboard. Verify: `curl -i https://api.lormentor.com/api/v1/payments/chapa/webhook` no 404.
4. **Upload volume not proven persistent** — `uploads` named volume may be empty after rebuild. Why: student receipts lost. Fix: `docker volume inspect lor-mentor_uploads` + test upload→rebuild→file still serves. Verify: download `GET /payments/:id/receipt` after `compose up -d --build`.
5. **Axios 401 interceptor race** — no dedup, may loop refresh. Why: stale tokens → redirect storm. Fix: Add `isRefreshing` queue. Verify: expire access_token, fire 3 parallel `/me`.

---

## 18. Prioritized Action Plan

### Phase 1 — Critical Fixes (must before prod)
- [ ] P1-1 Env sync: compare live `.env.production` to example, generate secrets (`openssl rand -hex 48` for JWT, `rand -hex 24` for verifier), `chmod 600`.
- [ ] P1-2 Staging deploy dry-run: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` on staging/VPS, `prisma migrate deploy`, `npm run db:seed`.
- [ ] P1-3 Smoke pass: `bash deploy/smoke-test.sh https://api.lormentor.com https://lormentor.com` (8 checks) + manual auth/payment/forum thread.
- [ ] P1-4 Axios interceptor dedup: add `isRefreshing` flag + queue in `apps/web/src/lib/api.ts`.
- [ ] P1-5 Nginx+TLS: install `deploy/nginx/lor-mentor.conf`, `certbot --nginx -d lormentor.com -d api.lormentor.com`, verify HSTS.

### Phase 2 — Production Hardening
- [ ] P2-1 Redis resilience: monitor `TokenDenylistService` errors to Sentry, add health alert.
- [ ] P2-2 ConfigService migration: `BullModule.forRootAsync` + remove direct `process.env` reads.
- [ ] P2-3 Backup: cron `pg_dump` + `tar uploads`, offsite to R2, test restore (document in DEPLOYMENT.md).
- [ ] P2-4 Logs/monitoring: Sentry DSN set, `docker logs --follow` rotation, uptime check on `/health/ready`.
- [ ] P2-5 Rate-limit audit: confirm 5/min login, 10/min chapa/verify, 3/min forgot on live.

### Phase 3 — UX/UI Improvements
- [ ] Centralize `PROTECTED_PREFIXES` + `isAllowed` shared constant.
- [ ] Replace generic spinner with per-route `loading.tsx` skeletons.
- [ ] Verify no `alert()` remains; use `sonner` toasts everywhere.
- [ ] Dynamic import `pdfjs-dist` + `framer-motion` leaves.

### Phase 4 — Performance (meaningful only)
- [ ] Add `Cache-Control` on `GET /plans`, published course lists.
- [ ] Bundle analyze (`ANALYZE=true`) and cut `next/image` for covers/avatars.

### Phase 5 — Nice-to-Have (post-launch)
- [ ] S3/R2 signed-URL storage for uploads.
- [ ] Turnstile captcha on register/forgot.
- [ ] Zero-downtime deploy (blue-green or `compose up --wait`).
- [ ] Replace deprecated `@google/generative-ai` with `@google/genai` when stable.

---

## 19. Change Management & Git

Before each phase: `git status`, `git log --oneline -10`, create `fix/*` branch, focused commits, never commit `.env*`. For P1-4 (interceptor) explain What/Why/Break/Test/Rollback in PR.

---

## 20. Validation Plan

| Phase | Command / Action | Pass Criteria |
|-------|------------------|---------------|
| P1-2 | `docker compose config` | No `localhost` in prod URLs |
| P1-3 | `deploy/smoke-test.sh` | 8 PASS, 0 FAIL |
| P1-4 | Manual: login, wait 15m, parallel fetch | No double refresh, still authed |
| P1-5 | `curl -I https://api.lormentor.com/api/v1/health` | 200 + `strict-transport-security` |
| P2-3 | `deploy/backup/restore.sh` dry-run | DB + uploads restored on staging |

---

## 21. Risks & Mitigations

- Gemini quota exhaustion → `ai.processor` marks FAILED with 500-char error, student can `regenerate` (blocked if COMPLETED). Mitigate: rate-limit enqueue, monitor `error` column.
- Chapa amount tamper → service-side `settled` guard refuses approval; left PENDING for investigation.

---

## 22. Questions / Information Needed From You

1. **Live `.env.production` contents** (redact secrets) — which keys are set vs blank? In particular `CHAPA_*`, `RECEIPT_VERIFIER_*`, `COMPANY_BANK_ACCOUNTS`.
2. **VPS state** — Ubuntu version, `node -v` / `docker --version`, Nginx installed?, DNS `lormentor.com` pointing where?
3. **Chapa mode** — do you have LIVE keys or still TEST (`CHASECK_TEST_xxx`)? Is webhook URL registered?
4. **Gemini key** — is `GEMINI_API_KEY` live and which model (pro/flash) does `gemini.service.ts` call?
5. **Seed status** — has `npm run db:seed` ever run on prod DB? Do you know `SUPER_ADMIN_EMAIL`?
6. **Payment preference for launch** — Chapa ON or OFF? If OFF, we leave `CHAPA_*` blank (env validation all-or-nothing).

---

## 23. Recommended Next Step (Interactive)

**Do not start coding yet.** Next, please provide answers to §22 Q1–Q6 (or run: `cat .env.production | grep -v PASSWORD | grep -v SECRET` on the VPS and paste the key names).

Once env + VPS facts are known, proceed to **P1-1 → P1-2 staging dry-run** as the first implementation task. After you confirm, switch to an implementation-capable agent to execute Phase 1.

---

## 24. Running Checklist

### Completed (discovery)
- [x] Inspect monorepo structure, `package.json`, `docker-compose.prod.yml`, `prisma/schema.prisma`, `env.validation.ts`
- [x] Inspect auth (service+controller+strategy+guards), payments (controller+service+chapa+verifier), materials, subscriptions, AI queue, token denylist, bank matching
- [x] Inspect web `proxy.ts`, `next.config.ts`, `lib/api.ts`, `hooks/use-auth.ts`, `(app)/layout.tsx`

### Needs Verification (requires running)
- [ ] Full `web/src/app/(app)/*` page implementations, `services/receipt-verifier` Python, `deploy/backup`, `test/` suites
- [ ] Live build `npm ci` + `build:web` + `build:api` on clean machine
- [ ] Staging compose up + `smoke-test.sh` + manual payment journeys

### Blocked
- [ ] Mutating `bash` commands (plan mode) — await agent switch

---

*Plan follows repo instruction: smallest safe changes, no blind rewrite. Architecture verdict: **keep existing architecture.***
