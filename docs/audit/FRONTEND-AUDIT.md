# LOR MENTOR — FRONTEND AUDIT

**Phase:** Four (part) — Frontend
**Date:** 2026-10-17
**Stack:** Next.js 16.2 (`reactStrictMode`, `output: "standalone"`) + React 19.2 + TypeScript 5 + Tailwind 3.4 + TanStack React Query 5 + axios + react-hook-form + zod + framer-motion
**Pass:** static — `next build`, `eslint`, `tsc`, and Playwright were **NOT run** (see `INITIAL-BASELINE.md` R2.1). Anything execution-dependent is marked **NOT VERIFIED**.

## 1. Route Map

| Route | Type | Access (enforced at) |
|---|---|---|
| `/` | public landing | — |
| `/login`, `/admin-login` | public | — |
| `/register` | public | — |
| `/forgot-password`, `/reset-password` | public | — |
| `/verify-email` | public | — |
| `/pricing`, `/pricing/subscribe`, `/pricing/payment/callback` | public | — |
| `(app)/dashboard` | authed | STUDENT (`route-access.ts`) |
| `(app)/courses`, `/courses/[id]`, `/courses/[id]/study` | authed | STUDENT |
| `(app)/ai-tutor` | authed | STUDENT |
| `(app)/flashcards`, `(app)/quiz`, `(app)/progress` | authed | STUDENT |
| `(app)/forum` | authed | STUDENT / TEACHER |
| `(app)/profile`, `(app)/notifications` | authed | any logged-in |
| `(app)/teacher`, `/teacher/courses`, `/teacher/analytics` | authed | TEACHER |
| `(app)/admin`, `/users`, `/courses`, `/payments`, `/plans`, `/moderation`, `/audit` | authed | ADMIN / SUPER_ADMIN |

## 2. Auth & Access Control

- **Edge guard** — `src/proxy.ts` (Next 16 "proxy", formerly middleware) redirects logged-out users hitting a protected path to `/login` **before render**, keyed on the *presence* of `access_token` or `refresh_token` cookies. It cannot and does not verify the JWT; the API does. Matcher list covers all `(app)` prefixes.
- **Client gate** — `(app)/layout.tsx` uses `useAuth()` and `isAllowed(pathname, role)` from `lib/route-access.ts` (single source of truth shared with the proxy). On a disallowed area it `router.replace(homeFor(role))`.
- **Real enforcement** — every API call is still guarded server-side (JwtAuthGuard/RolesGuard/SubscriptionGuard). The frontend gates are UX only, which is the correct layering.
- **`homeFor`** — ADMIN/SUPER_ADMIN → `/admin`, TEACHER → `/teacher`, else `/dashboard`.
- `threadsafe`: cookie-based auth means JS never handles tokens (`httpOnly`).

## 3. API Client

`src/lib/api.ts`:
- baseURL `${NEXT_PUBLIC_API_URL}/api/v1`, `withCredentials: true`.
- **Single-flight refresh queue**: concurrent 401s share one `POST /auth/refresh`; queued requests replay after it succeeds; on failure it redirects to `/login`. Auth/pricing pages are excluded from the refresh loop to avoid loops on public pages. This correctly avoids the rotated-`jti` replay problem the old code had.
- **Observation (INFO):** on the auth pages the interceptor rejects the original error rather than retrying — correct.

## 4. Data Fetching

- `useAuth()` (`hooks/use-auth.ts`) is backed by one shared React Query key `["me"]`; `fetchMe` returns `null` on error so logged-out is a cached state, not an error loop. `login()` seeds the cache directly. This removed the previous duplicate `/me` fan-out.
- **Observation:** no explicit `staleTime`/`gcTime` are set on the React Query client, so defaults apply (stale immediately, gc 5 min). Acceptable, but paid-content lists re-fetch on every mount. Minor.
- `types/index.ts` hand-maintains response shapes mirroring API selections — no codegen. Risk of drift; keep in sync when the API changes.

## 5. Findings Fixed This Pass

- **B-3 — `RegisterResponse.verifyToken`** (`types/index.ts`) was a leftover `// Remove in production` field the API never returns. Removed; the interface is now `{ message: string }`. This cannot change runtime behaviour (the field never existed).

## 6. Findings Not Fixed (require confirmation / out of scope)

- **B-5 — `useAuth().register()` mismatch.** The hook posts only `{fullName,email,password}`, but `RegisterDto` requires `departmentId`/`academicYearId`/`phoneNumber`. The actual register page posts the full body **directly via `api.post`** and does **not** use the hook, so this dead helper would 400 if ever wired up. Left unchanged deliberately (removing/changing it without a full call-site search could break an unseen caller). **Recommendation:** delete the unused `register` from the hook, or make it accept the full payload.
- **No web healthcheck** in `docker-compose.prod.yml` (only `api` has one). See deployment doc.
- **No `error.tsx` / `not-found.tsx`** were found under `app/`; loading states exist (`(app)/loading.tsx`). Cosmetic resilience gap.

## 7. Build / Tooling

- `next.config.ts`: `output: "standalone"` + `outputFileTracingRoot` at the monorepo root — matches the Dockerfile's expectation of `.next/standalone` + `apps/web/server.js`. Rewrites `/api/v1/:path*` → `NEXT_PUBLIC_API_URL` so browser calls can be same-origin.
- `src/app/api/proxy/[...path]/route.ts`: SSRF-hardened pass-through that rejects `..`, `\`, `@`, and embedded `http(s):` segments, resolves against a fixed origin, and re-checks the origin. Streams bytes (PDF/image) with cookies forwarded. Good.
- **AGENTS.md note:** `apps/web/AGENTS.md` warns this Next.js version has breaking changes and to read `node_modules/next/dist/docs/` before writing code. No Next source was modified this pass.

## 8. Tests Present

Playwright config (`playwright.config.ts`) + 5 specs: `smoke`, `auth` (opt-in, needs servers), `accessibility`, `theme`, `verification`. **NOT run** — require the dev server (and API for auth).

## 9. NOT VERIFIED

`next build`, `tsc --noEmit` (web), `eslint` (web), Playwright run, production Docker image, real browser behaviour. The prior pass reported web `tsc` = 0 errors and one `react-hooks/set-state-in-effect` ESLint error in `admin/users/page.tsx`; that rule was reported fixed in the current tree during this pass, but **the lint was not re-run**.
