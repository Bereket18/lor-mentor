# LOR MENTOR — DATABASE AUDIT

**Phase:** Three — Database and Relationship Audit
**Date:** 2026-10-17
**Source:** `apps/api/prisma/schema.prisma` (read in full), `apps/api/prisma/migrations/*`, `apps/api/prisma/seed.ts`, `prisma.config.ts`
**Pass:** static — no database was reachable, so DB-state claims are marked **NOT VERIFIED**.

## 1. Model Inventory

28 models, 10 enums. Grouped by domain:

| Domain | Models |
|---|---|
| Identity | `User`, `AuditLog` |
| Billing | `SubscriptionPlan`, `Subscription`, `Payment` |
| Academic structure | `Department`, `AcademicYear`, `Semester`, `Course` |
| Content | `Material`, `AiContent`, `FlashcardSet`, `Flashcard`, `FlashcardReview` |
| Assessment | `QuizBank`, `Quiz`, `Question`, `QuizAttempt`, `QuizAnswer` |
| AI tutor | `AiHistory` |
| Community | `ForumSection`, `ForumPost`, `ForumReply`, `Reaction`, `Report` |
| Engagement | `Notification`, `ProgressRecord`, `Announcement` |

## 2. Correctness / Cardinality Review

| Constraint | Model | Assessment |
|---|---|---|
| `User.email @unique` (+ `@@index`) | User | Correct |
| `Subscription.userId @unique` | Subscription | One subscription per user — matches the product model |
| `Payment.txRef @unique` | Payment | Chapa idempotency / anti-replay — correct |
| `Payment.bankReference @unique` | Payment | Manual-receipt anti-replay — correct |
| `Payment.receiptNumber @unique` | Payment | Receipt numbering — correct |
| `AiContent.materialId @unique` | AiContent | One AI job per material — correct |
| `FlashcardSet.aiContentId @unique` / `QuizBank.aiContentId @unique` | — | One set/bank per generated content — correct |
| `Quiz.quizBankId @unique` | Quiz | At most one attempt-anchor per bank — correct |
| `ForumSection.courseId @unique` | ForumSection | One forum per course — correct |
| `ProgressRecord @@unique([userId, materialId])` | ProgressRecord | Prevents duplicate view rows — correct |
| `FlashcardReview @@unique([userId, cardId])` | FlashcardReview | One review state per card per user — correct |
| `Reaction @@unique([userId, postId, type])` / `@@unique([userId, replyId, type])` | Reaction | Prevents duplicate reaction types — correct |

## 3. Referential Integrity Gaps (static findings)

### D-1 — No `onDelete` cascades anywhere; cleanup is application-level (INFO / risk)
Every relation uses the default (`onDelete: NoAction`/restrict). Deleting a parent (`Course`, `Material`, `AiContent`, `Quiz`, `User`, …) is only safe because services delete children first. `UsersService.deleteUser()` does this correctly in a transaction; **`deleteInactiveUsers()` did not and would FK-error — fixed this pass** (see `CLEANUP-REPORT.md` B-1). Any future delete path must replicate the same ordering; the schema will not protect it. **Recommendation:** consider explicit `onDelete: Cascade` on purely-owned children (e.g. `Material → AiContent → FlashcardSet → Flashcard`) to remove the footgun.

### D-2 — `AiHistory.courseId` / `materialId` are raw strings with no FK (B-6)
They are not Prisma relations. Deleting a course/material leaves orphaned history rows silently. **Recommendation:** convert to nullable relations with `onDelete: SetNull`, or accept as denormalised history and document it.

### D-3 — `Question` has two optional owners (B-8)
`quizId?` **and** `quizBankId?` are both optional; nothing at the DB level forces exactly one. In practice AI questions are created with `quizBankId` and the app anchors attempts through `Quiz.quizBankId`. **Recommendation:** add a CHECK constraint (at least one non-null) or a comment documenting the invariant; the current code happens to be consistent.

## 4. Index Review

### Before this pass
Indexes existed on: `User(email, role)`, `Payment(userId+status, status)`, `Notification(userId+isRead)`, `AuditLog(actorId, action, createdAt)`, `Reaction(postId, replyId)`, `Report(status, postId, replyId)`. Unique constraints also act as indexes (`Subscription.userId`, `FlashcardReview(userId,cardId)`, `ProgressRecord(userId,materialId)`).

