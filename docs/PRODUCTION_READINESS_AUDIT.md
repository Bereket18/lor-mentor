# Lor Mentor — Production Readiness Report

## 1. Executive Summary

The Lor Mentor platform (Next.js web + NestJS/Prisma API + Python receipt-verifier) is a feature-complete medical learning application with payments, AI tutoring, and content management. However, a review of 89 verified findings reveals **systemic weaknesses in the security, payments, and production-configuration layers** — including a JWT signature bypass, multiple payment-approval race conditions enabling duplicate subscriptions, missing amount verification against Chapa, and SSRF exposure in the web proxy. With **1 P0 blocker and 30 P1 findings**, the platform is not safe to expose to real users or process real money in its current state. The core product is sound, but a focused hardening pass across auth, payments idempotency, and deployment configuration is required before launch.

## 2. Deployment Decision

**Would you deploy to production today? NO.**

Deploying today would expose the platform to direct financial loss and account compromise. The combination of a JWT-secret-to-empty-string fallback (token forgery), unverified Chapa payment amounts, and at least four distinct payment-approval race conditions means an attacker could impersonate admins, activate subscriptions without paying the correct amount, or double-activate access. Compounding this, the P0 configuration gap (SMTP/Chapa/public-URL validation) means password reset and payment callbacks silently fail in production, and file-based receipt/material storage does not survive the horizontal scaling or redeploys any real deployment requires. These are not cosmetic — they are money-and-identity issues that must be closed before any real traffic.

## 3. Overall Production Readiness Score

**48 / 100**

Strong feature breadth and a coherent architecture, dragged down by a security/payments/DevOps foundation that is not launch-grade. The score reflects working functionality offset by a dense cluster of exploitable P1s and missing production guardrails.

## 4. Critical Blockers (P0)

| Issue | File | Impact | Fix |
|---|---|---|---|
| Missing prod validation for Chapa/SMTP config | `apps/api/src/config/env.validation.ts:40-45` | App boots without SMTP → password resets & payment notifications throw at request time; users locked out, payments stranded | Mark `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` required in production; fail fast at boot instead of request time |

## 5. Findings by Priority

### High Priority (P1)

**Security / Auth**
| Issue | File | Impact | Fix |
|---|---|---|---|
| JWT secret fallback to empty string bypasses signature verification | `common/strategies/jwt.strategy.ts` | Anyone can forge tokens if secret unset | Remove `''` fallback; let module fail to instantiate |
| Weak JWT secrets accepted in prod validation | `config/env.validation.ts:28-37` | Forgeable admin tokens | Require 64+ random chars; reject known weak patterns |
| Missing path traversal protection in receipt upload | `payments.service.ts:545-550` | `../../../etc/passwd` served if `receiptPath` poisoned | Validate `basename(path) === path`; reject otherwise |
| Weak rate-limiting for sensitive ops (120/min) | `app.module.ts:34` | Login brute-force via IP rotation | Reduce global to 30/min; `@Throttle` 5/min on login |
| API proxy lacks URL sanitization (SSRF) | `apps/web/.../api/proxy/[...path]/route.ts:22` | Server reaches cloud metadata/internal IPs | Reject `..`; whitelist path prefixes; build via `URL` |
| File upload size limits insufficient (DoS) | `materials.controller.ts:131`, `payments.controller.ts:96` | 250MB/min fills disk | Per-user quotas + per-endpoint `@Throttle` + disk alerts |
| Client-side auth redirect flash / no server middleware | `apps/web/(app)/layout.tsx:64-75` | Protected data visible 100-500ms pre-redirect | Add `middleware.ts` server-side 307 redirect |
| Login does not enforce email verification; weak lockout | `auth.service.ts:127-186` | Brute-force of weak passwords | Exponential backoff + CAPTCHA at 5 fails |

