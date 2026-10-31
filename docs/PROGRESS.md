# LOR Mentor — anatomy lab & release hardening

**Branch:** `integration/anatomy-hardening` (local only; nothing pushed)
**Started:** 2026-10-29
**Rule reminders for every phase:** local only; no push/rebase/reset/force, no
branch creation; never read or print a `.env` or secret; no
`prisma migrate dev/reset` or `db push`; never `npm audit fix` or `--force`;
never publish a system (`isPublished` stays `false`); never set `isReviewed`
true; never change licence wording; never write or edit teaching text; the
three untracked `docs/audit/*.md` files stay untracked; temporary test users use
random unprinted passwords and are deleted with a 401 check.

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Merge `main`; GitLab CI + templates, notice, changelog; secret scan | **Done** |
| 2A | Dependency security upgrades (Prisma / API / web) | **Done** |
| 2B | Config gaps (wildcard CORS, `check-env.mjs` parity, `API_URL`) | **Done** |
| 2C | Docker / nginx review without a daemon; nginx test script | **Done** (static review; image builds and `nginx -t` NOT RUN) |
| 2D | `/anatomy` for ADMIN/SUPER_ADMIN; run existing Playwright specs; checklist | **Done** |
| 3 | Faculty review + edit tool | **Partly done: offline packet only, in-app tool NOT built** |
| 4 | Build remaining systems (respiratory … body surface) | **Done (local build; 16 unpublished drafts, owner review and teaching text pending)** |
| 5 | Left/right proof, README, final report | **Done** (left/right proof, README `8e929fe`, final report below) |
| S1 | Read-only anatomy text integrity check | **Done** (mismatches reported, none fixed) |
| S2 | npm audit critical/high inventory | **Done** (read-only; no dependency changes) |

## Step 1 — anatomy text integrity (read-only)

Run on `integration/anatomy-hardening` at `a25e8df`; database
`lor_mentor` on `127.0.0.1:5432`. No database writes were made.

- Rows: heart **26** (`isPublished=true`, `isSample=true`), urinary **15**
  (`isPublished=false`, `isSample=false`), `isReviewed=true` rows: **0**.
- Method: per-row SHA-256 over
  `JSON.stringify([summary, location, function, bloodSupply, clinicalNotes])`,
  preserving `null`. Aggregate values below use the stated method only.

| Comparison | Shared rows | Match | Mismatch |
| --- | ---: | ---: | ---: |
| DB heart vs newest backup `anatomy-backup-2026-10-25T17-25-47-227Z.json` | 14 | **14** | 0 |
| DB heart vs `7e4c284:apps/api/prisma/seed-anatomy.ts` | 26 | 22 | 4 |
| DB heart vs current `anatomy-heart.data.ts` | 26 | **26** | 0 |
| DB urinary vs `anatomy-urinary.data.ts` | 15 | **15** | 0 |

The four heart rows that differ from `7e4c284` are `tricuspid-valve`,
`pulmonary-valve`, `mitral-valve`, and `aortic-valve`. They match the current
heart data file, so the difference is a later teaching-text update, not a
current DB mismatch. The 12 heart rows absent from the 14-row backup are
`interventricular-septum`, `pulmonary-arteries`, `pulmonary-veins`,
`aortic-arch`, `pericardium`, `endocardium`, `myocardium`, `epicardium`,
`sinoatrial-node`, `atrioventricular-node`, `bundle-of-his`, and
`purkinje-fibers`; all 12 match `7e4c284`. Of the 14 backup rows, 10 match
`7e4c284` and the four valves do not, so “12 restored” is only accurate if it
means the 12 non-backup rows. Nothing was changed.

### Historical hash attribution

- **`ea8a7bba6d262c7f…e9fa` — verified.** It is the aggregate SHA-256 of
  `JSON.stringify(protectedBefore.rows)`, where each row is
  `{id, slug, hash}` and `hash` is the **7-field** per-row hash
  `[name, latinName, summary, location, function, bloodSupply, clinicalNotes]`.
  All 14 protected-before row hashes match that 7-field method.
- **f7373f05…384b — method not recorded, not reproducible.** It appears only
  in commit `a3d08b5` (`docs/PROGRESS.md`) as a “protected-text SHA-256”; no
  script, artifact, or method definition for it exists in the repository. It
  did not match the 5-field array, 7-field array, 5-field object, 7-field
  object, full-row, raw/CRLF/BOM file-byte, or tested aggregate variants.
- **`d2bb966f…` — no local source.** It occurs nowhere in the repository
  history except the saved `docs/anatomy/RUN-SPEC.md` prompt. It is not in the
  backup, seed, data files, or DB recomputation, so its method cannot be
  verified from local evidence.
- The adjacent `caf4e073…257b6` value in the same `a3d08b5` line is likewise
  unreproducible from the current tree. These two values are therefore
  reported as unattributed rather than assigned an invented method.

## Step 2 — npm audit critical/high inventory (read-only)

Commands: `npm audit --json --workspace=apps/api` and
`npm audit --json --workspace=apps/web`. No dependency was changed; `npm audit
fix` and `--force` were not run.

Totals from the audit metadata: API **14** (4 high, 1 critical, 1 moderate,
8 low); web **19** (12 high, 1 critical, 5 moderate, 1 low). The tables below
list every critical/high package, including meta-findings that are flagged only
through a vulnerable dependency.

