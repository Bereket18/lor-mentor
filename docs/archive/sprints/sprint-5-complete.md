# Sprint 5 — Subscriptions, Payments & Platform Hardening
## Lor Mentor · Lorcan Medical College
### Status: ✅ COMPLETE (validated against actual repository code)

---

## A Note on This Document

Unlike Sprints 0–4, this document was written by reading the **actual
code that exists on `main`**, not a plan dictated in advance. This
sprint's real scope ended up broader than originally planned — it
covers subscriptions/payments, a full auth UI redesign, and a batch
of admin/teacher features added independently. All of it is documented
here as what genuinely happened.

---

## What This Sprint Actually Delivered

```
Backend:
  PlansModule         — admin creates/manages subscription plans
  PaymentsModule       — receipt upload, admin approve/reject queue
  SubscriptionsModule  — subscription status lookup + server-side
                          enforcement, called from MaterialsService
  UsersModule (extended) — staff account creation, inactive account
                          cleanup, role-based sorting
  Auth (extended)      — refresh token endpoint

Frontend:
  /pricing, /pricing/subscribe   — public plan browsing + receipt upload
  /admin/plans, /admin/payments  — plan management + approval queue
  /admin-login                   — staff-only login portal
  SubscriptionGuard component    — friendly UX gate (not the real security)
  Login/Register redesign        — glass panel, teal branding, theme toggle
  Teacher pages                  — dashboard, courses, analytics
  Lorcan seed script             — 9 real programs, years, semesters
```

---

## The Three-Module Split — Plans / Payments / Subscriptions

Rather than the two-module structure originally sketched, the actual
implementation splits this into three focused modules:

| Module | Responsibility |
|---|---|
| `PlansModule` | CRUD for `SubscriptionPlan` records — what admin manages on `/admin/plans` |
| `PaymentsModule` | The receipt upload + approval workflow — creates `Payment` records, and on approval, creates/updates a `Subscription` |
| `SubscriptionsModule` | Read-only status lookup (`/subscriptions/me`) and the enforcement helper `ensureActiveForStudent()` |

This is a cleaner separation than combining everything into one module —
each one has a single clear job, and `SubscriptionsModule` can be
imported into `MaterialsModule` without dragging in the entire payment
upload/approval surface area.

---

## The Most Important Concept — Where Enforcement Actually Lives

This is worth being explicit about, because it's easy to get backwards.

```ts
// apps/web/.../subscription-guard.tsx — UX ONLY
// Shows a friendly "Subscribe to continue" screen instead of a raw error.
// A user could theoretically bypass this in the browser — and it would
// not matter, because it grants no real access.

// apps/api/.../materials.service.ts — THE ACTUAL GATE
if (student?.role === 'STUDENT') {
  await this.subscriptionsService.ensureActiveForStudent(studentId, student.role)
}
// This runs on the SERVER, on every single file request, with no
// way for the browser to skip it. This is the real security boundary.
```

The pattern: **client-side guards are for user experience, server-side
guards are for security.** Lor Mentor gets this right — the frontend
`SubscriptionGuard` exists purely so a student sees a clean upgrade
prompt instead of a confusing error page; it grants nothing. The actual
permission check happens inside `MaterialsService.getFilePathForStudent()`,
the same method that already enforces department/year access from
Sprint 4. Subscription status is just one more condition added to an
already-correct gatekeeper.

---

## Key Files — What They Do

### `apps/api/src/modules/plans/plans.service.ts`

Plain CRUD over the `SubscriptionPlan` model (the model name is
unchanged from the original Sprint 0 schema). `findAllPublic()` only
returns `isActive: true` plans sorted by price — what students see on
`/pricing`. `findAllAdmin()` returns everything, for the management
screen.

### `apps/api/src/modules/payments/payments.service.ts`

```ts
async submit(userId: string, planId: string, file: Express.Multer.File) {
  const pending = await this.prisma.payment.findFirst({
    where: { userId, status: 'PENDING' },
  })
  if (pending) {
    throw new BadRequestException('You already have a payment awaiting review')
  }
  ...
}
```
Prevents a student from submitting multiple receipts while one is
already under review — avoids confusing the admin queue with duplicate
entries for the same person.

```ts
async approve(paymentId: string, adminId: string) {
  ...
  await this.prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { userId: payment.userId } })
    if (existing) {
      // renew — update existing subscription row
    } else {
      // first-time subscriber — create new row
    }
    await tx.payment.update({ ...status: 'APPROVED' })
  })
}
```
Handles both the "first subscription ever" and "renewing an existing
subscription" cases inside one atomic transaction — if anything fails
partway through, nothing is left half-updated. This correctly upserts
rather than assuming every approval is a brand-new subscriber.

`getReceiptPath()` maps file extension to MIME type manually (`.jpg`
→ `image/jpeg` etc.) since receipts can be JPEG, PNG, or WEBP and the
correct `Content-Type` header matters for the browser to render the
image instead of downloading it.

