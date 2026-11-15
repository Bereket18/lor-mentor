# Passwordless login design

Status: **proposed — awaiting approval; no implementation authorised yet**.
Date: 2026-11-15. Branch: `feat/passwordless-login`.
Base: `origin/main` at `63e31f019490fa02e0ad34256d8815e72feef9b4`.

## 1. Preconditions and existing behaviour

The support-centre tip `d2344dc` is an ancestor of the base above. The base
contains `apps/api/src/modules/auth/verification-code.ts`, its tests, the
`VerificationCode` model, and migration
`20261104120000_add_verification_codes`. Both prerequisites were checked before
creating this branch in a new worktree.

Existing verification codes verify an already-created user; they do not log the
user in. Their policy is six cryptographically random digits, bcrypt cost 10,
15-minute expiry, five guesses, 60-second resend cooldown, and five issuances per
hour. Password registration currently requires name, phone, department and year.
`User.passwordHash` is required; `VerificationCode.userId` is required.

Existing authentication issues HTTP-only access/refresh cookies. Refresh tokens
have a denylist and user revocation marker. **Access tokens currently do not check
that marker:** `JwtStrategy` loads the user but checks only existence and activity.
Immediate revocation of both token types is therefore part of the implementation,
not a capability we can assume. The existing OriginGuard also accepts missing
Origin headers; the new browser-auth POSTs need stricter CSRF handling.

## 2. Invariants and scope

- Two independently enforced server flags: `AUTH_GOOGLE_ENABLED=false` and
  `AUTH_EMAIL_LINK_ENABLED=false` by default. Hiding a button is not enforcement.
- Existing password login remains available. `/admin-login` remains password-only.
  `ADMIN` and `SUPER_ADMIN` may never obtain or refresh a Google/email-link
  session, including when a role changes during an in-flight challenge.
- Roles and privileges come exclusively from the database. New users are
  `STUDENT`; Google claims, email domains and client fields never grant a role.
- GET/HEAD never consume an email link or OAuth transaction, create a user, link
  an identity, exchange an OAuth authorization code, or establish a session.
  Completion requires a deliberate, CSRF-protected POST.
- Email initiation/resend responses are identical for existing, unknown,
  unverified, inactive and administrator addresses. No account-existence field,
  purpose, masked account profile, or different delivery result is exposed.
- A link and its six-digit code are alternative proofs for one challenge. A
  successful POST consumes both, atomically and exactly once.
- No plaintext credentials, codes, tokens, cookies, OAuth parameters or sign-in
  links in application, proxy, access, audit, telemetry or test-report logs.
- Step 1 adds this design only. Migrations, code, dependencies, gates and
  screenshots belong to Step 2 after explicit approval.

## 3. User journeys

### 3.1 Email link and code (one sign-in/sign-up entry point)

1. On `/login`, choose **Continue with email**, enter an email and submit.
   Normalise using the existing trim/lowercase utility; do not remove Gmail dots
   or plus suffixes. Validate shape/length independently of account existence.
2. Browser obtains a CSRF bootstrap, then POSTs email and an optional return path.
   Server generates a 256-bit browser-binding nonce in an HTTP-only cookie and
   returns an opaque random challenge handle with the generic 202 response.
   Every well-formed request gets the same response/cookie shape, even if delivery
   is suppressed. A handle alone is never authentication.
3. In a bounded background delivery path, issue an eligible challenge and send
   the same email template for login and signup. Existing users use purpose
   `LOGIN`; absent users use `SIGNUP`. Purpose is server-selected and private.
   Inactive and admin users receive no sign-in credential. Apply the same
   per-address budgets and generic outward behaviour to all addresses.
4. Show **Check your email** with one six-digit input, **Continue**, **Send a new
   email** (available after 60 seconds), and **Use a different email**. No polling
   can automatically log this browser in when another device opens the link.
5. Code route: submit `{challengeId, code}` from the original browser. Require
   its nonce cookie and CSRF token; compare the code only within that challenge.
   Missing/wrong browser is rejected, even with the correct code. Do not accept
   email-plus-code as an unbound fallback.
6. Link route: open `WEB_PUBLIC_URL/auth/email/confirm#challenge=<id>&token=<secret>`.
   The fragment keeps the secret out of normal HTTP access logs and referrers.
   A minimal first-party page captures it in memory and immediately removes it
   from the address bar with `history.replaceState`. No local/session storage,
   analytics, third-party resources, prefetch, or automatic redemption.
