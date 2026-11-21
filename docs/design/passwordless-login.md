# Passwordless login: as-built design and remaining work

Status: **approved for continued implementation; email link + six-digit code is implemented and its P0 defects are closed.**
Production enablement: **not yet approved** until the remaining P1 items in section 9 are closed and a production-like smoke run passes.
Date: 2026-11-21. Branch: `feat/passwordless-login`. Phase 1 closes P0-1 to P0-4.
Base: `origin/main` at `63e31f019490fa02e0ad34256d8815e72feef9b4`.

This revision replaces the earlier "proposed — awaiting approval; no implementation
authorised" document. The implementation described below exists and was verified on
this branch. Where the earlier design and the code differ, section 8 records the
correction and section 9 records the remaining defect. The document is therefore an
as-built design plus a gated plan, not a proposal for code that has yet to be written.

## 1. Scope and decision summary

Approved and implemented:

- Email sign-in with one challenge that can be redeemed either by a six-digit code on
  the initiating browser or by an emailed link on any browser, with an explicit
  "Continue here" POST.
- A restricted profile-completion grant for a verified newcomer, producing a
  `STUDENT` account only after the profile POST.
- An AES-256-GCM encrypted, bounded BullMQ `auth-mail` queue. The request path only
  enqueues ciphertext; a worker sends and skips non-deliverable decoys.
- Session versioning (`User.sessionVersion`) and an authentication-method claim
  (`am`) on access and refresh tokens. Administrator roles remain password-only at
  issuance, refresh and access-token validation.
- Redis-atomic request budgets with HMAC keys and fail-closed 503 behaviour.
- Database-backed issuance caps as a second layer.
- Pre-hijack recovery for an unverified password account that proves its email.

Deferred, not implemented:

- Google/OIDC sign-in. The schema (`AuthIdentity`, `AuthProvider`, `AuthMethod.GOOGLE`)
  is additive and ready, but there are no routes, UI, transaction store or token
  verifier. `AUTH_GOOGLE_ENABLED=true` is refused at boot until that work is complete.
- A scheduled cleanup job for expired challenges and grants (section 9, P1-4).
- A Content-Security-Policy and Fetch-Metadata checks (section 9, P1-5).
- Screenshot and accessibility evidence at the paths required by the acceptance plan
  (section 12).

Out of scope for this document: the separate account-cleanup script that is waiting
on the user-marked list in `02-marking-sheet.sql`, and the role-scoped portal
enforcement study in `docs/design/role-scoped-sign-in.md`.

## 2. Verified implementation evidence

The table below is the pre-Phase-1 baseline at `1c74a0b`. The Phase 1 re-verification
is recorded after it.

