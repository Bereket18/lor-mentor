# syntax=docker/dockerfile:1
# NestJS API image. Build context MUST be the monorepo root (see
# docker-compose.prod.yml) because npm workspaces hoist dependencies to /app.
#
#   docker build -f apps/api/Dockerfile -t lor-mentor-api .
#
# Note: the runtime image keeps the full dependency tree on purpose — the
# Prisma CLI + dotenv (devDependencies) are needed at container start to run
# `prisma migrate deploy`. Pruning them would break startup migrations.

# ── Base ────────────────────────────────────────────────────────────
# Pinned by digest for reproducible builds. The digest is a multi-arch index,
# so the same tag works on x86_64 and arm64 VPS hosts. Update deliberately:
#   docker buildx imagetools inspect node:24-slim
#
# The base is Debian (glibc), which is what the prebuilt sharp binary expects
# (@img/sharp-linux-x64 / @img/sharp-linux-arm64). If this image is ever moved
# to Alpine, two things must change together: install libc6-compat, and make
# sure the musl binaries (@img/sharp-linuxmusl-*) are the ones npm selects.
# `scripts/check-sharp.js` (run by docker-entrypoint.sh) fails the container
# with a clear message when the wrong flavour is installed, so a bad base swap
# cannot reach production silently.
FROM node:24-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS base
WORKDIR /app
# sharp ships libvips inside its prebuilt package. Pin the prebuilt path so a
# stray system libvips on the build host can never be picked up instead.
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
# OpenSSL is required by Prisma's query engine at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# ── Dependencies (cached on lockfile) ───────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# --include=optional is npm's default, stated explicitly because sharp's
# native binary is an optionalDependency per platform: an inherited
# omit=optional setting would produce an image that starts but cannot process
# a single attachment.
RUN npm ci --include=optional
# Fail the build (not the first upload) if the native binary is wrong for this
# image, e.g. a lockfile install that silently skipped optional packages.
RUN node -e "const s=require('sharp'); console.log('sharp', s.versions.sharp, 'libvips', s.versions.vips)"

# ── Build ───────────────────────────────────────────────────────────
FROM deps AS build
COPY apps/api ./apps/api
# Generate the Prisma client (→ /app/node_modules/.prisma/client) then compile
# Nest → apps/api/dist/src/main.js
RUN cd apps/api \
    && npx prisma generate \
    && npm run build

# ── Runtime ─────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
# Startup self-check for the image pipeline (sharp). Plain JS so it runs before
# the compiled app, and on every boot (a volume mount cannot hide it).
COPY apps/api/scripts ./apps/api/scripts
RUN chmod +x ./apps/api/docker-entrypoint.sh \
    # uploads/ holds bank receipts + generated PDF receipts and, under
    # uploads/support, support-ticket attachments; mounted as volumes in
    # compose. Create it and hand ownership to the node user.
    && mkdir -p /app/apps/api/uploads/support \
    && chown -R node:node /app/apps/api/uploads

WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Entrypoint applies pending DB migrations, then starts the server.
ENTRYPOINT ["./docker-entrypoint.sh"]