7. The confirmation page always offers:
   - **Continue here** — “Sign in on this device. Only continue if you requested
     this email.” Clicking POSTs the link proof, CSRF token, and explicit
     `destination: current-browser` consent.
   - **Enter this code on your original device** — “Use the six-digit code in
     your email on the device where you started. Leave this page open or close
     it; opening the link does not sign you in.” This choice does not consume
     anything. The numeric code is in the email; it cannot be recovered from its
     stored hash and is not included in the URL or returned by a preview API.
8. Same-browser link completion validates the original binding. Cross-device
   completion deliberately permits a missing/different original binding **only
   on the link-confirm POST**, after an explicit click, valid high-entropy link
   proof and CSRF validation for the receiving browser. Create a fresh receiving
   browser binding; never transplant the original cookie. This narrowly scoped
   exception enables “Continue here”; it does not relax code verification.
9. Recheck user existence, active state, role and current credentials in the
   consume transaction. Existing verified users receive a new session. Unknown
   users receive only a restricted profile-completion grant. Existing unverified
   password accounts follow the takeover-recovery policy in section 4.
10. The other device's code/link is now invalid. No success notification or
    session is delivered to the initiating device after cross-device completion.

Resend uses the bound handle and issues a new challenge, preserving the validated
return path. It supersedes all earlier active email-auth challenges for the
normalised address (across LOGIN/SIGNUP), not email-verification/reset codes.
Issuance and supersession are serialised per address. Old links/codes fail with
the same generic message. Delivery failure does not revive a superseded proof;
the user can retry after the cooldown. This fail-closed rule avoids restoration
races and is stated in troubleshooting.

### 3.2 Google

1. **Continue with Google** performs a CSRF-protected POST to start OAuth. Generate
   independent random state, OIDC nonce, browser-binding nonce and PKCE verifier;
   PKCE is S256 only. Store a ten-minute, browser-bound server transaction. Request
   only `openid email profile`, with account selection and no offline access.
2. Navigate to the fixed Google authorization endpoint. Use an exact registered
   redirect URI; do not derive issuer, callback, token endpoint or JWKS location
   from request headers, client input, or token `jku`/`x5u` values.
3. Google returns to the web `/auth/google/callback`. Its GET renders a minimal
   page; it does not redeem the authorization code or log in. Capture `code` and
   `state` in memory, scrub the query immediately, and show **Continue with
   Google**. Provider errors show **Google sign-in was not completed. Try again
   or use another method.** No raw provider diagnostics reach the UI.
4. An explicit click POSTs code/state with the bound cookie and CSRF token to the
   API. Atomically claim the OAuth transaction, compare state, enforce expiry
   and browser binding, and exchange the code server-side using the stored PKCE
   verifier and configured client credentials. A failed exchange burns the
   transaction; restart rather than allowing replay.
5. Verify the ID-token signature with Google's trusted JWKS, allowed algorithm,
   issuer, exact audience, `azp` when applicable, expiry, issued-at (bounded clock
   skew), nonempty subject, transaction nonce, and **`email_verified === true`**.
   A browser-supplied decoded token or email is never accepted as proof.
6. Resolve by `(provider=GOOGLE, subject)` first, then apply section 4 for first
   linking. Read role/activity again before issuing any grant/session. Existing
   identity subject changing its email does not silently merge accounts or
   rewrite the local address. Address conflicts fail safely and require support.
7. Existing eligible users receive a fresh session. New users go to profile
   completion. Delete transient OAuth secrets; do not retain Google access,
   refresh or ID tokens. A suggested display name is editable plain text only.

### 3.3 New-user profile completion

- Proof produces a random, hashed, HTTP-only, browser-bound ten-minute enrollment
  grant. It is not an access/refresh JWT and cannot call ordinary authenticated
  endpoints. Reloading the page may read its safe status; expiry requires sign-in
  again. Do not create a partial User merely on an email request or OAuth start.
- `/complete-profile` asks for full name (2–100 characters), phone (current
  registration constraints), department and academic year. Server verifies that
  department/year exist, are active, and the year belongs to the department.
  Email is locked to the verified grant. Role, user ID, verified flags, password,
  subscription and privileges are rejected as unexpected inputs.
- On POST, consume the grant and create the verified STUDENT in one transaction.
  Generate a random unusable password hash and set `passwordLoginEnabled=false`.
  Mark `profileCompletedAt`, attach Google identity if applicable, then issue new
  session cookies and navigate to the validated return path/default dashboard.
