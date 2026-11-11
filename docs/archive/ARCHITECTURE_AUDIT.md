# Lor Mentor — Architecture Audit & Chapa Payment Integration

_Senior architecture review prepared 2026-06-29. This document records (1) what was
built in the Chapa payment integration, (2) the critical fixes applied on the payment
path, and (3) a prioritized backlog of the remaining issues found across security,
code quality, UX/UI, and performance._

---

## 1. What was delivered — Chapa online payments

The app already had a **manual** flow (student uploads a bank receipt → admin approves).
That is preserved. A full **online** flow was added on top, plus automatic receipts.

### Backend (`apps/api`)

- **Schema** (`prisma/schema.prisma`): `Payment` gained `method` (MANUAL | CHAPA),
  `amount`/`currency` (price snapshot), `txRef` (unique idempotency key), `chapaRef`,
  `paidAt`, and `receiptNumber` (unique). `receiptPath` is now optional (Chapa payments
  have no uploaded image). Added indexes `(userId, status)` and `(status)`.
  Migration: `prisma/migrations/20260629120000_add_chapa_payments`.
- **`ChapaService`** — `initialize()` (creates a pending payment + calls Chapa's
  `/transaction/initialize`), `handleWebhook()` (HMAC-SHA256 signature verified, then
  confirms via `/transaction/verify`), and `verifyByTxRef()` (browser callback path).
- **`PaymentsService.finalizeApproval()`** — single, **idempotent** approval path shared
  by manual admin approval AND Chapa auto-approval. It activates the subscription,
  writes a `Notification` (PAYMENT_APPROVED) and an `AuditLog`, and generates the PDF —
  all so the two flows can never drift apart.
- **`ReceiptService`** — generates a branded **PDF receipt** (pdfkit) with a stable
  receipt number, stored under `uploads/receipts-generated/<paymentId>.pdf`.
- **Endpoints** (`payments.controller.ts`):
  `POST /payments/chapa/initialize`, `POST /payments/chapa/webhook` (public, signed),
  `GET /payments/chapa/verify/:txRef`, `GET /payments/me`, `GET /payments/:id/document`
  (owner or admin downloads the PDF).

### Frontend (`apps/web`)

- **`/pricing/subscribe`** — choose **Pay online (Chapa)** or **Bank transfer (manual)**.
- **`/pricing/payment/callback`** — polls verification, shows success + PDF download.
- **Admin payments** — shows the method badge and downloads the right artifact
  (manual = uploaded image, approved = generated PDF).
- **Profile** — students can re-download the PDF receipt for any approved payment.

### Configuration required to go live

Set in `apps/api/.env` (documented in `.env.example`):
`CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`.
The webhook URL (`<API_PUBLIC_URL>/api/v1/payments/chapa/webhook`) must be registered
in the Chapa dashboard and be reachable from the internet (use a tunnel in dev).

---

## 2. Critical fixes applied (payment path)

| # | Issue | Fix |
|---|-------|-----|
| C1 | **Forgeable JWTs.** Secrets fell back to `''` (`config.get('JWT_ACCESS_SECRET') ?? ''`). An empty signing key is catastrophic. | `config/env.validation.ts` now fails startup if JWT/DB secrets are missing, and rejects placeholder/short secrets and missing Chapa keys in production. |
| C2 | **No rate limiting.** `@nestjs/throttler` was a dependency but never wired — login was brute-forceable. | Global `ThrottlerGuard` (120/min/IP) in `app.module.ts`; stricter 10/min on Chapa initialize. |
| C3 | **Webhook trust.** A naive webhook would let anyone activate a subscription by POSTing JSON. | HMAC-SHA256 signature verification (`timingSafeEqual`) **and** server-side re-verification against Chapa before approving. |
| C4 | **Silent approval drift / no trail.** Manual approval created no notification or audit record. | Unified `finalizeApproval()` always writes `Notification` + `AuditLog`. |

---

## 3. Prioritized backlog (not yet changed)

