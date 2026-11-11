# Sprint 0 — Project Setup & Environment

## Lor Mentor · Lorcan Medical College

### Status: ✅ COMPLETE

---

## What We Accomplished in Sprint 0

Sprint 0 had one goal:

> Set up the entire project so that both the frontend and backend
> run on your computer with one command each.

By the end of Sprint 0 we have:

- A professional monorepo (one folder containing both frontend and backend)
- Next.js 15 frontend running on `localhost:3000`
- NestJS backend running on `localhost:4000`
- PostgreSQL database with all tables created
- Lorcan brand design system (teal colors, fonts)
- GitHub repository with clean commit history
- Every developer tool verified and working

---

## Technologies We Used — Plain English Explanations

### What is a Monorepo?

A monorepo means **one Git repository that holds multiple projects**.

```
lor-mentor/          ← one GitHub repo
├── apps/web/        ← the website (project 1)
└── apps/api/        ← the server (project 2)
```

The alternative is two separate repositories — one for frontend,
one for backend. The monorepo approach is used by Google, Meta,
and Airbnb because it is easier to share code and keep everything
in sync.

---

### What is Next.js?

You know React. Next.js is React with superpowers.

| Plain React | Next.js |
|---|---|
| You manage routing yourself | Routing is automatic — every folder = a page |
| Runs only in the browser | Can run code on the server too |
| You configure webpack yourself | Everything is pre-configured |
| No built-in image optimization | Images are automatically compressed |

Think of Next.js as React + a professional setup already done for you.

**Version 15** is the latest. It introduced the **App Router** which
means your folder structure directly maps to your website URLs:

```
src/app/page.tsx          → localhost:3000/
src/app/login/page.tsx    → localhost:3000/login
src/app/dashboard/page.tsx → localhost:3000/dashboard
```

---

### What is NestJS?

You know Node.js and Express. NestJS is Express with structure enforced.

In plain Express you can write code anywhere in any way. This leads
to messy codebases that are hard to maintain.

NestJS forces you to organize code into **modules**:

```
AuthModule     → handles login and registration
CoursesModule  → handles course management
MaterialsModule → handles file uploads
```

Each module has three main files:

```
auth.controller.ts  → receives the HTTP request
auth.service.ts     → does the actual work (business logic)
auth.module.ts      → connects controller and service together
```

This is the same pattern used by enterprise companies. It makes
the codebase easy to navigate and test.

---

### What is PostgreSQL?

PostgreSQL is a **relational database**. Think of it as a very
powerful Excel spreadsheet where each sheet is a table.

```
Users table:
| id  | email              | fullName         | role    |
|-----|--------------------|------------------|---------|
| 1   | bereket@lorcan.edu | Bereket Adamsseged | STUDENT |
| 2   | aisha@lorcan.edu   | Dr. Aisha Mohammed | TEACHER |

Courses table:
| id  | title            | semesterId |
|-----|------------------|------------|
| 1   | Human Anatomy I  | sem_001    |
| 2   | Physiology       | sem_001    |
```

The word **relational** means tables can be connected. A course
belongs to a semester. A semester belongs to an academic year.
PostgreSQL enforces these connections so your data stays clean.

---

### What is Prisma?

Prisma is an ORM — **Object Relational Mapper**.

Without Prisma you would write raw SQL:

```sql
SELECT * FROM users WHERE email = 'bereket@lorcan.edu' AND isActive = true;
```

With Prisma you write JavaScript/TypeScript:

```ts
const user = await prisma.user.findFirst({
  where: {
    email: 'bereket@lorcan.edu',
    isActive: true
  }
})
```

Both do the same thing. Prisma's version is:

- Type-safe (TypeScript knows exactly what fields exist)
- Auto-completed in VSCode
- Much harder to make SQL injection mistakes
- Easier to read and maintain

Prisma also manages **migrations** — when you change your database
schema, Prisma generates and runs the SQL to update the tables.

---

### What is TailwindCSS?

You know CSS. Tailwind is CSS written as class names directly in your HTML.

Without Tailwind:

```css
/* styles.css */
.button {
  background-color: #147878;
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
}
```

```html
<button class="button">Click me</button>
```

With Tailwind:

```html
<button class="bg-accent text-white px-4 py-2 rounded-lg">
  Click me
</button>
```