- If an account appeared meanwhile, re-resolve it under the same identity,
  administrator, linking and recovery rules. Never overwrite another profile or
  reuse proof to escalate privileges. Unique-email/subject races have one winner.
- Existing users with completed profiles skip this page. Unverified accounts
  recovered from pre-hijack must reconfirm name/phone/academic details; do not
  trust the preparer's values. Grant permits only that user's profile completion.

## 4. Linking, pre-hijack recovery and sessions

| Account state after verified proof | Decision |
|---|---|
| ADMIN or SUPER_ADMIN, including an already-linked subject | Refuse Google/email completion; no identity mutation, verification, revocation or session issuance. Password admin login remains the route. |
| Inactive user | Refuse generically; do not reactivate. |
| No user | Restricted enrollment grant; new STUDENT only after valid profile POST. |
| Verified password user, no Google identity | Verified matching Google email may link once; retain password and local role. Existing email proof may log in. |
| Unverified password user | Treat the old password as attacker-controlled: atomically replace its hash with a hash of a discarded random secret, disable password login, clear reset tokens, supersede old verification/auth challenges, increment session version, and mark email verified. Google identity is linked only after this invalidation. Require profile reconfirmation. Apply the same recovery to email proof. |
| Subject already linked to another user, or different Google subject already linked to this user | Refuse; no automatic merge, transfer, or overwrite. |

Add `User.sessionVersion Int @default(0)` and include it in **all newly issued**
access and refresh JWTs. Every API access and refresh checks the current database
version; missing version is interpreted as zero only while the user's version is
zero. Incrementing it revokes old access and refresh tokens immediately, including
legacy tokens. Continue refresh rotation/denylisting. Revocation and account
recovery happen in the same DB transaction; Redis failure cannot resurrect an old
version. Password reset also increments the version. Do not cache stale versions.

Add JWT authentication method (`PASSWORD`, `GOOGLE`, `EMAIL_LINK`) and reject
non-password sessions for administrator roles at access and refresh time, even
after promotion. Legacy missing method means PASSWORD only for existing legacy
tokens; unsigned/client input never sets it. Role guards continue reading the
database role. Grant/session completion rechecks role within the locked user
transaction. Promotion/version changes must be included in the abuse matrix.

Successful authentication overwrites access/refresh cookies with fresh tokens,
new refresh JTI and current version, revokes any presented prior refresh token,
and clears challenge/enrollment cookies. Never adopt a caller-supplied session ID.
Browser binding is not a session. An existing session for a different user must
show an explicit account-switch confirmation before replacement.

Password reset remains the explicit route to setting a password for a recovered
or passwordless account; successful reset sets `passwordLoginEnabled=true` and
revokes sessions. Turning method flags off does not resurrect invalidated
passwords. Once recovery/session-version enforcement is deployed, rollback must
retain those checks; reverting to pre-version authentication is unsafe.

## 5. Additive data model

Choose a separate **AuthChallenge**, rather than extending VerificationCode:
signup must exist before a User, and login tokens must never be accepted as email
verification or password-reset codes. Reuse random-code/hash helpers, not the
existing verification consumption endpoint.

| Model / field | Proposed semantics |
|---|---|
| AuthChallenge.id | Unguessable random handle (at least 128 bits). |
| purpose | New enum `LOGIN`, `SIGNUP`; selected server-side, never disclosed at initiation. |
| email / userId? | Normalised destination; nullable user FK; re-resolve at consumption. |
| linkTokenHash | Unique SHA-256 digest of independently generated 256-bit link secret. |
| codeHash | bcrypt cost 10 over an HMAC-SHA-256 of `challengeId + code` under a dedicated pepper. Reuse existing six-digit generation and bcrypt primitives; no bare fast hash of six digits. |
| browserNonceHash | SHA-256 of a random 256-bit nonce; plaintext only in HTTP-only cookie. |
| attempts | Integer default zero, constrained 0–5. Reserve an attempt under lock before expensive comparison; concurrent requests cannot exceed five guesses. |
| expiresAt / consumedAt / supersededAt / createdAt | 15-minute fixed lifetime; nullable terminal timestamps. Expiry is checked on every claim, not dependent on cleanup. |
| returnPath | Canonical, server-allowlisted local path captured at initiation. |
| AuthIdentity | id, userId, provider=GOOGLE, subject, createdAt. Unique `(provider, subject)` and `(userId, provider)`. Email is not the provider identity key. |
| EnrollmentGrant | id, unique tokenHash, email, optional userId, method, optional Google subject, browserNonceHash, returnPath, expiresAt, consumedAt, createdAt. No password, link token or Google token. |
| User additions | `passwordLoginEnabled Boolean @default(true)`, `sessionVersion Int @default(0)`, `profileCompletedAt DateTime?`. Existing passwordHash remains required; new passwordless users receive a discarded-random-secret bcrypt hash. |
| OAuth transaction (Redis, 10-minute TTL) | Hash-keyed random handle, state hash, nonce hash, browser hash, encrypted PKCE verifier, validated return path, pending/claimed state. Atomic claim; no refresh token storage. |