| WS | Package | Sev. | Type | Advisory IDs (critical/high) | Dependency path | Runtime reachable? |
| --- | --- | --- | --- | --- | --- | --- |
| API | `brace-expansion` | high | transitive | GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p | `api -> ts-jest -> jest -> @jest/core -> jest-config -> glob -> minimatch -> brace-expansion` | **No** — Jest/test tooling; absent from `npm ls --omit=dev`; no source import. |
| API | `browserslist` | high | transitive | GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g | `web -> shadcn -> @babel/... -> browserslist` (hoisted; audit also attributes it to API) | **No** — web dev/build tooling; no API runtime path. |
| API | `fast-uri` | high | transitive | GHSA-7p8r-x3mc-p8w7, GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp, GHSA-qw65-cvwx-89v3 | `api -> @nestjs/cli -> @angular-devkit/core -> ajv -> fast-uri` | **No** — Nest CLI dev tooling; no `ajv`/`fast-uri` import in `apps/api/src`. |
| API | `handlebars` | critical | transitive | GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f | `api -> ts-jest -> handlebars` | **No** — test tooling; absent from production tree. |
| API | `js-yaml` | high | transitive | GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh | `api -> ts-jest -> jest -> @jest/core -> @jest/transform -> babel-plugin-istanbul -> @istanbuljs/load-nyc-config -> js-yaml` | **No** — test/coverage tooling. |
| web | `@mapbox/node-pre-gyp` | high | transitive | via `tar` (no own advisory) | lockfile/optional chain only; `npm ls` finds no installed copy | **No** — not present in `node_modules`; no runtime code. |
| web | `@modelcontextprotocol/sdk` | high | transitive | GHSA-6qxp-vccf-f47h, GHSA-22jm-h49p-29qw, GHSA-46jr-4wx8-v453, GHSA-f897-62hf-6gxq | `web -> shadcn -> @modelcontextprotocol/sdk` | **No** — `shadcn` dev CLI. |
| web | `brace-expansion` | high | transitive | GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p | `web -> shadcn -> ts-morph -> @ts-morph/common -> minimatch -> brace-expansion` | **No** — dev CLI. |
| web | `browserslist` | high | transitive | GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g | `web -> shadcn -> @babel/... -> browserslist` | **No** — build-time only; no `src` import. |
| web | `fast-uri` | high | transitive | GHSA-7p8r-x3mc-p8w7, GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp, GHSA-qw65-cvwx-89v3 | `api -> @nestjs/cli -> @angular-devkit/core -> ajv -> fast-uri` (hoisted; audit also attributes it to web) | **No** — API dev CLI, not web runtime. |
| web | `follow-redirects` | high | transitive | GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c | `web -> axios -> follow-redirects` | **Unknown** — axios is used by client components (`lib/api.ts`, `anatomy-ai-panel.tsx`, `anatomy-viewer.tsx`); the browser adapter does not use `follow-redirects`; no server-side axios import was found, so only a Node-side axios path could reach it. |
| web | `ip-address` | high | transitive | GHSA-mwp4-54f8-5fhr | `web -> shadcn -> @modelcontextprotocol/sdk -> express-rate-limit -> ip-address` | **No** — dev CLI. |
| web | `js-yaml` | high | transitive | GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh | `web -> eslint-config-next -> typescript-eslint -> ... -> js-yaml` | **No** — lint dev tooling. |
| web | `postcss` | high | transitive | GHSA-r28c-9q8g-f849 | `web -> tailwindcss -> postcss` (also direct and Next nested copies) | **No** — CSS build-time; no `src` import. |
| web | `shadcn` | high | direct | via `deepmerge`, `zod` (no own advisory) | `web -> shadcn` | **No** — dev CLI; not in production tree. |
| web | `tar` | critical | transitive | GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx, GHSA-qffp-2rhf-9h96, GHSA-9ppj-qmqm-q256, GHSA-r6q2-hw4h-h46w, GHSA-23hp-3jrh-7fpw, GHSA-8x88-c5mf-7j5w, GHSA-r292-9mhp-454m | `web -> @mapbox/node-pre-gyp -> tar` (lockfile/optional only) | **No** — not installed; `npm ls tar --workspace=apps/web` is empty. |
| web | `undici` | high | transitive | GHSA-4cwx-7wf7-3272, GHSA-rfgv-xxqx-mfg5, GHSA-w293-vg96-wgc3, GHSA-xjj6-f33q-929c, GHSA-4w7w-5xrc-9h26, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm | `web -> shadcn -> undici` | **No** — dev CLI. |
| web | `zod` | high | transitive | GHSA-mrhx-c7xc-m3w5 | `web -> shadcn -> zod@3.25.76` (nested); production `zod@4.6.7` is above the `<4.6.6` advisory range | **No** — vulnerable copy is dev-only; production copy is patched. |

No critical/high finding is confirmed reachable in the running API or web
request path. The only unresolved reachability is `follow-redirects` through a
possible server-side axios call; the source search found client-side axios use
only. No dependency was upgraded or removed.

## Step 3 — eight new anatomy systems (local build)

Run on `integration/anatomy-hardening` from `b03aeb9`. All work is local; no
system was published, no teaching text was written, and no `isReviewed` row was
set.

### Sources and derivation

- Official BodyParts3D archives/tables were downloaded only to
  `C:\Users\berek\Desktop\bp3d-source`. All 10 archive SHA-256 values in
  `docs/anatomy/provenance/phase-1-sources.json` verified OK.
- Structures were derived from the recursive FMA inclusion tree
  (`inclusion_relation_list`) and matched to OBJ files through
  `element_parts`. This reproduces every official system count in
  `whole-body-plan.md` exactly.
- The OBJ header `Concept ID` / `English name` is the grouping key for one
  structure per named structure. Left and right are separate rows, not a
  mirrored mesh.
- `scripts/generate-anatomy-systems.mjs --check` passes and regenerates the 16
  source maps, seed files, mapping documents, registry, attribution file,
  `step-3-systems.json`, and `step-3-orientation-pairs.json` deterministically.

### Built modules

The database/viewer supports one GLB per system and a 5 MB / 150,000-triangle
budget per GLB, so large systems were split into modules. All 16 GLBs pass
`validate-anatomy-model.mjs`; all SHA-256 values are registered in
`apps/web/public/models/anatomy/published-models.json`.

