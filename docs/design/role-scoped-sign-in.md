# Role-scoped sign-in: feasibility study

Status: proposal for decision

## 1. Question

Should administrators and super administrators — and possibly teachers — be
prevented from signing in through the student sign-in page (`/login`)?

The answer depends on what "prevented" means. This study separates the two
possible requirements and recommends the one that is enforceable.

## 2. Current behaviour

Verified in this checkout:

- `/login` accepts any valid email and password and then routes by role:
  `ADMIN`/`SUPER_ADMIN` → `/admin`, `TEACHER` → `/teacher`, everyone else →
  `/dashboard` (`apps/web/src/app/login/page.tsx`).
- `/admin-login` exists and is password-only. It calls the same login endpoint,
  then checks the returned role in the browser. A non-admin is logged out with
  "This portal is for administrators only." That check happens after the API has
  already issued and set a session.
- The passwordless flow is already role-aware on the server: administrator
  addresses are suppressed at initiation and refused at completion, so no
  admin can obtain an email-link or code session. Teachers can use it and are
  routed to `/teacher`.
- `POST /api/v1/auth/login` has no notion of a portal or audience. Any account
  with a correct password receives a session.
- The edge guard (`apps/web/src/proxy.ts`) only checks for the presence of an
  auth cookie. Role-to-route access is enforced in the app layout by
  `apps/web/src/lib/route-access.ts`; the API re-checks roles on its own
  endpoints.
- There is no teacher login page, and `/admin-login` is not linked from anywhere
  in the application.

So today an administrator can sign in from the public student page and is
simply sent to `/admin`. The dedicated admin page is optional and its role
check is client-side only.

## 3. What "cannot sign in" can mean

| Interpretation | What changes | Real effect |
| --- | --- | --- |
| UX-only | The page detects the role after login and logs the session out again | The user sees a message, but the session existed. Anyone can bypass it by calling the API directly. |
| Server-enforced | The API refuses to issue a session for that role on that surface | The session never exists. This is the only interpretation that matches "cannot sign in". |

Recommendation: state the requirement as the server-enforced one. A page-level
check alone is cosmetic and creates the false impression of a boundary.

## 4. Threat model and value

What this actually buys:

- Admin credentials stop working on the public student surface, so a
  mistyped or phished admin sign-in does not silently open an admin session
  from the student page.
- The admin portal becomes the only place an admin session is minted. That is a
  prerequisite for portal-specific controls later: MFA, IP allowlisting,
  shorter session lifetimes, and a clean "admin sign-in" audit trail.
- It removes the odd path where the student page routes an administrator to
  `/admin`, which currently makes `/admin-login` redundant.

What it does **not** buy:

- It is not an authorization control. An attacker with a valid admin password
  can still sign in through the admin endpoint. Admin data is protected by the
  API role guards and the route-access rules, not by which form was used.
- It does not replace the existing password-only rule for admin sessions, nor
  the passwordless refusal that is already in place.
- It does not hide the admin portal from the internet. Security by obscurity
  is not the goal.

This is access-routing hygiene plus a foundation for stronger admin controls,
not a privilege-escalation fix.

## 5. Options

### A. UI-only guard (not recommended as the only measure)

Have `/login` call `logout()` when the returned role is `ADMIN` or
`SUPER_ADMIN`, and keep the current check on `/admin-login`.

- Effort: about half a day, including copy and tests.
- Benefits: immediate messaging; no API change.
- Problems: the API already set HttpOnly cookies before the check; a second
  request is needed to revoke them; a race or a failed logout leaves a valid
  admin session; direct API calls bypass it entirely; the client cannot be
  trusted. It also logs out an admin who lands on the wrong page rather than
  preventing access.

### B. Audience on the shared login endpoint (recommended first step)

Add an optional `audience` value (`student`, `teacher`, `admin`) to
`POST /auth/login`. After the password is verified, the server compares the
account role with the requested audience and refuses before any token is
minted if they do not match. Both web pages always send an explicit audience.

- Effort: 1–2 days including tests and copy.
- Benefits: real server-side refusal, no new endpoint, additive and
  backward-compatible (clients that omit the field keep working), and one
  policy module that both controllers can share.
- Costs: the shared endpoint now mixes two products; per-portal throttling and
  audit still need work later; forgetting to send the field from a new client
  defaults to the permissive behaviour unless that default is chosen carefully.

### C. Dedicated admin endpoint (best if admin MFA is near-term)

Add `POST /api/v1/auth/admin/login`, calling the same credential-verification
service with a fixed `admin` audience. Keep `/auth/login` for
students/teachers.

- Effort: 2–3 days including tests and docs.
- Benefits: no client can forget an audience; separate throttles, lockout
  counters, audit events and rate limits; a natural place for MFA, IP
  allowlisting and shorter admin sessions; the student endpoint never has to
  know that admins exist.
- Costs: a small amount of controller duplication (the service logic is
  shared); two endpoints to document; slightly more test surface.

### D. Separate admin host or subdomain

Serve the admin portal from `admin.<domain>` with host-only cookies and its own
deployment.

- Effort: 1–2 weeks of infrastructure, DNS, TLS, cookie-scoping and deployment
  work.
- Benefits: strongest isolation; a stolen student-site cookie never reaches the
  admin origin.
- Costs: disproportionate for the current single-app deployment; the admin and
  student apps share a Next.js build and API today. Not recommended now.

## 6. Recommendation

1. **Do B now.** It is the smallest change that makes the requirement true
   rather than cosmetic, and it is structured so C can follow without moving
   the policy.