Severity: **P0** ship-blocker · **P1** soon · **P2** quality · **P3** nice-to-have.

### Security

- **P1 — `forbidNonWhitelisted: false`** in `main.ts`. Unknown body fields are silently
  stripped rather than rejected; flip to `true` for defense in depth.
- **P1 — File uploads trust client MIME type.** `payments`/`materials` validate
  `file.mimetype` (spoofable). Validate magic bytes and re-encode/scan images.
- **P2 — Receipts on local disk.** `uploads/` won’t survive horizontal scaling or a
  container redeploy. Move to S3/Cloudflare R2 with signed URLs.
- **P2 — No account lockout / audit on failed logins.** Throttling helps (C2) but add
  lockout + `AuditLog` on repeated failures.
- **P2 — Duplicate-subscription guard.** A user with an ACTIVE sub can still start a new
  payment. Decide renew-vs-extend semantics explicitly.

### Code quality (junior-pattern cleanups)

- **P2 — `interface AuthUser { id; role }` redefined per controller.** Extract one shared
  `AuthUser`/`RequestUser` type and import it everywhere.
- **P2 — Magic role strings** (`'ADMIN'`, `'SUPER_ADMIN'`) scattered across guards and
  services. Centralize as a `Role` const/enum and a `PRIVILEGED_ROLES` set.
- **P2 — No global exception filter.** Error shapes are inconsistent. Add an
  `AllExceptionsFilter` returning `{ statusCode, message, error, timestamp, path }`.
- **P3 — `process.env` read directly** in places (e.g. `app.module.ts` Redis/CORS).
  Prefer `ConfigService` for one validated source of truth.

### Performance (the “make it fast” ask)

The biggest wins are on the web tier. Current state: **29/31 pages are `'use client'`**,
**React Query is installed but unused**, and **every navigation cold-fetches** (incl.
multiple `/me` calls because `useAuth()` runs per component).

- **P1 — Adopt React Query (already a dependency).** Wrap the app in a
  `QueryClientProvider`; convert `useAuth` and page fetches to `useQuery`. This alone
  removes duplicate `/me` calls and gives caching + dedup + stale-while-revalidate. Est.
  the single highest-impact perceived-speed change.
- **P1 — Auth in `middleware.ts`.** Today the guard runs in a `layout.tsx` `useEffect`,
  so users see a flash of the app before redirect. A middleware bounce is instant (0ms)
  and removes a render.
- **P2 — Server Components + `loading.tsx`.** Move read-only pages (course lists,
  pricing) to RSC with streaming and per-route `loading.tsx` skeletons; push
  `'use client'` down to interactive leaves only.
- **P2 — Dynamic-import heavy widgets.** `pdfjs-dist` (PDF viewer) and Framer Motion
  should be `next/dynamic` so they don’t inflate every bundle.
- **P2 — HTTP caching headers** on cacheable GETs (plans, published course metadata).
- **P3 — `next/image`** for course covers and avatars.

### UX / UI

- **P2 — No global toast system.** Errors use `alert()` (see admin payments, profile).
  Add a toast/snackbar for consistent, on-brand feedback.
- **P2 — Static notification bell.** The red dot is hardcoded; wire it to the real
  `Notification` table (the data now exists, incl. PAYMENT_APPROVED).
- **P3 — Skeletons are generic** (`h-16 skeleton`). Shape them to the real content.
- **P3 — Empty/error states** are sparse on several pages.

---

## 4. Suggested sequencing

1. **P0/P1 security** — `forbidNonWhitelisted`, upload hardening, login lockout.
2. **Perf phase 1** — React Query provider + `useAuth` migration + `middleware.ts`.
   (Most user-visible “fast” improvement; low risk.)
3. **Code-quality sweep** — shared `AuthUser` type, role constants, global exception filter.
4. **Perf phase 2** — selective RSC + `loading.tsx`, dynamic imports, image optimization.
5. **UX polish** — toasts, live notifications, real skeletons.

Each is independently shippable; none blocks the payment system, which is complete.
