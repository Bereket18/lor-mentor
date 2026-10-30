# LOR Mentor — anatomy lab & release hardening

**Branch:** `integration/anatomy-hardening` (local only; nothing pushed)
**Started:** 2026-10-29
**Rule reminders for every phase:** local only; no push/rebase/reset/force, no
branch creation; never read or print a `.env` or secret; no
`prisma migrate dev/reset` or `db push`; never `npm audit fix` or `--force`;
never publish a system (`isPublished` stays `false`); never set `isReviewed`
true; never change licence wording; never write or edit teaching text; the
three untracked `docs/audit/*.md` files stay untracked; temporary test users use
random unprinted passwords and are deleted with a 401 check.

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Merge `main`; GitLab CI + templates, notice, changelog; secret scan | **Done** |
| 2A | Dependency security upgrades (Prisma / API / web) | **Done** |
| 2B | Config gaps (wildcard CORS, `check-env.mjs` parity, `API_URL`) | **Done** |
| 2C | Docker / nginx review without a daemon; nginx test script | **Done** (static review; image builds and `nginx -t` NOT RUN) |
| 2D | `/anatomy` for ADMIN/SUPER_ADMIN; run existing Playwright specs; checklist | **Done** |
| 3 | Faculty review + edit tool | **Done** (packet export/validation + existing sign-off) |
| 4 | Build remaining systems (respiratory … body surface) | **Blocked** — no licensed source assets/mappings/text for any system beyond heart and urinary |
| 5 | Left/right proof, README, final report | Left/right proof done; README + final report pending |

## Phase 1 — merge + GitLab files

Done:

- `git merge main` (`3a8383c`) → merge commit `a69ac49`, **no conflicts**.
- Full API suite after the merge: `Test Suites: 25 passed`, `Tests: 282 passed,
  282 total`. (First run flaked one test — `config/trust-proxy.spec.ts` hit the
  5000 ms rate-limiter timeout under parallel load; it passed in isolation and
  on the immediate rerun. Environment/parallelism flake, not a regression.)
- Web build: `npm run build:web` → exit 0, 39/39 pages generated.
- `.gitlab-ci.yml` added: install + cache, API build, API unit tests (with
  `postgres:16-alpine` and `redis:7-alpine` services and a `prisma migrate
  deploy` step), API e2e, both anatomy validators, web lint (report-only), web
  build, verifier tests, `npm audit` (report-only), docker build jobs for api /
  web / verifier (`docker:dind`, build only), `compose-config`, `nginx-syntax`,
  and a report-only `trivy` job. Includes `Jobs/SAST.gitlab-ci.yml` and
  `Jobs/Secret-Detection.gitlab-ci.yml`. Runs on merge requests and the default
  branch only. No deploy jobs, no secrets. YAML parses (checked with `js-yaml`).
- `deploy/nginx/test-nginx-config.sh` added (temp copy, `example.test`
  substitution, throwaway self-signed certs, minimal wrapper, `nginx -t -c`).
  `bash -n` passes and it exits 0 with a notice when nginx is absent.
- `apps/web/public/models/anatomy/NOTICE-MODELS.md` added: exact credit line and
  the exact "Licence status" paragraph copied from the attribution pages, the
  two licence statements, the licence URL, and the adaptations list.
- `CHANGELOG.md` (v0.1.0, summarised from `git log` only; no tags).
- `.gitlab/merge_request_templates/Default.md`, `.gitlab/issue_templates/bug.md`,
  `.gitlab/issue_templates/content-correction.md`.
- `.gitattributes`: added `*.sh text eol=lf` so Windows checkouts cannot rewrite
  the shell scripts to CRLF.
- Updated the stale comment in `.github/workflows/ci.yml` that claimed no
  `.gitlab-ci.yml` existed.
- Secret-shaped-pattern scan: `git grep` for AWS keys, PEM private keys, Google
  API keys, Stripe live keys, Slack tokens, GitHub tokens and JWTs → **no
  matches**. Generic `key/secret/password/token = "<20+ chars>"` → **1 match**,
  `docs/test-report.md` (line 97): a 32-char hex token captured in an old QA
  report body. Not a JWT and not a production credential; left untouched,
  reported as a low-severity finding.

