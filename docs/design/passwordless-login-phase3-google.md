# Phase 3 — Google/OIDC sign-in: implementation plan

Status: **draft for review** (nothing implemented). Branch: `feat/passwordless-login`.
Companion documents: [`passwordless-login.md`](./passwordless-login.md) (as-built design,
section 9 Phase 3 and section 11 deferred design) and
[`passwordless-login-gate-report.md`](./passwordless-login-gate-report.md) (Phase 2 evidence).

The Google flag (`AUTH_GOOGLE_ENABLED`) stays **false** and is still refused at boot until
every slice below is complete, tested and reviewed. This document does not change that; it
is the plan to lift it.

## 1. Scope

Deliver a server-side Google OIDC authorization-code flow with PKCE that:

- issues a session exactly like the email-link flow (same `AuthMethod.GOOGLE` `am` claim,
  same `sessionVersion` check, same admin/active rules);
- creates no user at OAuth start and never merges an identity by email;
- is switchable, fails closed, and stays off by default.

Non-goals: generic non-Google OIDC providers; refresh-token / offline access; retaining any
Google token after completion; a generic "connect any identity provider" abstraction.

## 2. Verified current state (what already exists)

| Piece | State |
|---|---|
| `AuthMethod.GOOGLE`, `AuthProvider.GOOGLE`, `AuthIdentity(provider, subject)` | Present in `apps/api/prisma/schema.prisma` (`@@unique([provider, subject])`, `@@unique([userId, provider])`). No migration needed for these. |
| `EnrollmentGrant.googleSubject`, `.method` | Present; the newcomer grant already carries them. |
| `AuthService.issueSession(userId, method)` | Present; refuses admin roles for non-password methods (`auth.service.ts:~490`). Reusable as-is. |
| `AuthMethodsConfig`, `GET /auth/methods` | Present; `googleEnabled` currently throws at boot when true (`auth-methods.config.ts`), and `env.validation.ts:~446` repeats the refusal. |
| `AuthMailCryptoService` (AES-256-GCM envelope, `AUTH_TRANSIENT_ENCRYPTION_KEY`) | Present; reusable to encrypt the PKCE verifier and nonce at rest. |
| `AuthRateLimitService`, `NoStoreInterceptor`, CSRF cookie/guard, browser-id cookie | Present; reused for the new endpoints. |
| `auth-cleanup.ts` sweep | Present; must be extended to purge expired OAuth transactions. |
| `@nestjs/jwt` → `jsonwebtoken@9.0.3` (CJS) | Present (transitive) with `@types/jsonwebtoken`. |
| A maintained OIDC verifier | **Not present.** `jose` 6 is in the tree but is ESM-only and cannot be `require`d from the CommonJS Nest build. `google-auth-library`, `jwks-rsa`, `openid-client` are absent. This is open decision **Q1**. |

## 3. Design

### 3.1 Transaction store (new additive model)

`AuthOAuthTransaction`, one row per start, mirroring the `AuthChallenge` handle pattern
(the application generates a 256-bit `id`; the DB never invents it):

- `id` — 256 random bits, generated server-side. This value **is** the OAuth `state`.
  Unlike section 11's wording ("encrypted … state"), the state is *not* stored
  encrypted: it is a public round-trip value and the row handle, exactly like
  `AuthChallenge.id`. Its security comes from 256-bit entropy, the browser-binding
  cookie and single use — encryption would add nothing.
- `browserNonceHash` — SHA-256 of a random browser-binding nonce that lives only in an
  HttpOnly cookie, so a stolen `state` alone cannot redeem the transaction.
- `encryptedVerifier`, `encryptedNonce` — the S256 PKCE verifier and the OIDC `nonce`,
  sealed with the existing transient-encryption envelope. Plaintext exists only in the
  row's short life and is decrypted once at callback.
- `returnPath` — validated local path, revalidated at completion.
- `expiresAt` (10 minutes), `consumedAt`, `createdAt`.

No email, no subject, no user reference: at start we know nothing verified about the caller.
Consumption is a single conditional `updateMany` (`consumedAt: null` **and**
`expiresAt > now`) so two concurrent callbacks cannot both redeem.

### 3.2 Endpoints