| Check | Result |
|---|---|
| API unit/integration suite | 51 suites / 811 tests passed; 2 suites / 21 skipped |
| Web unit suite | 89 tests passed |
| API `tsc --noEmit` | clean |
| Web `tsc --noEmit` | clean |
| Web ESLint | exit 0; one pre-existing warning in `admin/payments/page.tsx` |
| Real-HTTP passwordless smoke | 39/39 checks passed |
| Next.js production standalone | serves `/login`, `/auth/email/confirm` and `/complete-profile` with `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` |
| Browser verification | login method toggle, email confirmation page and profile-completion UI exercised manually |
| Screenshots / a11y manifest | **not produced**; `C:\Users\berek\Desktop\lor-screens\passwordless-login\` does not exist |

Phase 1 (2026-11-21) was re-verified on the pre-commit working tree: the Prisma schema
validates; 26/26 migrations applied to a fresh disposable PostgreSQL database and
`migrate status` reports up to date; API `tsc --noEmit` and ESLint are clean on the
touched files; the API suite is 54 passed suites / 841 passed tests / 21 skipped. A
real-HTTP run against the built API passed 39/39 checks (existing, unknown and new
users, code and link sign-in, binding enforcement, single use, cross-device
confirmation, administrator suppression and queued delivery). A dedicated
initiation-parity run passed 18/18 checks: identical body keys for eligible and
suppressed addresses, a binding cookie on every start, distinct handles, stable
handles on cooldown with a fresh binding, and no mail for administrator or inactive
addresses. Mail now arrives from the worker after the 202, so the harness polls the
sink briefly.

The disposable-QA environment used PostgreSQL `55433`/`55434`, Redis `6379`, SMTP sink
`1025`, API `4000` and web `3000`, with a local mail sink writing `.eml` files outside
the repository. No real credentials, production database or production mail
transport was used. The Next.js security upgrade is commit `81da5a4` on this branch;
the separate local branch `chore/next-security-upgrade-16.4.6` (`e06d5c8`) is not part
of the delivered history.

## 3. Invariants and their as-built status

| Invariant | Status |
|---|---|
| Both passwordless flags default to `false` and are enforced server-side. | Met. Disabled methods fail closed with 503, not merely hidden UI. |
| Password login and `/admin-login` remain available; `ADMIN`/`SUPER_ADMIN` never receive or refresh a passwordless session. | Met. `issueSession`, refresh and the JWT strategy re-read the role; access tokens also check the method. |
| Roles and privileges come only from the database. | Met. Email domain, request fields and (future) Google claims never set a role. New users are `STUDENT`. |
| GET/HEAD never consume a link, create a user, or establish a session. | Met. The confirmation page captures the fragment, scrubs it, and waits for a click. |
| A challenge is consumed at most once, atomically. | Met for the claim (`updateMany` with `consumedAt: null`, `supersededAt: null`, unexpired). See P1-1 for concurrent *issuance*. |
| Codes are stored as a slow peppered hash; link secrets as a fast digest of 256-bit material; plaintext never reaches the database. | Met. `bcrypt(10)` over `HMAC-SHA256(AUTH_CODE_PEPPER, challengeId:code)`; link and binding values are SHA-256 digests. |
| Rate limits are cross-instance, HMAC-keyed and fail closed. | Met. Redis Lua `INCR` + `PEXPIRE`; raw email/IP/cookie values are never stored; Redis failure returns a uniform 503. |
| Email-link secrets travel in a fragment and confirmation is an explicit CSRF-protected POST. | Met. |
| Cross-device link confirmation is allowed only with `destination: "current-browser"`. | Met. The server ignores the original binding on `POST /email/confirm` but still requires the high-entropy link token and receiving-browser CSRF. |
| Initiation is indistinguishable for existing, unknown, inactive and administrator addresses. | Met. Every well-formed start after validation persists a challenge-shaped row and returns a handle plus a fresh binding cookie; suppressed rows are `deliverable=false` and enqueued as decoys the worker drops. |
| One challenge per address is active at a time. | **Not met under concurrency.** See P1-1. |
| Profile completion cannot mutate an account that appeared mid-grant, including an administrator. | Met. One transaction re-reads and locks an existing user, refuses admin/inactive/identity mismatch before mutation, consumes the grant inside the transaction, and maps a create race to 409. |
| No plaintext credential is logged. | Implemented by construction; a canary-secret test is still missing from the acceptance evidence. |
| Schema changes are additive. | Met. No drops, renames or nullability changes to existing columns. |
| Password reset invalidates existing access and refresh tokens. | Met. `claimResetToken` increments `sessionVersion`; the denylist also revokes refresh tokens issued before the reset. |

## 4. As-built flows

### 4.1 Start

1. `POST /api/v1/auth/email/start` passes `AuthCsrfGuard`, then the per-IP Redis
   budgets (10/minute and 50/hour).
2. The service refuses with 503 if `AUTH_EMAIL_LINK_ENABLED` is false.
3. The email is trimmed/lowercased with the shared normaliser and checked for a
   plausible shape and bounded length. A malformed value returns 400 with a
   shape-only message.
4. The user is looked up by email.
   - Administrator: write `AUTH_PASSWORDLESS_ADMIN_REFUSED`; the row is still created
     as a non-deliverable decoy.
   - Inactive: the row is created as a non-deliverable decoy.
5. If an active challenge for the address was created less than 60 seconds ago,
   return that challenge's id with `retryAfterSeconds: 60`, rotate its binding, and
   return a fresh cookie. Nothing new is written or sent.
6. Otherwise `mayIssue` consumes the Redis 5/hour and 10/day address budgets and then
   checks the durable `AuthChallenge` counts. A refusal still creates a decoy.
7. A challenge is created with purpose `LOGIN` when a user exists and `SIGNUP`
   otherwise. All still-active email challenges for the address are marked
   `supersededAt` in the same array transaction as the insert.
8. The plaintext six-digit code and 256-bit link secret exist only in memory. The row
   stores `bcrypt(HMAC(pepper, id:code))`, `sha256(linkToken)`, `sha256(browserNonce)`,
   the `deliverable` marker and the validated return path.
9. An encrypted BullMQ job is enqueued for every start, including decoys. Redis holds
   only an AES-256-GCM envelope; the worker decrypts it in memory, sends only when
   `deliverable=true`, and audits success or a safe failure category. A queue failure
   is audited and does not change the response.
10. The response is `202 {message, challengeId, retryAfterSeconds: 60}` and always sets
    a fresh `auth_ch_` binding cookie.

### 4.2 Resend

`POST /api/v1/auth/email/resend` requires the `auth_ch_` binding cookie. A missing or
wrong binding, an unknown challenge, and a cooldown hit all return the same 202 shape
and change nothing. An eligible resend creates a new challenge, supersedes every
active email challenge for the address, enqueues a new email and rotates the binding
cookie. A suppressed address gets the same shape with a non-deliverable decoy row.

### 4.3 Code proof

`POST /api/v1/auth/email/code` accepts exactly six digits, preserving leading zeroes.
The order is deliberate:

1. Shape check; a malformed code spends one timing-equaliser bcrypt comparison.
2. Challenge lookup; an unknown id also spends the equaliser.
3. Address-wide Redis budget (20/hour across resends), counted before the binding
   check so a wrong-browser submission still spends the address budget.
4. Binding check: the submitted cookie's SHA-256 must equal `browserNonceHash` in
   constant time. A correct code from the wrong browser is rejected.
5. Attempt reservation: a conditional `UPDATE` increments `attempts` only while
   `attempts < 5`, the row is unconsumed, unsuperseded and unexpired. The database,
   not a read-then-write check, enforces the cap.
6. Constant-time digest comparison through bcrypt.
7. Atomic claim (`consumedAt` set) and finalisation.

Every failure is the same 400 message. No remaining-attempt count or eligibility
detail is returned.

### 4.4 Link proof and cross-device confirmation

`POST /api/v1/auth/email/confirm` accepts `{challengeId, token, destination}`. The
token must be a string of at least 20 characters; its SHA-256 is compared with the
stored unique digest in constant time. The original browser binding is intentionally
not required, because the link may be opened on a phone after sign-in started on a
laptop. The explicit `destination: "current-browser"` value is the consent record.
On success the challenge is claimed atomically and finalised. The initiating device's
code/link becomes invalid; no session is pushed to it.

The current implementation does **not** mint a fresh receiving-browser binding on
cross-device success; it clears the challenge cookie. That is consistent with the
link being a bearer capability held in the email, but the earlier design's wording
about a "fresh receiving browser binding" was inaccurate.

### 4.5 Finalisation

After a successful claim, the account is re-read by the challenge's normalised email:

- Administrator or inactive: audit where appropriate, return the uniform 400 proof
  failure. No session, identity mutation or grant is produced.
- No user: issue a ten-minute `EnrollmentGrant` and return
  `{next: "complete_profile", redirectTo: "/complete-profile"}`. The grant token is
  written only as an HttpOnly cookie; no access/refresh JWT is issued.
- Unverified email: treat the existing password as attacker-controlled. In one
  transaction, replace the password hash with a hash of a discarded random secret,
  set `passwordLoginEnabled=false`, mark the email verified, clear reset tokens and
  lockout state, clear `profileCompletedAt`, increment `sessionVersion`, and supersede
  pending challenges and verification codes. Then issue a recovery grant.
- A passwordless signup that never finished its profile (`profileCompletedAt` null
  and `passwordLoginEnabled` false): issue a grant.
- Otherwise: issue new session tokens with the current `sessionVersion` and
  `am=EMAIL_LINK`, and redirect to the validated return path or the role home.

### 4.6 Profile completion

`GET /api/v1/auth/profile-completion` reads the grant cookie and returns
`{email, existingAccount, expiresAt}` without consuming anything. An invalid, expired
or already-consumed grant returns 404. A disabled method returns 503.

`POST /api/v1/auth/profile-completion`:

1. Finds the unconsumed, unexpired grant and checks that its method is still enabled.
2. Validates the department (exists, not archived) and academic year (exists, not
   archived, belongs to that department).
3. Re-reads any user by the grant's email and locks the row (`FOR UPDATE`) before
   reading its role and activity. A newcomer grant whose address now has an account,
   a recovery grant whose user vanished, or a different account at the address is a
   409 conflict. An administrator or inactive account is refused before mutation.
4. Consumes the grant with a conditional `UPDATE` inside the same transaction, after
   every check. A later failure rolls the consumption back.
5. Updates the existing user's profile (recovery path, without touching the password
   policy) or creates a new verified `STUDENT` with a discarded random password hash
   and `passwordLoginEnabled=false`. A P2002 create race becomes a 409 conflict.
6. Audits `AUTH_PROFILE_COMPLETED`, issues a session through `issueSession`, and
   returns `{next: "signed_in", redirectTo, user}`.

### 4.7 Session issuance, refresh and revocation

- Access and refresh tokens carry `ver` (session version) and `am` (auth method).
  Legacy tokens without them are read as version 0 and method `PASSWORD`.
- `JwtStrategy` loads the user, rejects inactivity, compares `ver` with the database,
  and rejects a non-password method for `ADMIN`/`SUPER_ADMIN`.
- Refresh repeats the same version and method checks before rotating.
- `issueSession` re-reads the user and refuses admins and inactive accounts even if a
  future caller forgets the earlier checks.
- Password login checks `passwordLoginEnabled` as a second gate, so a recovered
  account with a discarded hash cannot be opened with an old password even if the
  hash comparison were somehow restored.
- Password reset sets `passwordLoginEnabled=true`, increments `sessionVersion`, and
  revokes pre-reset refresh tokens through the denylist.
- Logout and refresh rotation use the existing JWT denylist.

## 5. As-built data model

The migration `20261116120000_passwordless_auth` is additive.

| Model / field | Actual semantics |
|---|---|
| `AuthChallenge.id` | 256-bit base64url random handle, primary key. |
| `purpose` | `LOGIN` or `SIGNUP`; selected server-side and never disclosed at initiation. |
| `email` | Normalised destination. Re-resolved to a user at consumption. |
| `userId?` | Nullable relation recording who the challenge was issued for, if anyone. |
| `linkTokenHash` | Unique SHA-256 of a 256-bit link secret. |
| `codeHash` | bcrypt cost 10 over `HMAC-SHA256(AUTH_CODE_PEPPER, challengeId:code)`. |
| `browserNonceHash` | SHA-256 of the 256-bit value in the `auth_ch_` cookie. |
| `attempts` | Integer default 0. The cap is enforced by conditional updates requiring `attempts < 5`; there is **no** database CHECK constraint. |
| `expiresAt`, `consumedAt`, `supersededAt`, `createdAt` | 15-minute fixed lifetime; nullable terminal timestamps; expiry checked on every claim. |
| `returnPath?` | Canonical local path from the fixed allowlist. |
| `AuthIdentity` | `id`, `userId`, `provider=GOOGLE`, `subject`, `createdAt`; unique `(provider, subject)` and `(userId, provider)`. Currently unused. |
| `EnrollmentGrant` | `id`, unique `tokenHash`, `email`, optional `userId`, `method`, optional `googleSubject`, `browserNonceHash`, `returnPath`, `expiresAt`, `consumedAt`, `createdAt`. |
| `User.passwordLoginEnabled` | Default `true`; set false for passwordless/recovered accounts until a deliberate password reset. |
| `User.sessionVersion` | Default 0; included in both token types and checked on every access and refresh. |
| `User.profileCompletedAt` | Set when a passwordless user finishes the profile step; existing registrations are treated as complete without a bulk update. |

`EnrollmentGrant.browserNonceHash` is currently set to `sha256(grantToken)`, the same
value as `tokenHash`. There is no independent grant-binding nonce; the grant is a
bearer capability held in an HttpOnly cookie. The implementation and documentation
must describe it that way unless a separate nonce is added.

There is no CHECK constraint on `attempts`. The conditional `UPDATE` is the effective
control; a CHECK is recommended as defence in depth (P1-8).

## 6. As-built API contract

All routes are under `/api/v1/auth`. The web app proxies them same-origin. State-changing
routes require JSON, an exact allowed `Origin`, and the double-submit CSRF header.

| Method and path | As-built behaviour |
|---|---|
| `GET /methods` | 200 `{googleEnabled, emailLinkEnabled}`; flags only. Redis-backed 60/IP/minute; 503 if Redis is unavailable. |
| `GET /csrf` | 200 `{csrfToken}`; sets the `auth_cs_` cookie (15-minute max age). 60/IP/minute. |
| `POST /email/start` | 202 `{message, challengeId, retryAfterSeconds: 60}`. Always sets a fresh `auth_ch_` and persists a challenge-shaped record; suppressed addresses get a non-deliverable decoy. 10/IP/minute and 50/IP/hour. |
| `POST /email/resend` | 202 with the same body shape; requires the original `auth_ch_` binding. 10/IP/minute and 50/IP/hour. |
| `POST /email/code` | 200 completion on success; otherwise 400 generic proof failure. 30/IP/10 minutes, 10/browser/10 minutes, 20/address/hour. |
| `POST /email/confirm` | 200 completion on success; otherwise 400 generic proof failure. `destination` must be `"current-browser"`. 30/IP/10 minutes, 10/browser/10 minutes. |
| `GET /profile-completion` | 200 `{email, existingAccount, expiresAt}`; **404** for an invalid/expired/consumed grant; 503 if the grant's method is disabled. No rate limit is applied. |
| `POST /profile-completion` | 200 completion; 400 for an invalid grant or field error; 409 for the email-conflict path; 503 if the method is disabled. 30/IP/10 minutes and 5/grant/10 minutes. |

A disabled method returns **503**
`{"statusCode":503,"message":"Sign-in is not available right now"}`. It does not return
404. The `AuthMethodsConfig` comment that still says 404 is a stale comment, not the
contract.

Success bodies:

- Signed in: `{next: "signed_in", redirectTo, user}` with session cookies.
- Profile needed: `{next: "complete_profile", redirectTo: "/complete-profile"}` with an
  enrollment cookie.
- No access/refresh/link/grant token is ever returned in JSON.

The generic proof failure is:

> We couldn't complete sign-in. Request a new email and try again.

The generic initiation message is:

> If this address can use email sign-in, you'll receive a link and a six-digit code.
> You can also create your student account this way.

## 7. Cookies, CSRF, redirects and rate limits

### 7.1 Cookies

Base names are `auth_cs_`, `auth_ch_` and `auth_en_`. In production each is prefixed
with `__Host-` and set with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` and no
`Domain`. Development uses the unprefixed names without `Secure`.

