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
FROM node:24-slim AS base
WORKDIR /app
# OpenSSL is required by Prisma's query engine at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# ── Dependencies (cached on lockfile) ───────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

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
RUN chmod +x ./apps/api/docker-entrypoint.sh \
    # uploads/ holds bank receipts + generated PDF receipts; mounted as a
    # volume in compose. Create it and hand ownership to the node user.
    && mkdir -p /app/apps/api/uploads \
    && chown -R node:node /app/apps/api/uploads

WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Entrypoint applies pending DB migrations, then starts the server.
ENTRYPOINT ["./docker-entrypoint.sh"]
