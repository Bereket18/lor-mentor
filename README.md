# Lor Mentor

Learning platform for Lorcan Medical College: courses, materials, AI study
tools, payments, and an interactive 3D Anatomy Lab.

> **Status:** release candidate on `main` (`5b08f7c`, 2026-11-11). The code gate
> is green on GitHub Actions and every hardening branch is merged — see
> [docs/deployer/80-GO-NOGO-GATE.md §11](docs/deployer/80-GO-NOGO-GATE.md). It has not been
> deployed yet: the heart system is the published sample; the urinary system is
> an unpublished draft. No anatomy teaching text has been faculty-reviewed, and
> the DBCLS licence question remains open. Open items are in
> [docs/annex/HANDOVER.md §6](docs/annex/HANDOVER.md); the historical working log is in
> [`docs/archive/PROGRESS.md`](docs/archive/PROGRESS.md).

> **Deployment warning — local build:** this checkout's `.next` output was built
> for local testing against `http://localhost:4000`. Do not deploy that build
> or copy `apps/web/.env.local` to a server. Rebuild with the public API origin,
> run the standalone server, and follow
> [`docs/annex/LOCAL-BUILD-NOTICE.md`](docs/annex/LOCAL-BUILD-NOTICE.md).

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 16 (App Router, standalone output), React 19, TypeScript, Tailwind, Three.js / React Three Fiber |
| API | NestJS 11, Prisma 7, PostgreSQL, Redis / BullMQ, Passport JWT |
| AI | Google Gemini (`@google/generative-ai`) |
| Receipt verifier | Python 3.12 / FastAPI + Selenium/Chromium for bank-slip extraction |
| Deploy | Docker Compose behind host Nginx + Let's Encrypt |

## Repository layout

```text
apps/web                  Next.js app, Playwright tests, anatomy assets/validators
apps/api                  NestJS API, Prisma schema/migrations/seeds, Jest tests
services/receipt-verifier Python receipt extractor (FastAPI)
deploy/                   Nginx configs, smoke test, backup script
docs/                     Deployment runbooks, anatomy records and archived history
scripts/                  Environment preflight and operational scripts
```

## Documentation map

Start here, then follow the document for your role.

| Document | Audience | What it covers |
|---|---|---|
| [`docs/deployer/00-START-HERE.md`](docs/deployer/00-START-HERE.md) | Deployment engineer | Map of the deployer pack, reading order, accounts you need |
| [`docs/deployer/10-DEPLOYMENT-GUIDE.md`](docs/deployer/10-DEPLOYMENT-GUIDE.md) | Deployment engineer | End-to-end deployment, top to bottom |
| [`docs/deployer/91-CREDENTIAL-REPLACEMENT.md`](docs/deployer/91-CREDENTIAL-REPLACEMENT.md) | College + engineer | Moving every account and secret from the previous owner to the college |
| [`docs/deployer/60-ENVIRONMENT-VARIABLES.md`](docs/deployer/60-ENVIRONMENT-VARIABLES.md) | Deployment engineer | Every variable: purpose, required/optional, exposure, source |
| [`docs/deployer/30-DATABASE-AND-BACKUPS.md`](docs/deployer/30-DATABASE-AND-BACKUPS.md) | Deployment engineer | Schema, migrations, backup and restore drill |
| [`docs/deployer/70-SECURITY.md`](docs/deployer/70-SECURITY.md) | Everyone | Controls, secret handling, incident response, reporting |
| [`docs/deployer/80-GO-NOGO-GATE.md`](docs/deployer/80-GO-NOGO-GATE.md) | Everyone | Go/no-go checklist with owners |
| [`docs/deployer/92-TROUBLESHOOTING.md`](docs/deployer/92-TROUBLESHOOTING.md) | Deployment engineer | Symptom, cause and fix for the common failures |
| [`docs/annex/HANDOVER.md`](docs/annex/HANDOVER.md) | College owner | Ownership, responsibility matrix, operating model |
| [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) | College owner | Software and content licensing obligations |

The rest of the deployer pack — payments, email, nginx/TLS, integrations,
release checklist, production gates and secret rotation — is listed in
[`docs/deployer/00-START-HERE.md`](docs/deployer/00-START-HERE.md) and indexed in
[`docs/README.md`](docs/README.md).

The full index — the active set plus the historical audit and archive folders —
is [`docs/README.md`](docs/README.md).

## Prerequisites (local development)

- Node.js >= 20 and npm >= 10 (the containers use Node 24)
- PostgreSQL 16+
- Redis 7+
- Optional: Docker + Docker Compose for the production-style stack
- Optional: Python 3.12 for the receipt verifier

## Local setup

```bash
npm ci
npx prisma generate
```

