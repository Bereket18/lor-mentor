# Passwordless sign-in — Phase 4 staging checklist (scoping draft)

Status: **draft for review; not executed.** This scopes the Phase 4 gate named in
section 10 of [`passwordless-login.md`](./passwordless-login.md). It is the checklist
that must pass — with evidence — before `AUTH_EMAIL_LINK_ENABLED` is set `true` in
production.

Nothing here contains a credential, code, token, cookie or raw address. Where an item
produces evidence, the evidence is stored outside the repository like the Phase 2 pack
and is referenced by path only.

## 0. Purpose and entry criteria

Entry (all must already hold, verified on the branch tip):

- [ ] P0-1 … P0-4 closed; P1-1 … P1-12 closed; P2-1 … P2-9 closed or explicitly deferred.
- [ ] Phase 2 gate report complete and committed (`passwordless-login-gate-report.md`).
- [ ] API suite green (58 suites / 880 passed / 21 skipped at `4a8fb22`); web unit 89.
- [ ] Production-like standalone build green; 0 CSP violations on hydration.
- [ ] GitHub Actions `CI` green on the branch tip; GitLab push present (no pipeline runs
      on feature branches by `.gitlab-ci.yml` design — see §7 below).
- [ ] No open defect in section 9 of the design doc.

Exit (definition of done):

- [ ] Every "real-mail matrix" row passes on staging with a **real** transport.
- [ ] The final security review is recorded with named signer(s) and date: the project
      owner for staging, plus a second named human reviewer for production (§10, §11).
- [ ] The rollback rehearsal passes without reverting any schema or dropping any token check.
- [ ] The production enablement decision is recorded, with `AUTH_GOOGLE_ENABLED=false`.

## 1. Scope

In scope:

- A staging environment that is production-shaped (HTTPS, reverse proxy, real SMTP).
- The real-mail abuse matrix and the edge cases Phase 2 could not run live.
- The final security review and the rollback rehearsal.

Out of scope (unchanged):

- Google/OIDC (implemented in Phase 3, still disabled; enablement is a separate decision).
- The account-cleanup script awaiting `02-marking-sheet.sql`.
- Any change to the 17 draft anatomy systems or to admin password-only login.

## 2. Staging environment

- [ ] Dedicated staging host or namespace with its own PostgreSQL and Redis (not the dev DB).
- [ ] HTTPS termination in front of the API and web (required: `__Host-` cookie prefixes
      need `Secure`, `Path=/`, no `Domain`, and a real TLS origin).
