# Database and Backups

Everything the application stores, how schema changes reach production, what is
backed up, and how to restore it.

The database is **PostgreSQL 16**, accessed through **Prisma 7**, running in the
`postgres` container with no host port. Its data lives in the `pgdata` Docker
volume.

---

## 1. Where the data lives

| Store | Contents | Volume | Survives |
|---|---|---|---|
| PostgreSQL | All application data (32 models) | `pgdata` | `restart`, `down`, re-`up`, image rebuild |
| Uploads | Receipt images, material files, generated receipt PDFs | `uploads` | Same |
| Redis | Cache, rate-limit counters, BullMQ queue, revoked-token denylist | `redisdata` | Same |

None is deleted by `docker compose restart` or `docker compose up -d --build`.
**All three are deleted by `docker compose down -v`** — never run that in
production.

Redis is reconstructible: losing it forces re-login and re-queues background
work, nothing more. The database and uploads are not.

---

## 2. Schema map

32 models, grouped by concern. `apps/api/prisma/schema.prisma` is authoritative.

| Group | Models |
|---|---|
| Identity & access | `User`, `Subscription`, `SubscriptionPlan` |
| Academic catalogue | `Department`, `AcademicYear`, `Semester`, `Course`, `Material` |
| AI-generated study content | `AiContent`, `AiHistory`, `FlashcardSet`, `Flashcard`, `FlashcardReview`, `QuizBank`, `Quiz`, `Question`, `QuizAttempt`, `QuizAnswer` |
| Community | `ForumSection`, `ForumPost`, `ForumReply`, `Reaction`, `Report`, `Announcement` |
| Learning progress | `ProgressRecord` |
| Payments | `Payment`, `AcceptedBank` |
| Anatomy Lab | `AnatomySystem`, `AnatomyStructure`, `AnatomyStructureRevision` |
| Operations | `AuditLog`, `Notification` |

Ten enums constrain state: `Role`, `MaterialType`, `SubscriptionStatus`,
`PaymentStatus`, `PaymentMethod`, `AiStatus`, `NotificationType`, `ReactionType`,
`ReportReason`, `ReportStatus`.

### Highest-value tables

| Model | Why it matters |
|---|---|
| `User` | Accounts, bcrypt password hashes, roles, lockout counters |
| `Payment` | Money. Amounts, `tx_ref`, status, reversal fields |
| `Subscription` | What each student is entitled to |
| `SubscriptionPlan` | Pricing; wrong values misprice checkout |
| `AuditLog` | Who changed what; needed for disputes |
| `AcceptedBank` | Where students are told to transfer money |

A restore that returns zero rows in any of these is a failed restore, not a
successful one.

---

## 3. Migrations

### 3.1 How they run

`apps/api/docker-entrypoint.sh` executes `prisma migrate deploy` **before**
starting the API. On every container start Prisma compares the
`_prisma_migrations` table against `apps/api/prisma/migrations/` and applies
anything missing. It is:

- **forward-only** — there is no down migration
- **idempotent** — a restart with nothing pending applies nothing
- **fail-fast** — a failed migration exits non-zero and the API never starts

There are **17 committed migrations**. A fresh deployment applies all of them in
order.

### 3.2 Commands that must never touch production

| Command | Effect | Allowed where |
|---|---|---|
| `prisma migrate deploy` | Applies pending migrations | **Production and dev** |
| `prisma migrate dev` | Diffs schema, may reset the database | Local only |
| `prisma migrate reset` | **Drops and recreates the database** | Local only |
| `prisma db push` | Forces schema without a migration record | Local only |

Running any of the last three against production destroys data or desynchronises
the migration history.

### 3.3 The line-ending trap

Prisma hashes each `migration.sql` **exactly as it sits on disk**. Three
migrations (`20260611063236_init`, `20260618104412_add_department_year_to_user`,
`20260701120000_add_bank_receipt_verification`) were originally applied with
CRLF bytes, and `.gitattributes` pins them to `eol=crlf` for that reason.

Consequences:

- Obtain the repository with `git clone`. A zip download or a line-ending-
  normalising copy changes those hashes and `migrate deploy` fails with a
  checksum mismatch on redeploy.
- Never re-save a migration file in an editor that rewrites line endings.
- Never edit a migration that has already been applied. Add a new one.

### 3.4 Adding a migration (development only)

```bash
# 1. Edit schema.prisma
cd apps/api && npx prisma migrate dev --name describe_the_change
# 2. Review the generated SQL in prisma/migrations/<timestamp>_<name>/migration.sql
# 3. Run the test suite, commit schema + migration together
```

Review the SQL before committing. Prisma generates `DROP COLUMN` for a renamed
field — that is data loss, and it will execute unattended in production.

For a destructive change, use the expand/migrate/contract pattern: add the new
column in one release, copy data, switch reads, drop the old column a release
later. Each step is separately revertible by rolling back code.

---

## 4. Backups

### 4.1 What is covered

| Data | Covered by | Automated |
|---|---|---|
| PostgreSQL | `deploy/backup/pg-backup.sh` | Yes, once scheduled |
| Uploads volume | Manual `tar` (§4.5) | **No — must be scheduled separately** |
| Redis | Nothing | Not needed |
| `.env.production` | Your password manager | Manual |

### 4.2 The nightly dump

The script lives at [`deploy/backup/pg-backup.sh`](deploy/backup/pg-backup.sh)
and does four things beyond `pg_dump`:

1. Fails loudly if `POSTGRES_USER` / `POSTGRES_DB` cannot be read from
   `.env.production` — rather than writing a file named `-<stamp>.sql.gz`.
2. Rejects any dump under 100 bytes.
3. Runs `gzip -t` to prove the stream is intact (a truncated dump only surfaces
   on restore day).
