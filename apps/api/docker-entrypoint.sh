#!/bin/sh
# API container entrypoint.
#
# Applies any pending database migrations BEFORE the server accepts traffic,
# then launches Nest. `migrate deploy` is the production-safe command: it only
# runs already-committed migrations and never generates or resets anything.
set -e

echo "→ Applying database migrations (prisma migrate deploy)…"
npx prisma migrate deploy

echo "→ Starting Lor Mentor API…"
exec node dist/src/main
