# Lor Mentor — Full Stack Test Report

**Date:** 2026-06-18  
**Tester:** Kiro (Senior SE / QA)  
**Scope:** Full end-to-end testing of backend API and frontend Next.js app  
**Environment:** Local development — `api` on `http://localhost:4000`, `web` on `http://localhost:3000`

---

## 1. Environment Setup

| Item | Value |
|---|---|
| API Framework | NestJS 11, TypeScript |
| Database | PostgreSQL (`lor_mentor`) via Prisma |
| Frontend | Next.js 16.2.9 (Turbopack), React 19 |
| Auth | JWT in HTTP-only cookies (access: 15m, refresh: 7d) |
| API Base URL | `http://localhost:4000/api/v1` |
| Frontend URL | `http://localhost:3000` |

Both servers started successfully. Database connected on first boot.

---

## 2. Backend API Tests

### 2.1 Health Check

```
GET /api/v1/health
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **Response** | `{ "status": "ok", "app": "Lor Mentor API", "timestamp": "..." }` |

---

### 2.2 Departments — Public List

```
GET /api/v1/departments
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **Response** | Returns active departments with academic year counts |
| **Data found** | Medicine department (`id: cmqjewtxd0000sktyn0pvcfjo`) |
| **Auth required** | No — public endpoint |

---

### 2.3 Academic Years — By Department

```
GET /api/v1/academic-years?departmentId=cmqjewtxd0000sktyn0pvcfjo
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **Response** | Returns 2 academic years (Year 1 x2) |
| **Auth required** | No — public endpoint |

---

### 2.4 Register — New Student Account

```
POST /api/v1/auth/register
Body: {
  "fullName": "Jane Doe",
  "email": "jane.doe@lorcan.edu.et",
  "password": "password123",
  "departmentId": "cmqjewtxd0000sktyn0pvcfjo",
  "academicYearId": "cmqjflxcs0000xgtyv3g4r1cx",
  "phoneNumber": "0912345678"
}
```

| | |
|---|---|
| **Status** | ✅ 201 Created |
| **Response** | `{ "message": "Registration successful...", "verifyToken": "293bfdba..." }` |
| **Password hashing** | ✅ bcrypt with 12 rounds |
| **Email verification** | ✅ Token generated, expiry set to 24h |
| **Duplicate email** | ✅ Returns 400 `"An account with this email already exists"` |

---

### 2.5 Email Verification

```
POST /api/v1/auth/verify-email
Body: { "token": "293bfdba50312fe99c98f565d3387c836e0933fc21188ccad50611821bb32f4c" }
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **Response** | `{ "message": "Email verified successfully. You can now log in." }` |
| **DB updated** | `isEmailVerified: true`, token and expiry cleared |

---

### 2.6 Login — New Student

```
POST /api/v1/auth/login
Body: { "email": "jane.doe@lorcan.edu.et", "password": "password123" }
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **Response** | `{ "message": "Login successful", "user": { "id": "...", "role": "STUDENT" } }` |
| **access_token cookie** | ✅ Set — HttpOnly, SameSite=Lax, Max-Age=900 |
| **refresh_token cookie** | ✅ Set — HttpOnly, SameSite=Lax, Max-Age=604800 |
| **Token in body** | ✅ Absent — tokens only in cookies (secure) |
| **CORS header** | ✅ `Access-Control-Allow-Origin: http://localhost:3000` |
| **Credentials** | ✅ `Access-Control-Allow-Credentials: true` |

---

### 2.7 Login — Admin (bereket@lorcan.edu.et)

```
POST /api/v1/auth/login
Body: { "email": "bereket@lorcan.edu.et", "password": "password123" }
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **User ID** | `cmqbpaukh00006otybu6eoo3l` |
| **Full name** | Bereket Adamsseged |
| **Role** | `ADMIN` ✅ |
| **Cookies** | ✅ Both set correctly |

---

### 2.8 GET /me — Protected Route (JWT Guard)

```
GET /api/v1/me
Cookie: access_token=<jwt>
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **Response** | Full user profile — id, email, fullName, role, avatarPath, isActive, isEmailVerified, createdAt |
| **Password hash** | ✅ Not returned |
| **Without cookie** | ✅ Returns 401 Unauthorized |