**Payments**
| Issue | File | Impact | Fix |
|---|---|---|---|
| Amount tampering — client can override server price | `payments.service.ts:105-115` | Pay 1 ETB for 1000 ETB plan | Snapshot plan price into `payment.amount` at creation; verify Chapa amount |
| Chapa verify checks status, not amount | `chapa.service.ts:224-240` | Underpayment approved | Compare `chapaAmount` vs `plan.priceETB` within tolerance |
| Non-deterministic txRef → duplicate activations | `chapa.service.ts:103-110` | Multiple PENDING payments per plan | Unique constraint on `(userId, planId, method, status='PENDING')` |
| Duplicate subscription — parallel approvals activate same user | `payments.service.ts:405-411` | Double activation, wrong end dates | Lock `SELECT ... FOR UPDATE` on active sub; reject if present |
| Payment approval race / duplicate subscription guard missing | `chapa.service.ts:82-83` | Two payments both go ACTIVE | Transactional check inside `finalizeApproval()` |
| Admin approval lacks role/threshold controls | `payments.service.ts` | Junior admin approves all payments | Restrict high-value approvals to SUPER_ADMIN; audit role + 2FA |

**AI**
| Issue | File | Impact | Fix |
|---|---|---|---|
| Prompt injection via user question | `gemini.service.ts:116-141` | System prompt leak / behavior hijack | Wrap input in XML tags; use system param; validate patterns |
| No per-user rate limiting on AI tutor | `tutor.controller.ts:14-17`, `app.module.ts:34` | Financial DoS on API budget | `@Throttle` keyed by userId; token pre-count; spend alerts |
| Non-subscriber can call AI tutor | `tutor.service.ts:19-35` | Paid feature leaks to free users | `ensureActiveForStudent()` / `SubscriptionGuard` |
| Context leakage — tutor serves other students' materials | `tutor.service.ts:77-92` | IP leak, cheating | Enforce enrollment/academic-year access in `buildContext()` |
| PDF extraction silently truncates/fails | `ai.processor.ts:47-55` | Biased/empty AI content, no cause shown | Log length+source; typed errors; chunked extraction |

**Code Quality / QA**
| Issue | File | Impact | Fix |
|---|---|---|---|
| Magic role strings in courses.service | `courses.service.ts:178` | Typo silently breaks authz | Use `Role` enum consistently |
| Quiz attempt missing ownership check | quiz endpoint (`quiz/page.tsx:86-92`) | Cross-course credit farming | Verify enrollment before accepting attempt |
| Admin panel action logs not verified on approve/reject | `payments.service.ts` | Compromised admin approves everything | Role-gated approvals + audited approver identity |

**Production / DevOps**
| Issue | File | Impact | Fix |
|---|---|---|---|
| Local disk storage for uploads | `materials.controller.ts:33` | Files vanish on scale/redeploy | Migrate to S3/R2; store key in DB |
| CORS_ORIGIN defaults to localhost in prod | `main.ts:26` | Frontend fully broken if unset | Require `CORS_ORIGIN` in prod validation |
| No graceful shutdown (Redis/BullMQ not drained) | `main.ts:57-60` | AI jobs lost on deploy | SIGTERM handler → `app.close()` + drain queues |
| Readiness probe ignores DB/queue | `app.controller.ts:11-17` | Dead pod marked Ready | `/readiness` runs `SELECT 1` + Redis ping |
| No error tracking / centralized logging | `all-exceptions.filter.ts:43-48` | Silent failures, no alerts | Integrate Sentry; persist logs to volume |
| No migration check at boot | `prisma.service.ts:18-20` | App runs on stale schema | Check `migrate status` at `onModuleInit` |
| Redis/BullMQ connection not validated at startup | `app.module.ts:31-38` | Jobs silently never process | Ping Redis at boot; exit(1) on failure |
| API/WEB public URLs default to localhost | `env.validation.ts:1-65` | Chapa callback unreachable → stranded payments | Require `API_PUBLIC_URL`/`WEB_PUBLIC_URL` in prod |

