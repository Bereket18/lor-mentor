# Bug Fix Report — Next.js App (`apps/web`)

**Date:** 2025-07-18  
**App:** `apps/web` (Next.js 16.2.9, Turbopack, Tailwind CSS v3)

---

## Bug 1 — Tailwind v4 `--spacing()` Function Used in a Tailwind v3 Project

### File
`src/components/ui/card.tsx`

### Error Message
```
Parsing CSS source code failed

.\[--card-spacing\:--spacing\(4\)\] {
  --card-spacing: var(--spacing(4));   ← error here
}

Unexpected token Function("--spacing")
```

The build produced **2 CSS parsing errors** from Turbopack — one for `--spacing(4)` and one for `--spacing(3)`.

### Root Cause

The `Card` component was generated with Tailwind v4-style arbitrary CSS custom property syntax:

```tsx
// ❌ Tailwind v4 syntax — does not work in Tailwind v3
"[--card-spacing:--spacing(4)]"
"data-[size=sm]:[--card-spacing:--spacing(3)]"
```

`--spacing()` is a built-in CSS helper function introduced in **Tailwind CSS v4**. This project uses **Tailwind CSS v3.4.19**, which has no concept of this function. When Turbopack processed the generated CSS, it hit an unexpected token and failed the build entirely.

### Fix

Replaced the v4 `--spacing()` calls with their equivalent plain CSS values using Tailwind v3's default spacing scale:

| Tailwind v4 | Tailwind v3 equivalent | Value |
|---|---|---|
| `--spacing(4)` | `1rem` | 16px |
| `--spacing(3)` | `0.75rem` | 12px |

```tsx
// ✅ Fixed — plain CSS values compatible with Tailwind v3
"[--card-spacing:1rem]"
"data-[size=sm]:[--card-spacing:0.75rem]"
```

**Diff:**
```diff
- "group/card ... [--card-spacing:--spacing(4)] ... data-[size=sm]:[--card-spacing:--spacing(3)] ..."
+ "group/card ... [--card-spacing:1rem] ... data-[size=sm]:[--card-spacing:0.75rem] ..."
```

---

## Bug 2 — `useSearchParams()` Called Without a Suspense Boundary

### File
`src/app/verify-email/page.tsx`

### Error Message
```
useSearchParams() should be wrapped in a suspense boundary at page "/verify-email"
Error occurred prerendering page "/verify-email". Exiting the build.
```

### Root Cause

The `VerifyEmailPage` component called `useSearchParams()` directly at the top level of the default export:

```tsx
// ❌ useSearchParams() at the top level — no Suspense boundary
export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  // ...
}
```

Next.js App Router statically prerenders pages at build time. When a component uses `useSearchParams()`, it opts into dynamic rendering based on the URL search string. Next.js requires this component to be wrapped in a `<Suspense>` boundary so the static shell can render while the dynamic part loads on the client. Without it, the build fails during the static generation phase.

### Fix

Split the page into two components:

1. **`VerifyEmailContent`** — inner component that owns the `useSearchParams()` call and all the page UI.
2. **`VerifyEmailPage`** — the exported default that wraps `VerifyEmailContent` in `<Suspense>` with a loading spinner fallback.

```tsx
// ✅ Fixed — inner component reads search params
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // ... all page logic and UI
}

// ✅ Fixed — exported page wraps it in Suspense
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
```

---

## Build Result

After both fixes, the build completed successfully:

```
✓ Compiled successfully in 14.0s
✓ Finished TypeScript in 15.6s
✓ Collecting page data using 7 workers in 4.6s
✓ Generating static pages (8/8)
✓ Finalizing page optimization

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /dashboard
├ ○ /login
├ ○ /register
└ ○ /verify-email
```

Exit code: `0`