---

### 2.9 Login — Unverified Email

```
POST /api/v1/auth/login  (email not yet verified)
```

| | |
|---|---|
| **Status** | ✅ 401 Unauthorized |
| **Response** | `"Please verify your email address before logging in."` |

---

### 2.10 Login — Wrong Password

```
POST /api/v1/auth/login  (wrong password)
```

| | |
|---|---|
| **Status** | ✅ 401 Unauthorized |
| **Response** | `"Invalid email or password"` — same message for wrong email and wrong password (prevents user enumeration) |

---

### 2.11 Logout

```
POST /api/v1/auth/logout
```

| | |
|---|---|
| **Status** | ✅ 200 OK |
| **Response** | `{ "message": "Logged out successfully" }` |
| **Cookies cleared** | ✅ Both `access_token` and `refresh_token` cleared |

---

## 3. Frontend Tests

### 3.1 Page Availability

| Route | HTTP Status | Notes |
|---|---|---|
| `GET /login` | ✅ 200 | Sign in form renders |
| `GET /register` | ✅ 200 | Full form with dept/year dropdowns renders |
| `GET /verify-email` | ✅ 200 | Token input form renders |
| `GET /dashboard` | ✅ 200 | Protected — client redirects to login when no JWT |
| `GET /admin` | ✅ 200 | Protected — client redirects to login when no JWT |
| `GET /courses` | ✅ 200 | Renders |

---

### 3.2 Register Page — Form Fields

Verified the register form includes all fields required by the backend:

| Field | Present | Validates |
|---|---|---|
| Full Name | ✅ | Min 2 chars |
| Email | ✅ | Valid email format |
| Phone Number | ✅ | Min 9, Max 15 digits |
| Department (select) | ✅ | Loaded from API, required |
| Academic Year (select) | ✅ | Loaded dynamically by department, required |
| Password | ✅ | Min 8 chars |
| Confirm Password | ✅ | Must match password |

The department dropdown fetches `GET /api/v1/departments` on mount. The academic year dropdown fetches `GET /api/v1/academic-years?departmentId=...` whenever the department selection changes. Mismatched department/year pairs are rejected server-side even if the client is manipulated.

---

### 3.3 Frontend Build

```
npm run build  (Next.js production build)
```

| | |
|---|---|
| **Result** | ✅ Exit code 0 — clean |
| **TypeScript** | ✅ No errors |
| **Pages generated** | 10 routes |
| **Turbopack compile** | ✅ ~28-32s |

---

## 4. Bugs Found & Fixed

### Bug 1 — `border-default` Tailwind class not resolving

**Files affected:** `register/page.tsx`, `story-frames.tsx`, `courses/page.tsx`, `admin/courses/page.tsx`, `courses/[id]/page.tsx`, `[id]/page.tsx`, `material-viewer.tsx`, `dashboard/page.tsx`  
**Symptom:** All input fields and card borders were invisible — no visible border rendered  
**Root cause:** `border.DEFAULT` in `tailwind.config.ts` generates the class `border-border`, not `border-default`. Tailwind doesn't create standalone utilities for nested color keys unless they match the parent key name.  
**Fix:** Added `default: "var(--border-default)"` as a top-level color alias in `tailwind.config.ts`. No changes to any component files needed.

```diff
// tailwind.config.ts — theme.extend.colors
+ default: "var(--border-default)",
+ glass:   "var(--border-glass)",
```

---

### Bug 2 — `border-glass` Tailwind class not resolving

**Files affected:** `register/page.tsx` left panel divider, `login/page.tsx` left panel divider  
**Symptom:** Glass-style border on the left/right panel separator was invisible  
**Root cause:** Same issue as Bug 1 — `border.glass` maps to `border-border-glass`, not `border-glass`  
**Fix:** Added `glass: "var(--border-glass)"` as a top-level color alias (same commit as Bug 1), and replaced both panel borders with explicit inline styles for safety:

