# Production Readiness — Remediation Log

_Fixes applied 2026-07-02 following the multi-agent production audit
(`docs/PRODUCTION_READINESS_AUDIT.md`, 89 verified findings). Verified with
`tsc --noEmit` on both apps and `nest build` (all green)._

## Blockers fixed

### Auth / secrets
- **JWT empty-string fallback removed** (`common/strategies/jwt.strategy.ts`).
  `secretOrKey` no longer falls back to `''`; the strategy throws if the secret
  is unset. Forged/unsigned tokens are no longer possible.
- **Stronger prod secret validation** (`config/env.validation.ts`): rejects
  low-entropy (repeated-char) secrets and requires `JWT_ACCESS_SECRET !==
  JWT_REFRESH_SECRET`.
- **Strict per-endpoint throttles** on `login` (5/min), `register` (5/min),
  `forgot-password` (3/min), `reset-password` (5/min), `verify-email` (10/min)
  on top of the per-account lockout already in `AuthService`.

### Payments
- **Chapa amount verification** (`payments/chapa.service.ts`): `confirmAndApprove`
  now compares the amount Chapa actually settled against the server-snapshotted
  price and refuses to approve underpayments — success flag alone is no longer
  trusted.
- **Atomic approval (idempotency/race fix)** (`payments/payments.service.ts`):
  `finalizeApproval` now claims the `PENDING → APPROVED` transition with a
  guarded `updateMany` inside the transaction. Concurrent webhook + browser
  callback can no longer double-activate, double-notify, or double-audit.
- **Receipt path basename guard** (`getReceiptPath`): defence-in-depth against a
  poisoned `receiptPath` traversing out of the uploads dir.

### Web
- **SSRF hardening on the API proxy** (`app/api/proxy/[...path]/route.ts`):
  rejects traversal / protocol-relative / credential segments, resolves via a
  `URL` object, and asserts the target origin is still the backend. Query
  strings are now forwarded correctly.
- **Build-breaking merge conflict resolved** (`components/courses/material-viewer.tsx`).
  Unresolved `<<<<<<<` markers were failing the web build entirely.

### AI tutor
- **Subscription gate**: `TutorService.chat` calls `ensureActiveForStudent` —
  free (unsubscribed) students can no longer run up the Gemini bill; staff bypass.
- **Per-user rate limit**: new `UserThrottlerGuard` keys the limit on user id
  (not shared college IP); tutor chat capped at 20/min/user.
- **Prompt-injection hardening** (`ai/gemini.service.ts`): the untrusted student
  question is length-capped, fenced in a delimiter block, and the model is told
  to treat it as data, never instructions, and never reveal the system prompt.

### Production / DevOps
- **Fail-fast prod config** (`config/env.validation.ts`): `SMTP_*`,
  `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, and `CORS_ORIGIN` are now required in
  production and rejected if they point at localhost.
- **Graceful shutdown** (`main.ts`): `enableShutdownHooks()` so Prisma
  disconnects and BullMQ drains on SIGTERM/SIGINT.
- **Real readiness probe** (`app.controller.ts`): `GET /health/ready` runs
  `SELECT 1`; a pod with a dead DB connection is no longer marked Ready.
- **Multi-origin CORS** (`main.ts`): comma-separated `CORS_ORIGIN` supported.

## Findings downgraded during fixing (false positives / overstated)

Verified against the actual code:
- **"Amount tampering — client overrides price"** — false. `amount` is always
  snapshotted from `plan.priceETB` server-side in every create path.
- **"Non-deterministic txRef → duplicate activations"** — false. `txRef` is
  deterministic (`lm-${payment.id}`) with pending-attempt reuse.
- **"Upload size 250MB DoS"** — overstated. Receipts cap at 10MB (magic-byte
  validated); materials cap at 25MB and are staff-only (students can't upload).
- **"Reset token not single-use"** — false. `updatePassword` clears the token.
- **`forbidNonWhitelisted: false`** — already `true` in `main.ts`.

## Not yet done (recommended next)

- **Object storage for uploads** (S3/R2) — local disk won't survive redeploy/scale.
- **Error tracking** (Sentry) + centralized logging.
- **Migration status check at boot**; **Redis ping at boot**.
- **Enrollment-scoped tutor context** — now low severity (free users blocked),
  but tutor `buildContext` still doesn't verify course enrolment.
- P2/P3 code-quality and UX polish — see the audit report.