| Cookie | Lifetime | Purpose |
|---|---|---|
| `auth_cs_` | 15 minutes | CSRF synchronizer value; also the current browser key for request budgets. |
| `auth_ch_` | 15 minutes | Challenge browser binding; rotated on a new/resend-issued challenge. |
| `auth_en_` | 10 minutes | Profile-completion grant token. |

These are host-only and separate from the existing session cookies, so a parent-domain
session cookie is never widened to cover them. Session cookies remain the existing
access/refresh pair.

### 7.2 CSRF

`AuthCsrfGuard` enforces:

1. `Content-Type` includes `application/json`;
2. `Origin` is present and exactly matches one of `CORS_ORIGIN`, `WEB_PUBLIC_URL` or
   `API_PUBLIC_URL` (after trimming a trailing slash and lowercasing);
3. the `x-auth-csrf` header equals the `auth_cs_` cookie in constant time.

There is no Fetch-Metadata check. The guard is in addition to `SameSite=Lax` and CORS.
It is attached to every passwordless POST. GET/HEAD/OPTIONS pass through.

### 7.3 Redirect allowlist

The exact allowlist is:

`/dashboard`, `/courses`, `/support`, `/support/tickets`, `/profile`, `/teacher`.

`sanitizeReturnPath` rejects schemes, protocol-relative forms, backslashes, control
characters, encoded separators, query strings and fragments, and any value not in the
list. The fallback is `/dashboard`, with `/teacher` for a teacher role. The current
implementation does not reject a role-inaccessible destination at completion (for
example, a student asking for `/teacher`); the destination page's own guard is the
remaining control. This is P1-9.