- [ ] A **real** mail transport. Preferred: a provider sandbox (e.g. a transactional
      provider's test mode) or a controlled mailbox on a real domain. A local sink is not
      sufficient for this gate.
- [ ] Reverse proxy / CDN set to **not cache** auth responses (the app also sends
      `Cache-Control: no-store`; confirm the edge honours it).

Required environment (values distinct from dev; secrets not in the repo):

| Variable | Notes |
|---|---|
| `DATABASE_URL`, `REDIS_*` | Staging-only instances. |
| `AUTH_EMAIL_LINK_ENABLED` | Starts `false`; flipped in §4. |
| `AUTH_GOOGLE_ENABLED` | Must stay `false`. |
| `AUTH_CODE_PEPPER` | Independent, ≥ the required length. |
| `AUTH_RATE_KEY_SECRET` | Independent; keys the address advisory lock and Redis HMACs. |
| `AUTH_TRANSIENT_ENCRYPTION_KEY` | Independent; encrypts queued mail envelopes. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Real transport; validated at boot when email is enabled. |
| `WEB_PUBLIC_URL`, `API_PUBLIC_URL`, `CORS_ORIGIN` | Must be the real staging origins. |
| `COOKIE_DOMAIN` | If a parent domain is used, must be a parent of `WEB_PUBLIC_URL`. |

## 3. Migration and deploy with flags off

- [ ] Apply the additive migrations to the staging database; `prisma migrate status`
      reports up to date. No destructive change.
- [ ] Deploy the version-aware auth code with **both** passwordless flags `false`.
- [ ] Existing flows still work: password login, `/admin-login`, refresh, logout,
      password reset (which increments `sessionVersion` and emails the reset).
- [ ] Boot refuses an incomplete Google configuration: with `AUTH_GOOGLE_ENABLED=true` but
      `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (or a ≥32-character
      `AUTH_TRANSIENT_ENCRYPTION_KEY`) missing, startup fails with the actionable error
      (negative test; capture the error line only).
- [ ] Confirm an old (pre-`ver`) token is read as version 0 and method `PASSWORD`, and
      that a bumped `sessionVersion` invalidates it.

## 4. Enable email sign-in on staging

- [ ] Set `AUTH_EMAIL_LINK_ENABLED=true`; restart.
- [ ] Boot log shows `auth_mail_worker_ready queue=auth-mail concurrency=4`.
- [ ] `GET /methods` returns `{emailLinkEnabled: true, googleEnabled: false}`.
- [ ] The three auth pages (`/login`, `/auth/email/confirm`, `/complete-profile`) return
      the CSP, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, and
      `Cache-Control: no-store` on the staging origin.
- [ ] Cookies are actually set with the `__Host-` prefix, `Secure`, `HttpOnly`,
      `SameSite=Lax`, `Path=/`, no `Domain` (inspect in a real browser jar).

## 5. Real-mail matrix (the new evidence)

Each row asserts the outcome **and** that real mail arrives (or does not) with the
correct content. Record pass/fail and a redacted artifact path per row.

| # | Case | Expected |
|---|---|---|
| 1 | Start, eligible account | 202; mail with both a code and a link arrives. |
| 2 | Code sign-in on the initiating browser | `/dashboard`; cookies set. |
| 3 | Link sign-in on a **second** real device/mailbox | `/dashboard` on that device; initiating device still signed out. |
| 4 | Resend within the 60s cooldown | Same handle, fresh binding, no second mail. |
| 5 | Wrong code | Uniform 400; attempt spent. |
| 6 | Correct code from the wrong browser | Refused. |
| 7 | Replay of a consumed code/link | Refused. |
| 8 | Newcomer | Profile step, then `/dashboard`. |
| 9 | Administrator / inactive address | Uniform 202; **no mail** sent. |
| 10 | Issuance caps (5/hour, 10/day per address; 10/IP/min, 50/IP/hour) | 202/429 per policy; no mail past the cap. |
| 11 | Challenge expiry (15 min) and grant expiry (10 min) | 400/404 after expiry. |
| 12 | Redis outage | Uniform 503; password/admin login unaffected. |
| 13 | SMTP outage | Start still 202; worker retries then a safe failure is audited; no leak. |
| 14 | Role-inaccessible `returnPath` (student asks `/teacher`) | Falls back to the role home. |
| 15 | Canary redaction on staging | Address, code, token, `token=` fragment absent from staging logs. |

Notes on the ones Phase 2 marked as exclusions (they are the reason for this phase):

- Rows 10–12 need a real budget spend, a clock jump or short TTL, and a stopped
  dependency. **Decided (§11):** backdate the challenge/grant/transaction rows in the
  staging database; never edit the shipping policy values or add a TTL override.
- Row 3 must use a genuinely different mailbox/device — this is the cross-device defect
  class (P2-9) that a single-browser test cannot see. **Decided (§11):** a second browser
  profile (preferably a real phone) with a clean cookie jar using the same real mailbox,
  plus a second-provider mailbox for the login-swap scenario.

## 6. Deliverability and edge infrastructure

- [ ] SPF, DKIM and DMARC align for `SMTP_FROM`'s domain; check the alignment, not just
      a successful send.
- [ ] The link and code render in the plain-text and HTML parts; quoted-printable
      wrapping does not corrupt the fragment.
- [ ] Gmail and Outlook (or the provider's placement tools) do not place the mail in
      spam; record placement.
- [ ] The worker survives a restart with queued jobs; undelivered envelopes behave per
      policy when `AUTH_TRANSIENT_ENCRYPTION_KEY` is rotated (undelivered jobs abandoned).
- [ ] Queue depth/concurrency behave under a small burst; no request-path blocking.

## 7. CI and branch notes (context, not a gate)

- GitHub Actions is the CI of record for this branch and runs on every push.
- GitLab (`.gitlab-ci.yml`) runs only on merge requests, `main`, or manual web pipelines,
  so a feature-branch push intentionally produces no GitLab pipeline. **Decided (§11):**
  keep `.gitlab-ci.yml` unchanged — GitLab has no compute minutes, so a push rule would
  only fail with `ci_quota_exceeded`. If that changes, add a rule **and** keep the matrix
  in sync with `.github/workflows/ci.yml`.

## 8. Final security review

- [ ] Re-read the invariants in section 3 of the design doc against staging behaviour.
- [ ] Enumeration: initiation is byte-identical for eligible/unknown/inactive/admin
      (body, cookie, status); timing is equalised on the failure paths.
- [ ] Pre-hijack: an unverified password account that proves the email is invalidated
      before linking.
- [ ] Admin password-only holds at issue, refresh and access.
- [ ] Session revocation: password reset and account switch both invalidate the prior
      token (refresh `jti` denylisted; `sessionVersion` compared).
- [ ] Secret rotation plan documented; confirm rotating `AUTH_TRANSIENT_ENCRYPTION_KEY`
      does not break live sign-ins (only abandons undelivered jobs).
- [ ] Staging logs re-scrubbed for address/code/token/cookie.
- [ ] Dependency/audit status reviewed (report-only jobs in CI remain report-only).

## 9. Rollback rehearsal

- [ ] Disable issuance (`AUTH_EMAIL_LINK_ENABLED=false`); password/admin login unaffected.
- [ ] Let in-flight grants/challenges expire; confirm no orphaned state blocks sign-in.
- [ ] Confirm rollback does **not** revert `sessionVersion` or `passwordLoginEnabled`
      enforcement, and does not drop the additive schema.
- [ ] Confirm queued jobs expire with their challenges.

## 10. Sign-off

- [ ] Named approver, date, and a link to the staging evidence pack.
- [ ] Recorded decision: enable in production, or hold with a list of follow-ups.
- [ ] The **project owner** signs the staging decision; production enablement additionally
      requires a **second named human reviewer** (the college's technical lead or an
      external security reviewer). Agent reviews are evidence, not sign-off. Record signer
      names and dates in the gate-evidence report.

## 11. Scoping decisions (resolved 2026-11-25)

1. **Transport — both.** A provider sandbox drives the bulk matrix; a controlled mailbox
   on a real domain is the "real sink" used for SPF/DKIM/DMARC alignment and inbox/spam
   placement. A local sink still does not satisfy this gate.
2. **TTL/clock control — DB backdate.** Drive the expiry rows (10–12) by backdating the
   challenge/grant/transaction timestamps in the staging database. Do not add a TTL
   override and do not edit the shipping policy values.
3. **Second device — a real second browser profile plus a second mailbox.** Start the
   sign-in in one browser profile, then open the emailed link in a genuinely different
   browser profile with a clean cookie jar (preferably a real phone) using the same real
   mailbox. For the login-swap scenario, add one second mailbox on a **different provider**
   as the attacker address and confirm the confirmation page shows the attacker's address
   in the victim's browser. Record exactly which devices, browsers and providers were used.
4. **Reviewer — two signers for production.** The project owner signs the staging decision
   now. Production enablement additionally requires a second named human reviewer (the
   college's technical lead or an external security reviewer). Agent reviews are evidence,
   not sign-off. Record signer names and dates in the gate-evidence report (§10).
5. **GitLab pipeline — keep `.gitlab-ci.yml` unchanged** (no `feat/**` branch rule).
   GitLab has no compute minutes, so push rules would only fail with `ci_quota_exceeded`;
   evidence continues to come from the GitHub Actions run of record and the gate-evidence
   reports (§7).
