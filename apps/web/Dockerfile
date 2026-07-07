# syntax=docker/dockerfile:1
# Next.js web image (standalone output). Build context MUST be the monorepo
# root (npm workspaces hoist dependencies to /app).
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t lor-mentor-web .
#
# IMPORTANT: NEXT_PUBLIC_* values are inlined into the client bundle at BUILD
# time, so the public API URL must be passed as a build arg (not just runtime).

# ── Base ────────────────────────────────────────────────────────────
FROM node:24-slim AS base
WORKDIR /app

# ── Dependencies (cached on lockfile) ───────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# ── Build ───────────────────────────────────────────────────────────
FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web ./apps/web
RUN npm run --workspace=apps/web build

# ── Runtime ─────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Standalone bundle (includes the traced node_modules + server.js at
# apps/web/server.js), plus static assets and public files which standalone
# does not copy automatically.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