### 7.4 Rate limits

| Action | Policy |
|---|---|
| Start/resend | 60-second address cooldown; 5/address/hour and 10/day (Redis + durable counts); 10/IP/minute and 50/IP/hour. |
| Code | 5 submitted comparisons/challenge (conditional `UPDATE`); 20/address/hour; 30/IP/10 minutes; 10/browser/10 minutes. |
| Link confirm | 30/IP/10 minutes; 10/browser/10 minutes. |
| Profile POST | 30/IP/10 minutes; 5/grant/10 minutes. |
| Methods/CSRF | 60/IP/minute. |

Address caps, cooldowns and admin/inactive suppression return the generic 202. An
IP/browser-wide limit returns 429 with `Retry-After`. A Redis failure returns a
uniform 503; password and admin flows do not call this service and keep working.

The browser bucket is keyed by the CSRF cookie. Because `GET /csrf` can mint a new
value, a caller can reset the browser budget by fetching a new token. The IP budget
still applies. See P1-2.

## 8. Corrections to the earlier design

| Earlier claim | As-built reality | Action |
|---|---|---|
| Status was "proposed — awaiting approval; no implementation authorised". | The email flow, schema, UI, tests and Next.js upgrade are implemented and pushed at `1c74a0b`. | Replaced by this as-built document. |
| Disabled methods return 404. | They return 503. | Contract corrected; stale code comment is P2-4. |
| `GET /profile-completion` returns 401 for an invalid grant. | It returns 404. | Contract corrected. |
| `POST /profile-completion` returns 401 for an invalid grant. | It returns 400 (and 409 for the email-conflict case). | Contract corrected. |
| `attempts` has a database 0–5 constraint. | A conditional `UPDATE ... WHERE attempts < 5` enforces the cap; there is no CHECK. | Document corrected; add CHECK as P1-8. |
| `AUTH_TRANSIENT_ENCRYPTION_KEY` and `AUTH_POST_LOGIN_PATHS` are configuration. | `AUTH_TRANSIENT_ENCRYPTION_KEY` now exists and is required when email sign-in is enabled; it encrypts queued mail. The path allowlist remains a fixed constant. | Contract corrected for the encryption key; post-login paths remain code. |
| Mail is delivered by a bounded, encrypted BullMQ job. | The `auth-mail` queue carries AES-256-GCM envelopes only; a worker sends deliverable payloads with three bounded retries and skips decoys. | Closed; P0-3. |
| A daily cleanup job removes expired challenges/grants. | No scheduled job exists. | Corrected; P1-4. |
| Auth pages carry a restrictive CSP and Fetch-Metadata checks. | Next.js sets `Referrer-Policy`, `X-Robots-Tag` and `Cache-Control` on the three pages; there is no CSP and the guard does not inspect Fetch-Metadata. | Corrected; P1-5. |
| The profile grant is consumed and the user is created in one transaction. | `completeProfile` re-reads the grant and locks an existing user inside one transaction, consumes only after checks, and lets a failure roll both back. | Closed; P1-3 and P0-2. |
| A successful sign-in revokes the presented prior refresh token. | A new refresh cookie is written, but the previous refresh token is not explicitly denylisted at login. | Corrected; P1-7. |
| A different signed-in user must confirm an account switch. | No account-switch confirmation exists; the new cookies overwrite the old session. | Corrected; P1-6. |
| The initiating response is identical in body, cookie and timing for eligible and suppressed addresses. | Suppressed addresses also get a challenge-shaped row, the same body, a fresh binding cookie and an enqueued decoy; the worker sends nothing. | Closed; P0-1/P0-3. |
| Issuance and supersession are serialised per address. | There is no per-address lock or partial unique index; concurrent starts can create two active challenges. | **Open P1**; P1-1. |
| Cross-device confirmation creates a fresh receiving-browser binding. | It clears the challenge cookie and issues the session; no new binding is minted. | Wording corrected; the link remains a bearer capability. |
| The profile grant is browser-bound by an independent nonce. | `browserNonceHash` equals `sha256(grantToken)`; the grant is a bearer cookie. | Wording corrected; independent binding is optional P2-1. |

