# Lor Mentor

Learning platform for Lorcan Medical College: courses, materials, AI study
tools, payments, and an interactive 3D Anatomy Lab.

> **Status:** release-hardening branch, not a production release. The heart
> system is the published sample. The urinary system is an unpublished draft.
> No anatomy teaching text has been faculty-reviewed, and the DBCLS licence
> question remains open. See [`docs/PROGRESS.md`](docs/PROGRESS.md) for the
> current gate results and open blockers.

## Stack

- **Web:** Next.js 16.4.3, React 19, TypeScript, Tailwind CSS, Three.js +
  React Three Fiber
- **API:** NestJS 11, Prisma 7.10.1, PostgreSQL, Redis/BullMQ, Passport JWT
- **AI:** Google Gemini
- **Receipt verifier:** Python/FastAPI service with Chromium for bank-slip
  extraction
- **Deploy:** Docker Compose behind host Nginx (see
  [`docs/deploy/RELEASE-CHECKLIST.md`](docs/deploy/RELEASE-CHECKLIST.md))

## Repository layout

```text
apps/web                 Next.js app, Playwright tests, anatomy assets/validators
apps/api                 NestJS API, Prisma schema/migrations/seeds, Jest tests
services/receipt-verifier Python receipt extractor and tests
deploy/                  Nginx, smoke test, backup helpers
docs/                    Deployment, anatomy provenance, progress, release notes
scripts/                 Environment preflight and operational scripts
```

## Prerequisites

- Node.js >= 20 and npm >= 10
- PostgreSQL (the local stack uses PostgreSQL 18)
- Redis
- Optional: Docker + Docker Compose for the production-style stack
- Optional: Python 3.12 for the receipt verifier

## Local setup

```bash
npm ci
npx prisma generate
```

Create local environment files from the examples. **Never commit a filled
`.env` file or paste its values into a ticket or log.**

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Set at minimum in `apps/api/.env`: `DATABASE_URL`, distinct long
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, SMTP settings, and a Gemini key if AI
features are needed. The root `.env` supplies Compose/operational values.

Apply the committed migrations to the **local dev database only**:

```bash
cd apps/api
npx prisma migrate deploy
```

Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push`
against production. Production uses forward-only migrations and a backup.

Seed core data and the heart-only anatomy sample:

```bash
npm run db:seed --workspace=apps/api
npm run db:seed:anatomy --workspace=apps/api -- --reconcile --system heart
```

Always pass `--system heart` in production until urinary has completed faculty
review. Running the anatomy seed without `--system` creates every registered
system, including drafts.

Start both apps from the repository root:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:api   # http://127.0.0.1:4000/api/v1
npm run dev:web   # http://localhost:3000
```

The API must run with `apps/api` as its working directory so `ConfigModule`
loads `apps/api/.env`. The root `dev:api` script already does this.

## Checks

```bash
npm run build:api
npm run build:web
npm test --workspace=apps/api
npm run test:e2e --workspace=apps/api
npm run e2e --workspace=apps/web
```

The two Playwright auth tests are opt-in and need a seeded super admin:

```bash
E2E_RUN_AUTH=1 \
E2E_ADMIN_EMAIL=admin@example.test \
E2E_ADMIN_PASSWORD='<temporary password>' \
npm run e2e --workspace=apps/web
```

Anatomy validators (run after any asset or manifest change):

```bash
cd apps/web
node scripts/validate-anatomy-model.mjs --system heart
node scripts/validate-anatomy-model.mjs --system urinary
```

Environment preflight for a deployment file:

```bash
npm run check:env -- .env.production --strict
```

Smoke test against a local stack (no nginx, so the immutable-cache check is
skipped):

```bash
SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh \
  http://127.0.0.1:4000 http://localhost:3000
```

Production HTTPS expects 20 passing checks; the local command reports 18 with
`FAIL: 0`.

## Anatomy Lab safety

- The Anatomy Lab is available to `STUDENT` and `TEACHER` accounts only. The API
  returns `403` for `ADMIN`/`SUPER_ADMIN`; the web app redirects them to
  `/admin`.
- `isPublished` and `isReviewed` are content decisions, not test switches. The
  hardening work did not publish a system or mark teaching text reviewed.
- Faculty review uses the existing operator script:

  ```bash
  # Read-only packet (JSON for validation, Markdown for reading)
  npm run anatomy:review --workspace=apps/api -- \
    --system urinary --export urinary-review.json

  # After the reviewer fills in reviewer/date/decisions
  npm run anatomy:review --workspace=apps/api -- \
    --system urinary --validate urinary-review.json

  # Separate sign-off, only after approval
  npm run anatomy:review --workspace=apps/api -- \
    --system urinary --reviewer "Dr Example" --date 2026-10-28 --confirm
  ```

  `--export` and `--validate` never change teaching text, `isReviewed`, or
  `isPublished`. See [`docs/deploy/GO-LIVE.md`](docs/deploy/GO-LIVE.md) §3.4.1.
- Model credit and licence wording live in
  [`apps/web/public/models/anatomy/NOTICE-MODELS.md`](apps/web/public/models/anatomy/NOTICE-MODELS.md)
  and the public attribution pages. Do not shorten or rewrite the licence
  statements.

## Deployment

Use [`docs/deploy/RELEASE-CHECKLIST.md`](docs/deploy/RELEASE-CHECKLIST.md) in
order. It covers backups, migrations, seed scope, Nginx/TLS, smoke tests,
rollback, and owner-only gates. `docker-compose.prod.yml` publishes only the web
and API ports on `127.0.0.1`; Nginx terminates TLS.

## Licence and security

Project licence and security-contact files are still pending real owner values.
Third-party model and text notices are in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Report security issues
privately once the contact in `SECURITY.md` is filled in.
