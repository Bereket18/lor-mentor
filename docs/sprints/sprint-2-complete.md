# Sprint 2 — User Management & App Layout
## Lor Mentor · Lorcan Medical College
### Status: ✅ COMPLETE

---

## What We Built in Sprint 2

```
Backend:
  GET  /api/v1/users/me           → current user profile
  GET  /api/v1/users              → paginated user list (admin)
  PATCH /api/v1/users/:id/role    → change user role (admin)
  PATCH /api/v1/users/:id/status  → activate/deactivate (admin)
  PATCH /api/v1/users/me/profile  → update own profile

Frontend:
  Sidebar navigation (role-aware — student/teacher/admin nav)
  Topbar (page title, theme toggle, notifications bell, avatar)
  Mobile bottom navigation (5 tabs for phones)
  App layout (wraps every logged-in page)
  Student dashboard (KPI cards, course progress, AI activity, exam readiness)
```

---

## Technologies Introduced This Sprint

### What is a Next.js Route Group?

A folder with brackets like `(app)` is a Route Group.
It groups related routes together WITHOUT adding to the URL.

```
src/app/(app)/dashboard/page.tsx  →  localhost:3000/dashboard
src/app/(app)/courses/page.tsx    →  localhost:3000/courses
```

The `(app)` part is invisible in the URL.
The benefit is we can apply a shared layout to all routes in the group.
Every page inside `(app)/` gets the sidebar and topbar automatically.

Without route groups you would have to add sidebar and topbar
to every single page manually.

---

### What is a Layout File?

In Next.js every `layout.tsx` file wraps all pages in the same folder.

```
(app)/
  layout.tsx        ← Runs for EVERY page inside (app)/
  dashboard/
    page.tsx        ← Gets wrapped by layout.tsx
  courses/
    page.tsx        ← Also gets wrapped by layout.tsx
  ai-tutor/
    page.tsx        ← Also gets wrapped by layout.tsx
```

This is how we add the sidebar once and have it appear on
every student page without repeating ourselves.

---

### What is Framer Motion?

Framer Motion is a React animation library.