| Method | Path | Behaviour |
|---|---|---|
| GET | `/auth/google/start?returnPath=` | Rate-limited. Creates a transaction, sets the binding cookie, **302** to Google's authorization URL with `state=<id>`, `code_challenge` (S256), `nonce`, fixed scope `openid email profile`, no `access_type=offline`. |
| POST | `/auth/google/callback` | Body `{ code, state }`. Authenticated by the binding cookie + single-use state (the OAuth CSRF defence), **not** by the generic `x-auth-csrf` header; documented as such. Loads and consumes the transaction, exchanges the code, verifies the ID token, resolves identity, and returns the same `AuthCompletion` shape as the email flow. |
| (web) | `/auth/google/callback` page | Inert Next.js page: reads `code`/`state`, scrubs the query via `history.replaceState`, then POSTs to the API. Holds no secret and renders nothing sensitive. |

The API's `redirect_uri` sent to Google is exactly
`${WEB_PUBLIC_URL}/auth/google/callback`; the same value is used for the code exchange.
It is fixed and must be registered verbatim on the Google client.

### 3.3 Verification

The ID token is verified by a maintained library against Google's JWKS (never hand-written
signature code). Required checks: signature and `alg` allow-list, issuer
(`https://accounts.google.com` / `accounts.google.com`), exact audience = the client id,
`azp` where present, `exp`/`iat` with bounded skew, `nonce` equals the transaction nonce,
non-empty `sub`, and `email_verified === true`. The `sub` is the only identity key.

### 3.4 Identity resolution (never merge by email)

1. `AuthIdentity` found for `(GOOGLE, sub)` → load the user; re-read role/`isActive`/
   `passwordLoginEnabled`; administrators are refused (password-only); issue the session.
2. No identity, and no local user with the verified email → issue an `EnrollmentGrant`
   (`method = GOOGLE`, `googleSubject = sub`, `email` from the verified claim). The same
   restricted profile-completion flow creates one `STUDENT`.
3. No identity, but a local user **does** hold that email → **fail safely** (generic
   message, no account created, no link). Linking is a deliberate, separately-authenticated
   action (Q2).

### 3.5 Config and flag changes

- Remove the boot refusal in `AuthMethodsConfig` and `env.validation.ts`; when
  `AUTH_GOOGLE_ENABLED=true`, require `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a
  valid `AUTH_TRANSIENT_ENCRYPTION_KEY` (the last already required for email), else fail
  closed at boot with an actionable message.
- `GET /auth/methods` reports `googleEnabled: true` only when the flag is true **and** the
  config is complete.

### 3.6 Cleanup

Extend `auth-cleanup.ts` with a third delete (expired transactions, short grace) inside the
same advisory-locked transaction, plus a unit test.

## 4. Slice plan (each slice is independently reviewable and keeps the flag off)

| Slice | Contents | Exit check |
|---|---|---|
| **P3-A** | `AuthOAuthTransaction` model + additive migration + cleanup extension. No runtime behaviour. | Migration applies on a disposable DB; cleanup unit test passes; `prisma validate` clean. |
| **P3-B** | `GoogleOidcClient` wrapper (authorization URL, code exchange, ID-token verification) behind an injectable interface, plus the chosen verifier dependency. | Unit tests against a fake verifier; the `jose`-ESM/`require` problem resolved. |
| **P3-C** | `start` + `callback` endpoints, transaction consume, identity resolution, session issuance. | Unit tests: happy path, expired, consumed, wrong binding cookie, nonce mismatch, `email_verified=false`, admin refusal, existing-email conflict. |
| **P3-D** | Linking / recovery path (Q2). | Unit tests; no email-based auto-merge. |
| **P3-E** | Web: conditional "Continue with Google" button + inert callback page; e2e with a **local mock provider** (discovery/JWKS/token). | Playwright flow green on a disposable DB; canary/redaction extended. |

## 5. Decisions (resolved 2026-11-25)

1. **Verifier library — `google-auth-library`.** Official, CommonJS, and it performs the
   code exchange, JWKS caching and the full ID-token verification (issuer, exact audience,
   expiry, signature). It is the maintained verifier the design requires.
2. **Linking scope — safe-fail only for this phase.** A verified Google email that matches
   an existing local account with no Google identity fails safely: no account is created
   and nothing is merged. A deliberate, separately-authenticated linking endpoint is
   deferred and needs its own threat model and tests.
3. **Callback host — the web host.** The redirect URI is
   `${WEB_PUBLIC_URL}/auth/google/callback`; the inert Next.js page captures `code`/`state`
   and POSTs them to the API, keeping auth cookies first-party. The value is fixed and must
   be registered verbatim on the Google client.

Execution: slice-by-slice (P3-A … P3-E). Each slice is committed and pushed to both
remotes with CI green before the next begins. The flag stays false throughout.