### `apps/api/src/modules/subscriptions/subscriptions.service.ts`

```ts
async ensureActiveForStudent(userId: string, role: string) {
  if (['ADMIN', 'SUPER_ADMIN', 'TEACHER'].includes(role)) return
  const { isActive } = await this.getForUser(userId)
  if (!isActive) {
    throw new ForbiddenException('An active subscription is required to access materials')
  }
}
```
Staff roles are exempt entirely — they never need a subscription to
view content. `isActive` itself is computed in `getForUser()`:
```ts
const isActive =
  subscription.status === 'ACTIVE' &&
  (!subscription.endDate || subscription.endDate > new Date())
```
Two conditions, both required: the stored status flag says ACTIVE,
*and* the end date (if set) hasn't passed. This means an expired
subscription is correctly treated as inactive even if nobody has
gotten around to flipping its status field yet — the date check is
the real source of truth, not just the stored label.

### `apps/web/src/components/subscription/subscription-guard.tsx`

```tsx
if (!user || isAdmin || isTeacher) {
  setIsActive(true)
  setLoading(false)
  return
}
api.get('/subscriptions/me').then((res) => setIsActive(res.data.isActive))
```
Mirrors the backend's staff exemption on the frontend — admins and
teachers never see the subscription paywall UI either. This is purely
cosmetic consistency; even if this check were removed, the backend
guard above would still correctly let staff through and correctly
block an unsubscribed student.

---

## Auth & Platform Hardening Added Alongside This Sprint

A few things landed in the same window that round out the platform:

- **Refresh token endpoint** (`POST /auth/refresh`) — the axios
  interceptor from Sprint 1 was calling this since the start, but the
  backend route didn't exist until now. Sessions now correctly renew
  silently instead of forcing re-login every 15 minutes.
- **Admin-only staff creation** (`POST /users/create-staff`) — the
  only way to create a TEACHER or ADMIN account; generates a temporary
  password, optionally assigns a department at creation time.
- **Inactive account cleanup** (`DELETE /users/inactive`,
  SUPER_ADMIN only) — removes STUDENT/GUEST accounts inactive for
  12+ months, deleting child records in correct foreign-key order
  first. Never touches staff accounts.
- **Lorcan programs seed script** — populates real department/year/
  semester data (9 programs) so the platform isn't being tested
  against placeholder "Medicine / Year 1" data anymore.
- **Auth UI redesign** — glass panel login/register with the Lorcan
  teal brand badge correctly rendering in both light and dark mode.

---

## API Endpoints Added This Sprint

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/v1/plans | Public | Active plans for pricing page |
| GET | /api/v1/plans/admin | Admin | All plans |
| POST | /api/v1/plans | Admin | Create plan |
| PATCH | /api/v1/plans/:id | Admin | Update plan |
| POST | /api/v1/payments | Student | Submit receipt for a plan |
| GET | /api/v1/payments/admin | Admin | Full payment queue |
| GET | /api/v1/payments/:id/receipt | Admin | View receipt image |
| POST | /api/v1/payments/:id/approve | Admin | Approve + activate subscription |
| POST | /api/v1/payments/:id/reject | Admin | Reject with optional reason |
| GET | /api/v1/subscriptions/me | Logged in | Own subscription status |
| POST | /api/v1/auth/refresh | Public (cookie-based) | Silent token renewal |
| POST | /api/v1/users/create-staff | Admin | Create teacher/admin account |
| DELETE | /api/v1/users/inactive | Super Admin | Purge old inactive students |

---

## Known Issues to Fix Before Moving On

| Issue | File | Status |
|---|---|---|
| Duplicate `Post` import + duplicate `createStaff` method, breaks build | `users.controller.ts` | 🔴 Needs fix — given above |
| Stray outdated course-detail page at wrong route | `(app)/[id]/page.tsx` | 🔴 Needs deletion — given above |
| Dead unused `createStaffAccount` method | `users.service.ts` | 🟡 Cleanup, not urgent |
| `cookies.txt` tracked in git | repo root, `apps/api` | 🟡 Cleanup, not urgent |
| `seed.ts` unused (only `seed.js` is actually run) | `apps/api/prisma/` | 🟡 Cleanup, not urgent |

---

## What's Genuinely Not Built Yet

- AI pipeline (summaries, flashcards, quizzes from uploaded PDFs) —
  no `ai` module exists in the repo. This was discussed at length as
  *architecture only*, never implemented.
- Chapa or any automated payment gateway — current payment flow is
  100% manual receipt review, which is a complete and correct system
  on its own, just without automatic verification.
- Real landing page at `/` (currently redirects straight to `/login`)

---

*Document generated from direct repository inspection*
*Reflects actual code on `main` as of this validation pass*