Without it you would write CSS animations:
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.element { animation: fadeIn 0.3s ease-out; }
```

With Framer Motion:
```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  Content
</motion.div>
```

Much cleaner. Also handles complex animations like:
- Staggered children (cards appear one after another)
- Layout animations (elements smoothly move when list changes)
- Gesture animations (hover, tap, drag)

We use it on the dashboard so cards animate in smoothly
when the page loads — professional feel without effort.

---

## Every File We Created — Line by Line

---

### `/apps/api/src/modules/users/users.controller.ts`

**Purpose:** HTTP endpoints for user management.
Thin layer — delegates everything to UsersService.

```ts
interface AuthUser {
  id:              string
  email:           string
  fullName:        string
  role:            string
  isActive:        boolean
  isEmailVerified: boolean
  createdAt:       Date
}
```
We define the shape of the logged-in user instead of using `any`.
This is what `JwtStrategy.validate()` returns and attaches to `request.user`.
TypeScript now knows exactly what fields are available.

```ts
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
```
`@UseGuards(JwtAuthGuard)` at the class level means EVERY route
in this controller requires authentication. We do not need to
add it to each method separately.

```ts
@Get()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
findAll(
  @Query('page')   page   = '1',
  @Query('limit')  limit  = '20',
  @Query('search') search = '',
  @Query('role')   role   = '',
)
```
`@Query()` reads URL parameters:
`GET /api/v1/users?page=2&search=bereket&role=STUDENT`
Default values mean the params are optional.
`parseInt(page, 10)` converts the string `"2"` to the number `2`.
The `10` is the radix — always pass it to prevent octal parsing bugs.

---

### `/apps/api/src/modules/users/users.service.ts` (new methods)

#### findAll()
```ts
const where: Prisma.UserWhereInput = {}
```
`Prisma.UserWhereInput` is the correct type generated from our schema.
It knows that `role` must be the `Role` enum — not any string.
This prevents type errors and catches bugs at compile time.

```ts
if (role && Object.values(Role).includes(role as Role)) {
  where.role = role as Role
}
```
`Object.values(Role)` returns `['GUEST', 'STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN']`.
We check the incoming string is in that list before casting.
This prevents invalid values from reaching the database query.

```ts
const [users, total] = await Promise.all([
  this.prisma.user.findMany({ ... }),
  this.prisma.user.count({ where }),
])
```
`Promise.all()` runs both queries at the SAME TIME.
Without it they would run one after another — twice as slow.
Both use the same `where` filter so counts match the returned data.

#### changeRole()
```ts
data: { role: role as 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN' }
```
We cast to a union type instead of `any`.
TypeScript accepts this because we validated the string above.
Prisma accepts this because it matches the schema enum exactly.

---

### `/apps/web/src/lib/utils.ts`

**Purpose:** Small helper functions used everywhere in the frontend.

#### cn()
```ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```
The most important utility. Used in almost every component.

`clsx` handles conditional classes:
```ts
clsx('base', isActive && 'active', isError && 'error')
// → 'base active'  (if isActive=true, isError=false)
```

`twMerge` resolves Tailwind conflicts:
```ts
twMerge('bg-white bg-red-500')
// → 'bg-red-500'  (last one wins, no duplicate properties)
```

Together:
```ts
cn('bg-white rounded', isActive && 'bg-accent', className)
// Handles conditions AND merges conflicts safely
```

#### toggleTheme()
```ts
export function toggleTheme(): 'light' | 'dark' {
  const current = document.documentElement.getAttribute('data-theme') ?? 'light'
  const next    = current === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('lm-theme', next)
  return next
}
```
- Reads the current theme from the `<html>` element
- Flips it to the other
- Sets it back on `<html data-theme="dark">`
- Saves to localStorage so it persists on page refresh
- Returns the new value so the caller can update React state

---

### `/apps/web/src/components/layout/sidebar.tsx`

**Purpose:** The dark left navigation panel. Appears on every logged-in page.

```ts
const studentNav = [ ... ]
const adminNav   = [ ... ]
const teacherNav = [ ... ]
```
Three separate navigation arrays for each role.
We do not show admin routes to students.
We do not show teacher routes to admins.
Clean separation — no if/else sprawl in the template.

```ts
const navItems = isAdmin
  ? adminNav
  : isTeacher
  ? teacherNav
  : studentNav
```
Pick the right nav based on role.
`isAdmin` and `isTeacher` come from `useAuth()`.

```ts
const isActive =
  item.href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname.startsWith(item.href)
```
Special case for `/dashboard` — we use exact match.
Otherwise `/dashboard` would match `/dashboard/anything`.
All other routes use `startsWith` so `/courses/123` highlights
the Courses nav item.

```tsx
<motion.div
  whileHover={{ x: 2 }}
  transition={{ duration: 0.15 }}
>
```
On hover the nav item moves 2 pixels to the right.
Subtle — but it makes the sidebar feel alive.
Duration 0.15s is fast enough to not feel sluggish.

```tsx
{isActive && (
  <motion.div
    layoutId="activeBar"
    className="absolute left-0 w-0.5 h-6 bg-brand-400 rounded-r"
  />
)}
```
`layoutId="activeBar"` is a Framer Motion feature.
When the active item changes, the indicator bar
smoothly slides from the old position to the new one.
One line — impressive animation.

---

### `/apps/web/src/components/layout/topbar.tsx`

**Purpose:** The top bar visible on every logged-in page.

```ts
const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/courses':   'My Courses',
  ...
}
const title = pageTitles[pathname] ?? 'Lor Mentor'
```
Maps URL paths to human-readable page titles.
The `??` operator means "if pageTitles[pathname] is undefined,
use 'Lor Mentor' as fallback".

```tsx
<button onClick={handleThemeToggle}>
  {isDark ? <Sun /> : <Moon />}