Indexes: challenge `(email, createdAt)`, `(userId, purpose, createdAt)`, expiry and
unique link hash; enrollment expiry/token hash; identity constraints above. Use
transaction-scoped per-normalised-address locks for issuance/consumption/signup
races, and user row locks for recovery. Recheck expiry, supersession, attempts,
role/activity and proof in the final compare-and-consume transaction. Exactly one
of code/link/concurrent submissions may commit. Failure must never issue cookies.

Add tables/enums/columns/indexes only; no drops, renames, destructive rewrites or
nullability changes to existing columns. Existing users with valid registration
details are treated as complete without a mandatory bulk update. Old verification
and reset purposes remain isolated. Apply the new migration first with flags off.
Daily cleanup removes expired/terminal challenges and enrollment grants after
24 hours; rate counters persist for their full windows independently of cleanup.
Security audit metadata follows the existing audit retention policy; do not keep
expired credential hashes indefinitely. Test fixtures use a disposable database.

## 6. Endpoint contract

API prefix is `/api/v1/auth`. Browser UI and transient cookies use the web-origin
API proxy so new binding cookies can be host-only. Verify proxy preservation of
Origin/CSRF headers and Set-Cookie; do not widen `COOKIE_DOMAIN` for new cookies.
All responses here are `Cache-Control: no-store`; pages also use
`Referrer-Policy: no-referrer` and a restrictive CSP.

| Method and path | Input / binding | Response / effect |
|---|---|---|
| GET `/methods` | None | 200 `{googleEnabled,emailLinkEnabled}`; flags only, never account-dependent. |
| GET `/csrf` | Anonymous browser | 200 CSRF token plus opaque bootstrap cookie; no authentication or proof consumption. |
| POST `/email/start` | email, optional returnTo; CSRF | 202 `{message,challengeId,retryAfterSeconds:60}`; opaque handle/cookie regardless of eligibility or suppressed mail. |
| POST `/email/resend` | challengeId; original binding, CSRF | Same 202 shape with a fresh opaque handle; eligible issue supersedes old challenge. |
| POST `/email/code` | challengeId, six-digit code; original binding, CSRF | 200 next step on success, otherwise uniform 400. Atomically consumes on success. |
| POST `/email/confirm` | challengeId, linkToken, destination=current-browser; receiving-browser CSRF | 200 next step on success; same uniform 400 otherwise. Explicit cross-device exception described above. |
| POST `/google/start` | optional returnTo; CSRF | 200 fixed-provider authorization URL; sets binding, creates transaction. Response is never logged. |
| POST `/google/complete` | authorization code, state; original binding, CSRF | 200 next step after claimed transaction, exchange, verified ID token and policy checks; generic 400 on rejection. |
| GET `/profile-completion` | Bound enrollment cookie | 200 locked email and safe completion status, or generic 401. No consumption; only proof-holders see email. |
| POST `/profile-completion` | fullName, phoneNumber, departmentId, academicYearId; enrollment binding, CSRF | 200 session result; 400 field errors for this authenticated grant, 401 invalid grant, 409 safe conflict/restart if not resolvable. |

Success result is `{next:"signed_in",redirectTo}` with session cookies or
`{next:"complete_profile",redirectTo:"/complete-profile"}` with a restricted grant.
Never send access/refresh/link tokens back in JSON. Differences after possession
of valid proof may reveal that user's next step; initiation cannot reveal account
existence. Invalid/expired/used/superseded/wrong-browser/exhausted/admin/inactive
email proofs share: **“We couldn't complete sign-in. Request a new email and try
again.”** No remaining-attempt count or account eligibility detail.

