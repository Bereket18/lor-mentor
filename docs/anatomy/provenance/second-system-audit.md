# Second-system audit: urinary v1 readiness

This is a read-only audit of the viewer, API, and seed code for heart-specific
assumptions that would block a second Anatomy Lab system. No viewer, API, or
seed code was changed for this audit. The urinary asset, manifest, fixture, and
contract test were built separately; see
[`urinary-v1-build.md`](./urinary-v1-build.md).

- Branch: `integration/anatomy-hardening`
- Audit date: 2026-10-27
- Target second system: `urinary` (draft, `isPublished: false`)
- Verdict: the API and database layer already support multiple systems. The
  seed, the viewer layer registry, the library icon, and the attribution page
  are still single-system and must be generalized before urinary is published.

## 1. Summary

| Area                                         | Heart-specific today? | Blocks publishing urinary? | Required change                                                                                                          |
| -------------------------------------------- | --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Prisma schema                                | No                    | No                         | None. `AnatomySystem.slug` is unique and `AnatomyStructure` is unique per `(systemId, slug)` and `(systemId, meshName)`. |
| Anatomy API service                          | No                    | No                         | None. Queries are by slug and `systemId`; publication and subscription checks are system-agnostic.                       |
| Anatomy API controller and DTOs              | No                    | No                         | None. Route parameters are generic; the `heart` mentions are examples in comments.                                       |
| Anatomy seed script                          | Yes                   | Yes                        | Teach `seed-anatomy.ts` to select or iterate systems instead of importing only the heart data.                           |
| Viewer mesh selection and text-only handling | No                    | No                         | None. Selection is by `meshName`; `meshName: null` already renders as text-only.                                         |
| Viewer layer registry                        | Yes                   | No, but UI quality         | Curate urinary layer order and labels; today they fall back to alphabetical, title-cased extras.                         |
| Library page icon                            | Yes                   | No, but UI quality         | Choose an icon per system instead of `HeartPulse` for every card.                                                        |
| Attribution page                             | Yes                   | Yes                        | It imports the heart manifest directly and its copy describes the heart model only.                                      |
| App navigation icon                          | Yes                   | No                         | `HeartPulse` is used for the Anatomy Lab section. Optional to keep as a section icon or make generic.                    |
| Model README                                 | Yes                   | No, but misleading         | It still calls `heart.v1.glb` the production asset and omits `--system`.                                                 |
| Third-party notices                          | Yes                   | Yes, before release        | It says the heart model, lists only the PART-OF tree, and points at the heart seed file.                                 |
| Orientation                                  | Recorded, no marker   | No for urinary             | Both systems use patient-left `+X`; an on-screen marker is still absent.                                                 |
| Contract test                                | Extended for both     | No                         | Already covers the urinary draft and the heart v1/v2 assets.                                                             |

## 2. API and database

`apps/api/src/modules/anatomy/anatomy.service.ts` is already generic:

- `listSystems()` filters on `isPublished: true`, orders by `sortOrder` and
  `name`, and returns a structure count per system.
- `getSystem()` looks up by `slug`, checks `isPublished`, applies the
  subscription rule per system, and loads structures by `systemId`.
- `findStructureForAi()` repeats the same slug, publication, and subscription
  checks before loading protected text.

`apps/api/src/modules/anatomy/anatomy.controller.ts` exposes the same routes for
every system. The DTO comments mention `heart` only as an example. The Prisma
schema already scopes uniqueness to the system:

```prisma
@@unique([systemId, slug])
@@unique([systemId, meshName])
```

No API or schema change is required to serve a second system. The urinary seed
sets `isPublished: false`, so it will stay invisible to `listSystems()` and
return 404 from `getSystem()` until an explicit publish decision.

## 3. Seed script

`apps/api/prisma/seed-anatomy.ts` is heart-only:

- It imports `HEART_STRUCTURES`, `HEART_SYSTEM`, and `validateHeartSeed` from
  `anatomy-heart.data`.
- It validates only the heart seed.
- It looks up, creates, reconciles, and prunes one system identified by
  `HEART_SYSTEM.slug`.
- Its log messages say “Heart seed complete”.

The safety model is worth preserving when generalizing:

- create-only by default;
- `--reconcile` refreshes system metadata and derived structure fields but not
  teaching text, names, or `isReviewed`;
- `--prune-stale` is opt-in and refuses to delete faculty-reviewed rows.

Recommended shape:

1. Export a small registry, for example
   `[{ system: HEART_SYSTEM, structures: HEART_STRUCTURES, validate: validateHeartSeed }, { system: URINARY_SYSTEM, structures: URINARY_STRUCTURES, validate: validateUrinarySeed }]`.