## 9. Open defects and risk register

Severity means "before production enablement", not "before the next commit".

### P0 — closed in Phase 1 (must remain closed before any production enablement)

**P0-1: Initiation is an account-existence oracle.**
`startEmail` used to set `auth_ch_` only when it issued a challenge. A suppressed response
(administrator or inactive) set no cookie. A repeated start inside the cooldown
returned the existing challenge id for an eligible address, while a suppressed address
got a fresh random id. The response body alone looked identical, but the cookie and
the id comparison were not. This directly contradicted the enumeration invariant.

Fix: persist a challenge-shaped record for every well-formed start that reaches the
issuance step, including suppressed addresses, and always set a fresh binding cookie.
The record must be marked non-deliverable (for example, `deliverable=false`) so no
mail is sent. On cooldown, return the most recent record for the address for both
eligible and suppressed cases and rotate its binding. Use a queue/outbox so the
response does not await SMTP. Tests must compare status, body keys, cookie presence,
id stability and a timing distribution across existing/unknown/inactive/admin
addresses.

Closed: `AuthChallenge.deliverable` (migration `20261121120000_passwordless_delivery`)
marks decoys. Every well-formed start after validation persists a row, returns a
handle and rotates the binding; cooldown reuses the active row for every address. The
response no longer awaits SMTP (P0-3). Unit tests cover body-key parity, cookie
presence, decoy flags and cooldown id stability.

**P0-2: Profile completion can mutate an existing account, including an administrator.**
The grant used to be consumed before the user transaction. The existing-user branch
updated by email whenever a user existed; it only rejected a mismatch when
`grant.userId` was non-null. Therefore:

- A newcomer grant (`userId=null`) followed by an account appearing at that address
  updates that account's name, phone, department and year, marks it verified and sets
  `passwordLoginEnabled=false`.
- If the account was promoted to `ADMIN`/`SUPER_ADMIN` after the grant was issued,
  the same update disables its password login; `issueSession` then refuses the
  passwordless session, leaving the administrator with no working sign-in route.

