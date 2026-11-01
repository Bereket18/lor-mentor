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
#
# A backup that has never been restored is not a backup. See
# docs/deploy/BACKUP-RESTORE.md for the restore drill.
set -euo pipefail

# Repo root (two levels up from this script). Adjust if you relocate it.
REPO_DIR="${REPO_DIR:-/opt/lor-mentor}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lor-mentor}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE="docker compose -f ${REPO_DIR}/docker-compose.prod.yml --env-file ${REPO_DIR}/.env.production"

ENV_FILE="${REPO_DIR}/.env.production"
[ -r "${ENV_FILE}" ] || { echo "ERROR: cannot read ${ENV_FILE}" >&2; exit 1; }

# Read a key from the env file without exporting the whole thing.
#
# `tr -d '\r'` strips CRLF endings: this file is frequently authored on Windows
# and deployed to Linux, and a trailing \r would silently corrupt the value
# (pg_dump would receive "lor_mentor\r" as the database name). Surrounding
# quotes are stripped because the template documents quoted values in places.
read_env() {
  local key="$1" val
  val="$(grep -E "^${key}=" "${ENV_FILE}" | head -1 | cut -d= -f2- | tr -d '\r' || true)"
  val="${val%\"}"; val="${val#\"}"
  printf '%s' "$val"
}

POSTGRES_USER="$(read_env POSTGRES_USER)"
POSTGRES_DB="$(read_env POSTGRES_DB)"

# Fail loudly rather than producing a dump named "-<stamp>.sql.gz" or a pg_dump
# invocation with an empty -U.
[ -n "${POSTGRES_USER}" ] || { echo "ERROR: POSTGRES_USER not set in ${ENV_FILE}" >&2; exit 1; }
[ -n "${POSTGRES_DB}" ]   || { echo "ERROR: POSTGRES_DB not set in ${ENV_FILE}" >&2; exit 1; }

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

# The gzip stream must be intact — a truncated dump only fails on restore day.
if ! gzip -t "${OUT}" 2>/dev/null; then
  echo "[$(date -Is)] ERROR: backup is corrupt (gzip integrity check failed), removing" >&2
  rm -f "${OUT}"
  exit 1
fi

find "${BACKUP_DIR}" -name "${POSTGRES_DB}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -Is)] Backup complete ($(du -h "${OUT}" | cut -f1)); pruned >${RETENTION_DAYS}d"