UI GET routes: `/login`, `/auth/email/confirm`, `/auth/google/callback`,
`/complete-profile`; none consumes credentials. Callback query redaction is
required at the web server, proxy and error collector before Google is enabled.
No auto-submit on page load or hydration, including callback pages.

Disabled method POSTs return the same 404 feature-unavailable envelope independent
of email; disabling applies to in-flight completions too. Existing issued sessions
continue under normal policy; flags are issuance switches, not global logout.
Profile grants remember their method and are refused if that method is disabled.

## 7. Binding, redirects, CSRF and rates

Production binding/bootstrap/enrollment cookies: `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/`, no Domain, `__Host-` prefix; distinct purpose-specific
names. Development HTTP uses clearly separate non-prefixed names. Lifetimes are
bounded by the corresponding 10/15-minute transaction. Rotate binding on a new
attempt; explain that starting again supersedes the earlier browser attempt.
No tokens in localStorage. Cross-device completion obtains its own CSRF bootstrap.

All new browser POSTs require JSON, an exact allowed Origin (missing/null is
rejected), a synchronizer token tied to the bootstrap cookie, and consistent
Fetch-Metadata when present. SameSite and CORS are defense in depth. Trusted
same-origin proxy must preserve/validate the original Origin, never manufacture
trust from arbitrary forwarded headers. OAuth state is unpredictable, bound,
single-use and independent of CSRF token; nonce and PKCE are also mandatory.

Return targets are parsed once and stored server-side. Default `/dashboard` for
students, `/teacher` for existing teachers. Initial exact path allowlist:
`/dashboard`, `/courses`, `/support`, `/support/tickets`, `/profile`, `/teacher`.
Reject schemes, protocol-relative URLs, backslashes, control characters,
credentials, encoded separator tricks, query strings and fragments. No prefix
matching and no `next` chaining. Reject inaccessible role destinations, falling
back to the role home. Revalidate on completion. `/admin` is never a destination
for these methods. OAuth callback URI is a separate fixed configured absolute URL.

New limits are enforced atomically across instances using Redis plus durable DB
attempt/issuance constraints. Do not rely solely on existing in-process Nest
throttling. Keys for addresses use a dedicated keyed HMAC, never raw email.

| Action | Initial policy |
|---|---|
| Email start/resend | 60-second address cooldown; 5 emails/address/hour and 10/day; 10 requests/IP/minute and 50/hour. Same buckets for unknown/admin addresses. |
| Code verification | At most 5 submitted comparisons/challenge; 20/address/hour across resends; 30/IP/10 minutes and 10/browser/10 minutes. Wrong browser never bypasses IP/browser budgets. |
| Link confirmation | 10/browser/10 minutes and 30/IP/10 minutes; random invalid handles count too. A failed link proof does not reset any code budget. |
| Google start / completion | 10/browser/10 minutes; 30/IP/10 minutes; 1 completion claim per transaction. |
| Profile POST | 5/grant/10 minutes; 30/IP/10 minutes; one successful consumption. |
| CSRF bootstrap / public reads | 60/IP/minute in addition to global limits. |

Address delivery caps/cooldowns always return generic 202; an IP/browser-wide
limit may return generic 429 with Retry-After independent of existence. Missing
proof paths perform a dummy bcrypt comparison where needed, with bounded work
after throttling. Initiation schedules work without waiting for SMTP/account
lookup; equalise response work and test timing distributions rather than claiming
perfect constant network latency. Bound queue/backlog and CPU concurrency. If
Redis is unavailable, fail new authentication uniformly with 503, not unbounded
attempts; keep existing password/admin operations under their current policy.
Do not permanently lock accounts based on anonymous email traffic.

Mail delivery uses a restricted TTL queue item encrypted at rest under a dedicated
key (including email/link/code), never plaintext BullMQ job data. Retain jobs only
for bounded retries before challenge expiry; no failed-job payload logging.
Decrypt only in worker memory and delete on delivery/expiry. Mail-sink content
is intentionally readable only in disposable local tests and is not a log.

## 8. Threat model and mitigations