Fix: perform the re-resolution and the grant consumption in one transaction with a
row lock. Require `existing.id === grant.userId` for a recovery grant. If a newcomer
grant now finds an existing user, refuse with a safe restart/conflict response rather
than updating it. Reject administrator and inactive accounts before any mutation.
Never set `passwordLoginEnabled=false` on an existing account unless the recovery path
has explicitly invalidated that account and the role check has passed.

Closed: `completeProfile` now runs one interactive transaction. It re-reads the grant,
locks any existing user row with `SELECT ... FOR UPDATE`, refuses admin/inactive and
any newcomer/missing-target identity mismatch before mutation, consumes the grant only
after those checks, and maps a P2002 create race to 409. The recovery branch no longer
writes `passwordLoginEnabled`.

**P0-3: Synchronous SMTP creates a timing oracle and a request-path DoS.**
`deliver` used to await `MailService.sendAuthSignIn`, which awaits Nodemailer. Eligible
addresses therefore took SMTP time; suppressed addresses returned earlier. A slow or
unreachable SMTP server also held the API request open.

Fix: use the existing BullMQ dependency (already configured for AI generation) or a
durable outbox. Enqueue a job containing only an encrypted payload under a dedicated
`AUTH_TRANSIENT_ENCRYPTION_KEY`; send from a bounded worker with limited retries; never
log the payload. Always enqueue a job, including for suppressed addresses, so the
enqueue path is shape- and latency-similar; the worker skips non-deliverable records.
Add a boot-time validation that refuses email enablement without a working queue and
SMTP configuration.

Closed: the `auth-mail` BullMQ queue carries only AES-256-GCM envelopes keyed by
`AUTH_TRANSIENT_ENCRYPTION_KEY`; the worker decrypts in memory, sends deliverable
payloads with three bounded retries and drops decoys. Both start and resend enqueue
before returning. Env validation requires the encryption key when email sign-in is
enabled and refuses reused passwordless secrets. SMTP and Redis queue connectivity
remain deployment checks (P1-11 still covers an end-to-end boot probe).

**P0-4: `AUTH_GOOGLE_ENABLED=true` is accepted without a Google implementation.**
`AuthMethodsConfig` read the flag and `/auth/methods` reported it, but there were no
Google routes, UI, transaction store or verifier. A deployer could advertise a method
that did not exist.

Fix: until the Google phase lands, reject `AUTH_GOOGLE_ENABLED=true` at boot with an
actionable error and keep the flag out of the effective methods response. When Google
is implemented, require the client id/secret/redirect URI at boot in the same change.

Closed: both `validateEnv` and `AuthMethodsConfig` refuse `AUTH_GOOGLE_ENABLED=true`
with a boot error; tests cover the refusal. The flag stays false in both env examples.

### P1 — should close before production enablement or immediately after

**P1-1: Concurrent starts can create multiple active challenges.**
`createChallenge` runs `updateMany` + `create` in an array transaction, but two
transactions for the same address can both see no recent row and both insert. The
"newest email replaces the previous one" guarantee then depends on whichever code is
used. Fix: a transaction-scoped PostgreSQL advisory lock keyed by an HMAC of the
address, or a partial unique index on active challenges for `(email)` where
`consumedAt IS NULL AND supersededAt IS NULL`. Add a concurrent-start test.

**P1-2: The browser rate-limit bucket is resettable.**
`browserId` returns the `auth_cs_` cookie. A caller can call `GET /csrf` for a new
value and reset the browser budget. The IP budget remains, but the browser budget is
not a stable identity. Fix: add a separate long-lived, HttpOnly browser id cookie set
on the first passwordless interaction, or key the browser bucket to the challenge
binding and accept rotation on a new attempt. Document the chosen trade-off.

**P1-3: The grant is consumed outside the user transaction.**
A validation, conflict or database failure after consumption burns the grant and
forces a new email. Fix: consume the grant with the conditional update inside the same
transaction that creates/updates the user, after all re-resolution checks, so a
failure rolls back both.

**P1-4: No cleanup job.**
Expired/terminal challenges and grants accumulate indefinitely. Fix: a scheduled job
(guarded so only one instance runs it, or use a Redis lock) deleting terminal rows
older than 24 hours and expired rows past a small grace period. Keep rate counters for
their full windows; do not delete audit metadata early. Add an operational metric for
rows removed and failures.

**P1-5: No CSP.**
The pages have `Referrer-Policy`, `X-Robots-Tag` and `Cache-Control`, but no
Content-Security-Policy. Fix: add a CSP for the auth pages (and preferably the app)
via Next.js headers or middleware, with a nonce if inline scripts require it. Keep
`default-src 'self'`, disallow third-party analytics/images on auth pages, and test
that the confirmation page still hydrates.

**P1-6: No account-switch confirmation.**
If a different user is already signed in, a successful passwordless completion
overwrites the session cookies without an explicit switch. Fix: detect an existing
session at completion and require an explicit confirmation before replacing it, or
sign the old session out and show a clear "signed in as …" transition.

**P1-7: The prior refresh token is not revoked on a new sign-in.**
A new refresh cookie overwrites the browser's copy, but a previously captured refresh
token remains valid until expiry or rotation. Fix: read the presented refresh cookie
on successful completion and denylist its `jti` before writing the new pair; keep the
existing refresh-rotation behaviour.

**P1-8: No database CHECK on `attempts`.**
The conditional update is correct, but a future code path or manual write could store
an out-of-range value. Fix: add a CHECK constraint `attempts >= 0 AND attempts <= 5`
after confirming existing rows comply. This is a small, safe schema addition.