**Accessibility / UX**
| Issue | File | Impact | Fix |
|---|---|---|---|
| Form labels not associated via htmlFor | `login/page.tsx:192`, `register` | Screen readers can't map labels | Add `id`/`htmlFor` pairs |
| Inputs lack aria-invalid/aria-describedby | `login/page.tsx:193`, `register` | Errors invisible to SR users | Add `aria-invalid` + `aria-describedby` |
| Missing focus-visible styling app-wide | `topbar.tsx`, `sidebar.tsx`, `mobile-nav.tsx` | Keyboard focus invisible (WCAG 2.4.7) | CSS `:focus-visible` outline; drop JS hover overrides |

### Medium Priority (P2)

**Auth / Security**
| Issue | File | Fix |
|---|---|---|
| Weak dev JWT secrets | `apps/api/.env` | `openssl rand -hex 32`; document rotation |
| Password reset token not single-use (race) | `auth.service.ts` | Verify+clear atomically in one transaction |
| Email verify token replayable | `auth.service.ts` | Atomic check-not-null + clear in txn |
| `getReceiptPath()` no ownership check | `payments.service.ts` | Pass requester; verify owner/admin |
| No rate-limit on register/verify/forgot-password | `auth.controller.ts` | `@Throttle` per endpoint |
| Brute-force lockout per-user not per-IP | `auth.service.ts` | Combine per-user + per-IP throttling |
| CORS too permissive with credentials | `main.ts:25-28` | Whitelist origins; require explicit prod value |
| Insufficient MIME validation (P3→trusts client) | `materials.controller.ts:52-65` | Validate magic bytes synchronously in filter |
| No CSRF protection on state-changing endpoints | `main.ts` | CSRF token header + SameSite=Strict |
| Logout doesn't invalidate refresh token | `auth.controller.ts:111-119` | Server-side blacklist (Redis) with expiry |

**Payments**
| Issue | File | Fix |
|---|---|---|
| Double activation on concurrent approvals | `payments.service.ts:404-451` | Move status check inside transaction |
| Bank reference uniqueness not atomic | `payments.service.ts:162-199` | Serializable txn / `FOR UPDATE` lock |
| Masked account matching bypassable | `bank-account-match.ts:14-36` | Require ≥6 visible digits; confidence score |
| Verifier unauthenticated if token unset | `services/receipt-verifier/main.py:95-97` | Require token; disable endpoint if missing |
| No duplicate detection across uploads | `payments.service.ts:77-116` | SHA256 receipt hash; reject approved dupes |
| Missing transaction protection in `approve()` | `payments.service.ts:369-371` | Guard `status !== PENDING` before finalize |
| No rate limit on webhook (replay) | `payments.controller.ts:132-139` | `@Throttle` + nonce validation |
| File receipts don't survive scaling | `payments.controller.ts:37-40` | Object storage + signed URLs |
| Admin payments page swallows action errors | `admin/payments/page.tsx:135-155` | Surface 403/409/500 to admin |

**AI**
| Issue | File | Fix |
|---|---|---|
| No Gemini key validation/rotation | `ai/gemini.service.ts:25-29` | Startup test call; multi-key round-robin |
| Tutor responses stored plaintext, unbounded | `tutor.service.ts:25-33` | Truncate; paginate; encrypt/redact flag |
| Job failure doesn't notify teachers | `ai.processor.ts:111-121` | Failure notification + retry job |
| JSON mode output not schema-validated | `gemini.service.ts:85-109` | `zod` schema parse; retry on failure |

**Performance**
| Issue | File | Fix |
|---|---|---|
| 54 `use client` → no code-splitting | `src/app` | Audit; move to RSC; target ≤15 |
| React Query unused → waterfalls | `dashboard/page.tsx:48-65` | Convert `api.get` to `useQuery` |
| framer-motion on every page (~40KB) | `sidebar.tsx`, dashboard, +10 | CSS animations; lazy-load heavy pages |
| Study page course→material waterfall | `study/page.tsx:79-119` | `useQuery` with `enabled` dependency |
| Dashboard blocks on slowest of 3 fetches | `dashboard/page.tsx:48-65` | Independent `useQuery` per section |
| Animations ignore prefers-reduced-motion | dashboard, study, +15 | Gate transition duration on media query |

