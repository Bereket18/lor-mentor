# Heart model v2 switch and rollback

This record covers the switch of the live Anatomy Lab heart model from
`heart.v1.glb` to `heart.v2.glb` in the local development environment. It is a
local switch: nothing was pushed or deployed.

## 1. Commits and assets

| Item | Value |
| --- | --- |
| Branch | `feature/anatomy-atlas` |
| Pre-switch commit | `8fdfee6` (`fix(web): enlarge anatomy study-tool targets`) |
| Code switch commit | `8831e18` (`feat(anatomy): switch live heart model to v2`) |
| Build-manifest follow-up | `79dfe85` (`fix(anatomy): keep v2 changes in rebuilt manifests`) |
| Live asset | `apps/web/public/models/anatomy/heart.v2.glb` |
| Rollback asset | `apps/web/public/models/anatomy/heart.v1.glb` |
| Live manifest | `apps/web/public/models/anatomy/manifest.json` |
| v2 provenance manifest | `apps/web/public/models/anatomy/heart.v2.manifest.json` |

Asset values:

| Field | v1 (rollback) | v2 (live) |
| --- | ---: | ---: |
| Bytes | 1,841,856 | 2,003,856 |
| MiB | 1.76 | 1.91 |
| Triangles | 93,842 | 102,568 |
| Mesh nodes | 14 | 17 |
| Text-only structures | 0 | 9 |
| Total structures | 14 | 26 |
| SHA-256 | `e7723082d617b7d9198210200c7c4e82a052e699cec5cdc2faf6c652fc6f0db0` | `b1fac8e02842b40b9cd123e3e896d868254d07b63ed3bc856977d511b879541d` |

The v2 asset adds `pulmonary_arteries`, `pulmonary_veins`, and `aortic_arch` to
the 14 v1 node names. The live manifest and `heart.v2.manifest.json` are
identical, and their licence block is unchanged from the pre-switch wording.

## 2. What changed

- `HEART_SYSTEM.modelUrl` changed from `/models/anatomy/heart.v1.glb` to
  `/models/anatomy/heart.v2.glb`.
- `manifest.json` now describes the live v2 asset: file name, byte size,
  SHA-256, 102,568 triangles, 17 mesh nodes, 9 text-only structures, 26 total
  structures, both source archives, and the seven-item “What we changed” list.
- The credits page shows the same live v2 facts and change list. The required
  BodyParts3D credit and the licence caveat were not reworded.
- The validator and build script default to the live v2 asset.
- The contract test now asserts the live v2 asset, the 17/9/26 split, the v2
  manifest contents, and the preserved v1 rollback asset.
- `heart.v1.glb` was kept unchanged for rollback. No migration was added or run
  for this switch.

### Database reconcile

The switch was applied with:

```powershell
npm run db:seed:anatomy --workspace=apps/api -- --reconcile
```

The result was:

```text
Anatomy system "heart" exists; reconciled metadata (model URL /models/anatomy/heart.v2.glb).
Heart seed complete: 0 created, 26 already existed, 26 total, 26 existing rows reconciled.
```