2. Add `--system heart|urinary|all` (default `all`, or default `heart` for
   backward compatibility). Keep the existing flags unchanged.
3. Run the existing create/reconcile/prune logic once per selected system.
4. Keep the seed script as the only writer. Do not import seed data into the
   viewer or the build script.
5. Leave `URINARY_SYSTEM.isPublished` false until the content and UI review is
   complete.

This is the only change that is strictly required before the urinary rows can
exist in a database. No seed has been run in this working tree.

## 4. Viewer layer registry

`apps/web/src/lib/anatomy.ts` hard-codes the heart layers:

```ts
export const LAYER_ORDER = [
  "chambers",
  "valves",
  "great-vessels",
  "coronary-circulation",
] as const;

export const LAYER_LABELS: Record<string, string> = {
  chambers: "Chambers",
  valves: "Valves",
  "great-vessels": "Great vessels",
  "coronary-circulation": "Coronary circulation",
};
```

`orderedLayers()` appends unknown layers alphabetically, and `layerLabel()`
title-cases unknown slugs. The urinary layers are `kidneys`, `ureters`,
`bladder`, `urethra`, `renal-vessels`, and `renal-parts`. They will render today,
but the fallback order is:

```text
Bladder, Kidneys, Renal Parts, Renal Vessels, Urethra, Ureters
```

That is not the teaching order. The viewer also calls `orderedLayers(system.structures)`
without passing the system slug, so a per-system registry needs a small viewer
change:

- add a registry keyed by system slug, with the heart order as the default;
- pass `system.slug` into `orderedLayers()` and `layerLabel()`, or resolve the
  registry once in `AnatomyViewer`;
- keep the current fallback so a new system never hides a structure;
- use the intended urinary order, for example `kidneys`, `renal-parts`,
  `renal-vessels`, `ureters`, `bladder`, `urethra`, with labels “Kidneys”,
  “Renal parts”, “Renal vessels”, “Ureters”, “Bladder”, “Urethra”.

This is a viewer change and was deliberately not made in this audit.

## 5. Library page and navigation icons

`apps/web/src/app/(app)/anatomy/page.tsx` imports `HeartPulse` and uses it in
two places:

- the page header icon;
- the icon on every system card in the library list.

Once two systems are listed, every card would show a heart. The card icon
should come from a small slug-to-icon map with a neutral fallback (for example
`Boxes` or `Scan`). The header can stay generic or use a neutral anatomy icon.

`apps/web/src/components/layout/sidebar.tsx` and
`apps/web/src/components/layout/mobile-nav.tsx` also use `HeartPulse` for the
Anatomy Lab navigation entry. This is a section-level icon rather than a
per-system claim, so it is lower priority. If the product wants a neutral
Anatomy Lab identity, replace it in both files at the same time.

## 6. Attribution page

`apps/web/src/app/attribution/anatomy/page.tsx` is the strongest blocker after
the seed:

- it imports `../../../../public/models/anatomy/manifest.json` directly, which
  is the heart v2 manifest;
- the metadata description says “heart model”;
- the intro says “The heart model in Anatomy Lab”;
- “What we changed” hard-codes 52 source files (42 PART-OF, 10 IS-A),
  17 selectable nodes, the aortic-arch split, and 9 text-only structures;
- the footer reports the heart structure and triangle totals.

Serving a urinary viewer page that links here would show heart provenance for a
urinary model. Required change: select the manifest by system, either with a
route such as `/attribution/anatomy/[slug]` or a query parameter, backed by a
small registry:

```text
heart   -> manifest.json (or heart.v2.manifest.json)
urinary -> urinary.v1.manifest.json
```

The page should derive the archive list, file counts, node counts, text-only
counts, triangles, and change list from the selected manifest instead of
hard-coding them. The shared licence block can stay common because the urinary
manifest deliberately uses the same wording as heart v2. The urinary change
list already records the 12 files, 10 nodes, 5 text-only rows, and shared renal
vessels.

The viewer currently links to the single attribution route from the library
page, not from inside a system. A per-system link should be added when the
attribution route is generalized.

## 7. Orientation

The urinary manifest records patient-left `+X` in both the source and output
frames and verifies four left/right pairs. The viewer camera sits at `[0, 0, 7]`
looking at the origin, so `+X` appears on the viewer's right and is the patient's
left. This matches heart v2.