| Module | Structures | GLB bytes | Triangles | Playwright first render | Median frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| respiratory | 26 | 2,729,336 | 139,164 | 2,630 ms | 66.6 ms |
| digestive-upper | 12 | 1,184,308 | 61,140 | 2,062 ms | 33.3 ms |
| digestive-lower | 19 | 3,590,876 | 116,642 | 1,453 ms | 33.3 ms |
| digestive-liver | 8 | 2,464,824 | 127,788 | 1,772 ms | 66.6 ms |
| digestive-hepatobiliary | 48 | 1,869,160 | 84,834 | 2,539 ms | 66.7 ms |
| nervous-left | 21 | 2,051,568 | 104,652 | 2,447 ms | 66.7 ms |
| nervous-right | 21 | 2,085,392 | 106,280 | 1,893 ms | 33.4 ms |
| nervous-central | 12 | 2,163,996 | 112,058 | 1,723 ms | 33.4 ms |
| sensory-eye-right | 21 | 2,481,460 | 125,714 | 2,482 ms | 66.7 ms |
| sensory-eye-left | 22 | 2,493,604 | 128,994 | 1,767 ms | 33.3 ms |
| sensory-ear | 1 | 64,576 | 2,910 | 1,468 ms | 33.3 ms |
| endocrine | 3 | 141,324 | 7,454 | 1,502 ms | 33.3 ms |
| lymphatic | 3 | 72,276 | 3,410 | 1,294 ms | 33.3 ms |
| male-reproductive | 10 | 122,508 | 5,130 | 1,410 ms | 33.3 ms |
| body-surface-upper | 1 | 1,861,888 | 101,691 | 1,367 ms | 33.3 ms |
| body-surface-lower | 1 | 1,849,888 | 101,691 | 1,265 ms | 33.3 ms |
| **Total** | **229** | **27,226,984** | **1,329,552** | - | - |

Largest GLB: 3,590,876 bytes; largest triangle count: 139,164. Both are below
the 5 MB / 150,000-triangle limits. Heart v2 (26 rows, 2,003,856 bytes,
102,568 triangles) and urinary v1 (15 rows, 465,208 bytes, 20,364 triangles)
were included in the same Playwright run as regression checks.

Coverage limits recorded in the mapping documents:

- Respiratory has no lung-surface mesh in the source; the model is bronchi,
  trachea, diaphragm, and six lingular arteries.
- Lymphatic has only spleen and thymus lobes; endocrine has only pituitary and
  left/right adrenal.
- Male reproductive has 10 source files and no ductus deferens/scrotum mesh;
  sensory-ear is the external ear only.
- Body surface is one 203,382-triangle skin mesh. It was split by triangle
  centroid Z into two derived 101,691-triangle OBJs (`FJ2810U`, `FJ2810L`);
  no decimation or duplication was used. Derived hashes are in
  `step-3-systems.json`.

All 16 generated mapping documents still contain
`mapping not yet owner-reviewed`. That is deliberate: no owner/faculty mapping
review was performed, and the publish script refuses to publish while the
marker is present.

### Seed, AI refusal, and publish gate

- Local seed applied to `lor_mentor`: **18 systems, 270 structures, 0 reviewed,
  229 empty-text rows**. Heart remains published/sample with 26 rows; urinary
  remains an unpublished 15-row draft; all 16 new systems are unpublished.
- The protected heart/urinary aggregate is unchanged:
  `039549a077774dbc9964afb3a31beff93f506c1f6003b4022c5aabc09f8ce32c`.
- `anatomy.service.ts` refuses AI explain/quiz for empty-text rows with HTTP
  **409** and `Teaching notes are not available for this structure yet.` The
  UI hides the AI panel and shows “Notes coming soon”.
- `apps/api/prisma/publish-anatomy.ts` is dry-run by default. A respiratory
  dry run was blocked by the mapping marker, 26 empty-text rows, and 26
  unreviewed rows. A urinary `--unpublish` dry run reported no blockers. No
  `--confirm` run was made and no publication flag changed.

### Verification (real results)

| Check | Result |
| --- | --- |
| `node scripts/generate-anatomy-systems.mjs --check` | pass; official totals reproduced |
| `npm run validate:anatomy-model --workspace=apps/web` | 16/16 GLBs pass |
| `npm run check:anatomy-orientation --workspace=apps/web` | 42 pairs across 4 GLBs pass |
| `npm test --workspace=apps/api -- --runInBand` | 25 suites, **354/354 tests** pass |
| Anatomy service suite | 16/16 pass |
| Anatomy seed-to-model contract suite | 88/88 pass |
| `npm run build --workspace=apps/api` | pass |
| `npx tsc --noEmit` in `apps/web` | pass |
| `npm run build --workspace=apps/web` | pass; 55/55 pages generated |
| ESLint on all changed API files | pass |
| ESLint on changed web files | pass |
| Step 3 Playwright (temporary TEACHER) | 1/1 pass in 4.2 min; 18 systems, all 42 left/right pair structures selected, **no console/page errors** |
| Existing Playwright smoke/theme/accessibility | 14/14 pass |
| Final DB state check | 18 systems, 270 structures, 0 reviewed, 229 empty-text |

The Playwright run opened every system, waited for the GLB to finish loading,
selected at least five structures per system, and selected every structure in
the 42 cross-module left/right pairs (nervous-left/right and
sensory-eye-left/right). Every selected mesh resolved; no “not in the loaded 3D
model” status appeared. The temporary teacher was deleted and its login
returned **401**.

### Not run / limitations

- `prisma migrate deploy` was **not run** in Step 3; no schema migration was
  needed for this step.
- No publish `--confirm`, no `isPublished=true`, and no `isReviewed=true` write
  was made.
- Headless Chromium used software rendering. Median frame intervals were
  33.3–66.7 ms (p95 up to 400 ms), so these are headless limits, not a GPU
  performance verdict. A human visual/3D review was not performed.
- The 16 mapping documents still need owner review; all 16 systems remain
  unpublished drafts with empty teaching text.
- Docker/nginx and production deployment checks were not run in this step.

Commit: `2492ae4` (`feat(anatomy): build eight new systems as unpublished drafts`).

## Step 4 — faculty review and edit tool (local)

Started from `626a3f3`. Local-only; no push, no new branch, no
`prisma migrate dev/reset`, and no `db push`.

### Schema migration (SQL shown before applying)

Pre-migration JSON backup (users without password hashes/tokens, systems,
structures): `C:\Users\berek\Desktop\lor-backups\anatomy-pre-step4-2026-10-31T03-57-00-945Z.json`
(SHA-256 `36bc45be04d354b96a47d0e7e950168670ed849a5538b84ba3c81d8f4cf9db82`;
18 users, 18 systems, 270 structures). The backup script refused to run unless
`DATABASE_URL` resolved to local `localhost:5432/lor_mentor`.