| Threat | Required mitigation / residual boundary |
|---|---|
| Mail scanners, preview bots, browser prefetch | GET/HEAD and hydration are inert; fragment proof; explicit POST button; no auto-login. A scanner that actively submits forms cannot be perfectly distinguished from a person; bind/CSRF and explicit confirmation reduce this risk. |
| Email enumeration | Same initiation/resend status, body shape, cookie shape, template and budget behaviour; opaque handles; no eligibility preview; asynchronous bounded mail work and timing tests. Existing legacy password registration's duplicate-email response is outside this method's guarantee and must not be called by the new flow. |
| Six-digit brute force / distributed guessing | Secure unbiased generation incl. leading zeroes, peppered slow hash, short expiry, bound original browser, atomic five-comparison cap, cross-resend address budget and distributed IP/browser limits. |
| Pre-hijacked password registration / Google linking | Require verified Google email; verified local email may link; unverified local password and all sessions are invalidated before linking. Clear reset proofs and reconfirm untrusted profile. |
| Admin bypass, role spoofing | DB role checks at issue, consume, profile creation, access and refresh. Reject supplied role fields; domain/Google profile is never authority. |
| OAuth login CSRF / mix-up / interception | Explicit start POST, exact state + browser binding, nonce, S256 PKCE, trusted issuer/endpoints, server ID-token verification and exact callback. Wrong browser burns no other user's session. |
| Link login CSRF / unsolicited login | Explicit confirmation wording, new-browser CSRF and account-switch confirmation. Link possession remains a bearer capability; do not use forwarded/shared links. |
| Open redirects | Exact canonical local-path allowlist; no client callback URLs; role-aware revalidation. |
| Session fixation / stale access JWT | Rotate cookies/JTI, revoke previous refresh, DB sessionVersion enforced on both token types. No sessions from proof GETs or enrollment grants. |
| Replay, races, expired/superseded proof | Locked atomic consume/claim and unique constraints; one winner across both proof modes/devices; server clock expiry, no client clock trust. |
| Token leakage / XSS / observability | Fragment email secrets, immediate URL scrub, no-store/no-referrer/CSP, escaped templates/profile text, no third parties or analytics on auth pages, redact OAuth query and all secret bodies/headers before logging. |
| Queue/database read | Hash proofs; encrypt transient mail/PKCE secrets with separate keys; least-privilege access and short retention. Mailbox compromise still permits email login; this feature is not MFA. |
| Recovery downgrade | Password-disable and session-version checks stay active even with both method flags off; prevent rollback to code ignoring them. |

## 9. Audit events and logging contract

Use the existing AuditLog with explicit metadata allowlists. Events:
`AUTH_EMAIL_REQUESTED`, `AUTH_EMAIL_SUPPRESSED`, `AUTH_EMAIL_DELIVERY_FAILED`,
`AUTH_CHALLENGE_REJECTED`, `AUTH_CHALLENGE_CONSUMED`, `AUTH_CHALLENGE_SUPERSEDED`,
`AUTH_RATE_LIMITED`, `AUTH_GOOGLE_STARTED`, `AUTH_GOOGLE_REJECTED`,
`AUTH_IDENTITY_LINKED`, `AUTH_PREHIJACK_RECOVERED`, `AUTH_SESSIONS_REVOKED`,
`AUTH_PROFILE_COMPLETED`, `AUTH_PASSWORDLESS_LOGIN_SUCCEEDED`,
`AUTH_PASSWORDLESS_ADMIN_REFUSED`.

Metadata may contain method, internal purpose, coarse reason enum, request ID,
safe internal audit correlation ID, timestamp, user ID after resolution and
version change. Anonymous actor remains null. Use keyed email pseudonym only
where needed for abuse correlation; restrict IP access/retention under existing
audit policy. Do not use a challenge/token hash or public challenge handle as the
audit correlation ID. Rejection reasons are internal, never reflected to users.
Never serialise DTOs, request URLs/query, headers, SMTP payloads, provider response
bodies, cookies or exception objects containing secrets. Tests inject canary
secrets and assert they are absent in captured application/proxy/test logs.

## 10. UI states and email templates

### UI and accessibility

- Login idle: password form plus only enabled methods. Labels: **Continue with
  Google**, **Continue with email**; admin form shows neither.
- Sending: **Sending your sign-in email…**; disable duplicate submit, preserve
  input. Success: **If this address can use email sign-in, you'll receive a link
  and a six-digit code. You can also create your student account this way.**
- Waiting: **Check your email**; **Six-digit code**; **Continue**; **Send a new
  email**; **Use a different email**. Explain “A new email replaces the previous
  link and code.” Support password-manager paste/one-time-code autocomplete.