```tsx
style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}
```

---

### Bug 3 — Glow orbs not rendering (login + register pages)

**Files affected:** `login/page.tsx`, `register/page.tsx`  
**Symptom:** Background corner glow orbs were completely invisible  
**Root cause:** `bg-accent/[0.07]` and `bg-teal/[0.06]` — Tailwind v3 opacity modifiers require colors defined as RGB channels. These colors are CSS variable references (`var(--accent-primary)`), which Tailwind can't decompose into channels at build time, so the opacity modifier silently produces nothing.  
**Fix:** Replaced with `radial-gradient` inline styles using explicit `rgba()` values:

```tsx
// Before (broken)
className="bg-accent/[0.07] ..."

// After (fixed)
style={{ background: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)" }}
```

---

### Bug 4 — Word-by-word headline animation not playing (`WordReveal` component)

**File:** `src/components/shared/word-reveal.tsx`  
**Symptom:** Headline text was either invisible on load or appeared all at once with no animation  
**Root cause:** The component relied on a CSS class selector `.word-reveal span > span` to apply the animation, but didn't set the `animation` property directly on the inner span elements. The CSS selector was fragile and didn't include `animation-fill-mode: both`, causing words to start invisible and never fill forward.  
**Fix:** Moved the full `animation` shorthand directly onto each word span's inline style with `animation-fill-mode: both`:

```tsx
style={{
  display: "inline-block",
  animation: "word-reveal 0.55s cubic-bezier(0.4, 0, 0.2, 1) both",
  animationDelay: `${delay + i * stagger}ms`,
}}
```

---

### Bug 5 — `animate-fade-up` starting and staying invisible

**Files affected:** `login/page.tsx`, `register/page.tsx`  
**Symptom:** Elements with `animate-fade-up` plus an inline `animationDelay` were invisible on load and did not animate in  
**Root cause:** Adding an inline `style={{ animationDelay: "600ms" }}` creates a new style object that doesn't inherit the `animation-fill-mode: both` baked into the Tailwind animation shorthand. Without `fill-mode: both`, the element starts at `opacity: 0` (the keyframe 0% state) and then snaps to visible after the delay — or stays invisible if there's a paint issue.  
**Fix:** Added `animationFillMode: "both"` to every inline style that sets `animationDelay`:

```tsx
style={{ animationDelay: "600ms", animationFillMode: "both" }}
```

---

## 5. Known Limitations / Out of Scope

| Item | Notes |
|---|---|
| Email sending | Not implemented — verification token returned in API response body (dev only) |
| Password reset email | Not implemented — reset token returned in API response body (dev only) |
| Token refresh endpoint | `POST /auth/refresh` exists in the axios interceptor but no controller route is mapped — will return 404 if access token expires mid-session |
| Admin dashboard UI | Pages exist and render but admin-specific data endpoints not fully wired |
| Payment flow | Schema and models exist, no upload/approval UI yet |
| Mobile navigation | `MobileNav` component renders but no routes connected |

---

## 6. Summary

| Category | Tests Run | Passed | Failed |
|---|---|---|---|
| Backend API | 11 | 11 | 0 |
| Frontend pages | 6 | 6 | 0 |
| Frontend build | 1 | 1 | 0 |
| Bugs found | 5 | — | — |
| Bugs fixed | 5 | — | — |

**Overall status: ✅ PASS — both servers running, all tested flows working, all found bugs fixed.**

---

---

# Post-Report Session — Additional Bugs Found & Fixed

**Date:** 2026-06-18 (continued session)  
**Scope:** Runtime errors discovered after initial report was written, during live browser testing

---

## 7. Runtime Errors Found After Initial Report

### Bug 6 — `TypeError: Cannot read properties of undefined (reading 'length')` on Course Detail Page

**Discovered via:** Browser console error during live navigation  
**Files affected:** `src/app/(app)/[id]/page.tsx`, `src/app/(app)/courses/[id]/page.tsx`  
**Error message:**
```
Uncaught TypeError: Cannot read properties of undefined (reading 'length')
  at CourseDetailPage (src/app/(app)/[id]/page.tsx:65:27)
```