Create local environment files from the templates. **Never commit a filled
`.env` file or paste its values into a ticket or log.**

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Set at minimum in `apps/api/.env`: `DATABASE_URL`, two different long
`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, SMTP settings, and a Gemini key if AI
features are needed. The root `.env` supplies Compose and operational values.
See [`docs/deployer/60-ENVIRONMENT-VARIABLES.md`](docs/deployer/60-ENVIRONMENT-VARIABLES.md) for the full list.

Apply committed migrations to the **local dev database only**:

```bash
cd apps/api && npx prisma migrate deploy
```

Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push`
against production. Production is forward-only (see
[`docs/deployer/30-DATABASE-AND-BACKUPS.md`](docs/deployer/30-DATABASE-AND-BACKUPS.md)).

Seed core data and the heart-only anatomy sample:

```bash
npm run db:seed --workspace=apps/api
npm run db:seed:anatomy --workspace=apps/api -- --reconcile --system heart
```

Always pass `--system heart` in production until urinary completes faculty
review. Running the anatomy seed without `--system` creates every registered
system, including drafts.

Start both apps from the repository root:

```bash
npm run dev          # both
npm run dev:api      # http://127.0.0.1:4000/api/v1
npm run dev:web      # http://localhost:3000
```

The API must run with `apps/api` as its working directory so `ConfigModule`
loads `apps/api/.env`; the root `dev:api` script already does this.

## Checks

```bash
npm run build:api
npm run build:web      # needs NEXT_PUBLIC_API_URL set — see the note below
npm test --workspace=apps/api
npm run test:unit --workspace=apps/web   # web config/unit tests (Playwright)
npm run test:e2e --workspace=apps/api
npm run e2e --workspace=apps/web

# An anatomy or manifest change needs the asset validators
cd apps/web && node scripts/validate-anatomy-model.mjs --system heart

# Environment preflight for a deployment file
npm run check:env -- .env.production --strict

# Documentation links and anchors (not wired into CI)
node scripts/check-doc-links.mjs

# Smoke test against a local stack (no nginx, so the cache check is skipped)
SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh \
  http://127.0.0.1:4000 http://localhost:3000
```

`next build` always runs with `NODE_ENV=production`, so the web build validates
`NEXT_PUBLIC_API_URL` and **fails** on an empty, relative, path-carrying or
loopback value rather than silently falling back to localhost:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com npm run build:web   # deployment shape
NEXT_PUBLIC_API_URL=http://localhost:4000 ALLOW_LOCAL_API_ORIGIN=1 npm run build:web
```

The second form is the local-only escape hatch for smoking a production build
against a local API; never set `ALLOW_LOCAL_API_ORIGIN` in a deployment. See
[docs/deployer/60-ENVIRONMENT-VARIABLES.md](docs/deployer/60-ENVIRONMENT-VARIABLES.md) §3.

The two Playwright auth tests are opt-in and need a seeded super admin:

```bash
E2E_RUN_AUTH=1 E2E_ADMIN_EMAIL=admin@example.test \
E2E_ADMIN_PASSWORD='<temporary password>' npm run e2e --workspace=apps/web
```

## Anatomy Lab safety

- Available to `STUDENT` and `TEACHER` accounts only; the API returns `403` for
  `ADMIN`/`SUPER_ADMIN` and the web app redirects them to `/admin`.
- `isPublished` and `isReviewed` are **content decisions, not test switches**.
- Faculty review uses the operator script (`npm run anatomy:review --workspace=apps/api -- …`).
  `--export` and `--validate` never change teaching text, `isReviewed`, or
  `isPublished`. See [`docs/deployer/10-DEPLOYMENT-GUIDE.md`](docs/deployer/10-DEPLOYMENT-GUIDE.md) §3.4.1.
- Model credit and licence wording live in
  [`apps/web/public/models/anatomy/NOTICE-MODELS.md`](apps/web/public/models/anatomy/NOTICE-MODELS.md).
  Do not shorten or rewrite the licence statements.

## Deployment

Follow [`docs/deployer/80-GO-NOGO-GATE.md`](docs/deployer/80-GO-NOGO-GATE.md), then
[`docs/deployer/00-START-HERE.md`](docs/deployer/00-START-HERE.md). `docker-compose.prod.yml` publishes only the
web and API ports, and only on `127.0.0.1`; Nginx terminates TLS.

## Security and licensing

Report vulnerabilities as described in [`docs/deployer/70-SECURITY.md`](docs/deployer/70-SECURITY.md) — never in a
public issue. Licensing obligations for code, 3D models and teaching text are in
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The project itself currently has **no LICENSE file**; unless the college chooses
one, it is "all rights reserved" by default. See
[`docs/annex/HANDOVER.md`](docs/annex/HANDOVER.md).