```sql
ALTER TABLE "User"
ADD COLUMN "isAnatomyReviewer" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AnatomyStructure"
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT;

CREATE TABLE "AnatomyStructureRevision" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous" JSONB NOT NULL,
    "new" JSONB NOT NULL,
    "note" TEXT,
    CONSTRAINT "AnatomyStructureRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnatomyStructure_reviewedById_idx"
ON "AnatomyStructure"("reviewedById");

CREATE INDEX "AnatomyStructureRevision_structureId_createdAt_idx"
ON "AnatomyStructureRevision"("structureId", "createdAt");

CREATE INDEX "AnatomyStructureRevision_editorId_idx"
ON "AnatomyStructureRevision"("editorId");

ALTER TABLE "AnatomyStructure"
ADD CONSTRAINT "AnatomyStructure_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnatomyStructureRevision"
ADD CONSTRAINT "AnatomyStructureRevision_structureId_fkey"
FOREIGN KEY ("structureId") REFERENCES "AnatomyStructure"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnatomyStructureRevision"
ADD CONSTRAINT "AnatomyStructureRevision_editorId_fkey"
FOREIGN KEY ("editorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

Applied with `npx prisma migrate deploy` against the local `lor_mentor`
database only, followed by `npx prisma generate`.

### Implementation and verification results

Implemented:

- `User.isAnatomyReviewer` plus `AnatomyReviewerGuard`. The review controller
  uses JWT → `Roles('TEACHER')` → reviewer flag → per-user write throttle, so
  STUDENT, ADMIN, and SUPER_ADMIN are rejected at the role gate even if the
  flag is set by hand.
- `AnatomyStructureRevision` and `reviewedAt`/`reviewedById`; one immutable
  revision per save in the same transaction. Editing a reviewed row clears
  approval and both review fields. A no-op save leaves approval intact.
- Protected endpoints under `/api/v1/anatomy/review`: systems with computed
  Empty/Draft/Pending review/Reviewed counts, system structures, edit, review
  one structure, review a whole system in one transaction, revoke, and
  revision history. Action POSTs return **200**, not 201.
- DTO validation: trimming, plain-text rejection of `<`/`>`, field/reference
  limits, existing same-system `relatedSlugs`, no self-reference, and
  optimistic `updatedAt` checks with **409** on a stale write.
- `/anatomy/review` reviewer workspace: reviewer-only link, progress counts,
  structure status chips, split view reusing the existing anatomy scene,
  editor with counters, save/save-and-review, revision restore, revision
  history, unsaved-changes guard, and 409 reload state. Student/teacher detail
  panels show the reviewed/pending badge.
- `apps/api/prisma/anatomy-reviewer.ts` CLI (`anatomy:reviewer`): dry run by
  default, `--confirm` to write, TEACHER-only grants, audit entry.
- Playwright fixture scaffolding (`apps/api/prisma/_step4-fixtures.ts`) creates
  a disposable published sample system, two structures, and temporary
  STUDENT/TEACHER/ADMIN/SUPER_ADMIN users with random passwords stored only in
  a mode-0600 temp file. Cleanup removes fixture audit rows, the system, and
  users.

Verification run on the local dev database:

- `npx tsc --noEmit` in `apps/api` and `apps/web`: pass.
- `npm run build --workspace=apps/api`: pass.
- `npm run build --workspace=apps/web`: pass; `/anatomy/review` is present in
  the route list.
- `npm test --workspace=apps/api -- --runInBand`: **29 suites, 386/386 tests
  pass**. The Step 4 controller/service/guard/DTO specs account for 32 of
  those tests.
- Targeted ESLint on every changed Step 4 API/web file, including the fixture
  and Playwright spec: pass.
- Playwright (`E2E_RUN_ANATOMY_REVIEW=1 npm run e2e --workspace=apps/web --
  e2e/anatomy-review.spec.ts --workers=1 --reporter=line,json`):
  **5/5 passed in 13.2 s**. Report:
  `C:\Users\berek\AppData\Local\Temp\opencode\anatomy-step4-playwright.json`.
  The five tests covered: reviewer edit → revision → history → mark reviewed →
  whole-system review → HTML rejection → reset-on-edit → live 409 → re-review →
  revoke → re-review; student reviewed badge and hidden reviewer link/API 403;
  non-reviewer teacher hidden link, restricted page, and API 403; ADMIN and
  SUPER_ADMIN 403 on read and write endpoints.
- A UI bug found by the first Playwright run was fixed: the review viewport's
  `h-full` made the structure card overflow under the editor form at 1280 px.
  The viewport now uses a bounded `clamp(320px, 42vh, 480px)` height.
- Fixture cleanup: removed 7 fixture audit rows, 1 fixture system, and 5
  temporary users. All five deleted-user logins returned **401**. The database
  returned to **18 systems / 270 structures / 0 reviewed**, with 0 fixture
  systems and 0 fixture users. All **41** heart/urinary rows match the
  pre-Step-4 backup on the 5-field text hash; heart remains
  published/sample and urinary remains an unpublished draft.
- Reviewer CLI verification on temporary TEACHER and ADMIN users: grant dry
  run left the flag false; `--grant --confirm` set it true; revoke dry run left
  it true; `--revoke --confirm` set it false; an ADMIN grant was refused with
  exit 1 and no flag change. Both temporary users were deleted and both logins
  returned **401**. No password was printed.

Not run:

- No real teaching text was edited, approved, or published; every review
  action ran on disposable fixtures.
- No manual visual review beyond the Playwright assertions, no keyboard-only
  walkthrough, and no separate 320 px viewport measurement. Controls use
  44 px minimum heights and the shared focus ring, but those accessibility
  checks are not claimed as measured.
- No production database, publish script, or remote environment was used.
- The Step 3 protected aggregate `039549a0…` was not recomputed because its
  exact one-off hashing method is not stored in the repository; the direct
  41/41 row comparison above was used instead.

## Phase 1 — merge + GitLab files

Done:

- `git merge main` (`3a8383c`) → merge commit `a69ac49`, **no conflicts**.
- Full API suite after the merge: `Test Suites: 25 passed`, `Tests: 282 passed,
  282 total`. (First run flaked one test — `config/trust-proxy.spec.ts` hit the
  5000 ms rate-limiter timeout under parallel load; it passed in isolation and
  on the immediate rerun. Environment/parallelism flake, not a regression.)
- Web build: `npm run build:web` → exit 0, 39/39 pages generated.
- `.gitlab-ci.yml` added: install + cache, API build, API unit tests (with
  `postgres:16-alpine` and `redis:7-alpine` services and a `prisma migrate
  deploy` step), API e2e, both anatomy validators, web lint (report-only), web
  build, verifier tests, `npm audit` (report-only), docker build jobs for api /
  web / verifier (`docker:dind`, build only), `compose-config`, `nginx-syntax`,
  and a report-only `trivy` job. Includes `Jobs/SAST.gitlab-ci.yml` and
  `Jobs/Secret-Detection.gitlab-ci.yml`. Runs on merge requests and the default
  branch only. No deploy jobs, no secrets. YAML parses (checked with `js-yaml`).
- `deploy/nginx/test-nginx-config.sh` added (temp copy, `example.test`
  substitution, throwaway self-signed certs, minimal wrapper, `nginx -t -c`).
  `bash -n` passes and it exits 0 with a notice when nginx is absent.
- `apps/web/public/models/anatomy/NOTICE-MODELS.md` added: exact credit line and
  the exact "Licence status" paragraph copied from the attribution pages, the
  two licence statements, the licence URL, and the adaptations list.
- `CHANGELOG.md` (v0.1.0, summarised from `git log` only; no tags).
- `.gitlab/merge_request_templates/Default.md`, `.gitlab/issue_templates/bug.md`,
  `.gitlab/issue_templates/content-correction.md`.
- `.gitattributes`: added `*.sh text eol=lf` so Windows checkouts cannot rewrite
  the shell scripts to CRLF.
- Updated the stale comment in `.github/workflows/ci.yml` that claimed no
  `.gitlab-ci.yml` existed.
- Secret-shaped-pattern scan: `git grep` for AWS keys, PEM private keys, Google
  API keys, Stripe live keys, Slack tokens, GitHub tokens and JWTs → **no
  matches**. Generic `key/secret/password/token = "<20+ chars>"` → **1 match**,
  `docs/test-report.md` (line 97): a 32-char hex token captured in an old QA
  report body. Not a JWT and not a production credential; left untouched,
  reported as a low-severity finding.

Skipped (pending real values):

- `LICENSE.md` — the copyright holder is still the placeholder
  `[YOUR LEGAL NAME OR COMPANY]`.
- `SECURITY.md` — the security contact is still the placeholder
  `[YOUR SECURITY EMAIL]`.

Not run in Phase 1:

- `.gitlab-ci.yml` was not executed (no GitLab runner here). Only YAML parsing
  and the `nginx-syntax` helper's local behaviour were checked.
- `nginx -t` — nginx is not installed on this machine (NOT RUN).

Commits: `6a228cb` (ci), `9154863` (gitattributes), `0f862b3` (docs).

## Phase 2A — dependency security upgrades

Target versions were verified with `npm view` before installing. Five requested
targets were under seven days old at check time, so the newest older fixed
version was used instead:

| Package | Requested | Used | Reason |
| --- | --- | --- | --- |
| `next` | 16.4.3 | **16.4.3** | Initially chose 16.4.2 while 16.4.3 was 6.3 days old. A duplicate root/web Next copy broke type-check; by the time both copies were aligned, 16.4.3 had crossed seven days. Single copy now installed. |
| `axios` | 1.21.0 | **1.20.0** | 1.21.0 was 2.5 days old; 1.20.0 is older and outside the advisory range. |
| `postcss` | 8.5.32 | **8.5.31** | 8.5.32 was 3.0 days old; 8.5.31 is older and outside the advisory range. |
| `@nestjs/platform-express` | 11.2.8 | **11.2.7** | 11.2.8 was 6.3 days old; 11.2.7 was already installed and audit-clean. |
| `nodemailer` | 10.3.0 | **10.2.0** | 10.3.0 was 0.6 days old; 10.2.0 is older and outside the advisory range. |

Other versions: `zod@4.6.7`, `sharp@0.35.5`, `nanoid@3.3.20`,
`multer@2.5.0`, `body-parser@2.4.0`, `proxy-addr@2.0.8`, and the Prisma stack
at `7.10.1`. Root overrides now cover `multer`, `body-parser`, `proxy-addr`,
`sharp`, and `nanoid`.

**Process deviation to report:** the allowed `chore/dependency-security-upgrade`
branch was not created before the Prisma and API upgrades. Those two commits
(`5a4d333`, `697ac23`) landed directly on `integration/anatomy-hardening`.
The web upgrade was done on `chore/dependency-security-upgrade`, created from
integration HEAD, and merged back with `--no-ff` after its gates passed. No
history was rewritten.

Gates run on the final tree:

- `npm ci`: exit 0, 1771 packages. This npm skipped Prisma/bcrypt postinstall
  scripts, so `npx prisma generate` was run explicitly; `bcrypt` loads normally.
- `npx prisma validate`, `npx prisma generate`, `npx prisma migrate status`:
  pass; schema valid, 16 migrations, database up to date.
- `npm run build:api`: pass.
- `npm test --workspace=apps/api`: 25 suites, **282/282 tests** pass. The known
  `config/trust-proxy.spec.ts` 5000 ms flake appeared once under parallel load,
  passed 9/9 in isolation, and the full rerun passed.
- `npm run test:e2e --workspace=apps/api`: 1 suite, **3/3** pass.
- `npm run build:web`: pass with Next 16.4.3; all routes generated and Proxy
  (Middleware) present.
- Heart validator: 17 mesh + 9 text-only, 102,568 triangles, 1.91 MB.
  Urinary validator: 10 mesh + 5 text-only, 20,364 triangles, 0.44 MB.
- Anatomy reconcile against the local DB: heart 26 rows, urinary 15 rows;
  protected-text SHA-256 unchanged (`f7373f05…384b`, `caf4e073…257b6`);
  flags unchanged (heart published/sample, urinary draft).
- Nested `$transaction`: inner rollback handled, outer transaction continues,
  counts 2/2.
- Smoke (`SMOKE_STRICT_CACHE=0`): **PASS: 18 FAIL: 0**.
- Targeted middleware checks: malformed JSON → 400; oversized JSON → **413**
  after a narrow fix to `AllExceptionsFilter` (body-parser raises a plain Error,
  which previously became a generic 500). `trust-proxy.spec.ts` covers forwarded
  client rate-limit keys and spoofed-header rejection.
- Nodemailer 10 `jsonTransport` test: message built successfully; no real email
  sent.
- Playwright as temporary STUDENT and TEACHER: login, `/anatomy`, `/anatomy/heart`
  with real `heart.v2.glb` (200, `model/gltf-binary`), visible canvas, no model
  error, reload stays authenticated. Forcing access-cookie expiry produced a
  200 `/auth/refresh` and a retried 200 `/anatomy/systems`. STUDENT saw no draft
  urinary system; TEACHER did. Both temp users deleted, both logins → 401.
- Web lint: 5 pre-existing `react-hooks/set-state-in-effect` errors in untouched
  files (`(app)/layout.tsx`, `admin-login`, `login`, `register`, `topbar`);
  no changed source file is implicated. CI lint is report-only.
- `npm audit signatures`: 1769 verified, 522 attestations.
- Per-workspace `npm audit --omit=dev` after the upgrade: API **4** (1 moderate,
  3 high) and web **9** (1 critical, 6 high, 2 moderate), all transitive
  build/optional chains. Direct advisories for `next`, `axios`, `zod`, `multer`,
  `nodemailer`, `body-parser`, `proxy-addr`, `sharp`, `nanoid`, `postcss`,
  Prisma, and Nest are cleared. The remaining `tar` critical is the optional,
  uninstalled `canvas → @mapbox/node-pre-gyp` lockfile path already accepted in
  `docs/audit/DEPENDENCY-UPGRADE-TRIAGE.md`; the remaining high/moderate entries
  are build-chain packages.
- `npm dedupe` timed out after 15 minutes without changing the tree; the
  single-Next alignment was achieved with a clean `npm install` instead.

Commits: `5a4d333` (Prisma), `697ac23` (API), web upgrade + 413 filter fix on
`chore/dependency-security-upgrade` (merged back with `--no-ff`).

## Phase 2B — environment validation parity

Done:

- `env.validation.ts` rejects any `CORS_ORIGIN` containing `*`, including `*`,
  `https://*.example.com`, and wildcard entries in a comma-separated list.
  Credentialed CORS must always be an explicit allowlist.