No CSS file needed. The styles live with the component.
This makes development much faster.

---

## Every File We Created — Line by Line

---

### `/package.json` (Root)

**Purpose:** Tells Node.js this is a monorepo containing multiple projects.

```json
{
  "name": "lor-mentor",
```

The name of the whole project.

```json
  "private": true,
```

Prevents this from being accidentally published to npm.

```json
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
```

Tells npm that `apps/web` and `apps/api` are separate projects
that share node_modules at the root level. This saves disk space
and allows shared dependencies.

```json
  "scripts": {
    "dev:web": "npm run dev --workspace=apps/web",
    "dev:api": "npm run dev --workspace=apps/api",
  }
```

Shortcuts so you can run `npm run dev:web` from the root folder
instead of navigating into each app folder.

```json
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
```

Tells anyone who clones this repo what versions of Node and npm
are required. Prevents "it works on my machine" problems.

---

### `/.gitignore`

**Purpose:** Tells Git which files to never track or upload to GitHub.

```
node_modules/
```

The downloaded packages folder. Never commit this —
it can be hundreds of megabytes and is rebuilt with `npm install`.

```
.env
.env.local
.env.production
```

Your secret keys and passwords. If this goes to GitHub,
anyone in the world can see your database password and API keys.
This is one of the most common security mistakes beginners make.

```
.next/
dist/
build/
```

Build output folders. These are generated automatically and
do not belong in version control.

```
*.log
```

Log files are temporary debugging information. Not needed in Git.

---

### `/.env.example`

**Purpose:** A template showing what variables are needed WITHOUT
showing the actual secret values.

This file IS committed to Git. It helps other developers know
what variables to set up without exposing real secrets.

```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/lower_mentor"
```

- `postgres` — the database username
- `YOUR_PASSWORD` — replaced with your real password in `.env`
- `localhost:5432` — PostgreSQL runs on port 5432 by default
- `lower_mentor` — the name of our database

```bash
JWT_ACCESS_SECRET=replace_with_long_random_string
JWT_REFRESH_SECRET=replace_with_different_long_random_string
```

These are used to sign login tokens. They must be long random
strings. Anyone who has these can forge login tokens — never
share them.