There is no on-screen orientation marker. That is acceptable while both systems
use the same convention and the manifest records it. If a future system uses a
different output axis, or if students need an explicit left/right cue, add a
marker to the viewer and record it in that system's manifest. No change is
required for urinary v1.

## 8. Model and provenance documentation

`apps/web/public/models/anatomy/README.md` is stale:

- it calls `heart.v1.glb` the production heart model, but `heart.v2.glb` is the
  live asset and `heart.v1.glb` is the rollback asset;
- the build command omits `--system`;
- it does not mention `urinary.v1.glb` or `urinary.v1.manifest.json`;
- it says the mesh naming rule is defined in `anatomy-heart.data.ts`, which is
  only one of two seed files now.

`docs/anatomy/provenance/README.md` is still titled “heart model provenance” and
does not index the urinary build. Add a short urinary section and a link to
`urinary-v1-build.md`; keep the heart history intact.

`THIRD_PARTY_NOTICES.md` also needs an update before release:

- it says “The Anatomy Lab heart model”;
- it lists only the PART-OF archive, while the urinary model also uses IS-A;
- it points readers at `anatomy-heart.data.ts` for written content.

The licence caveat itself does not change: the urinary manifest and GLB use the
same `asset.copyright` and `asset.extras.license` wording as heart v2, and the
CC BY 4.0 / CC BY-SA 2.1 Japan discrepancy remains unresolved.

## 9. What already works for a second system

- The API service, controller, DTO validation, schema, and subscription checks
  are system-agnostic.
- The viewer loads `system.modelUrl`, validates it with
  `isAllowedAnatomyModelUrl()`, and selects meshes by `meshName`. A urinary GLB
  with 10 nodes and 5 text-only rows needs no viewer code change to render and
  select.
- Text-only rows already render with “No 3D model” and keep their teaching
  text, search, keyboard tree, and camera behavior.
- The GLB path guard accepts `urinary.v1.glb`.
- The urinary manifest records the four shared renal vessels in the structure
  rows, the GLB node extras, and `sharedStructures`, so a future whole-body view
  can avoid drawing them twice.
- The contract test already checks the urinary fixture against the GLB and
  manifest, including node names, text-only rows, shared vessels, transform,
  orientation, licence parity, and totals.

## 10. Recommended order of work

1. Generalize `seed-anatomy.ts` and add a dry-run or `--system` selection. Keep
   `isPublished: false` for urinary.
2. Add the per-system layer registry and pass the system slug through the
   viewer.
3. Replace the per-card `HeartPulse` with a slug-to-icon map.
4. Generalize the attribution page and link it from the system viewer.
5. Update `apps/web/public/models/anatomy/README.md`,
   `docs/anatomy/provenance/README.md`, and `THIRD_PARTY_NOTICES.md`.
6. Re-run the heart and urinary validators, the contract test, the full API
   suite, and a web build.
7. Publish urinary only after faculty review of the teaching text and a
   documented decision on the licence caveat.

## 11. Audit method and limits

The audit read the files listed below and searched the web and API source trees
for `heart`, `chamber`, `valve`, `coronary`, `great-vessel`, `LAYER_ORDER`,
`LAYER_LABELS`, `manifest.json`, and `models/anatomy`. It did not run the app,
seed a database, or change viewer/API/seed code. The only files written for this
audit are this document and the two index READMEs.

Files read:

- `apps/api/prisma/seed-anatomy.ts`
- `apps/api/prisma/anatomy-heart.data.ts`
- `apps/api/prisma/anatomy-urinary.data.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/anatomy/anatomy.service.ts`
- `apps/api/src/modules/anatomy/anatomy.controller.ts`
- `apps/api/src/modules/anatomy/dto/get-system-params.dto.ts`
- `apps/api/src/modules/anatomy/dto/anatomy-structure-params.dto.ts`
- `apps/web/src/lib/anatomy.ts`
- `apps/web/src/components/anatomy/anatomy-viewer.tsx`
- `apps/web/src/components/anatomy/anatomy-scene.tsx`
- `apps/web/src/components/anatomy/anatomy-detail-panel.tsx`
- `apps/web/src/app/(app)/anatomy/page.tsx`
- `apps/web/src/app/(app)/anatomy/[slug]/page.tsx`
- `apps/web/src/app/attribution/anatomy/page.tsx`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/mobile-nav.tsx`
- `apps/web/public/models/anatomy/README.md`
- `apps/web/public/models/anatomy/manifest.json`
- `apps/web/public/models/anatomy/urinary.v1.manifest.json`
- `docs/anatomy/provenance/README.md`
- `THIRD_PARTY_NOTICES.md`

No viewer or API file was modified by this audit.