**Symptom:** Course detail page crashed immediately on load when the API response didn't include a `materials` key (e.g. course has no materials yet, or API omits the field).

**Root cause:** Both course detail pages accessed `course.materials.length` directly without guarding against `undefined`. The `CourseDetail` TypeScript interface declared `materials` as a required array, but the actual API response could omit the field entirely when no materials exist — TypeScript trusts the interface at compile time but can't enforce the shape of runtime API data.

**Fix:** Normalised the API response on arrival in both files using a nullish coalescing fallback:

```tsx
// Before (crashes when materials is absent from API response)
.then((res) => setCourse(res.data))

// After (safe — always an array)
.then((res) => {
  const data = res.data;
  setCourse({
    ...data,
    materials: data.materials ?? [],
  });
})
```

**Files changed:**
- `src/app/(app)/[id]/page.tsx`
- `src/app/(app)/courses/[id]/page.tsx`

---

### Bug 7 — `scroll-behavior: smooth` warning on `<html>` element

**Discovered via:** Browser console warning during live navigation  
**File affected:** `src/app/layout.tsx`  
**Warning message:**
```
[browser] Detected `scroll-behavior: smooth` on the `<html>` element.
To disable smooth scrolling during route transitions, add
`data-scroll-behavior="smooth"` to your <html> element.
```

**Root cause:** `globals.css` sets `scroll-behavior: smooth` on `html`. Next.js 16 requires the `data-scroll-behavior="smooth"` attribute on the `<html>` element to know the smooth scrolling is intentional and to handle its own route-transition scroll management correctly without conflict.

**Fix:** Added `data-scroll-behavior="smooth"` attribute to the root `<html>` tag in `layout.tsx`:

```tsx
// Before
<html lang="en" suppressHydrationWarning>

// After
<html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
```

**File changed:** `src/app/layout.tsx`

---

### Bug 8 — Uncontrolled → Controlled input warning on Admin Courses page

**Discovered via:** Browser console error when switching material type to YOUTUBE  
**File affected:** `src/app/(app)/admin/courses/page.tsx`  
**Error message:**
```
Console Error: A component is changing an uncontrolled input to be controlled.
This is likely caused by the value changing from undefined to a defined value,
which should not happen.
at input (src/app/(app)/admin/courses/page.tsx:411:13)
```

**Symptom:** Clicking the YOUTUBE type button in the admin material upload form triggered a React warning. The warning appeared because switching between material types (PDF/IMAGE ↔ YOUTUBE) caused a file `<input>` and a text `<input>` to alternate in the same DOM position, confusing React's reconciliation about controlled vs uncontrolled state.

**Root cause:** When `materialType` toggled to `"YOUTUBE"`, the file `<input>` unmounted and a `<input value={youtubeUrl}>` mounted in its place. On switching back, the file input remounted in the same tree slot. React detected the element changing between having no `value` prop (file input — always uncontrolled) and having one (text input — controlled), and warned. Additionally, no `key` prop was present to force a clean remount.

**Fix:** Three changes:

1. Added `fileInputKey` state (a counter) to force React to treat the file input as a new element when the type changes:

```tsx
const [fileInputKey, setFileInputKey] = useState(0);
```

2. Updated the type toggle buttons to bump `fileInputKey` and reset `youtubeUrl` when switching away from YOUTUBE:

```tsx
onClick={() => {
  setMaterialType(t);
  if (t !== "YOUTUBE") setYoutubeUrl("");
  if (t !== "YOUTUBE") setFileInputKey((k) => k + 1);
}}
```

3. Added `key={fileInputKey}` to the file input, and also bumped the key after successful upload to clear the file selection:

```tsx
<input key={fileInputKey} ref={fileInputRef} type="file" ... />

// After upload success:
setFileInputKey((k) => k + 1);
```

**File changed:** `src/app/(app)/admin/courses/page.tsx`

---

## 8. Updated Summary