**Gap (B-7):** many hot foreign-key columns had **no index** — every `courseId`/`semesterId`/`userId` lookup was a sequential scan. Most impactful: `Material.courseId` (course page), `Course.semesterId` (student/teacher lists), `Course.teacherId` (teacher dashboard), `QuizAttempt.userId` (history), `Question.quizBankId` (quiz fetch).

### Added this pass (additive, non-destructive)
A new migration `20261017120000_add_performance_indexes` adds `IF NOT EXISTS` indexes and the matching `@@index` declarations were added to `schema.prisma` so the schema and DB stay in sync:

| Table | Column(s) |
|---|---|
| `Course` | `semesterId`, `teacherId` |
| `Material` | `courseId` |
| `Question` | `quizBankId`, `quizId` |
| `QuizAttempt` | `userId`, `quizId` |
| `QuizAnswer` | `attemptId`, `questionId` |
| `ForumPost` | `sectionId`, `authorId` |
| `ForumReply` | `postId`, `authorId` |
| `Announcement` | `courseId` |
| `Report` | `reporterId` |
| `AiHistory` | `userId` |

**NOT VERIFIED:** the migration was not applied (no database here). It must be reviewed and run with `npx prisma migrate deploy` against a disposable DB before production. `CREATE INDEX IF NOT EXISTS` is idempotent and data-preserving, so the blast radius is low.

### Deliberately NOT added
- `Payment.createdAt` — `Payment` already has `(userId, status)` and `status`; admin ordering by `createdAt` is a small table. Skipped to keep the change minimal.
- `Material.uploadedBy`, `Announcement.authorId`, `Quiz.createdBy` — not on measured hot paths.

## 5. Missing Standard Columns (B-9, low)

`AcademicYear`, `Semester`, `Announcement`, `Flashcard` lack `updatedAt` (and `Flashcard` has no timestamps at all). Not a correctness bug; limits audit queries. **Recommendation:** add `updatedAt` when next touching these tables.

## 6. Migrations

Existing 8 migrations:
```
20260611063236_init
20260618104412_add_department_year_to_user
20260628120000_add_quiz_quizbank_link
20260628130000_add_forum_reactions_reports
20260629120000_add_chapa_payments
20260629140000_add_login_lockout
20260630120000_aicontent_error
20260701120000_add_bank_receipt_verification
+ 20261017120000_add_performance_indexes   (added this pass)
```
`docker-entrypoint.sh` runs `npx prisma migrate deploy` before boot, so migrations are the deploy mechanism (good). **NOT VERIFIED:** the live database's `_prisma_migrations` state and whether it matches the schema — `prisma migrate status` could not be run.

## 7. Seed / Bootstrap

`prisma/seed.ts` upserts the 9 Lorcan programs (BSC 5-year, TVET 3-year) with their academic years + Semester 1/2, and idempotently bootstraps the super admin from `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` (refuses to run without them, never overwrites an existing password). **Good:** no predictable default admin.

Note — two seed entry points exist: `package.json` `db:seed` = `ts-node prisma/seed.ts`, while `prisma.config.ts` `migrations.seed` = `node dist/prisma/seed.js` (needs a build first). Both are valid but the divergence should be documented or unified.

## 8. Backups

`deploy/backup/pg-backup.sh` dumps the `postgres` container to a gzipped, timestamped file, validates the dump is non-trivial, and prunes older than `RETENTION_DAYS` (14). It is **not** part of `docker-compose.prod.yml` — it expects a host cron entry (documented in the script header). **Gap:** nothing backs up the `uploads` Docker volume (bank-receipt images + generated PDF receipts), so restore would lose proof-of-payment artefacts. See `DEPLOYMENT-READINESS.md`.

## 9. Summary

- Relational design is sound: correct uniques, sensible cardinalities, no unintended duplicates possible at the DB level.
- Two structural soft spots: application-level-only cascades (D-1) and non-relational `AiHistory` references (D-2).
- One performance gap (missing FK indexes) — **addressed additively this pass**, pending a real `migrate deploy`.
- Backup covers Postgres but not uploaded files.
- **Database state, migration status, and index effectiveness are all NOT VERIFIED** — no DB was available.