`--reconcile` writes these columns on an existing system row: `slug`, `name`,
`latinName`, `description`, `modelUrl`, `isSample`, `isPublished`, `sortOrder`
(plus Prisma's automatic `updatedAt`). On existing structure rows it writes only
`references`, `sortOrder`, and `relatedSlugs`. It does **not** write `summary`,
`location`, `function`, `bloodSupply`, `clinicalNotes`, `name`, `latinName`,
`meshName`, or `isReviewed`.

Protected teaching-text hashes were captured before and after the reconcile using
SHA-256 over the UTF-8 JSON array
`[summary, location, function, bloodSupply, clinicalNotes]` for each row. All 26
hashes matched, and the 12 hashes recorded in
[`phase-1-source-mapping.md`](./phase-1-source-mapping.md) also matched. The
temporary capture files are outside the repository.

A local database backup was taken before the switch at
`C:\Users\berek\Desktop\lor-backups\anatomy-backup-2026-10-25T17-25-47-227Z.json`
(19,953 bytes, SHA-256
`23c468639f360941c18e2fce0fa8c182a6a16490e52a8692e78d6b3a0ab4696c`). The rollback does not require restoring
it because the switch did not change teaching text or schema.

## 3. Verification results

All checks below were run against the local development servers
(`http://localhost:3000` and `http://localhost:4000`).

| Check | Result |
| --- | --- |
| v2 validator | Passed: 17 mesh structures + 9 text-only, 102,568 triangles, 1.91 MB |
| Seed-to-model contract test | 11/11 passed |
| Anatomy API service tests | 10/10 passed |
| Web TypeScript (`tsc --noEmit`) | Passed |
| API build TypeScript (`tsconfig.build.json`) | Passed |
| Changed-file API TypeScript check | Passed |
| ESLint on changed API and web files | Passed |
| Served v2 download | HTTP 200, `model/gltf-binary`, 2,003,856 bytes, SHA-256 matched the manifest |
| DB-to-GLB mesh check | 17 DB mesh names, 17 GLB node names, no missing or extra names |
| Real-browser Playwright check | 26/26 rows passed; see below |

The full API project `tsc` still reports four pre-existing errors in
`auth.service.spec.ts`, `chapa.service.spec.ts`, and `payments.service.spec.ts`;
those files were not changed by this switch. The API build configuration and the
changed anatomy files compile cleanly.

### Browser evidence

The Playwright run used the real v2 GLB and a temporary verified student,
`anatomy-v2-e2e-local@example.test`. The student was deleted after the run and a
follow-up query returned no rows.

- 26/26 row titles matched the navigator and database order.
- All 9 text-only rows showed the “No 3D model” badge, the viewport status, and
  the live announcement.
- All 17 mesh rows showed a highlight change and camera movement.
- All 9 text-only rows showed zero camera movement.
- There were 0 row-level console errors. The global console contained one
  expected 401 for `/api/v1/me` and one `THREE.Clock` deprecation warning.
- The GLB response was HTTP 200 with a 2,003,856-byte body. Resource timing
  recorded 114 ms duration, 1,657,642 transfer bytes, and 2,003,856 decoded
  bytes. Time to first render was 1,913 ms.

The browser run was headless Chromium with software rendering. The camera and
highlight findings are screenshot, edge, silhouette, and teal-shift proxies, not
hardware-GPU proof. Physical low-end phone and throttled-network testing remains
outstanding.

The full result file and screenshots are outside the repository at
`C:\Users\berek\AppData\Local\Temp\opencode\anatomy-v2-e2e\`.

## 4. Exact rollback

Use this when the v2 switch must be undone. It restores the pre-switch code and
the v1 `modelUrl` while keeping the 26-row seed, the nullable-`meshName` schema,
and all teaching text.

1. Confirm the working tree is clean except for intentional untracked files:

   ```powershell
   git status --porcelain=v1
   ```

2. Revert the build-manifest follow-up and the code switch, newest first:

   ```powershell
   git revert --no-edit 79dfe85
   git revert --no-edit 8831e18
   ```

   `79dfe85` only affects future rebuilds. If it is intentionally kept, revert
   only `8831e18`. Do not revert the provenance documentation commit; leave it
   as the historical record and update the README current-state section if the
   rollback becomes permanent.

3. Re-apply the v1 model URL to the local database using the reverted seed:

   ```powershell
   npm run db:seed:anatomy --workspace=apps/api -- --reconcile
   ```

   The expected output includes
   `model URL /models/anatomy/heart.v1.glb` and
   `26 already existed, 26 total, 26 existing rows reconciled`.

4. Verify the database system row and row count. Run this read-only query with
   your normal database client:

   ```sql
   SELECT s.slug, s."modelUrl", count(st.id) AS structures
   FROM "AnatomySystem" s
   JOIN "AnatomyStructure" st ON st."systemId" = s.id
   WHERE s.slug = 'heart'
   GROUP BY s.slug, s."modelUrl";
   ```

   Expected: `heart | /models/anatomy/heart.v1.glb | 26`.

5. Verify the preserved v1 asset has not changed:

   ```powershell
   Get-FileHash apps/web/public/models/anatomy/heart.v1.glb -Algorithm SHA256
   ```

   Expected SHA-256:
   `e7723082d617b7d9198210200c7c4e82a052e699cec5cdc2faf6c652fc6f0db0`.

6. Validate the reverted live asset and run the contract test:

   ```powershell
   npm run validate:anatomy-model --workspace=apps/web
   npm test --workspace=apps/api -- anatomy-model.contract.spec.ts --runInBand
   ```

   After the revert, the validator defaults to v1 and the contract test asserts
   the v1 live asset plus the v2 candidate.

7. Re-check the 26 protected teaching-text hashes with the same method used for
   the switch. They must still match the pre-switch capture.

8. Reload `http://localhost:3000/anatomy/heart` and confirm the browser requests
   `/models/anatomy/heart.v1.glb`. The versioned URL is a distinct cache key; a
   hard refresh is only needed if the local browser cached the page shell.

### What rollback does not do

- It does not restore the database backup. The switch did not change teaching
  text, and all 26 hashes were verified before and after.
- It does not remove `heart.v2.glb`, `heart.v2.manifest.json`, the nullable
  `meshName` migration, or the text-only viewer support.
- Under v1, the 9 text-only rows remain text-only, while the 3 v2-only mesh rows
  (`pulmonary_arteries`, `pulmonary_veins`, `aortic_arch`) show the existing
  missing-mesh treatment because v1 has only 14 nodes. This is the known
  pre-switch state.
- It does not change the licence wording or the required BodyParts3D credit.

## 5. Not run

- No push, deployment, or production database change.
- No fresh-database migration replay. That is proposed separately and requires
  approval.
- No build from the source archives; the extracted BodyParts3D directories were
  not present in this environment.
- No physical low-end phone or throttled-network test.
- No full API test suite; only the anatomy contract and service tests were run.