Skipped (pending real values):

- `LICENSE.md` — the copyright holder is still the placeholder
  `[YOUR LEGAL NAME OR COMPANY]`.
- `SECURITY.md` — the security contact is still the placeholder
  `[YOUR SECURITY EMAIL]`.

Not run in Phase 1:

- `.gitlab-ci.yml` was not executed (no GitLab runner here). Only YAML parsing
  and the `nginx-syntax` helper's local behaviour were checked.
- `nginx -t` — nginx is not installed on this machine (NOT RUN).

Commits: `6a228cb` (ci), `9154863` (gitattributes), `0f862b3` (docs).

## Phase 2A — dependency security upgrades

Target versions were verified with `npm view` before installing. Five requested
targets were under seven days old at check time, so the newest older fixed
version was used instead:

| Package | Requested | Used | Reason |
| --- | --- | --- | --- |
| `next` | 16.4.3 | **16.4.3** | Initially chose 16.4.2 while 16.4.3 was 6.3 days old. A duplicate root/web Next copy broke type-check; by the time both copies were aligned, 16.4.3 had crossed seven days. Single copy now installed. |
| `axios` | 1.21.0 | **1.20.0** | 1.21.0 was 2.5 days old; 1.20.0 is older and outside the advisory range. |
| `postcss` | 8.5.32 | **8.5.31** | 8.5.32 was 3.0 days old; 8.5.31 is older and outside the advisory range. |
| `@nestjs/platform-express` | 11.2.8 | **11.2.7** | 11.2.8 was 6.3 days old; 11.2.7 was already installed and audit-clean. |
| `nodemailer` | 10.3.0 | **10.2.0** | 10.3.0 was 0.6 days old; 10.2.0 is older and outside the advisory range. |

Other versions: `zod@4.6.7`, `sharp@0.35.5`, `nanoid@3.3.20`,
`multer@2.5.0`, `body-parser@2.4.0`, `proxy-addr@2.0.8`, and the Prisma stack
at `7.10.1`. Root overrides now cover `multer`, `body-parser`, `proxy-addr`,
`sharp`, and `nanoid`.

**Process deviation to report:** the allowed `chore/dependency-security-upgrade`
branch was not created before the Prisma and API upgrades. Those two commits
(`5a4d333`, `697ac23`) landed directly on `integration/anatomy-hardening`.
The web upgrade was done on `chore/dependency-security-upgrade`, created from
integration HEAD, and merged back with `--no-ff` after its gates passed. No
history was rewritten.

Gates run on the final tree:

- `npm ci`: exit 0, 1771 packages. This npm skipped Prisma/bcrypt postinstall
  scripts, so `npx prisma generate` was run explicitly; `bcrypt` loads normally.
- `npx prisma validate`, `npx prisma generate`, `npx prisma migrate status`:
  pass; schema valid, 16 migrations, database up to date.
- `npm run build:api`: pass.
- `npm test --workspace=apps/api`: 25 suites, **282/282 tests** pass. The known
  `config/trust-proxy.spec.ts` 5000 ms flake appeared once under parallel load,
  passed 9/9 in isolation, and the full rerun passed.
- `npm run test:e2e --workspace=apps/api`: 1 suite, **3/3** pass.
- `npm run build:web`: pass with Next 16.4.3; all routes generated and Proxy
  (Middleware) present.
- Heart validator: 17 mesh + 9 text-only, 102,568 triangles, 1.91 MB.
  Urinary validator: 10 mesh + 5 text-only, 20,364 triangles, 0.44 MB.
- Anatomy reconcile against the local DB: heart 26 rows, urinary 15 rows;
  protected-text SHA-256 unchanged (`f7373f05…384b`, `caf4e073…257b6`);
  flags unchanged (heart published/sample, urinary draft).
- Nested `$transaction`: inner rollback handled, outer transaction continues,
  counts 2/2.
- Smoke (`SMOKE_STRICT_CACHE=0`): **PASS: 18 FAIL: 0**.
- Targeted middleware checks: malformed JSON → 400; oversized JSON → **413**
  after a narrow fix to `AllExceptionsFilter` (body-parser raises a plain Error,
  which previously became a generic 500). `trust-proxy.spec.ts` covers forwarded
  client rate-limit keys and spoofed-header rejection.