- `scripts/check-env.mjs` now mirrors the API checks:
  - rejects wildcard CORS origins;
  - validates optional `TRUST_PROXY` as a non-negative integer;
  - validates optional `COOKIE_DOMAIN` as a bare hostname;
  - requires `NEXT_PUBLIC_API_URL` (the web build arg) and rejects localhost
    values under `--strict`;
  - makes `RECEIPT_VERIFIER_TOKEN` conditional on `RECEIPT_VERIFIER_URL`
    instead of always required;
  - validates `RECEIPT_VERIFIER_TIMEOUT_MS` and
    `COMPANY_BANK_ACCOUNTS` the same way as the API.
- `.env.production.example`, `apps/api/.env.example`, and
  `docs/deploy/RELEASE-CHECKLIST.md` now state that wildcards are rejected.
- Tests: `config/env.validation.spec.ts` **33/33** pass, including four
  wildcard variants and a valid comma-separated allowlist. Full API suite:
  **25 suites, 287/287 tests**. `npm run build:api` passes.
- Preflight fixtures: valid strict config passes; wildcard CORS, bad
  `TRUST_PROXY`, bad `COOKIE_DOMAIN`, missing verifier token, out-of-range
  verifier timeout, and localhost `NEXT_PUBLIC_API_URL` all fail with the
  expected message. A disabled verifier with a blank token passes.