- Use one text input (`inputmode=numeric`, six-character validation), not six
  inaccessible focus traps. Leading zeroes survive. Never announce the code.
- Confirmation copy is the two choices in section 3.1; no page-load submission.
  Shared-device hint: **Only continue here on a device you trust.**
- Failed/expired/used/wrong-browser: generic proof error from section 6, with
  **Request a new email**. Browser-specific guidance is static: **If you started
  on another device, enter the code there or open the email link here.**
- Throttled: **Too many requests. Please wait and try again.** Delivery failure
  is not account-specific: waiting page offers resend after the cooldown.
- Profile: **Finish setting up your account**, locked email, explicit labels,
  associated field errors and **Create student account** (or **Confirm profile**
  for recovery). Session success navigates only after server confirmation.
- Keyboard operation and visible focus; status/error live regions; focus errors
  and confirmation heading appropriately; 44px touch targets; no colour-only
  state; reduced motion; ≥4.5:1 normal text and ≥3:1 meaningful control/focus
  boundaries. Light/dark layouts at 320px without horizontal scrolling.
- No auth secrets in screenshots, traces, videos or HTML attachments. Capture
  UI with synthetic placeholders, not usable challenge links or mailbox codes.

### Shared plain-text email (LOGIN and SIGNUP)

Subject: **Your Lor Mentor sign-in link and code**

```text
Sign in to Lor Mentor

Your six-digit code is:

    {{code}}

Enter this code on the device where you started, or open this link:
{{confirmationLink}}

The link opens a confirmation page. Choose “Continue here” to sign in on that
device, or enter this code on your original device. Opening the link alone
does not sign you in.

Both expire in 15 minutes and can be used once. A newer email replaces them.
Never share this email, link or code. Lor Mentor staff will never ask for them.
If you did not request this, ignore this email; no sign-in has occurred.

Lorcan Medical College
```

### HTML email skeleton

```html
<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:520px">
  <h1 style="font-size:24px">Sign in to Lor Mentor</h1>
  <p>Your six-digit code is:</p>
  <p style="font-family:monospace;font-size:34px;font-weight:bold;letter-spacing:6px;background:#f1f5f9;padding:18px;text-align:center">{{escapedCode}}</p>
  <p>Enter this code on the device where you started, or open the confirmation page.</p>
  <p><a href="{{escapedConfirmationLink}}" style="display:inline-block;background:#0b5f58;color:#fff;padding:12px 18px">Open sign-in confirmation</a></p>
  <p>Choose “Continue here” to sign in on this device, or enter this code on your original device. Opening the link alone does not sign you in.</p>
  <p>Both expire in 15 minutes and can be used once. A newer email replaces them.</p>
  <p>Never share this email, link or code. Lor Mentor staff will never ask for them. If you did not request this, ignore this email; no sign-in has occurred.</p>
  <p>Lorcan Medical College</p>
</div>
```

Send multipart text/HTML using existing MailService; escape all interpolated
values and derive links only from validated configuration. No user-supplied
subject/HTML, remote images, tracking pixels, click tracking or provider link
rewriting. Prominent selectable code remains usable when a mail client strips
fragments or changes links. SMTP failure logs a safe category only.

## 11. Configuration and deployment plan (Step 2)

| Variable | Default / contract |
|---|---|
| `AUTH_GOOGLE_ENABLED` | `false`; strict boolean, enforced server-side. |
| `AUTH_EMAIL_LINK_ENABLED` | `false`; strict boolean, enforced server-side. |
| `GOOGLE_CLIENT_ID` | Required only with Google enabled; exact audience. |
| `GOOGLE_CLIENT_SECRET` | Required only with Google enabled; secret store, never NEXT_PUBLIC. |
| `GOOGLE_REDIRECT_URI` | Exact `WEB_PUBLIC_URL/auth/google/callback`; HTTPS in production, explicitly permitted loopback in disposable tests. |
| `AUTH_CODE_PEPPER` | Independent ≥32 random bytes; required with email enabled; rotation invalidates pending codes. |
| `AUTH_RATE_KEY_SECRET` | Independent ≥32 random bytes; required with either method; HMAC address keys; coordinated rotation must not reset effective budgets. |
| `AUTH_TRANSIENT_ENCRYPTION_KEY` | Independent 32-byte encryption key for AEAD mail jobs/PKCE, required with either method; fresh nonce per ciphertext; rotation expires pending transactions safely. |
| `AUTH_POST_LOGIN_PATHS` | Exact subset of the code-reviewed local-path allowlist in section 7; unset uses that list; invalid entries fail startup. Cannot add arbitrary external URLs. |
| Existing `WEB_PUBLIC_URL`, `API_PUBLIC_URL`, `CORS_ORIGIN`, `TRUST_PROXY` | Explicit trusted deployment URLs/proxies; never reflect Host or untrusted forwarded host. |
| Existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Required working mail transport when email enabled. Local sink uses dummy credentials; production secrets injected by deployer. |
| Existing `REDIS_HOST`, `REDIS_PORT`, JWT and database settings | Reuse established services; new auth limit/transaction operations fail closed. |