**P1-9: Role-inaccessible return paths are not rejected.**
`sanitizeReturnPath` is path-only; it does not know the role. A student can request
`/teacher` and be sent there, relying on the destination page's guard. Fix: at
completion, compare the requested path with the role's allowed destinations and fall
back to the role home. Keep `/admin` out of the allowlist.

**P1-10: Profile status GET is unthrottled, and `Cache-Control` is incomplete.**
`GET /profile-completion` has no IP budget, and start/resend do not set
`Cache-Control: no-store` themselves (only the completion paths and the Next.js page
headers do). Fix: add the 60/IP/minute public-read budget and set `no-store` on every
passwordless response, ideally with a controller-level interceptor.

**P1-11: Email enablement does not validate SMTP at boot.**
`MailService` throws only when a send is attempted, and the service swallows that as a
delivery failure. A deployment can be "enabled" with no usable transport. Fix: validate
the required SMTP variables when `AUTH_EMAIL_LINK_ENABLED=true`, and surface queue/worker
health in the same check.

**P1-12: Missing audit events.**
`AUTH_EMAIL_SUPPRESSED` and `AUTH_SESSIONS_REVOKED` are listed in the design but not
written. Fix: add them with the same metadata allowlist; do not include the address,
challenge handle or token hash.

### P2 — correctness and polish

- **P2-1:** `EnrollmentGrant.browserNonceHash` duplicates `tokenHash`; either add an
  independent binding nonce or document the grant as a bearer cookie (this document
  does the latter).
- **P2-2:** Department/year validation happens before the user transaction; an
  archive can race the create. Re-read inside the transaction.
- **P2-3:** `confirmationLink` reads `process.env.WEB_PUBLIC_URL` directly instead of
  `ConfigService`; use the validated configuration accessor.
- **P2-4:** `AuthMethodsConfig`'s comment says disabled methods return 404; the code
  returns 503. Fix the comment.
- **P2-5:** `GET /profile-completion` uses 404 while the POST uses 400/409; this is
  acceptable but should be documented as intentional and covered by tests.
- **P2-6:** A failed link proof has no per-challenge attempt counter; only the
  IP/browser budgets apply. The 256-bit token makes guessing infeasible, but a
  per-challenge counter would make the abuse matrix uniform.
- **P2-7:** The canary-secret redaction test and the screenshot/a11y manifest are
  still missing from the evidence set.

## 10. Remaining implementation plan

The order is chosen so that each phase either removes an enumeration/privilege risk or
adds an operational control without widening the attack surface. Each phase ends with
tests and a gate; do not enable production email sign-in before Phase 1 is complete.

### Phase 0 — Freeze and document (current change)

- Mark the design approved for implementation, not for production enablement.
- Record the verified evidence and the P0/P1 defects above.
- Keep `AUTH_GOOGLE_ENABLED=false`.
- Confirm the working tree and branch; do not push to any remote other than `origin`.

Gate: this document is committed and pushed; no code changes in this phase.

### Phase 1 — P0 closure (completed)

Implemented on 2026-11-21:

1. Added `AuthChallenge.deliverable` (migration `20261121120000_passwordless_delivery`).
   Every well-formed start after validation persists a challenge-shaped row, returns a
   handle and a fresh binding cookie, and reuses the active row on cooldown for every
   address. Suppressed rows are decoys; no mail is sent for them.
2. Added the encrypted `auth-mail` BullMQ queue and worker. Payloads are AES-256-GCM
   envelopes under `AUTH_TRANSIENT_ENCRYPTION_KEY` with a fresh nonce; three bounded
   retries; decoys are dropped; no payload or provider error is logged. Every start and
   resend enqueues, so the request path is uniform.
3. Rewrote `completeProfile` as one interactive transaction with a row-locked
   re-resolution, identity checks, admin/inactive refusal before mutation, consumption
   only after checks, and P2002-to-409 mapping.
4. `validateEnv` and `AuthMethodsConfig` reject `AUTH_GOOGLE_ENABLED=true` at boot.

Verification: Prisma schema validates; all 26 migrations apply cleanly to a fresh
disposable PostgreSQL database; `tsc --noEmit` and ESLint are clean on the touched
files; the API suite is 54 passed suites (21 skipped tests), 841 passed tests. Added
focused tests for crypto round-trip/tamper/key failure, initiation parity/cooldown/
cap fail-closed, profile conflicts/admin refusal/order/race, and Google boot refusal.
A real-HTTP run against the built API passed 39/39 checks, and the initiation-parity
run passed 18/18, so Phase 1 is complete. Production email enablement remains held
until the P1 items below close.

### Phase 2 — P1 correctness and operations

1. Serialise issuance per address (advisory lock or partial unique index) and add a
   concurrency test.
2. Replace the resettable browser key with a stable browser identifier or document and
   test the accepted trade-off.
3. Add the scheduled cleanup job with a single-runner guard and metrics.
4. Add CSP for the auth pages (and the app if feasible) without breaking hydration.
5. Add account-switch confirmation and prior-refresh-token revocation on new sign-in.
6. Add the DB CHECK on `attempts`, role-aware return-path validation, the profile GET
   rate limit, `no-store` on all passwordless responses, SMTP/queue boot validation,
   and the missing audit events.
7. Add the canary redaction test and the accessibility/screenshot evidence at the
   required external path.

Gate: P1 tests pass; a production-like standalone build serves the auth pages with the
new headers; the abuse matrix includes concurrent starts, browser-budget reset,
account switch and cleanup.

