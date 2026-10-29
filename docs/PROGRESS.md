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
| 2A | Dependency security upgrades (Prisma / API / web) | Not started |
| 2B | Config gaps (wildcard CORS, `check-env.mjs` parity, `API_URL`) | Not started |
| 2C | Docker / nginx review without a daemon; nginx test script | Partly done (CI job + `test-nginx-config.sh` added; conf review pending) |
| 2D | `/anatomy` for ADMIN/SUPER_ADMIN; run existing Playwright specs; checklist | Not started |
| 3 | Faculty review + edit tool | Not started |
| 4 | Build remaining systems (respiratory … body surface) | Not started |
| 5 | Left/right proof, README, final report | Left/right proof done (report-only); README + final report pending |

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
- Dependency upgrades will be done directly on `integration/anatomy-hardening`
  in three commits (Prisma stack; API; web), per Phase 2A.
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

Phase 2A (dependency upgrades), starting with the `npm view`/publish-date check
for every target version, then the Prisma stack commit and its gates.