TTL/attempt/rate numbers are central reviewed constants, not freely weakened by
environment variables. Production issuer/authorization/token/JWKS endpoints are
fixed Google endpoints. Mock-provider injection is available only to a dedicated
test bootstrap that refuses production and non-disposable databases; no public
request or production environment override selects arbitrary issuers.

Step 2 deployer docs will include Google Cloud OAuth consent-screen configuration,
Web application credentials, exact development/staging/production callback URIs,
test users/publishing/domain verification as applicable, secret injection, and
the `openid email profile` scopes. No real keys are needed for implementation
tests. Expose only effective method booleans to the browser via `/auth/methods`.

Troubleshooting rows: missing/mismatched redirect URI; unverified Google email;
state/nonce/PKCE or browser-binding failure; blocked cookie/proxy header; delayed
mail/spam; fragment-stripping email client (use code); expired/superseded proof;
rate limiting; Redis outage; admin refusal (use password login); identity conflict;
incomplete profile; callback access-log redaction; flags off. Never request that a
user paste a code, URL or token into support logs.

Rollout: additive migration → deploy version-aware auth and both flags off →
mock-provider/local-sink gates → deployer validates configuration and logging →
enable one method at a time. Rollback disables issuance and expires grants while
retaining password-disable/session-version enforcement and additive schema.
No new library in Step 1. Step 2 must justify any library, pin its exact version,
update lockfile and `THIRD_PARTY_NOTICES.md`, and use a maintained OIDC verifier
rather than hand-writing JWT signature verification.

## 12. Approval gate and implementation acceptance plan

After design approval, implement only on this branch and push only to `origin`.
Use no real keys, `.env` files, system/service edits or non-disposable databases;
no GitHub/gh operations or merge requests. Runtime variables are process-scoped.

Required Step 2 evidence:

1. Unit tests for flags, DTO whitelists, email normalisation, code generation and
   hashes, expiry, counters, redirects, ID-token claims, linking and revocation.
2. Real-HTTP authorization/abuse matrix against migrated disposable PostgreSQL
   and Redis: enumeration incl. response/cookie/timing behaviour; distributed and
   parallel guessing; replay and simultaneous link/code; scanner GET/HEAD;
   wrong browser; explicit cross-device link success without original-browser
   login; expired and superseded proofs; both admin roles; inactive/changed roles;
   verified/unverified linking; conflicting subject; password/reset invalidation;
   rejection of old access AND refresh tokens; enrollment scope; CSRF/state/nonce/
   PKCE failures; feature flags disabled mid-flow; dependency/delivery failure.
3. Playwright with a local mocked Google provider and local mail sink; exercise
   actual redirect/exchange/signature verification and email delivery. Cover
   registration, recovery, account-switch and cross-device browser contexts.
4. Accessibility and 320px overflow checks in both themes for login, code entry,
   email confirmation, Google confirmation, error and profile-completion states.
   Screenshots at 390/1280px in light/dark saved outside the repository under
   `C:\Users\berek\Desktop\lor-screens\passwordless-login\`, with a manifest.
5. Prisma validation/migration, API/web typechecks, lint, unit and real-HTTP
   suites, production build, and Playwright against dev and production with real
   commands/exit codes/counts/skips. Redaction assertions cover logs and artifacts.
6. Deployer docs, exact dependency notices where needed, clean branch-only push
   to origin, and a gate-evidence report outside the repository distinguishing
   executed checks from exclusions. Then report results and wait.

**Current approval requested:** the separate AuthChallenge model, inert GET plus
explicit POST confirmation (including Google callback), explicit cross-device
link exception, pre-hijack recovery/session-version policy, and restricted
profile-completion flow described above. Implementation starts only after approval.
