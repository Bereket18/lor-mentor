# Passwordless sign-in — Phase 2 evidence gate report

Branch: `feat/passwordless-login`. This report records the acceptance-evidence pack
requested by section 12 of `passwordless-login.md`, what was executed, what was
deliberately excluded, and the one defect the evidence work uncovered and fixed.

Nothing here contains a credential, a one-time code, a link token, a cookie value or a
raw email address. Counts and outcomes only.

## 1. Environment

- OS: Windows, Node.js 26.x, local PostgreSQL 18 (`127.0.0.1:5432`).
- API: built `apps/api/dist` (`node apps/api/dist/src/main.js`).
- Web: the dev server on `:3000` for the UI matrix and screenshots, and the Next.js
  `output: "standalone"` production bundle for the build/smoke gate.
- Mail: a local SMTP sink on `:1025` writing quoted-printable `.eml` files to a
  directory outside the repository. No real mail transport was used.
- Sign-in data: the developer database (`lor_mentor`), synthetic `@example.test`
  newcomer addresses, and one existing eligible non-admin account whose address is
  redacted in every artifact.
- No production credential, production database or production mail transport was used.

## 2. Executed checks

| # | Check | Command | Result |
|---|---|---|---|
| 1 | API unit/integration suite (includes the new canary redaction spec) | `npx jest --runInBand` (api) | 58 passed suites / 876 passed tests, 21 skipped; 60 suites / 897 tests total |
| 2 | Web typecheck | `npx tsc --noEmit` (web) | exit 0 |
| 3 | Web lint on the touched files | `npx eslint src/lib/api.ts e2e/passwordless*.ts` | exit 0 |
| 4 | UI matrix — code, emailed link, inert page, cold profile load, wrong browser, newcomer step | `npx playwright test e2e/passwordless.spec.ts --workers=1` | 6 passed |
| 5 | Screenshots + accessibility manifest, 5 states × 3 widths × 2 themes | `npx playwright test e2e/passwordless-screenshots.spec.ts --workers=1` | 6 passed; 30 screenshots; 0 accessibility failures |
| 6 | Live log-redaction with an injected canary address/code/token | `canary-live.ps1` | 10/10 passed |
| 7 | Production-like standalone build | `npm run build` (web, `NODE_ENV=production`) | exit 0 |
| 8 | Auth-page header/CSP smoke on the standalone bundle | header assertions | 40/40 passed |
| 9 | Hydration + CSP-violation probe on the standalone bundle | headless probe | 0 CSP violations; email-mode toggle and input work |
| 10 | Queue-worker boot line | fresh API start | `auth_mail_worker_ready queue=auth-mail concurrency=4` logged |
| 11 | API e2e authorization matrix on a disposable Postgres | `npx jest --config ./test/jest-e2e.json support-auth` | 21 passed |

### 2.1 UI matrix (check 4)

1. Email code sign-in reaches `/dashboard`.
2. The emailed link signs in on a second, isolated browser context (cross-device).
3. Opening the link page alone signs nobody in: the page stays inert, scrubs the
   fragment, and a cold `/me` 401 does not bounce it to `/login`.
4. The profile page (`/complete-profile`) loads cold without a forced redirect.
5. A code presented from a different browser is refused.
6. A newcomer is sent to the profile step.

### 2.2 Screenshots and accessibility (check 5)

States: `login-password`, `login-email`, `login-check-email`, `confirm-link`,
`complete-profile-expired`. Widths: 320, 390, 1280. Themes: light and dark.