**Code Quality**
| Issue | File | Fix |
|---|---|---|
| Silent file-delete failure | `materials.service.ts:163` | Log non-ENOENT unlink errors |
| Missing Prisma indexes on hot columns | `schema.prisma:108-110` | Add `@@index` on email/role/dept/flags |
| Unhandled rejection in `buildContext()` | `tutor.service.ts:57-96` | try/catch → fallback to general knowledge |
| Hardcoded role strings in `isAdminRole()` | `materials.service.ts:235-237` | Use canonical `isPrivileged()` |

**Accessibility / UX**
| Issue | File | Fix |
|---|---|---|
| Hardcoded `#EF4444` badge color | `notification-bell.tsx:39` | `var(--state-error)` |
| Hardcoded `#2DD4BF` spinner | `pdf-viewer.tsx:244` | `var(--teal)` |
| Hardcoded error colors in forms | `login/page.tsx:184,194,208` | `var(--state-error)` |
| Sidebar nav mouse-only focus styling | `sidebar.tsx:172-288` | `:focus-visible` + onFocus/onBlur |
| Mobile nav lacks semantic `<nav>`/ARIA | `mobile-nav.tsx:27-60` | `<ul>/<li>` or `<button>` roles |
| Wrong aria-label "Delete user profile" on close | `material-viewer.tsx:103,142` | "Close material viewer" |
| Inline JS hover style mutation | `sidebar.tsx`, `topbar.tsx:65-72` | CSS/Tailwind hover classes |
| Sidebar logo not a link | `sidebar.tsx:84-142` | Wrap in `<Link href>` |
| `--teal-glow` low contrast in light mode | `globals.css:142,145` | Raise opacity to 0.3-0.4 |
| Quiz/AI/forum authz to course not validated | `quiz/`, `ai-tutor/` pages | Enforce enrollment server-side |
| Profile password-change error not reset | `profile/page.tsx:127-150` | Clear fields + message on 401 |

### Nice-to-Have (P3)

| Issue | File | Domain | Fix |
|---|---|---|---|
| No `loading.tsx` for most segments | home/login/pricing/courses[id] | web-perf | Add per-segment skeletons |
| ParallaxBackground scroll unthrottled | `parallax-background.tsx:20-29` | web-perf | Throttle via `requestAnimationFrame` |
| SubscriptionGuard renders twice, unmemoized | `subscription-guard.tsx` | web-perf | `React.memo`; pass user as prop |
| Query provider `refetchOnWindowFocus:false` | `query-provider.tsx:19-24` | web-perf | Enable for notifications/progress |
| Dead `AppService` code | `app.service.ts:1-11` | api-quality | Delete class + provider entry |
| Commented `NotFoundException` import | `auth.service.ts:6` | api-quality | Remove line |
| Potential N+1 in `getFullProfile` (uncertain) | `users.service.ts:497-558` | api-quality | Profile; split into parallel queries if needed |
| Forum/notification per-user filtering | `forum/page.tsx` | qa | Filter reads/writes by `userId` |
| Concurrent submit on subscribe page | `subscribe/page.tsx:94-109` | qa | `useRef` guard flag |
| No HTTPS/TLS support in `main.ts` | `main.ts:48-54` | prod-config | Optional TLS via env |
| File serving lacks cache-control headers | `materials.controller.ts:101-121` | prod-config | `Cache-Control` + ETag / CDN |

## 6. Domain Scorecards

| Domain | Score | Reasoning |
|---|---|---|
| **Security** | 3/10 | JWT empty-secret bypass, SSRF proxy, no CSRF, weak rate-limits, path traversal — multiple directly exploitable holes. |
| **Payments** | 3/10 | Amount tampering, unverified Chapa amounts, and 4+ approval race conditions make money handling unsafe. |
| **Auth** | 4/10 | Reasonable flows but replayable tokens, per-user-only lockout, non-invalidated logout, and secret fallback undermine it. |
| **Performance** | 5/10 | Functional but CSR-heavy: 54 client components, unused React Query, framer-motion everywhere, request waterfalls. |
| **Code Quality** | 6/10 | Mostly clean; magic role strings, silent failures, dead code, and missing indexes are fixable hygiene issues. |
| **Maintainability** | 6/10 | Coherent module structure; duplicated privilege checks and inline style mutation add friction. |
| **Scalability** | 3/10 | Local disk storage and no graceful shutdown break the moment you run more than one instance. |
| **Accessibility/UX** | 4/10 | Systemic WCAG-A gaps: unlabeled inputs, invisible focus, wrong ARIA, hardcoded theme colors. |
| **Production/DevOps** | 2/10 | P0 config validation gap plus no readiness checks, error tracking, migration checks, or queue validation. |
| **Testing** | 1/10 | No test coverage surfaced anywhere in the findings; verification burden falls entirely on manual review. |