4. Prunes dumps older than `RETENTION_DAYS` (default 14).

Schedule it:

```bash
sudo crontab -e
15 2 * * *  /opt/lor-mentor/deploy/backup/pg-backup.sh >> /var/log/lor-backup.log 2>&1
```

Output: `/var/backups/lor-mentor/<db>-<YYYYmmdd-HHMMSS>.sql.gz`.

Override with `REPO_DIR`, `BACKUP_DIR`, `RETENTION_DAYS`.

### 4.3 Off-box copies are mandatory

A dump on the same VPS is lost with the VPS. Sync it elsewhere:

```bash
30 2 * * *  rclone sync /var/backups/lor-mentor remote:lor-mentor-backups
```

Any off-site target works (object storage, another host the college controls).
Verify the sync succeeded — a sync job that has been failing silently for a month
is indistinguishable from no backup at all until you need one.

### 4.4 Retention and recovery targets

| Setting | Default | Meaning |
|---|---|---|
| Retention | 14 days | Oldest recoverable point is 14 days |
| RPO (max data loss) | ~24 hours | Nightly schedule |
| RTO (time to restore) | ~1 hour | Dump size dependent |

For an academic platform, 24 hours is usually acceptable. If the college wants
better, run the dump twice daily — the script is safe to run ad hoc.

### 4.5 Backing up uploads

```bash
docker run --rm \
  -v lor-mentor_uploads:/data:ro \
  -v /var/backups/lor-mentor:/backup \
  alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

Check the actual volume name first with `docker volume ls | grep uploads` — it
is prefixed with the Compose project name (`lor-mentor_uploads` by default).

Run this **before** or alongside the database dump. A database restored without
its uploads references files that no longer exist.

---

## 5. Restore

### 5.1 Always drill first

A backup that has never been restored is not a backup. Run this drill **once
before go-live** and then **quarterly**, on a machine that is not the production
VPS. It restores into a scratch database and checks row counts, so a dump that
"restores successfully" but is empty cannot pass.

```bash
# 1. Pick the newest dump and confirm it is intact
ls -1t /var/backups/lor-mentor/*.sql.gz | head -1
gzip -t /var/backups/lor-mentor/<file>.sql.gz && echo "gzip OK"

# 2. Restore into a throwaway database
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c 'CREATE DATABASE lor_restore_drill;'

gunzip -c /var/backups/lor-mentor/<file>.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d lor_restore_drill

# 3. Prove it actually contains data
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d lor_restore_drill \
  -c 'SELECT count(*) AS users FROM "User";' \
  -c 'SELECT count(*) AS payments FROM "Payment";' \
  -c 'SELECT count(*) AS materials FROM "Material";'

# 4. Clean up
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c 'DROP DATABASE lor_restore_drill;'
```

Record the date, the dump filename and the row counts in the
[release checklist](81-RELEASE-CHECKLIST.md). Row counts of zero mean the
backup is worthless — investigate before go-live.

Never restore over production to "test whether the dump works". Use the drill.

### 5.2 Production disaster recovery

Only after a drill has proven the dump is good. This **replaces** production
data.

```bash
cd /opt/lor-mentor

# 1. Stop writers. Leave the database running.
docker compose -f docker-compose.prod.yml --env-file .env.production stop api web verifier

# 2. Take a safety dump of the current (bad) state before touching anything.
bash deploy/backup/pg-backup.sh

# 3. Restore. --clean --if-exists drops existing objects first.
gunzip -c /var/backups/lor-mentor/<chosen>.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --single-transaction

# 4. Start the API; it re-runs migrate deploy and settles the schema.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 5. Verify before announcing recovery.
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT count(*) FROM "User";' -c 'SELECT count(*) FROM "Payment";'
```

Then restore uploads into the `uploads` volume (§4.5 in reverse), and run the
smoke test.

**Do not** restore over production to "test whether the dump works." Use the
drill.

### 5.3 Restoring uploads

```bash
docker run --rm \
  -v lor-mentor_uploads:/data \
  -v /var/backups/lor-mentor:/backup:ro \
  alpine sh -c 'cd /data && tar xzf /backup/uploads-<date>.tar.gz'
```

---

## 6. Verifying a live deployment

```bash
# Migrations applied and none failed
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;'

# Database and Redis reachable from the API
curl -s https://api.<domain>/api/v1/health/ready
```

A row in `_prisma_migrations` with `finished_at IS NULL` means an interrupted
migration; the API will refuse to start until it is resolved. Do not delete the
row — read Prisma's error output and fix the cause.

---

## 7. Failure modes

| Symptom | Cause | Response |
|---|---|---|
| API exits at boot with `P3018` | Migration failed | Read the log; fix forward with a new migration or restore |
| `checksum mismatch` on redeploy | Migration files re-saved / line endings changed | Re-clone; see §3.3 |
| `password authentication failed` | `POSTGRES_PASSWORD` and `DATABASE_URL` disagree | Make them match; restart `api` |
| Restore "succeeded" but app is empty | `.sql.gz` restored into the wrong database | Check the `-d` argument |
| Uploads 404 after restore | `uploads` volume not restored | §5.3 |
| Backup log shows nothing | cron not running, or script not executable | `chmod +x`, check `/var/log/lor-backup.log` |

---

## 8. Data handling summary

The database holds personal data (names, email addresses, hashed passwords),
payment records, and student-generated content. Access is restricted to the
`deploy` user on the VPS; there is no public database port.

- Backups contain the same personal data — treat them as sensitive, keep them
  off shared storage, and delete expired ones.
- Never copy a production dump to a laptop or into a ticket.
- Consent, retention and deletion obligations for student data are the college's
  policy; the mechanics are in [`SECURITY.md`](SECURITY.md).