</button>
```
Shows the Sun icon in dark mode (click to go light).
Shows the Moon icon in light mode (click to go dark).
Intuitive — shows what you WILL switch TO, not what you ARE.

---

### `/apps/web/src/app/(app)/layout.tsx`

**Purpose:** Wraps every logged-in page with sidebar + topbar.
Also handles the auth redirect.

```ts
useEffect(() => {
  if (!loading && user === null) {
    router.push('/login')
  }
}, [user, loading, router])
```
Client-side auth check. If no user is logged in, redirect to login.
`!loading` ensures we wait for the auth check to complete
before redirecting — prevents flash of redirect on page load.

```ts
if (loading || user === null || user === undefined) {
  return <LoadingSpinner />
}
```
Three possible states:
- `undefined` → still checking (show spinner)
- `null` → not logged in (useEffect above redirects)
- `User` → logged in (render the layout)

This prevents students from ever seeing a flash of the
dashboard before being redirected to login.

---

### `/apps/web/src/app/(app)/dashboard/page.tsx`

**Purpose:** The first page a student sees after login.

```ts
const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07 },
  },
}
```
Stagger means each child animates in 70ms after the previous one.
4 KPI cards appear one by one — not all at once.
Creates a professional, polished feel.

```tsx
const firstName = user?.fullName?.split(' ')[0] ?? 'Student'
```
`?.` is optional chaining — safely accesses nested properties.
If `user` is null, or `fullName` is undefined, it does not crash.
`split(' ')[0]` gets the first name from "Bereket Adamsseged" → "Bereket".

```tsx
const hour     = new Date().getHours()
const greeting =
  hour < 12 ? 'Good morning' :
  hour < 17 ? 'Good afternoon' :
  'Good evening'
```
Personalised greeting based on time of day.
Small detail — makes the platform feel alive and thoughtful.
Students notice these things.

---

## Why the App Looks Plain Right Now

This is expected at this stage. We have built:
✅ The structure (routing, layout, components)
✅ The logic (auth, data fetching, state)
✅ The design tokens (CSS variables defined)

We have NOT yet set up:
❌ Google Fonts loaded in root layout
❌ ShadCN UI initialized
❌ Components using real ShadCN components

The next step (before Sprint 3) is fixing the visual design.
This is the correct order — structure before style.

---

## API Endpoints Added This Sprint

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/v1/users/me | Student+ | Get own profile |
| GET | /api/v1/users | Admin | Paginated user list |
| PATCH | /api/v1/users/:id/role | Admin | Change user role |
| PATCH | /api/v1/users/:id/status | Admin | Activate/deactivate |
| PATCH | /api/v1/users/me/profile | Student+ | Update own name |

---

## Frontend Pages Added This Sprint

| Component | Purpose |
|---|---|
| Sidebar | Role-aware navigation, logout, user info |
| Topbar | Page title, theme toggle, notifications |
| MobileNav | Bottom tab bar for phones |
| App Layout | Wraps all logged-in pages, auth redirect |
| Dashboard | KPI cards, course progress, AI activity, exam readiness |

---

## TypeScript Lessons This Sprint

### Lesson 1 — Never use `any`
```ts
// ❌ Wrong — no type safety
const user: any = request.user

// ✅ Correct — define the shape
interface AuthUser { id: string; email: string; role: string }
const user: AuthUser = request.user
```

### Lesson 2 — Use Prisma's generated types
```ts
// ❌ Wrong — too loose
const where: any = {}

// ✅ Correct — Prisma's own type
const where: Prisma.UserWhereInput = {}
```

### Lesson 3 — Prefix unused params with underscore
```ts
// ❌ ESLint error — declared but never used
async changeRole(userId: string, role: string, actorId: string)

// ✅ Correct — underscore signals intentionally unused
async changeRole(userId: string, role: string, _actorId: string)
```

---

## Git History This Sprint

```
feat(users): add users endpoints with pagination, role management and status control
feat(layout): add sidebar, topbar, mobile nav and app layout with auth guard
feat(dashboard): add student dashboard with KPI cards and AI activity panel
```

---

## Sprint 3 Preview

Next we fix the visual design (fonts + ShadCN) then build:

- Academic structure API (Department → Year → Semester → Course)
- Admin can create and manage the entire content hierarchy
- Public course browser (guests can see departments and courses)
- Course cards with cover images

*Document generated at end of Sprint 2*
*Next update: End of Sprint 3 — Academic Structure*