# LOR Mentor — Production Readiness Report (independent audit, 2026-09-29)

> Method & limits: this audit was performed by **file inspection only**. The Linux sandbox on this machine failed to start (host paging-file error), so **no build, test, or migration was executed in this session**. Every claim below is backed by reading the actual code. Items marked "not verified by execution" must be run before any deployment decision.

## Executive Summary

LOR Mentor is substantially more complete and better-engineered than a typical project at this stage. The previously-audited critical flaws (documented in `docs/PRODUCTION_READINESS_AUDIT.md` and fixed in `docs/REMEDIATION-LOG.md`) have, on inspection, genuinely been fixed in the code: no JWT empty-secret fallback, Chapa amount verification exists, approval is atomic/idempotent, the web proxy is SSRF-hardened, uploads are magic-byte validated, the tutor is subscription-gated and per-user throttled.

The most serious **current** problem is not in the code — it is on disk: `apps/api/.env` contains real-looking secrets (Gemini API key, Chapa test secret + webhook secret, Resend SMTP password, receipt-verifier token) and the DB password is embedded in a connection string. `.env` is gitignored, so the git risk is limited, but these credentials must still be treated as potentially exposed (they were shared with this machine/assistant, and the Gemini key format suggests a live key). **Rotate all of them** before production.

Second problem: I could **execute nothing**. CI exists and presumably runs the tests, but per this audit's rules I will not claim builds or tests pass without evidence. Production readiness therefore cannot be certified from this session alone.

## What Is Working Well

- Auth is solid for this scale: bcrypt(12), anti-enumeration everywhere, account lockout + audit logging, refresh rotation with jti denylist, HTTP-only cookies, `secure` in production, tight per-endpoint throttles.
- Payment architecture follows the correct pattern: server-snapshotted price, Chapa verify + HMAC webhook + amount-mismatch guard, atomic `finalizeApproval`, unique `bankReference` anti-replay, human review path for ambiguous receipts. The "never trust the frontend saying payment succeeded" rule is respected.
- Uploads: random filenames, MIME filter **plus** magic-byte content validation, files outside `/public`, served only through authorized endpoints with academic-year + subscription checks.
- Quiz answers are graded server-side; `correctOption` is never sent before submission.
- Env validation fails fast in production (JWT entropy, Chapa all-or-nothing, SMTP required, no localhost URLs).
- Deployment story is coherent and proportionate: Docker Compose (justified here — 5 processes + healthchecks + volumes on one 4 GB VPS), Nginx TLS proxy, nightly pg_dump with retention and size check, CI running build + tests.
- Database schema is reasonable: correct cardinalities, useful unique constraints (`txRef`, `bankReference`, `@@unique([userId, cardId])`, `[userId, materialId]`), payment amount snapshotting, audit log with indexes.

## What Is Incomplete

- **Zero frontend tests found** (Playwright configured, no test files). API has 11 unit spec files (auth, payments, chapa, guards, env, utils) but **no e2e tests** despite `test:e2e` script scaffolding.
- **No Next.js middleware** — protected-route gating is client-side; page data flashes before redirect (APIs are protected, so this is UX/leak-of-shell, not data exposure).
- Subscription expiration is **checked at read time only**; no cron/job flips `EXPIRED` status or notifies users proactively (NotificationType enum has SUBSCRIPTION_EXPIRING/EXPIRED but I found no scheduler emitting them).
- No virus scanning of uploads (acceptable to defer with a documented risk acceptance; magic bytes + auth + random names limit exposure).
- Receipt images and materials live on a Docker volume — fine for one VPS, but backups cover only the DB, not `uploads/`. **Back up the uploads volume too.**
- Redis fail-open on the denylist (documented, conscious tradeoff — acceptable, but logout-revocation is then best-effort).

## Critical Problems (must fix before production)

