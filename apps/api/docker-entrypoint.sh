#!/bin/sh
# API container entrypoint.
#
# Applies any pending database migrations BEFORE the server accepts traffic,
# then launches Nest. `migrate deploy` is the production-safe command: it only
# runs already-committed migrations and never generates or resets anything.
# It first runs scripts/check-sharp.js: the API re-encodes support attachments
# with sharp, and a broken native binary must stop the container at boot rather
# than leave it "healthy" until the first upload.
set -e

# Fail fast (and loudly) if the native image processor is missing or was built
# for the wrong libc. Without this the container looks healthy until the first
# support attachment is uploaded.
echo "→ Checking image processing (sharp)…"
node scripts/check-sharp.js

echo "→ Applying database migrations (prisma migrate deploy)…"
npx prisma migrate deploy

echo "→ Starting Lor Mentor API…"
exec node dist/src/main