- Nodemailer 10 `jsonTransport` test: message built successfully; no real email
  sent.
- Playwright as temporary STUDENT and TEACHER: login, `/anatomy`, `/anatomy/heart`
  with real `heart.v2.glb` (200, `model/gltf-binary`), visible canvas, no model
  error, reload stays authenticated. Forcing access-cookie expiry produced a
  200 `/auth/refresh` and a retried 200 `/anatomy/systems`. STUDENT saw no draft
  urinary system; TEACHER did. Both temp users deleted, both logins → 401.
- Web lint: 5 pre-existing `react-hooks/set-state-in-effect` errors in untouched
  files (`(app)/layout.tsx`, `admin-login`, `login`, `register`, `topbar`);
  no changed source file is implicated. CI lint is report-only.
- `npm audit signatures`: 1769 verified, 522 attestations.
- Per-workspace `npm audit --omit=dev` after the upgrade: API **4** (1 moderate,
  3 high) and web **9** (1 critical, 6 high, 2 moderate), all transitive
  build/optional chains. Direct advisories for `next`, `axios`, `zod`, `multer`,
  `nodemailer`, `body-parser`, `proxy-addr`, `sharp`, `nanoid`, `postcss`,
  Prisma, and Nest are cleared. The remaining `tar` critical is the optional,
  uninstalled `canvas → @mapbox/node-pre-gyp` lockfile path already accepted in
  `docs/audit/DEPENDENCY-UPGRADE-TRIAGE.md`; the remaining high/moderate entries
  are build-chain packages.
- `npm dedupe` timed out after 15 minutes without changing the tree; the
  single-Next alignment was achieved with a clean `npm install` instead.

Commits: `5a4d333` (Prisma), `697ac23` (API), web upgrade + 413 filter fix on
`chore/dependency-security-upgrade` (merged back with `--no-ff`).

## Phase 2B — environment validation parity

Done:

- `env.validation.ts` rejects any `CORS_ORIGIN` containing `*`, including `*`,
  `https://*.example.com`, and wildcard entries in a comma-separated list.
  Credentialed CORS must always be an explicit allowlist.
- `scripts/check-env.mjs` now mirrors the API checks:
  - rejects wildcard CORS origins;
  - validates optional `TRUST_PROXY` as a non-negative integer;
  - validates optional `COOKIE_DOMAIN` as a bare hostname;
  - requires `NEXT_PUBLIC_API_URL` (the web build arg) and rejects localhost
    values under `--strict`;
  - makes `RECEIPT_VERIFIER_TOKEN` conditional on `RECEIPT_VERIFIER_URL`
    instead of always required;
  - validates `RECEIPT_VERIFIER_TIMEOUT_MS` and
    `COMPANY_BANK_ACCOUNTS` the same way as the API.
- `.env.production.example`, `apps/api/.env.example`, and
  `docs/deploy/RELEASE-CHECKLIST.md` now state that wildcards are rejected.
- Tests: `config/env.validation.spec.ts` **33/33** pass, including four
  wildcard variants and a valid comma-separated allowlist. Full API suite:
  **25 suites, 287/287 tests**. `npm run build:api` passes.
- Preflight fixtures: valid strict config passes; wildcard CORS, bad
  `TRUST_PROXY`, bad `COOKIE_DOMAIN`, missing verifier token, out-of-range
  verifier timeout, and localhost `NEXT_PUBLIC_API_URL` all fail with the
  expected message. A disabled verifier with a blank token passes.

## Phase 2C — Docker and nginx review

Static review only; the Docker daemon on this machine cannot start, so no image
was built and no container was run. Findings:

- `apps/api/Dockerfile` builds from the monorepo root, installs the full
  workspace tree, builds Nest, and intentionally keeps devDependencies in the
  runtime image because the entrypoint runs `npx prisma migrate deploy` before
  starting the API. The entrypoint uses `set -e`, so a failed migration stops
  startup. OpenSSL is installed for Prisma.
- `apps/web/Dockerfile` builds Next standalone output and requires
  `NEXT_PUBLIC_API_URL` as a **build** arg; changing it only at runtime would
  not change the inlined client bundle.