1. **Secrets exposure / rotation**: all credentials in `apps/api/.env` must be rotated (Gemini key, Chapa test→live keys, SMTP password, verifier token, DB password) and generated fresh per environment. Also remove the stray `//FT26194B4PBC` line (invalid in an env file; it will break dotenv parsing of lines after it — actually dotenv tolerates it, but it is debris and may contain a real reference number).
2. **Nothing was executed in this audit**: run `npm ci`, `prisma migrate deploy` against a fresh DB, `jest --ci`, `npm run build:api`, `npm run build:web`, and the smoke test before any go-live claim. CI green is the minimum bar.

## High Priority Problems

1. **Expired-subscription access race**: `ensureActiveForStudent` correctly checks `endDate > now`, so enforcement is sound; but status is never transitioned, so admin lists and notifications show stale ACTIVE. Add a daily job (BullMQ repeatable) to flip expired subscriptions and emit SUBSCRIPTION_EXPIRED notifications.
2. **`getQuiz` fetch (quiz taking) is subscription-gated but `getQuizzes` listing and attempts list are not** — minor, listing leaks titles only. Acceptable; note it.
3. **Web build lint is `continue-on-error`** in CI — known react-hooks debt. Pay it down and make lint blocking.
4. **No rate limit on `GET /materials/:id/file`** beyond the global 120/min/IP — students share college IPs; consider per-user throttling like the tutor's.
5. **`uploads/` not backed up** — add the volume to the backup script.
6. **Refresh-denylist fails open** — if Redis dies, revoked refresh tokens work again until expiry. Consider failing closed for refresh only (small blast radius) or accepting with documentation.

## Medium Priority

- `CoursesController.findOne` is public and returns materials list (titles + youtubeUrl, no files) for **unpublished** courses? — No: it returns whatever `findUnique` finds, including drafts, to guests. Low sensitivity (titles only) but inconsistent with the published-only listing. Gate `findOne` to published unless admin/teacher.
- `Material.update` passes the whole DTO to Prisma (`data: dto`) — safe now because validation strips unknown fields, but a `filePath` field in UpdateMaterialDto would be a mass-assignment vector. Audit DTO fields explicitly.
- `AiHistory`/`progress` unbounded growth; add retention policy later.
- `Reaction @@unique([userId, postId, type])` — with NULL replyId, Postgres allows duplicate NULLs; Prisma handles this via app-level checks; verify toggle logic is idempotent (appears to be upsert-based).
- No CSP headers configured in helmet (default helmet set is fine; add CSP for the Next.js app at Nginx level when convenient).
- Timezone: TZ=UTC everywhere and `setMonth` arithmetic for subscription end dates — fine, but document that renewals anchored to UTC.

## Low Priority / Technical Debt

- Duplicated `withUploaderNames` in two services — extract.
- Mixed comment density (some files teaching-commented, others terse).
- `apps/web` has `web-local.out.log` / err logs and `.tsbuildinfo` in tree; gitignored but clean them.
- Tailwind v3 config with v4 postcss plugin both present — confirm intentional; potential double-processing.
- `@types/node` v24 (api) vs v20 (web) mismatch.

## Security Findings Summary

| ID | Severity | Finding | Location |
|---|---|---|---|
| S-1 | CRITICAL (ops) | Live-looking secrets on disk; rotate all | `apps/api/.env` |
| S-2 | HIGH (process) | No executed verification this session; run full build/test/migrate suite | — |
| S-3 | MEDIUM | Public course detail exposes draft course material titles | `courses.controller.ts` `findOne` |
| S-4 | MEDIUM | Refresh denylist fails open when Redis down | `token-denylist.service.ts` |
| S-5 | LOW | No malware scanning of uploads | materials/payments controllers |
| S-6 | LOW | CSP not configured | nginx conf / helmet |
| S-7 | INFO | Screenshot/recording of PDFs cannot be prevented — controlled access only | by design |