```bash
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

Access token expires in 15 minutes (short, for security).
Refresh token expires in 7 days (longer, for convenience).
We will explain this fully in Sprint 1.

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

The `NEXT_PUBLIC_` prefix means this variable is safe to expose
to the browser. Variables without this prefix stay server-side only.

---

### `/apps/web/tailwind.config.ts`

**Purpose:** Configures TailwindCSS with our Lorcan brand design tokens.

```ts
darkMode: ['selector', '[data-theme="dark"]'],
```

Activates dark mode when the HTML element has
`data-theme="dark"` attribute. We control this with JavaScript.

```ts
colors: {
  base:    'var(--bg-base)',
  surface: 'var(--bg-surface)',
  accent:  'var(--accent-primary)',
}
```

These map CSS variable names to Tailwind class names.
Instead of using hardcoded colors like `bg-[#147878]` everywhere,
we use `bg-accent`. This means if we ever change the brand color,
we change it in ONE place (globals.css) and it updates everywhere.

```ts
fontFamily: {
  sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
  display: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
  mono:    ['var(--font-mono)', 'monospace'],
},
```

Three font families:

- `sans` — Inter, used for body text and UI
- `display` — Plus Jakarta Sans, used for headings and hero text
- `mono` — JetBrains Mono, used for code blocks

---

### `/apps/web/src/app/globals.css`

**Purpose:** Defines every color token for the entire design system.
This is the single source of truth for all colors.

```css
:root {
  --t700: #147878;
  --t800: #0D3B3B;
```

`--t700` is the primary Lorcan teal extracted from their logo.
`--t800` is the darker version used for the sidebar background.
These are the exact brand colors from Lorcan Medical College.

```css
  --bg-base:    #F0F8F8;
  --bg-surface: #FFFFFF;
```

`--bg-base` is the page background (slightly teal-tinted white).
`--bg-surface` is for cards and panels (pure white).

```css
[data-theme="dark"] {
  --bg-base:    #0B1919;
  --bg-surface: #0F2424;
```

When dark mode is active these override the light mode values.
Notice they are very dark teal — not pure black. Pure black feels
harsh. Dark teal matches the brand.

```css
.card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 0.75rem;
  padding: 1rem;
}
```

A reusable card style. In components we write `className="card"`
instead of repeating these 4 properties everywhere.

```css
.progress-track { ... }
.progress-fill  { ... }
```

Reusable progress bar styles used on the student dashboard
to show course completion percentage.

---

### `/apps/api/src/main.ts`

**Purpose:** The entry point of the entire backend.
When you run `npm run start:dev` this is the first file that executes.

```ts
import { NestFactory } from '@nestjs/core'
```

`NestFactory` is how we create a NestJS application.
Think of it as the `createRoot()` of React but for the server.

```ts
import { ValidationPipe } from '@nestjs/common'
```

A pipe that automatically validates every incoming request.
If a request sends invalid data, it is rejected before it
reaches any of our code.

```ts
import * as cookieParser from 'cookie-parser'
```

Allows us to read cookies from incoming HTTP requests.
We store JWT tokens in cookies — this lets us access them.

```ts
import helmet from 'helmet'
```

Adds security HTTP headers to every response automatically.
Protects against common attacks like XSS and clickjacking.
One import — many security improvements.

```ts
const app = await NestFactory.create(AppModule)
```

Creates the NestJS application using our root module.

```ts
app.use(helmet())
```

Applies security headers to every response.

```ts
app.use(cookieParser())
```

Enables cookie reading on all incoming requests.

```ts
app.enableCors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  credentials: true,
})
```

CORS (Cross-Origin Resource Sharing) is a browser security feature.
By default browsers block requests from `localhost:3000` to `localhost:4000`
because they are different "origins". We explicitly allow our frontend.
`credentials: true` is required for cookies to be sent cross-origin.

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
```

`whitelist: true` — automatically removes any fields in a request
that are not in our DTO definition. Prevents extra unexpected data.
`transform: true` — automatically converts data types.
For example if a URL param `?page=2` comes in as a string,
transform converts it to the number `2` automatically.

```ts
app.setGlobalPrefix('api/v1')
```

Every route in the entire app gets prefixed with `/api/v1`.
So a route defined as `/health` becomes `/api/v1/health`.
The `v1` means "version 1". When we make breaking changes in future
we create `v2` routes without breaking existing clients.

```ts
await app.listen(port)
```

Starts the HTTP server on port 4000. The server is now
ready to receive requests.

---

### `/apps/api/src/app.module.ts`

**Purpose:** The root module. Connects all feature modules together.
Think of it as the main plug board — every module plugs in here.

```ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
```

`ConfigModule` loads our `.env` file when the app starts.
`isGlobal: true` means we do not need to import ConfigModule
in every single feature module — it is available everywhere automatically.

As we build more features we will add more modules here:

```ts
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  AuthModule,        // ← Sprint 1
  UsersModule,       // ← Sprint 2
  CoursesModule,     // ← Sprint 3
  MaterialsModule,   // ← Sprint 4
]
```

---

### `/apps/api/src/app.controller.ts`

**Purpose:** Contains the health check endpoint.

```ts
@Controller()
```

This decorator tells NestJS this class handles HTTP requests.
The empty string means no prefix — routes are defined as-is.

```ts
@Get('health')
getHealth() {
```

`@Get('health')` maps HTTP GET requests to `/api/v1/health`
to this function (the `api/v1` prefix comes from `main.ts`).

```ts
  return {
    status: 'ok',
    app: 'Lor Mentor API',
    timestamp: new Date().toISOString(),
  }
```

Returns a JSON object. NestJS automatically converts the
JavaScript object to JSON and sets `Content-Type: application/json`.

---

### `/apps/api/prisma/schema.prisma`

**Purpose:** Defines every table in the database.
This is the single source of truth for our data structure.

```prisma
generator client {
  provider = "prisma-client-js"
}
```

Tells Prisma to generate a JavaScript/TypeScript client.
After running `npx prisma generate` we get type-safe
database query methods in our code.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Tells Prisma we are using PostgreSQL and to read the
connection string from the `DATABASE_URL` environment variable.

```prisma
enum Role {
  GUEST
  STUDENT
  TEACHER
  ADMIN
  SUPER_ADMIN
}
```

An enum is a fixed list of allowed values. A user's role
can ONLY be one of these five values — nothing else.
PostgreSQL enforces this at the database level.

```prisma
model User {
  id       String @id @default(cuid())
```

Every table needs a primary key — a unique identifier for each row.
`@id` marks this as the primary key.
`@default(cuid())` auto-generates a unique ID like `clx7abc123def`.
We use `cuid()` instead of `uuid()` because cuid IDs are:

- URL-safe
- Collision-resistant
- Slightly shorter

```prisma
  email    String @unique
```

`@unique` creates a database index that prevents two users
from having the same email address. The database itself enforces
this — it cannot happen even with a bug in our code.

```prisma
  passwordHash String
```

We NEVER store the actual password. We store a hash — a
one-way encrypted version. Even if someone steals the database
they cannot reverse the hash to get the password.
We will cover this in Sprint 1.

```prisma
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
```

`@default(now())` sets the time when the record is created.
`@updatedAt` automatically updates the time whenever the
record is changed. We never set these manually.

```prisma
  subscription Subscription?
```

The `?` means this relation is optional — not every user
has a subscription (guests have no subscription).
This creates a JOIN-able connection to the Subscription table.

---

## The Database Tables We Created

Running `npx prisma migrate dev --name init` created these tables:

| Table | Records It Holds |
|---|---|
| `User` | Every person with an account |
| `SubscriptionPlan` | The payment plans admin creates |
| `Subscription` | Which student has which active plan |
| `Payment` | Receipt uploads waiting for approval |
| `Department` | Medicine, Pharmacy, Nursing, etc. |
| `AcademicYear` | Year 1, Year 2 within each department |
| `Semester` | Semester 1, Semester 2 within each year |
| `Course` | Human Anatomy I, Physiology, etc. |
| `Material` | PDFs, images, YouTube links in each course |
| `AiContent` | AI-generated summary + topics for each PDF |
| `FlashcardSet` | A collection of flip cards for a material |
| `Flashcard` | Individual front/back card |
| `FlashcardReview` | Which cards a student marked Known or Review |
| `QuizBank` | AI-generated questions for a material |
| `Quiz` | A quiz (AI or teacher-created) |
| `Question` | Individual MCQ question with 4 options |
| `QuizAttempt` | A student's quiz score and time |
| `QuizAnswer` | The student's answer per question |
| `AiHistory` | Every AI tutor conversation per student |
| `ForumSection` | A forum connected to a course |
| `ForumPost` | A discussion post in a forum |
| `ForumReply` | A reply to a forum post |
| `Notification` | Messages sent to users |
| `ProgressRecord` | Which materials a student has viewed |
| `Announcement` | Teacher announcements for a course |
| `AuditLog` | Every admin action — immutable history |

---

## Git History This Sprint

```
chore(setup): add root package.json, gitignore and env template
chore(web): scaffold Next.js 15 with TypeScript and TailwindCSS
chore(design): apply Lorcan brand tokens to Tailwind and globals.css
chore(api): scaffold NestJS backend with Prisma and PostgreSQL
chore(db): add complete Prisma schema with all models and run initial migration
chore(api): wire up NestJS server with CORS, cookies, helmet and health check
chore(setup): rename project from lower-mentor to lor-mentor
```

---

## Tools Verified

| Tool | Version | Purpose |
|---|---|---|
| Node.js | v25.2.1 | Runs JavaScript on the server |
| npm | v11.6.2 | Installs packages |
| Git | v2.53.0 | Version control |
| PostgreSQL | v18.4 | Database |

---

## What We Did NOT Do Yet

These are coming in Sprint 1:

- No login system yet
- No real pages on the frontend yet
- No API endpoints beyond health check
- No email system yet
- No file uploads yet

Sprint 0 is purely foundation. Real features start in Sprint 1.

---

## Sprint 1 Preview

Next sprint we build the entire authentication system:

- Student registers with email and password
- Verification email is sent automatically
- Student clicks the link to verify their email
- Student logs in and gets a secure JWT token stored in a cookie
- Student can reset their password if forgotten

**This is the most security-critical sprint of the entire project.**
We will cover bcrypt, JWT, HTTP-only cookies, and rate limiting
in detail — all explained from scratch.

---

*Document generated at end of Sprint 0*
*Next update: End of Sprint 1 — Authentication*
