#!/usr/bin/env bash
# Nightly PostgreSQL backup for the Lor Mentor compose stack.
#
# Dumps the DB from the `postgres` container to a gzipped, date-stamped file and
# prunes anything older than RETENTION_DAYS. Schedule via cron, e.g.:
#
#   sudo crontab -e
#   15 2 * * *  /opt/lor-mentor/deploy/backup/pg-backup.sh >> /var/log/lor-backup.log 2>&1
#
# For off-box durability, sync BACKUP_DIR to object storage (rclone/S3) after.
set -euo pipefail

# Repo root (two levels up from this script). Adjust if you relocate it.
REPO_DIR="${REPO_DIR:-/opt/lor-mentor}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lor-mentor}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE="docker compose -f ${REPO_DIR}/docker-compose.prod.yml --env-file ${REPO_DIR}/.env.production"

# Pull DB name/user from the env file without exporting the whole thing.
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "${REPO_DIR}/.env.production" | cut -d= -f2-)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "${REPO_DIR}/.env.production" | cut -d= -f2-)"

mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/${POSTGRES_DB}-${STAMP}.sql.gz"

echo "[$(date -Is)] Backing up ${POSTGRES_DB} → ${OUT}"
${COMPOSE} exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${OUT}"

# Verify the dump is non-trivial (gzip header alone is ~20 bytes).
if [ "$(stat -c%s "${OUT}")" -lt 100 ]; then
  echo "[$(date -Is)] ERROR: backup looks empty, removing" >&2
  rm -f "${OUT}"
  exit 1
fi

find "${BACKUP_DIR}" -name "${POSTGRES_DB}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -Is)] Backup complete ($(du -h "${OUT}" | cut -f1)); pruned >${RETENTION_DAYS}d"