Per screenshot the manifest records the heading, unnamed form controls, unnamed buttons,
images without `alt`, horizontal overflow, and the `h1` count. All 30 entries report zero
of every failure class. Output (outside the repository):
`C:\Users\berek\Desktop\lor-screens\passwordless-login\` (`manifest.json`, `README.md`,
30 PNGs).

### 2.3 Live redaction (check 6)

One real challenge is driven for a generated canary address, the delivered code and link
token are read from the sink and never printed, a wrong code is submitted to exercise the
failure audit path, and the API's own stdout/stderr is grepped. Asserted: the canary
address, the delivered code, the link token and any `token=` fragment are all absent from
the log. 10/10 assertions passed. This complements the five unit assertions in
`passwordless.redaction.spec.ts` (start response, audit event, request log, mail payload;
admin suppression; rejected link; processor SMTP failure).

### 2.4 Production-like build and smoke (checks 7–10)

The standalone bundle serves `/login`, `/auth/email/confirm` and `/complete-profile` with
HTTP 200 and the expected body markers, and each response carries: `Content-Security-Policy`
(`default-src 'self'`; `connect-src` includes the configured API origin; `object-src 'none'`;
`frame-ancestors 'none'`; `form-action 'self'`; `base-uri 'self'`; no `'unsafe-eval'`),
`Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, and `Cache-Control: no-store`.
`/pricing` carries no auth-page CSP, confirming the headers are scoped. In a headless
browser the pages hydrate with zero CSP violations.

## 3. Exclusions (recorded, not executed live)

These checks are covered by unit/integration tests or by the earlier real-HTTP runs, but
were not repeated as live UI evidence because each needs a clock jump, a second issuance,
a stopped dependency, or a real budget spend:

- **Challenge and grant expiry.** The challenge lifetime is 15 minutes and the
  profile grant 10 minutes; asserting expiry live needs a clock jump or a TTL override.
  Covered at the unit/integration layer and by the "expired" UI state.
- **Supersession by a later issuance.** The 60-second cooldown reuses the active row, so
  a live second issuance within the window does not supersede. The P1-1 four-simultaneous
  start run already established that exactly one active row survives, and unit coverage
  asserts the advisory lock is taken only on the create path.
- **Issuance caps (5/hour, 10/day per address; 10/IP/min, 50/IP/hour).** Exercising these
  live spends real issuance budget, so they remain unit/DB-level.
- **Administrator and inactive-address suppression.** Covered by unit tests and the
  earlier 18/18 initiation-parity run; a live admin challenge needs an admin address.
- **Redis-outage fail-closed 503.** Needs Redis stopped; unit-covered with a mocked
  failure.
- **Retention cleanup deletion.** Needs backdated rows; the single-runner advisory guard
  and the retention predicate are unit/DB-level.
- **Google/OIDC.** Disabled by design; `validateEnv` and `AuthMethodsConfig` refuse
  `AUTH_GOOGLE_ENABLED=true` at boot (unit-covered).
- **Nonce-based CSP (P2-8).** Deferred by design; the root layout's theme script forces a
  nonce-free root until it is removed or the app renders dynamically.

## 4. Defect found and fixed during the gate

The evidence work uncovered a real cross-device defect. The axios response interceptor in
`apps/web/src/lib/api.ts` treated any `/me` 401 on a non-login page as "session expired"
and redirected to `/login`. `/auth/email/confirm` and `/complete-profile` are opened cold
on a device with no session, so their `/me` probe 401 forced an immediate redirect and
made the emailed link impossible to confirm off the originating device.

Fix: the interceptor's sessionless-page allowlist now includes `/auth/email/confirm` and
`/complete-profile`, so a 401 there is the expected "not signed in yet" answer rather than
a redirect trigger. Verified by UI-matrix tests 2–4 and by the standalone smoke probe
(both pages stay put and render their headings on a cold load).

A second, CI-only issue surfaced when validating the pipeline. The support-authorization
e2e matrix builds a partial module graph and stubs `UsersService.findById` with a
hand-written Prisma `select`; that select predated the strategy's `sessionVersion` check,
so every hand-signed token was rejected with 401 and the suite failed. It now mirrors the
real select (`sessionVersion`, `passwordLoginEnabled`, `profileCompletedAt`), and the
matrix passes 21/21 against a throwaway database.

## 5. Verdict

- Phase 2 P1 items (P1-1 … P1-12) remain closed; no regression was observed.
- The section-12 evidence pack is complete: executed checks 1–10 above, the exclusions
  recorded, and the redaction/screenshot/manifest artifacts produced outside the
  repository.
- Production email enablement stays held. Phase 4 (staging with a real sink, real-mail
  matrix, and the final security review) is still required before `AUTH_EMAIL_LINK_ENABLED`
  is set true in production.