### Phase 3 — Google/OIDC (deferred feature)

Use a maintained OIDC verifier; do not hand-write JWT signature verification. The
implementation must add:

- A ten-minute, browser-bound, single-use OAuth transaction store with encrypted PKCE
  verifier, state and nonce.
- Fixed Google authorization/token/JWKS endpoints, exact redirect URI, `openid email
  profile`, no offline access.
- An inert callback page that captures `code`/`state`, scrubs the query, and requires
  an explicit POST.
- Server-side code exchange and ID-token verification (signature, issuer, audience,
  expiry/issued-at with bounded skew, nonce, nonempty subject, `email_verified`).
- Identity resolution by `(GOOGLE, subject)`, the same role/active/admin rules, and a
  linking/recovery path that never merges by email.
- Full tests with a local mock provider and the same canary/redaction rules.

Gate: the Google flag remains false until every item above is implemented, tested and
reviewed. Do not expose a button or a `/methods` true value earlier.

### Phase 4 — Production enablement

1. Apply the additive migration with both flags off.
2. Deploy the version-aware auth code; verify password/admin login and session
   revocation behaviour.
3. Configure Redis and SMTP, then set independent `AUTH_CODE_PEPPER`,
   `AUTH_RATE_KEY_SECRET` and `AUTH_TRANSIENT_ENCRYPTION_KEY` values.
4. Enable `AUTH_EMAIL_LINK_ENABLED` on a staging environment with a real sink; run the
   HTTP abuse matrix and Playwright; capture screenshots and a11y results.
5. Enable in production only after the remaining P1 gate and the staged evidence.
6. Rollback: disable issuance, let grants expire, keep the additive schema, the
   password-disable flag and the session-version checks. Never revert to authentication
   that ignores `sessionVersion` or `passwordLoginEnabled`. Queued jobs expire with the
   challenges; rotating `AUTH_TRANSIENT_ENCRYPTION_KEY` abandons undelivered jobs.

## 11. Google sign-in: deferred design (not implemented)

This section is retained so the schema and security decisions are not lost; it is not
a description of shipped behaviour.

- Google is a separate server-side OIDC flow with state, nonce and S256 PKCE, a
  browser-bound ten-minute transaction and a fixed redirect URI.
- The callback GET is inert; a deliberate POST redeems the transaction.
- The ID token must be verified with a maintained library against Google's JWKS,
  allowed algorithm, issuer, exact audience, `azp` where applicable, expiry, bounded
  issued-at skew, nonce and `email_verified === true`.
- Identity is resolved by `(provider=GOOGLE, subject)`; email is never the identity
  key. A conflicting subject or address fails safely and requires support.
- Role, activity and admin rules are re-read at completion. Administrators remain
  password-only.
- New users receive the same restricted profile grant; no partial user is created at
  OAuth start.
- Do not retain Google access/refresh/ID tokens after completion.

Prerequisites: the Phase 3 work above, a maintained OIDC verifier, encrypted
transaction storage, a local mock provider for tests, and deployer documentation for
the consent screen and callback URIs.

## 12. Acceptance evidence still required

The current evidence covers unit tests (841 passed), typechecks, lint, two real-HTTP
runs against the Phase 1 build (39 core checks and 18 initiation-parity checks), a
production standalone page check and manual browser use. Before production
enablement, add:

1. The P0/P1 tests named in section 10, including timing-distribution and concurrent
   issuance checks.
2. Playwright coverage for start, code, link, cross-device confirmation, profile
   completion, expiry, supersession, wrong browser, admin refusal and Redis outage.
3. Accessibility and 320px/390px/1280px light/dark screenshots, saved outside the
   repository at `C:\Users\berek\Desktop\lor-screens\passwordless-login\`, with a
   manifest. The directory does not currently exist.
4. Log/artifact redaction assertions with injected canary values (no code, token,
   cookie, link or raw email).
5. A production-like build and smoke run with the new CSP and queue worker.
6. A gate report distinguishing executed checks from exclusions; then stop and report.

## 13. Approval record

Approved on 2026-11-19:

- The `AuthChallenge` / `AuthIdentity` / `EnrollmentGrant` model split and the additive
  `User` columns.
- Peppered bcrypt code hashes and SHA-256 link/binding digests.
- Fragment-based link delivery, inert confirmation page and explicit POST with
  `destination: "current-browser"`; cross-device confirmation is allowed only through
  that path.
- Session versioning plus the `am` claim, including admin password-only enforcement at
  issue, refresh and access time.
- Redis-atomic limits with HMAC keys and fail-closed 503; durable address caps as a
  second layer.
- Pre-hijack recovery that invalidates an unverified password before linking.
- The restricted profile-completion grant and the `STUDENT`-only creation rule.

Not approved:

- Production enablement before the remaining P1 items in section 9 are closed and the
  staged HTTP/Playwright evidence exists.
- Enabling Google before Phase 3 is complete; the flag is refused at boot until then.
- Any rollback that removes `sessionVersion` or `passwordLoginEnabled` enforcement.
- Any change that logs or returns a code, link, token, cookie or raw email address.

Open decisions for the next review:

1. Whether the browser budget should use a stable new cookie or the rotating challenge
   binding (P1-2).
2. Whether a newcomer grant that finds an existing account should hard-fail (safest) or
   enter a fresh recovery flow after a new proof.
3. Whether the grant should remain a bearer cookie or gain an independent binding
   nonce (P2-1).