## Phase 2C — Docker and nginx review

Static review only; the Docker daemon on this machine cannot start, so no image
was built and no container was run. Findings:

- `apps/api/Dockerfile` builds from the monorepo root, installs the full
  workspace tree, builds Nest, and intentionally keeps devDependencies in the
  runtime image because the entrypoint runs `npx prisma migrate deploy` before
  starting the API. The entrypoint uses `set -e`, so a failed migration stops
  startup. OpenSSL is installed for Prisma.
- `apps/web/Dockerfile` builds Next standalone output and requires
  `NEXT_PUBLIC_API_URL` as a **build** arg; changing it only at runtime would
  not change the inlined client bundle.
- `services/receipt-verifier/Dockerfile` installs Chromium and chromedriver for
  the BOA extractor and runs one uvicorn worker.
- `docker-compose.prod.yml` publishes only web/api, and only on `127.0.0.1`.
  Postgres and Redis stay on the internal network. API startup waits for
  healthy Postgres, Redis, and verifier; uploads use a named volume.
- `.dockerignore` excludes `.env*` (except the examples), `node_modules`,
  build output, uploads, VCS metadata, and docs.
- **Fixed:** both nginx configs capped request bodies at `12m`, below the API's
  `25 MB` materials upload limit. The web and API locations in production and
  staging now use `30m`, leaving room for multipart framing while Multer still
  enforces 25 MB (materials) and 10 MB (receipts).
- `bash -n deploy/nginx/test-nginx-config.sh` passes. The helper prints a notice
  and exits 0 when nginx is absent, as it is here.
- `docker compose -f docker-compose.prod.yml --env-file .env.production.example
  config --no-env-resolution --quiet` exits 0. Plain `config` fails only because
  the real `.env.production` is intentionally absent; it was not created or read.

NOT RUN in this phase:

- `docker version` reaches the client but fails to connect to
  `npipe:////./pipe/dockerDesktopLinuxEngine`; the Docker daemon is unavailable.
  Consequently `docker build`, `docker compose up`, container health checks, and
  `nginx -t` inside the official image were **not run**.
- nginx is not installed locally, so local `nginx -t` was **not run**.

## Phase 2D — admin anatomy gate, Playwright, checklist

API role check with temporary, verified ADMIN and SUPER_ADMIN accounts (random
passwords never printed):

