# Backup and Restore Drill

A backup that has never been restored is not a backup. Run this drill **once
before go-live** and then **quarterly**, on a machine that is not the production
VPS.

## 1. What must be backed up

| Data | Where it lives | Backed up by |
|---|---|---|
| PostgreSQL (all app data) | `pgdata` named volume | `deploy/backup/pg-backup.sh` |
| Uploaded receipts + generated PDFs | `uploads` named volume | **not automated — see §4** |
| Redis | `redisdata` named volume | Not backed up. It holds cache, rate-limit counters and the revoked-token denylist, all of which are reconstructible. Losing it forces re-login, nothing more. |

## 2. Schedule the database backup

```bash
sudo crontab -e
# Nightly at 02:15, append to /var/log/lor-backup.log
15 2 * * *  /opt/lor-mentor/deploy/backup/pg-backup.sh >> /var/log/lor-backup.log 2>&1
```

The script dumps to `/var/backups/lor-mentor/<db>-<timestamp>.sql.gz`, refuses to
keep a dump under 100 bytes, **verifies the gzip stream**, and prunes files older
than `RETENTION_DAYS` (default 14). Override with `BACKUP_DIR`, `RETENTION_DAYS`
or `REPO_DIR` if you relocate anything.

**Off-box copies are not optional for production.** A backup on the same VPS is
lost with the VPS. Sync `BACKUP_DIR` somewhere else:

```bash
# Example: rclone to object storage, after the nightly dump
30 2 * * *  rclone sync /var/backups/lor-mentor remote:lor-mentor-backups
```

## 3. The restore drill

Run this against a **scratch** database. Never restore over production to "test".

```bash
# 3.1 Pick the newest dump and confirm it is intact
ls -1t /var/backups/lor-mentor/*.sql.gz | head -1
gzip -t /var/backups/lor-mentor/<file>.sql.gz && echo "gzip OK"

# 3.2 Restore into a throwaway database
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c 'CREATE DATABASE lor_restore_drill;'

gunzip -c /var/backups/lor-mentor/<file>.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d lor_restore_drill

# 3.3 Verify it actually contains data — a dump can restore "successfully" and be empty
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d lor_restore_drill \
  -c 'SELECT count(*) AS users FROM "User";' \
  -c 'SELECT count(*) AS payments FROM "Payment";' \
  -c 'SELECT count(*) AS materials FROM "Material";'

# 3.4 Clean up
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c 'DROP DATABASE lor_restore_drill;'
```

Record the date, the dump filename and the row counts in the release checklist.
Row counts of zero mean the backup is worthless — investigate before go-live.

## 4. Backing up the uploads volume

Receipt images and generated PDF receipts live in the `uploads` volume and are
**not** covered by `pg-backup.sh`. Without them, a restored database references
files that no longer exist.

```bash
docker run --rm \
  -v lor-mentor_uploads:/data:ro \
  -v /var/backups/lor-mentor:/backup \
  alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

Confirm the volume name with `docker volume ls` — compose prefixes it with the
project name from `docker-compose.prod.yml` (`lor-mentor`).

## 5. Restoring a full environment

1. Restore the database (§3) into the real database name.
2. Restore the uploads volume (§4) into the **empty** `uploads` volume.
3. Recreate the stack: `docker compose ... up -d`.
4. Verify: `GET /api/v1/health/ready` reports database and Redis up.

Note that a restored database does **not** need migrations re-applied —
`_prisma_migrations` is part of the dump. The API's entrypoint runs
`prisma migrate deploy` on boot and will report the schema as already current.

## 6. Two failure modes worth knowing

**Prisma migration checksums.** `apps/api/prisma/migrations/**/migration.sql` is
hashed exactly as it sits on disk, and three migrations are deliberately pinned
to CRLF in `.gitattributes` to match checksums already recorded. **Always obtain
the repo with `git clone`.** A zip download or an `rsync` that normalises line
endings will change those hashes and make `prisma migrate deploy` fail on any
re-deploy against an existing database.

**Environment file line endings.** Editing `.env.production` on Windows can
leave CRLF endings. `pg-backup.sh` strips `\r` defensively, but other tooling may
not. Keep the file LF-only.