- `services/receipt-verifier/Dockerfile` installs Chromium and chromedriver for
  the BOA extractor and runs one uvicorn worker.
- `docker-compose.prod.yml` publishes only web/api, and only on `127.0.0.1`.
  Postgres and Redis stay on the internal network. API startup waits for
  healthy Postgres, Redis, and verifier; uploads use a named volume.
- `.dockerignore` excludes `.env*` (except the examples), `node_modules`,
  build output, uploads, VCS metadata, and docs.
- **Fixed:** both nginx configs capped request bodies at `12m`, below the API's
  `25 MB` materials upload limit. The web and API locations in production and
  staging now use `30m`, leaving room for multipart framing while Multer still
  enforces 25 MB (materials) and 10 MB (receipts).
- `bash -n deploy/nginx/test-nginx-config.sh` passes. The helper prints a notice
  and exits 0 when nginx is absent, as it is here.
- `docker compose -f docker-compose.prod.yml --env-file .env.production.example
  config --no-env-resolution --quiet` exits 0. Plain `config` fails only because
  the real `.env.production` is intentionally absent; it was not created or read.

NOT RUN in this phase:

- `docker version` reaches the client but fails to connect to
  `npipe:////./pipe/dockerDesktopLinuxEngine`; the Docker daemon is unavailable.
  Consequently `docker build`, `docker compose up`, container health checks, and
  `nginx -t` inside the official image were **not run**.
- nginx is not installed locally, so local `nginx -t` was **not run**.

## Phase 2D — admin anatomy gate, Playwright, checklist

API role check with temporary, verified ADMIN and SUPER_ADMIN accounts (random
passwords never printed):

