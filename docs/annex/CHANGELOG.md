# Changelog

All notable changes to LOR Mentor are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has no
git tags yet; entries are grouped by the development milestone they belong to.

## [0.1.0] — 2026-10-29

Initial development release. Summarised from the repository history
(`git log`); no tag exists for it.

### Added

- **Authentication** — email/password register, email verification, login,
  logout, forgot-password and reset-password, change password from the profile
  page, JWT access/refresh tokens with cookie transport, and a queued refresh
  flow on the web client.
- **Accounts and RBAC** — users module with pagination, role management and
  status control; role hierarchy guardrails; department-wide student access.
- **Academic structure** — Department, AcademicYear, Semester and Course
  modules with full CRUD.
- **Materials and study tools** — secure material upload and authenticated file
  serving, a PDF.js canvas viewer that blocks download/print, server-graded
  quizzes with attempt history, flashcards, progress tracking, and a Gemini
  tutor grounded on course material.
- **Forum** — course discussion threads with teacher access, reactions, reports
  and admin moderation.
- **Subscriptions and payments** — subscription plans, Chapa online checkout
  with auto-approval, manual bank-receipt upload with admin review, PDF
  receipts, and a Python receipt-verifier microservice (CBE link + QR OCR).
- **Notifications** — toast system, live notification bell, transactional email
  via Nodemailer.
- **Admin** — admin panels for users, courses, plans, payments, banks,
  moderation and audit; platform-wide admin action auditing.
- **Anatomy Lab** — BodyParts3D 4.0-derived heart v2 model (live free preview)
  and urinary v1 model (unpublished teacher-only draft); data-driven layers;
  per-structure teaching text; text-only structures; attribution and provenance
  pages; faculty review sign-off script; multi-system seed registry; staff
  preview of unpublished systems; immutable versioned model delivery.
- **Deployment** — production Docker stack (api, web, verifier, Postgres,
  Redis), host nginx reverse proxy with immutable model caching, staging soak
  overlay, database backup script, environment preflight, and automated smoke /
  security test script.
- **CI** — GitHub Actions workflow for the Node and Python services, plus a
  GitLab CI pipeline (`.gitlab-ci.yml`) that adds Docker image builds, compose
  config validation, nginx syntax checking and dependency auditing.

### Changed

- `demo`-era UI replaced with the Lorcan liquid-glass theme (light and dark
  modes) across auth pages, sidebar and app layout.
- PDF.js code-split and the pricing page moved to React Server Components for
  smaller bundles and HTTP caching.

### Fixed

- PDF viewer 401/404/network errors (authenticated byte fetch through the
  Next.js proxy).
- Theme hydration mismatch and script-tag warnings (adopted `next-themes`).
- Anatomy: camera, WebGL context-loss recovery, phone scrolling, keyboard
  accessibility, reduced-motion support, model-URL allow-listing, and
  student/teacher-only access.
- Prisma applied migrations checked out with CRLF bytes.

### Security

- Helmet security headers, login lockout with audit logging, upload and input
  validation hardening, per-user AI throttling, subscription gating on paid
  quiz/flashcard content, and trust-proxy hop handling for correct client IPs
  and rate-limit keying.