| Role | login | list systems | heart detail | explain | quiz |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ADMIN` | 200 | **403** | **403** | **403** | **403** |
| `SUPER_ADMIN` | 200 | **403** | **403** | **403** | **403** |

Both temporary users were deleted and both logins returned **401** afterwards.
The class-level `@Roles('STUDENT', 'TEACHER')` guard on `AnatomyController`
covers all four routes, including the AI endpoints, so no paid Gemini call is
made for an admin request.

Web alignment:

- `apps/web/src/lib/route-access.ts` previously let ADMIN/SUPER_ADMIN through
  the client `/anatomy` gate while the API rejected every data request. It now
  allows only STUDENT/TEACHER and sends admins to `/admin`.
- `apps/web/e2e/auth.spec.ts` gained an opt-in regression test: a super admin
  who visits `/anatomy` must land on `/admin`. The existing sign-in test was
  refactored to share the login helper.
- Targeted ESLint on the changed web files: exit 0. `npm run build:web`: pass.

Playwright:

- Default suite: **17 tests, 15 passed, 2 skipped** (the two auth tests are
  opt-in because they need a seeded super admin). Exit 0.
- With a temporary super admin: both auth tests pass, including the new
  `/anatomy` → `/admin` redirect. Temp user deleted; login → **401**.
- One earlier opt-in run hit the API's 5/minute login throttle because several
  temporary-account runs happened back-to-back. After the 60-second window
  cleared, the run passed 2/2; this is the intended brute-force protection, not
  a product failure.

`docs/deploy/RELEASE-CHECKLIST.md` now records the admin anatomy check, the
Playwright result, and the pre-existing web-lint caveat.

## Phase 3 — faculty review packet and sign-off

The existing `apps/api/prisma/review-anatomy.ts` sign-off script was extended
instead of adding a second workflow:

- `--export <file>` writes a read-only faculty packet. `.json` produces a
  machine-readable packet with one blank decision per structure; any other
  extension produces a Markdown packet for reading. Each structure records a
  SHA-256 over its current teaching text.
- `--validate <file>` checks that the packet matches the current system, every
  structure has an allowed decision (`approved`, `approved-with-edits`, or
  `rejected`), rejected rows have comments, a reviewer and date are present, and
  the teaching-text hashes still match. A stale packet is rejected.
- `--export` and `--validate` are read-only. They refuse to run with `--confirm`
  or `--revoke`, and never change teaching text, `isReviewed`, or `isPublished`.
- The existing `--confirm` sign-off and `--revoke` paths are unchanged. No
  sign-off was applied.

Verification against the local dev database:

- Heart JSON export: 26 structures, 26 decisions, 0 reviewed, 35,428 bytes.
  Markdown export: 29,686 bytes. System remains `isPublished=true`,
  `isSample=true`.
- Incomplete packet: rejected with missing reviewer/date/decisions.
- Filled packet (temporary test values, not written to the DB): **validation
  passed** for 26 structures.
- `--export --confirm`: rejected as intended.
- Database after the checks: heart 26 structures published/sample, urinary 15
  structures draft, **0 reviewed rows**. No teaching text was edited.
- `npx tsc --noEmit -p tsconfig.json`: pass. `npm run build:api`: pass.

Docs updated: `docs/deploy/GO-LIVE.md` §3.4.1,
`docs/deploy/RELEASE-CHECKLIST.md` §5, and
`docs/anatomy/provenance/README.md` §10.

## Phase 4 — remaining anatomy systems (blocked)

No system beyond heart and urinary can be built safely from this repository:

- `ANATOMY_SEED_REGISTRY` contains only `heart` and `urinary`.
- The repository contains no source archives, source maps, GLB candidates,
  manifests, or faculty-approved text for respiratory, nervous, alimentary,
  musculoskeletal, cardiovascular vessels, endocrine, deep fascial, genital, or
  integumentary releases.
- The whole-body plan requires mapping approval, text/licence approval, a
  versioned build, validation, contract coverage, faculty review, and release
  approval for each system. Those inputs are not present, and inventing anatomy
  text or mesh data is explicitly out of scope.
- Existing validators and contract tests still cover the two registered systems
  and pass. No placeholder systems were added.

This is a blocking dependency, not a test failure. The next safe step is the
respiratory mapping proposal described in `docs/anatomy/whole-body-plan.md`,
followed by text/licence review and a candidate build. Do not seed or publish a
system until those gates are recorded.

## Phase 5 detail — left/right on-screen check (report-only, done)

- GLB centroids confirm patient-left = +X for every pair: heart
  ventricles/atria; urinary kidney/ureter/renal artery/vein. `left_*` centroids
  are always more +X than `right_*`, so the ordering is correct and there is
  **no swap**.
- The viewer camera sits at `[0, 0, 7]` looking toward the origin, i.e. a front
  view. With +X on the viewer's right, LEFT structures render on the viewer's
  right, which is correct for a front view. The urinary manifest states the same
  (`camera looks from +Z toward the origin; patient left is +X`).
- A live Playwright pass as temporary STUDENT and TEACHER opened `/anatomy`,
  `/anatomy/heart` and `/anatomy/urinary` with the real GLB. Note: the viewer
  auto-focuses the selected mesh (the camera pans to the structure centre), so
  post-selection screenshots cannot show the default-view side; the screenshot
  teal centroid is also polluted by the scene point light. The authoritative
  check is the GLB centroid analysis above.

## Final verification - 2026-10-30

All commands were run locally on `integration/anatomy-hardening`. No push,
rebase, reset, force, migration, publish, or teaching-text edit was performed.

| Gate | Result |
| --- | --- |
| API unit | 25 suites, **287/287** tests pass |
| API e2e | 1 suite, **3/3** tests pass |
| Web build | Next.js 16.4.3, compiled successfully, **39/39** static pages |
| Heart model validator | pass - 17 mesh + 9 text-only, 102,568 triangles, 1.91 MB |
| Urinary model validator | pass - 10 mesh + 5 text-only, 20,364 triangles, 0.44 MB |
| Smoke (Git Bash, `SMOKE_STRICT_CACHE=0`) | **PASS: 18, FAIL: 0** |
| Playwright default (Phase 2D/5) | 15 passed, 2 skipped (auth tests opt-in) |
| Playwright auth opt-in (Phase 2D) | 2/2 passed after the rate-limit window |
| Phase 3 `tsc --noEmit` + API build | pass |
| Review packet export/validate | heart 26 structures; incomplete rejected; completed validated; read-only |
| Database flags after all checks | heart published/sample 26; urinary draft 15; **0 reviewed rows** |

The final API unit run first hit the known `trust-proxy.spec.ts` 5-second
timeout once under parallel load. The spec now sets a 15-second per-suite
timeout (`bb88864`); it passes 9/9 in isolation and the full suite passes
287/287. No assertion or application behavior changed.

The smoke test must be run with Git Bash, not the WSL `bash` on `PATH`: WSL
cannot reach the Windows-hosted `127.0.0.1`/`localhost` ports and reports
`000`. With `C:\Program Files\Git\bin\bash.exe` the suite passes 18/0.

## Final report (pre-Step-3 baseline)

> Historical report from before Step 3. Its “Phase 4 blocked” and “no system
> beyond heart and urinary” statements are superseded by the Step 3 section
> above and by the final Step 6 report.

### Delivered

- **Part A - dependency security upgrades.** Prisma stack 7.10.1, Nest
  platform-express/multer/nodemailer/body-parser/proxy-addr upgrades, and web
  package upgrades (Next 16.4.3, axios 1.20.0, postcss 8.5.31). Direct
  advisories were cleared without `npm audit fix` or `--force`.
- **Part B - configuration hardening.** Wildcard CORS is rejected; deployment
  preflight (`scripts/check-env.mjs`) matches runtime validation for
  `TRUST_PROXY`, `COOKIE_DOMAIN`, `NEXT_PUBLIC_API_URL`, verifier token/timeout,
  and bank accounts.
- **Part C - deployment review.** All Dockerfiles, Compose files, and nginx
  configurations were reviewed statically. Nginx body limits were raised from
  `12m` to `30m` to match the API's 25 MB materials cap.
- **Part D - access control and release checks.** ADMIN/SUPER_ADMIN now receive
  API `403` and the web redirects them to `/admin`; STUDENT/TEACHER retain
  access. The release checklist and Playwright coverage were updated.
- **Phase 3 - faculty review.** `anatomy:review` now exports a read-only JSON or
  Markdown packet and validates a completed packet against current teaching-text
  hashes. Sign-off remains a separate `--confirm` step. No review was applied.
- **Phase 5 - left/right proof and README.** GLB centroids confirm patient-left
  is `+X` with no swap; the README now documents setup, checks, anatomy safety,
  deployment, and the review workflow.

### Verified

The re-run gates above pass. The Playwright rows are the latest recorded runs
from Phase 2D/5; the README-only change does not affect them. The database still
contains only the heart sample (26 structures, published/sample) and the
urinary draft (15 structures), with zero `isReviewed` rows. The heart
protected-text hash and the published flags are unchanged.

### Not verified / blocked

- **Phase 4 (remaining anatomy systems) is blocked.** The repository has no
  licensed source archives, source maps, GLB candidates, manifests, or
  faculty-approved text for respiratory, nervous, alimentary, musculoskeletal,
  cardiovascular vessels, endocrine, deep fascial, genital, or integumentary
  releases. No placeholder systems were added.
- **Docker image builds and container health checks were not run.** The Docker
  daemon was unavailable at
  `npipe:////./pipe/dockerDesktopLinuxEngine`; only static review and
  `compose config` with the example environment were possible.