| Role | login | list systems | heart detail | explain | quiz |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ADMIN` | 200 | **403** | **403** | **403** | **403** |
| `SUPER_ADMIN` | 200 | **403** | **403** | **403** | **403** |

Both temporary users were deleted and both logins returned **401** afterwards.
The class-level `@Roles('STUDENT', 'TEACHER')` guard on `AnatomyController`
covers all four routes, including the AI endpoints, so no paid Gemini call is
made for an admin request.

Web alignment:

- `apps/web/src/lib/route-access.ts` previously let ADMIN/SUPER_ADMIN through
  the client `/anatomy` gate while the API rejected every data request. It now
  allows only STUDENT/TEACHER and sends admins to `/admin`.
- `apps/web/e2e/auth.spec.ts` gained an opt-in regression test: a super admin
  who visits `/anatomy` must land on `/admin`. The existing sign-in test was
  refactored to share the login helper.
- Targeted ESLint on the changed web files: exit 0. `npm run build:web`: pass.

Playwright:

- Default suite: **17 tests, 15 passed, 2 skipped** (the two auth tests are
  opt-in because they need a seeded super admin). Exit 0.
- With a temporary super admin: both auth tests pass, including the new
  `/anatomy` → `/admin` redirect. Temp user deleted; login → **401**.
- One earlier opt-in run hit the API's 5/minute login throttle because several
  temporary-account runs happened back-to-back. After the 60-second window
  cleared, the run passed 2/2; this is the intended brute-force protection, not
  a product failure.

`docs/deploy/RELEASE-CHECKLIST.md` now records the admin anatomy check, the
Playwright result, and the pre-existing web-lint caveat.

## Phase 3 — faculty review packet and sign-off

The existing `apps/api/prisma/review-anatomy.ts` sign-off script was extended
instead of adding a second workflow:

- `--export <file>` writes a read-only faculty packet. `.json` produces a
  machine-readable packet with one blank decision per structure; any other
  extension produces a Markdown packet for reading. Each structure records a
  SHA-256 over its current teaching text.
- `--validate <file>` checks that the packet matches the current system, every
  structure has an allowed decision (`approved`, `approved-with-edits`, or
  `rejected`), rejected rows have comments, a reviewer and date are present, and
  the teaching-text hashes still match. A stale packet is rejected.
- `--export` and `--validate` are read-only. They refuse to run with `--confirm`
  or `--revoke`, and never change teaching text, `isReviewed`, or `isPublished`.
- The existing `--confirm` sign-off and `--revoke` paths are unchanged. No
  sign-off was applied.

Verification against the local dev database:

- Heart JSON export: 26 structures, 26 decisions, 0 reviewed, 35,428 bytes.
  Markdown export: 29,686 bytes. System remains `isPublished=true`,
  `isSample=true`.
- Incomplete packet: rejected with missing reviewer/date/decisions.
- Filled packet (temporary test values, not written to the DB): **validation
  passed** for 26 structures.
- `--export --confirm`: rejected as intended.
- Database after the checks: heart 26 structures published/sample, urinary 15
  structures draft, **0 reviewed rows**. No teaching text was edited.
- `npx tsc --noEmit -p tsconfig.json`: pass. `npm run build:api`: pass.

Docs updated: `docs/deploy/GO-LIVE.md` §3.4.1,
`docs/deploy/RELEASE-CHECKLIST.md` §5, and
`docs/anatomy/provenance/README.md` §10.

## Phase 4 — remaining anatomy systems (blocked)

No system beyond heart and urinary can be built safely from this repository:

- `ANATOMY_SEED_REGISTRY` contains only `heart` and `urinary`.
- The repository contains no source archives, source maps, GLB candidates,
  manifests, or faculty-approved text for respiratory, nervous, alimentary,
  musculoskeletal, cardiovascular vessels, endocrine, deep fascial, genital, or
  integumentary releases.
- The whole-body plan requires mapping approval, text/licence approval, a
  versioned build, validation, contract coverage, faculty review, and release
  approval for each system. Those inputs are not present, and inventing anatomy
  text or mesh data is explicitly out of scope.
- Existing validators and contract tests still cover the two registered systems
  and pass. No placeholder systems were added.

This is a blocking dependency, not a test failure. The next safe step is the
respiratory mapping proposal described in `docs/anatomy/whole-body-plan.md`,
followed by text/licence review and a candidate build. Do not seed or publish a
system until those gates are recorded.

## Phase 5 detail — left/right on-screen check (report-only, done)

- GLB centroids confirm patient-left = +X for every pair: heart
  ventricles/atria; urinary kidney/ureter/renal artery/vein. `left_*` centroids
  are always more +X than `right_*`, so the ordering is correct and there is
  **no swap**.
- The viewer camera sits at `[0, 0, 7]` looking toward the origin, i.e. a front
  view. With +X on the viewer's right, LEFT structures render on the viewer's
  right, which is correct for a front view. The urinary manifest states the same
  (`camera looks from +Z toward the origin; patient left is +X`).
- A live Playwright pass as temporary STUDENT and TEACHER opened `/anatomy`,
  `/anatomy/heart` and `/anatomy/urinary` with the real GLB. Note: the viewer
  auto-focuses the selected mesh (the camera pans to the structure centre), so
  post-selection screenshots cannot show the default-view side; the screenshot
  teal centroid is also polluted by the scene point light. The authoritative
  check is the GLB centroid analysis above.

## Decisions

- `LICENSE.md` and `SECURITY.md` are skipped until the user supplies a real
  copyright holder and security email.
- Dependency upgrades were split into three commits (Prisma stack; API; web).
  The Prisma and API commits landed directly on
  `integration/anatomy-hardening` before the dedicated branch was created — a
  process deviation recorded above. The web commit was merged back with
  `--no-ff`.
- The API server must be started from `apps/api` (`node dist/src/main.js`) so
  `ConfigModule` loads `apps/api/.env`; starting it from the repo root loads the
  root `.env` and hits an empty database (login → 500).

## Local environment notes

- API `http://127.0.0.1:4000` (run from `apps/api`), web `http://localhost:3000`.
- Redis native service reports `MISCONF` (BullMQ errors) but the app serves the
  smoke suite; Postgres `postgresql-x64-18` on 5432, database `lor_mentor`, 16
  migrations, schema up to date.
- Smoke: `SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000`
  → `PASS: 18 FAIL: 0` locally. Production HTTPS strict mode expects 20.

## Next up

Phase 5 README and final report. Phase 4 remains blocked on licensed assets,
source maps, and faculty-approved text for systems beyond heart and urinary.
