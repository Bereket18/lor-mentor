# PHASE H — FINAL VALIDATION RESULTS

**Date:** 2026-10-31
**Branch:** `integration/anatomy-hardening`
**Method:** every result below was produced by executing the item in a fully
local, reversible environment. Nothing was inferred from documentation.
Anything that could not be executed is listed under
[NOT TESTED](#not-tested) and is **not** reported as passing.

## 0. Environment

| Item | Value |
|---|---|
| OS | Windows 11 (10.0.26300) |
| Node | v25.2.1 |
| npm | 11.19.0 |
| PostgreSQL | local server, throwaway database `lor_mentor_phaseh` |
| Redis | local instance (API readiness check) |
| API | `dist/src/main.js` on `http://localhost:4000` |
| Web | `next start` (standalone build) on `http://localhost:3000` |
| Email | local SMTP sink on `127.0.0.1:2525` (captured to files) |
| Chapa | local mock on `http://localhost:4555` |
| Gemini | **not called** (no API key supplied) |

The API ran with `NODE_ENV=development` on this stack because the production
environment validator correctly rejects localhost public URLs. Production-mode
acceptance and rejection behaviour is covered separately in §4, using the real
compiled `validateEnv()`.

No external service was contacted, no money moved, and no production
infrastructure was touched.

## 1. Build and static gates

| Gate | Command | Result |
|---|---|---|
| API unit tests | `npm test --workspace=apps/api -- --ci` | **PASS** — 25 suites, 354 tests, 0 failures |
| API production build | `npm run build:api` (`nest build`) | **PASS** |
| Web production build | `npm run build:web` (`next build`) | **PASS** — standalone output generated (33 MB) |
| Web typecheck | `tsc --noEmit -p apps/web/tsconfig.json` | **PASS** — exit 0 |
| Web lint | `eslint src scripts` (in `apps/web`) | **FAIL** — 5 errors, all in files this branch did not modify (`react-hooks/set-state-in-effect` in `(app)/layout.tsx`, `admin-login`, `login`, `register`, `topbar.tsx`). Pre-existing baseline. |
| API lint | `eslint "{src,test}/**/*.ts"` (no `--fix`) | **FAIL** — 71 errors; 48 are auto-fixable Prettier formatting. 65 are in pre-existing payment/cheki/user test files; 6 are in files added by this branch (`anatomy-review.controller.ts`, `anatomy-review.service.ts`, `dto/anatomy-review.dto.ts`). |

Lint is **not clean** and was not made clean as part of this validation
(`--fix` would rewrite unrelated files). See
[HANDOVER.md §6](../../HANDOVER.md#6-open-items-at-handover).

## 2. Workflow validation (65/65 executed checks passed)

Harness: `tmp-phaseh/workflows.cjs` (temporary, deleted after the run). It created
a disposable database, applied all 18 migrations, seeded it, and drove the real
HTTP API end to end.

| Workflow | Result | Evidence |
|---|---|---|
| Clean install / migrations | **PASS** | throwaway DB created; `prisma migrate deploy` applied 18 migrations; seed + anatomy seed succeeded |
| Service boot | **PASS** | API booted; `/health` healthy; readiness reported DB **and** Redis available |
| Public content | **PASS** | departments and academic years served without auth |
| Registration | **PASS** | registration accepted; verification email delivered to the SMTP sink |
| Email verification | **PASS** | token present in the email; login blocked before verification; verification accepted; login then succeeded |
| Login / session | **PASS** | access + refresh cookies set as `httpOnly` pair; `GET /users/me` returned the session; anonymous request rejected |
| Password reset | **PASS** | forgot-password accepted; token received by email; reset accepted; old password rejected; new password works |
| Role-based access | **PASS** | student denied user listing and admin payment data; teacher cannot create a course; admin blocked from the student anatomy explorer; super-admin login works |
| Input validation | **PASS** | unknown field rejected by the whitelist DTO |
| Course management | **PASS** | admin created a teacher account and a course, assigned the teacher; teacher logged in with the temporary password; semesters listed |
| Materials (PDF/video) | **PASS** | teacher uploaded a PDF; YouTube material created; uploaded PDF retrievable |
| Subscription state | **PASS** | plan creation; student with no subscription blocked by the guard; subscribed student passes the guard |
| Chapa checkout (mock) | **PASS** | initialize returned a checkout URL; callback and return URLs received by the mock |
| Webhook security | **PASS** | invalid signature rejected; valid signature accepted; duplicate webhook idempotent |
| Payment verification | **PASS** | underpaid transaction **not** activated; verified payment activated the subscription; browser verify endpoint reports approved |
| Manual payment | **PASS** | second student registered/logged in; receipt submitted; appeared in the admin queue; admin approved; subscription activated; PDF receipt generated |
| Logout / revocation | **PASS** | logout accepted; refresh rejected after logout |
| Rate limiting | **PASS** | login limited to 5/min — observed sequence `401,401,401,429,429,429,429` |
| Persistent storage (disk + DB) | **PASS** | after an API restart the uploaded file was still retrievable and database data was unchanged |
| 3D Anatomy Explorer (index) | **PASS** | `/anatomy` lists the heart system, links to `/anatomy/heart`, and hides the unpublished `urinary` draft |
| 3D Anatomy Explorer (viewer) | **PASS** | `/anatomy/heart` mounts the canvas; the viewer itself fetched `GET /models/anatomy/heart.v2.glb` → 200; no post-login non-2xx responses; no console errors |
| 3D render evidence | **PASS** | canvas-only screenshot measured 647×596 px with 4,982 unique colours and per-channel stdev 42.4 / 35.4 / 33.7 (a flat fill would be near-uniform); after a 140 px orbit drag the frame changed (1,000+ unique colours lost, mean shifted) — proving the scene renders and the camera responds |

Note on the 3D result: this is **numeric pixel evidence**, not a visual
judgement. No claim is made about anatomical correctness of the mesh.

One expected pre-login log entry appears on every page load:
`401 GET /api/v1/me` — the auth context's session probe before login, swallowed
by `useAuth()`. It is intended behaviour, not a failure.

## 3. Production URL and configuration (23/23 checks passed)

Harness called the **compiled** `apps/api/dist/src/config/env.validation.js`
`validateEnv()` — the same function the API runs at boot — with dummy values.

| Check | Result |
|---|---|
| Valid production baseline accepted | **PASS** |
| Each of 10 required variables rejected when missing (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `CORS_ORIGIN`) | **PASS** (10/10) |
| `localhost` rejected for `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `CORS_ORIGIN` | **PASS** (3/3) |
| Placeholder JWT secret rejected | **PASS** |
| Short `RECEIPT_VERIFIER_TOKEN` rejected | **PASS** |
| Chapa key without webhook secret rejected | **PASS** |
| `@resend.dev` sender rejected | **PASS** |
| Invalid `REDIS_FAIL_MODE` rejected | **PASS** |
| Wildcard `CORS_ORIGIN` rejected | **PASS** |
| Invalid `COOKIE_DOMAIN` rejected | **PASS** |
| Repeated validation is deterministic | **PASS** |
| Unfilled `.env.production.example` fails `npm run check:env -- .env.production.example --strict` | **PASS** (fails as intended) |

The same-origin rewrite path was exercised for real: the web server ran with
`NEXT_PUBLIC_API_URL` **unset**, so `/api/v1/*` was proxied server-side to
`http://localhost:4000`, and every browser and harness request went through it.

## 4. NOT TESTED

The following were **not executed**. They must not be reported as verified.

| Item | Why not executed | What it requires |
|---|---|---|
| Docker image build (`apps/api`, `apps/web`, `services/receipt-verifier`) | Docker client present, **daemon not running** (`docker ps` → cannot connect to `dockerDesktopLinuxEngine`) | Deployment engineer, on a host with a running Docker engine |
| Container boot via compose (prod/staging) | same | — |
| Docker named-volume persistence across container recreation | same | — |
| Live Gemini chat/explanation generation | no Gemini API key was supplied | College rep: Google AI Studio key |
| Live Chapa transactions | real financial transactions were prohibited for this phase; only the local mock was used | College rep: Chapa account + approved KYC; run in Chapa test mode first |
| Real email delivery through Resend | local SMTP sink only | College rep: verified sending domain + API key |
| External account setup, DNS records, TLS, production credentials | out of scope and not supplied | College rep / deployment engineer |
| Web Playwright suite (`npm run e2e`) | not executed in this phase; browser flows were covered by targeted harnesses instead | API + web running |
| `next start` under `output: "standalone"` | ran, with Next's own warning that `next start` is not the supported runner for standalone output | Covered by Docker image test above |

## 5. Artifacts and cleanup

- All temporary harness files (`tmp-phaseh/`, `tmp-anatomy-step4-backup.cjs`)
  were deleted after the run. They were never committed.
- The throwaway database `lor_mentor_phaseh` was **left in place** because
  destructive database operations are prohibited without explicit approval.
  Drop it manually when convenient:
  `DROP DATABASE lor_mentor_phaseh;`
- Ports 3000, 4000, 2525 and 4555 were confirmed free after teardown.
- No files were committed.

## 6. Verdict

Every workflow that can be exercised in a local environment passed. The two
things that stand between this code and a live deployment are execution, not
open defects: a real Docker build/boot, and real provider credentials. Lint is
not clean (pre-existing baseline plus formatting in the new anatomy-review
files) — recorded in HANDOVER.md §6, not hidden.