- **`nginx -t` was not run.** Nginx is not installed on this host; the configs
  received static review and the helper script passed `bash -n`.
- **Production strict smoke (20 checks) was not run.** It requires nginx/TLS;
  the local run reports 18 passing with 0 failures and skips the immutable-cache
  check.
- **`LICENSE.md` and `SECURITY.md` remain skipped.** The copyright holder and
  security contact are still bracketed placeholders.
- **Residual audit findings remain** in transitive/optional build-chain
  packages: API 4 (1 moderate, 3 high), web 9 (1 critical, 6 high, 2 moderate).
  They are documented in `docs/audit/DEPENDENCY-UPGRADE-TRIAGE.md`; no direct
  advisory remains.
- **Process deviation:** the Prisma and API upgrade commits landed directly on
  `integration/anatomy-hardening` before the dedicated upgrade branch existed.
  The web upgrade was merged back with `git merge --no-ff`.

### Release recommendation

This branch is ready for local review and a controlled staging deployment, not
production sign-off. Before production:

1. Supply licensed source assets/mappings and faculty-approved text for each
   remaining system, then run the Phase 4 build/validation/review gates per
   system.
2. Complete a faculty review packet and explicit sign-off for each system; keep
   `isPublished` false until approval.
3. Resolve the DBCLS licence question and fill `LICENSE.md` and `SECURITY.md`
   with real owner values.
4. Run Docker image builds, container health checks, and `nginx -t` on a host
   with those tools.
5. Re-run the strict 20-check smoke over HTTPS and the opt-in Playwright auth
   tests with temporary accounts; delete the accounts and verify `401`.

## Decisions

- `LICENSE.md` and `SECURITY.md` are skipped until the user supplies a real
  copyright holder and security email.
- Dependency upgrades were split into three commits (Prisma stack; API; web).
  The Prisma and API commits landed directly on
  `integration/anatomy-hardening` before the dedicated branch was created — a
  process deviation recorded above. The web commit was merged back with
  `--no-ff`.
- The API server must be started from `apps/api` (`node dist/src/main.js`) so
  `ConfigModule` loads `apps/api/.env`; starting it from the repo root loads the
  root `.env` and hits an empty database (login → 500).

## Local environment notes

- API `http://127.0.0.1:4000` (run from `apps/api`), web `http://localhost:3000`.
- Redis native service reports `MISCONF` (BullMQ errors) but the app serves the
  smoke suite; Postgres `postgresql-x64-18` on 5432, database `lor_mentor`, 16
  migrations, schema up to date.
- Smoke: `SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000`
  → `PASS: 18 FAIL: 0` locally. Production HTTPS strict mode expects 20.

## Next up

The hardening branch is complete for the work that can be done locally. The next
release step is a staging deployment with the Docker/nginx gates, followed by
Phase 4 only when licensed assets, source maps, and faculty-approved text are
available. Phase 4 remains blocked; no system beyond heart and urinary is
registered.