Positives verified: no IDOR found in materials/receipts/payments ownership checks; anti-enumeration; SSRF-hardened proxy; mass-assignment blocked by ValidationPipe whitelist+forbidNonWhitelisted; path traversal guarded in receipt serving and random filenames everywhere.

## Database Findings

- No `onDelete` behaviors specified anywhere → default restrict for required relations; user deletion with content will fail (probably desirable; `deleteInactive`/`deleteUser` need verification they handle related rows).
- Missing indexes: `Material.courseId`, `Course.semesterId`, `Course.teacherId`, `QuizAttempt.userId`, `ProgressRecord` (covered by unique), `Payment.createdAt` for admin listing. Add the first four — they are the hot paths at 500–1,000 users.
- `Subscription.userId @unique` means one subscription row per user — renewals overwrite history; the Payment table preserves history, so this is acceptable, but document it.
- Migrations exist and are incremental (8 migrations); `migrate deploy` path is standard. Not executed here.

## Frontend Findings

- Everything is client-rendered; SEO is weak on app pages (fine for an authenticated product; landing page matters only).
- `use-auth` React Query pattern is good; interceptor refresh-retry has no queue, so parallel 401s can fire multiple refreshes (each rotation burns the previous token — the denylist makes later ones fail; **verify**: concurrent-expiry could log a user out spuriously. Add a single-flight refresh promise).
- Client-side-only route guards (see High Priority #3 in incomplete list).
- `localStorage` used for sidebar collapse (fine — not sensitive).

## Testing Findings

- API: 11 spec files covering the riskiest logic (payments, chapa, guards, env validation, bank-account matching, image validation). Good coverage of money paths.
- Web: none. Playwright configured but unused.
- E2E journey tests (signup→verify→login, pay→activate, expired→denied) do not exist.

## Deployment Findings

- Compose, Nginx, backups, CI are all present and proportionate. Remaining: secrets rotation, run migrations, verify HTTPS via certbot, uploads volume backup, and set `NEXT_PUBLIC_API_URL` to the real API domain at build time.

## Production Readiness Percentage

Calculated against a fixed checklist (not feelings): architecture/feature completeness 25/25; code-level security 18/20 (deduct: secrets rotation outstanding, denylist fail-open); database 8/10 (missing hot-path indexes, no executed migration); testing 8/15 (good unit coverage of money paths, zero frontend/e2e, nothing executed); deployment 9/15 (compose+nginx+backups exist; no executed deploy validation, uploads not backed up); frontend reliability 4/5 (single-flight refresh, lint debt); docs/ops 4/10 (good internal docs; no runbook for incident/rollback, no monitoring beyond optional Sentry).

**Total: 76/100 — READY FOR STAGING. NOT READY FOR PRODUCTION** until: (a) secrets rotated, (b) full build/test/migrate executed and green, (c) staging deploy validated end-to-end including a real Chapa test transaction and an expired-subscription denial test.

## Remediation Roadmap

- **Phase 1 (immediate)**: rotate all secrets; remove `.env` debris; run full build/test/migration suite; commit results.
- **Phase 2**: subscription expiry cron + notifications; single-flight refresh in `api.ts`; uploads volume backup.
- **Phase 3**: DB indexes migration (Material.courseId, Course.semesterId, Course.teacherId, QuizAttempt.userId); gate `courses/:id` to published for non-staff; audit UpdateMaterialDto fields.
- **Phase 4**: frontend tests — Playwright for Journey 1 and Journey 5/6 (pay→activate, expired→denied); make lint blocking after paying down react-hooks debt.
- **Phase 5**: staging deployment, smoke test, real Chapa test-mode transaction, monitoring (Sentry DSN + uptime check on /health/ready).
- **Phase 6**: production go-live per `docs/deployer/10-DEPLOYMENT-GUIDE.md`.

Each phase is small, incremental, and independently committable. No architectural changes are proposed — the architecture is appropriate for this scale.