## 7. Risk Assessments

**Security risk — HIGH.** The attack surface is broad and shallow: a forged JWT (empty-secret fallback) grants admin impersonation, the web proxy enables SSRF against cloud metadata, and absent CSRF protection lets a malicious page trigger admin payment approvals via ambient cookies. Rate-limiting is too loose to slow credential stuffing. Any single one of these is sufficient to justify blocking launch; together they indicate the auth/security layer needs a dedicated hardening sprint, not point fixes.

**Performance risk — MEDIUM.** Nothing here crashes the app, but the platform behaves like a client-rendered SPA: 54 `use client` directives, an installed-but-unused React Query causing refetch waterfalls, and framer-motion shipped on every route. Users on slow networks or mobile will feel 2-5s repeat-navigation delays and janky, reduced-motion-ignoring animations. This degrades perceived quality and battery life but does not endanger data — it is a post-launch optimization track, not a blocker.

**Code quality risk — MEDIUM.** The codebase is structurally sound but leaks reliability through small cracks: magic role strings that silently break authorization on a typo, duplicated privilege checks that drift out of sync, silent file-delete failures that orphan storage, and missing DB indexes that will degrade as the user table grows. The complete absence of surfaced test coverage is the larger long-term risk — every one of the race conditions above is exactly the class of bug automated tests would catch and regressions will reintroduce.

## 8. Recommended Fix Sequencing

1. **Unblock boot integrity (P0):** enforce prod validation for SMTP, Chapa keys, `CORS_ORIGIN`, and `API_PUBLIC_URL`/`WEB_PUBLIC_URL` — fail fast so misconfiguration can't reach users.
2. **Close identity bypasses:** remove the JWT empty-secret fallback, enforce strong prod secrets, and rotate the weak dev secrets.
3. **Harden payments money-path:** snapshot plan price at creation, verify Chapa amount server-side, and wrap all approval/activation in transactions with `FOR UPDATE` locks + unique constraints to kill the double-activation races.
4. **Fix web attack surface:** sanitize/whitelist the API proxy (SSRF), add CSRF protection, tighten global and per-endpoint rate limits, and add path-traversal validation on receipt serving.
5. **Lock down AI as a paid, scoped feature:** enforce subscription + enrollment checks in the tutor, add per-user throttling and token budgets, and neutralize prompt injection.
6. **Make it deployable at scale:** migrate file storage to object storage, add graceful shutdown, a real `/readiness` probe, Redis/BullMQ startup validation, migration checks at boot, and Sentry error tracking.
7. **Auth robustness:** single-use reset/verify tokens, per-IP + per-user lockout with backoff, and server-side refresh-token invalidation on logout.
8. **Data-layer hygiene:** add the missing Prisma indexes, replace magic role strings with the `Role` enum / `isPrivileged()`, and fix silent file-delete handling.
9. **Accessibility compliance pass:** associate form labels, add `aria-invalid`/`aria-describedby`, restore visible `:focus-visible`, correct the mislabeled close button, and replace hardcoded theme colors with CSS variables.
10. **Performance & polish:** convert `api.get` calls to React Query, reduce `use client` footprint, trim/lazy-load framer-motion, honor `prefers-reduced-motion`, and add per-segment `loading.tsx`.
11. **Establish a test suite:** begin with regression tests for the payment races and auth flows fixed above, since these are the highest-value and most likely to regress.