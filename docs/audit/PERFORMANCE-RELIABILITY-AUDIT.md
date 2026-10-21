# LOR MENTOR — PERFORMANCE & RELIABILITY AUDIT

**Phase:** Five — Performance and Reliability
**Date:** 2026-10-17
**Pass:** static. No load test, profiling, or runtime observation was performed — every measured item is **NOT VERIFIED**.

## 1. Database Performance

- **Missing FK indexes (B-7) — fixed this pass.** `Course.semesterId/teacherId`, `Material.courseId`, `Question.quizBankId/quizId`, `QuizAttempt.userId/quizId`, `QuizAnswer.attemptId/questionId`, `ForumPost.sectionId/authorId`, `ForumReply.postId/authorId`, `Announcement.courseId`, `Report.reporterId`, `AiHistory.userId` now have indexes via migration `20261017120000_add_performance_indexes` (additive). Until this migration is applied to the live DB, those lookups are sequential scans.
- **Free-text search** in the admin user list (`search` on `fullName`/`email`) uses Prisma `contains` → `ILIKE '%…%'`, which cannot use a btree index. Fine at current scale; consider a trigram index if the user base grows.
- **Index effectiveness NOT VERIFIED** — needs `EXPLAIN ANALYZE` against real data.

## 2. Query Patterns

- **Forum** loads reactions for a page of posts/replies in a single batched query then groups in memory (`attachPostReactions`/`attachReplyReactions`) — avoids N+1 for reactions. Authors are selected via a relation in the main query. Good.
- **Materials** `withUploaderNames` resolves uploader names; depending on implementation this could be an extra round-trip per material — **worth confirming** it batches (inspect with a query logger).
- **Progress** per-course aggregation and **quiz** attempt lookups are index-backed after the migration.
- **`GET /plans` and `/plans/:id`** set `Cache-Control: public, max-age=60, stale-while-revalidate=300` — good for the pricing page.
- **AI tutor context** (`buildContext`) caps materials at 10 — bounded prompt size. Good.

## 3. AI Pipeline Reliability

| Item | Finding |
|---|---|
| R-04 (open) | `AiService.enqueueGeneration` adds the BullMQ job with **no `attempts`/backoff**, so transient Gemini/PDF failures are not retried by policy; the processor re-throws but the default is a single attempt. **Recommendation:** set `attempts` + exponential backoff and/or a dead-letter queue. |
| Idempotency | `AiContent` is `upsert`ed and the completion write is a single transaction — no half-saved summary/flashcards/quiz. |
| Re-generate guard | `regenerate` refuses `COMPLETED` materials so it can't orphan attempts/reviews. |
| Worker drain | `app.enableShutdownHooks()` drains BullMQ on SIGTERM — in-flight jobs are not lost mid-process. |
| Failure visibility | Failures set `AiContent.status=FAILED` with a truncated message and notify the uploader on success only; no notification on failure (minor UX gap). |

## 4. Caching & Frontend Performance

- React Query has **no explicit `staleTime`/`gcTime`** → default (stale immediately). Paid-content lists re-fetch on each mount. Acceptable but leaves easy wins on the table.
- `useAuth()` dedupes `/me` to one shared query (fixed earlier) — significant reduction in duplicate requests.
- Next.js `output: "standalone"` + `outputFileTracingRoot` keeps the runtime image small. `.next/static` and `public/` are copied explicitly (they are not in the standalone bundle).
- Bundle analyzer wired behind `ANALYZE=true`. **NOT VERIFIED** — no bundle report produced.

## 5. Reliability & Operations

- **Health checks:** API has liveness (`/health`) and DB readiness (`/health/ready`); the compose `api` healthcheck hits `/health`. **Missing:** `web` has **no healthcheck** in `docker-compose.prod.yml`, and readiness only checks the DB — not Redis (a dead Redis is not surfaced).
- **Timeouts:** Redis client uses `maxRetriesPerRequest: 2`; receipt-verifier timeout is bounded (5s–120s via env). Chapa/HTTP timeouts inherited from clients — **worth confirming**.
- **Graceful shutdown:** enabled. Good for zero-loss deploys.
- **Backups:** DB backup script exists (cron-driven) but the `uploads` volume (receipts + PDFs) is **not backed up**. See deployment doc.
- **Sentry:** initialized only when `SENTRY_DSN` is set; captures 5xx and unhandled errors. Ensure it is set in production and that sensitive fields are scrubbed (see SECURITY-AUDIT S-4).

## 6. Known Inefficiencies (low priority)

- `MailService` builds a new nodemailer transporter per send (new SMTP connection each time).
- Progress upsert on every material view is a write per view — expected; index-backed by `@@unique([userId, materialId])`.

## 7. NOT VERIFIED

Load/latency numbers, query plans, memory during PDF extraction, BullMQ behaviour under failure, Redis behaviour under outage, container health transitions, and bundle size. All require execution.