| Category | Tests Run | Passed | Failed |
|---|---|---|---|
| Backend API | 11 | 11 | 0 |
| Frontend pages | 6 | 6 | 0 |
| Frontend build | 1 | 1 | 0 |
| Bugs found (initial) | 5 | — | — |
| Bugs fixed (initial) | 5 | — | — |
| Bugs found (post-report) | 3 | — | — |
| Bugs fixed (post-report) | 3 | — | — |
| **Total bugs found** | **8** | — | — |
| **Total bugs fixed** | **8** | — | — |

**Overall status: ✅ PASS — all 8 bugs resolved, both servers stable, no remaining console errors.**

---

---

# Post-Report Session 2 — UI/UX & Theme System Overhaul

**Date:** 2026-06-18 (continued session)  
**Scope:** Visible UI breakage across login, register, sidebar, topbar, and dashboard in both light and dark modes. Logo color request.

---

## 9. UI/UX Bugs Found & Fixed

### Bug 9 — Sidebar completely unstyled: no background, no visible text

**Files affected:** `tailwind.config.ts`, `src/components/layout/sidebar.tsx`  
**Symptom:** The sidebar rendered with no background colour and completely invisible navigation text. The entire left navigation was unusable.

**Root cause:** Every sidebar class referenced the `brand` colour palette (`bg-brand-800`, `text-brand-300`, `bg-brand-700`, `border-brand-750`, etc.) but `brand` was never defined in `tailwind.config.ts`. Tailwind silently ignores unknown colour names and generates no CSS — so every single sidebar class produced nothing.

**Fix — Part A:** Added the full Lorcan teal `brand` palette to `tailwind.config.ts`:

```ts
brand: {
  950: "#020D0D",
  900: "#061212",
  800: "#0A1A1A",
  750: "#0D2424",
  700: "#147878",
  600: "#1A8A8A",
  500: "#1A9494",
  400: "#78AAAE",
  300: "#9EC4C7",
  200: "#B8D8DA",
  100: "#D9ECED",
  50:  "#F0F8F8",
},
```

**Fix — Part B:** Rewrote `sidebar.tsx` to use inline `style` props for all fixed brand values so the sidebar can never silently break again if a token is missing from the config. The sidebar is always the Lorcan dark-teal regardless of light/dark mode, so hardcoding the hex values in-component is the correct approach.

---

### Bug 10 — Theme toggle broken: text invisible in both modes

**Files affected:** `src/lib/utils.ts`, `src/app/layout.tsx`  
**Symptom:** Switching the theme toggle did nothing visually. In light mode, dark text on dark background made everything unreadable.

**Root cause:** `toggleTheme()` in `utils.ts` was reading and writing `localStorage.getItem("theme")` (key: `"theme"`), but the inline script in `layout.tsx` that runs before React hydration reads and writes `"lm-theme"`. This key mismatch meant:

1. The layout script set `data-theme="dark"` on every load (from `lm-theme`, which was empty → defaulted to dark)
2. `toggleTheme()` wrote to `"theme"`, which the layout script never reads
3. The `data-theme` attribute was never updated → light mode CSS variables never applied

**Fix:** Aligned `utils.ts` to use `"lm-theme"` consistently, and updated `toggleTheme()` to set `document.documentElement.setAttribute("data-theme", newTheme)` directly instead of toggling a CSS class:

```ts
// Before (broken — wrong key, wrong DOM method)
localStorage.setItem("theme", newTheme)
root.classList.add("dark") / root.classList.remove("dark")

// After (fixed — correct key, correct attribute)
localStorage.setItem("lm-theme", newTheme)
document.documentElement.setAttribute("data-theme", newTheme)
```

---

### Bug 11 — Tailwind `darkMode` selector was inverted

**File affected:** `tailwind.config.ts`  
**Symptom:** `dark:` utility classes applied in light mode and not in dark mode — the opposite of intended behaviour.

**Root cause:** The config had:
```ts
darkMode: ["selector", '[data-theme="light"]'],
```
This tells Tailwind that dark mode is active when `[data-theme="light"]` is present on the root element — completely backwards. Every `dark:` variant class was activating in light mode.

