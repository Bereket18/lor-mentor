# Local-build notice for the deployment engineer

> **Read this before deploying this checkout.**
>
> The `.next` output in this working tree was built for **local manual testing**
> with the API on `http://localhost:4000`. It is **not** a production build.
> Do not copy `apps/web/.next` to a server and do not deploy this checkout as-is.

## What is local-only in this tree

- The web app was built with:

  ```powershell
  $env:NEXT_PUBLIC_API_URL="http://localhost:4000"
  $env:ALLOW_LOCAL_API_ORIGIN="1"
  npm run build --workspace=apps/web
  ```

  `NEXT_PUBLIC_API_URL` is baked into the Next.js rewrite at **build time**.
  Changing the environment variable on an already-built `.next` directory does
  not repair it. Rebuild with the real public API origin.

- `apps/web/.env.local` in this checkout may point at a placeholder API host
  (for example `https://api.example.com`). That is why local login returned
  `500` until the web app was rebuilt against `http://localhost:4000`. **Do not
  copy this file to a server.** Create the deployment environment from
  `ENVIRONMENT_VARIABLES.md` and the deployment templates.

- The API schema has the faculty-review migration applied to the **local**
  `lor_mentor` database only. It has not been run against production.

- The local database currently has 18 systems, 270 structures, 1 published
  system (heart), and 0 reviewed structures. It is test data, not a content
  release.

## Correct production start commands

The web app uses Next.js `output: "standalone"`. `next start` prints:

```text
"next start" does not work with "output: standalone" configuration.
Use "node .next/standalone/server.js" instead.
```

Use the standalone server in the container:

```bash
node .next/standalone/server.js
```

The image must also copy `.next/static` and `public` into the standalone tree,
as the Dockerfile is expected to do. Do not use `next start` for production.

Start the API from `apps/api` so `ConfigModule` loads `apps/api/.env`:

```bash
cd apps/api
node dist/src/main
```

Starting the API from the repository root loads the wrong environment and can
point at an empty database.

## Production rebuild checklist

1. Set `NEXT_PUBLIC_API_URL` to the real public API origin and rebuild the web
   app. Do **not** set `ALLOW_LOCAL_API_ORIGIN` in production.
2. Rebuild the API with `npm run build --workspace=apps/api`.
3. Take a production database backup, then run `npx prisma migrate deploy`
   from `apps/api` against the intended database only.
4. Build and start the containers; run `nginx -t` and the HTTPS smoke test.
5. Re-run the review Playwright suite with temporary accounts, then delete the
   accounts and verify `401`.

## Reviewer access

Every TEACHER account receives `User.isAnatomyReviewer = true` automatically:
new teachers are created with the flag, and changing a user's role to TEACHER
sets it (changing away from TEACHER clears it). Existing teachers were
backfilled in the local database. ADMIN and SUPER_ADMIN are never reviewers and
are rejected by the API role guard even if the flag is set by hand.

The flag stays revocable per account. ADMIN and SUPER_ADMIN can grant or
revoke it from `/admin/users` (the **Reviewer / No review** control on TEACHER
rows); revoking asks for confirmation. This admin control changes **who may
review** only — it does not approve or withdraw individual structures, and
admins still get `403` on all anatomy content and review routes.

The CLI remains available for offline backfills and break-glass changes:

```bash
npm run anatomy:reviewer --workspace=apps/api -- --email <teacher-email> --grant
npm run anatomy:reviewer --workspace=apps/api -- --email <teacher-email> --grant --confirm
npm run anatomy:reviewer --workspace=apps/api -- --email <teacher-email> --revoke --confirm
npm run anatomy:reviewer --workspace=apps/api -- --all-teachers --grant
npm run anatomy:reviewer --workspace=apps/api -- --all-teachers --grant --confirm
```

Grant and backfill commands are dry runs until `--confirm` is added. Only
TEACHER accounts can be granted the flag.

## New in this local build

- `/admin/users` has an **Anatomy reviewer** control for TEACHER rows: ADMIN and
  SUPER_ADMIN can grant or revoke the flag (revoke asks for confirmation).
  Each change writes one `ANATOMY_REVIEWER_GRANT` / `ANATOMY_REVIEWER_REVOKE`
  audit row with `source: 'admin-reviewer-access'`.
- The public anatomy detail shows the reviewer's full name and the review
  date/time, plus "Last edited by <teacher> on <date/time>" derived from the
  newest revision.
- `/admin/audit` (SUPER_ADMIN only) has an **Anatomy lab** area filter and
  richer anatomy metadata (`changedFields`, `revisionId`, cleared review, note).
- In-app notifications are created for anatomy edits and reviews: other
  reviewers are told about pending edits, teachers hear about reviews on
  unpublished content, and students hear only about published content that was
  reviewed. The acting teacher is never notified about their own action. There
  is no email notification.

See `docs/PROGRESS.md` (Steps 7-8) for the local verification record and
remaining risks.