2. **Keep teachers on `/login` for now.** Teachers share the student app shell,
   the passwordless flow and several learning routes, and there is no teacher
   portal. Blocking them would remove their only sign-in path and disable
   passwordless sign-in for them. If the goal is specifically a "student-only"
   page, add `/teacher/login` and a `teacher` audience in a second phase.
3. **Remove the login-then-logout dance on `/admin-login`.** Once the server
   refuses the wrong audience, the client check and the extra logout request
   become unnecessary. A refusal must not create, clear or rotate a session.
4. **Do not count an audience mismatch as a failed password.** The password was
   correct; incrementing `failedLoginCount` or starting a lockout would let a
   mistyped portal choice lock a legitimate admin out.
5. **Audit the event, not the credential.** Record `AUTH_PORTAL_MISMATCH` with
   the role and the requested audience. Never log the password or the token.
6. **Make the admin portal discoverable.** `/admin-login` is currently an
   unlinked URL. Add an explicit link from the sign-in page footer or document
   it in the operations runbook, and mark it `noindex`.
7. **Revisit C if admin MFA, IP allowlisting or separate admin session
   lifetimes are planned within 6–12 months.** Building B first is still
   useful, but the policy module should be written so the dedicated endpoint
   can reuse it unchanged.

## 7. Design sketch for B

### Policy

Add a single predicate, for example in `auth-policy.ts`:

```ts
type SignInAudience = "student" | "teacher" | "admin";

function audienceAllows(role: Role, audience: SignInAudience): boolean {
  if (audience === "admin") return role === "ADMIN" || role === "SUPER_ADMIN";
  if (audience === "teacher") return role === "TEACHER";
  return role === "STUDENT" || role === "TEACHER"; // student page
}
```

The same predicate is used by the passwordless completion path once a teacher
portal exists. Today that path already refuses admins, so nothing changes
there.

### API

- `LoginDto` gains `@IsOptional() @IsIn(["student","teacher","admin"]) audience`.
- `AuthService.login` verifies credentials exactly as today, then checks
  `audienceAllows(user.role, dto.audience ?? "any")` before generating tokens.
  The default keeps old clients working; the web always sends a value.
- On mismatch, throw `ForbiddenException` with a fixed message. For an admin on
  the student page: "Use the administrator sign-in page." No cookies are set,
  no failed-login counter moves, and an audit event is written.
- Keep the existing 5/minute login throttle. The audience check adds no work
  beyond one role comparison.

### Web

- `useAuth.login(email, password, audience)` passes the field through.
- `/login` sends `student` (or `teacher` if the teacher page is added).
- `/admin-login` sends `admin` and shows the server message on 403 instead of
  calling `logout()`.
- The password reset and email verification pages currently send users to
  `/login`. A recovered admin will therefore be refused there once and told to
  use the admin portal; that is acceptable, but the copy should be explicit.
  If it is not acceptable, route those pages to `/admin-login` only when the
  reset/verify response names an admin role — which would itself disclose the
  role, so the simpler copy fix is preferable.

### Rollout

1. Deploy the API change (optional field).
2. Deploy the web change (both pages send an audience).
3. Watch `AUTH_PORTAL_MISMATCH` for a week; it should be near zero after the
   admin team updates bookmarks.
4. In a later phase, add `/teacher/login` and switch the policy if needed.

Old web clients and any API consumer that omits `audience` keep working during
the transition. Decide whether to remove that default after the mobile/API
clients are known, because "omitted means any role" is the one weak point of B.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Valid credentials reveal that an address is an admin | The role check only runs after a correct password, so the attacker already holds the credential. Use neutral copy ("Use the sign-in page for your role") if disclosure still matters. |
| A client forgets to send the audience | Start with a short compatibility default, then remove it; or choose C so the endpoint itself fixes the audience. |
| A legitimate admin is locked out by the new rule | Test the admin audience explicitly; keep `/admin-login` working before and after deploy; do not count mismatches as failures. |
| Teachers lose access by accident | The student audience explicitly includes `TEACHER`; block only after a teacher portal exists. |
| Existing admin sessions stay valid | Decide whether to bump `sessionVersion` for admins as a one-off; not required for the rule to be true going forward. |
| The student page still accepts an admin password and returns a message | That is the intended UX of B: the credential is checked, but no session is issued. If even the check is undesirable, C is required. |

## 9. Verification plan

- Unit-test the audience/role matrix, including `SUPER_ADMIN`, `TEACHER`,
  `STUDENT`, `GUEST`, and legacy tokens without a method claim.
- Controller/spec: an admin login with `audience: "student"` returns 403, sets
  no access or refresh cookie, and does not increment `failedLoginCount`.
- Controller/spec: an admin login with `audience: "admin"` succeeds and sets
  both cookies; a teacher with `audience: "student"` succeeds.
- Browser: admin on `/login` sees the refusal and no session; admin on
  `/admin-login` signs in; student on `/admin-login` is refused without a
  session.
- Refresh: a token issued before the change still refreshes, because the
  audience rule applies only at sign-in.
- Rate limiting: rejected audiences do not consume the failed-login budget.

## 10. Decision points

1. **Teachers now or later?** Recommendation: later, with a teacher portal.
2. **B or C?** Recommendation: B, unless admin MFA/IP allowlisting is already
   committed for this year.
3. **Message tone:** "Use the administrator sign-in page" (helpful, reveals the
   role only after a correct password) versus a neutral "Sign-in is not
   available here" (less helpful, no disclosure).
4. **Existing admin sessions:** leave them until expiry, or bump the session
   version once at rollout.