**Fix:**
```diff
- darkMode: ["selector", '[data-theme="light"]'],
+ darkMode: ["selector", '[data-theme="dark"]'],
```

---

### Bug 12 — Lorcan brand badge invisible (login + register left panels)

**Files affected:** `src/app/login/page.tsx`, `src/app/register/page.tsx`  
**Symptom:** The "LORCAN MEDICAL COLLEGE" badge in the left panel was completely invisible — no background, no text.

**Root cause:** `bg-lorcan-dark/60` and `border-lorcan/20` use Tailwind v3 opacity modifiers (`/60`, `/20`) on CSS variable-based colours. As established in Bug 3, Tailwind v3 cannot decompose CSS variables into RGB channels, so opacity modifiers produce no output.

**Fix:** Replaced with explicit `style` attributes using raw hex/rgba values. Logo teal colour (`#14B8A6`) is now applied in both light and dark mode as requested:

```tsx
<div
  style={{ backgroundColor: "#0D3B3B", border: "1px solid rgba(20,120,120,0.3)" }}
  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-10"
>
  <div style={{ backgroundColor: "#14B8A6" }} className="w-1.5 h-1.5 rounded-full" />
  <span style={{ color: "#14B8A6" }} className="text-[11px] font-medium tracking-wide">
    LORCAN MEDICAL COLLEGE
  </span>
</div>
```

---

### Bug 13 — Light mode missing colour token overrides

**File affected:** `src/app/globals.css`  
**Symptom:** After fixing the theme toggle and darkMode selector, light mode still had incorrect colours — accent, success/warning/error states, and teal were all showing dark mode values.

**Root cause:** The `[data-theme="light"]` override block in `globals.css` was missing `--accent-primary`, `--accent-hover`, `--accent-glow`, `--state-success`, `--state-warning`, `--state-error`, `--teal`, and `--teal-hover` declarations. These defaulted to the dark mode root values.

**Fix:** Added all missing token overrides to the `[data-theme="light"]` block with appropriate light-mode values.

---

### Bug 14 — Topbar avatar colour not rendering

**File affected:** `src/components/layout/topbar.tsx`  
**Symptom:** The user initials avatar in the topbar had no background colour (same CSS variable opacity issue as other bugs).

**Fix:** Replaced `bg-accent` (which suffers from the opacity modifier problem in some contexts) with a hardcoded `style={{ backgroundColor: "#147878" }}` so the avatar is always the Lorcan teal — consistent with the brand and visible in both modes.

---

## 10. Feature: Lorcan College Logo Teal Colour

**Request:** Logo and brand badge should always display in Lorcan teal (`#14B8A6` / `#147878`) in both light and dark mode.

**Implemented in:**
- `sidebar.tsx` — logo badge background `#147878`, dot accent `#2DD4BF`, "LOR MENTOR" text white, "Lorcan Medical College" subtitle `#78AAAE`
- `login/page.tsx` — brand badge: background `#0D3B3B`, text and dot `#14B8A6`
- `register/page.tsx` — same as login

All logo colours are now hardcoded inline styles rather than token-based classes, ensuring they never break from theme or config changes.

---

## 11. Updated Summary

| Category | Tests Run | Passed | Failed |
|---|---|---|---|
| Backend API | 11 | 11 | 0 |
| Frontend pages | 6 | 6 | 0 |
| Frontend build | 1 | 1 | 0 |
| Bugs found (session 1) | 5 | — | — |
| Bugs fixed (session 1) | 5 | — | — |
| Bugs found (session 2) | 3 | — | — |
| Bugs fixed (session 2) | 3 | — | — |
| Bugs found (session 3 — UI/UX) | 6 | — | — |
| Bugs fixed (session 3 — UI/UX) | 6 | — | — |
| **Total bugs found** | **14** | — | — |
| **Total bugs fixed** | **14** | — | — |

**Overall status: ✅ PASS — all 14 bugs resolved, theme system working correctly in both modes, brand colours applied consistently.**
