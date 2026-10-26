# Phase 2 — Heart v2 build and change proposals

**Status: build and validation complete. Licence wording, migration, and seed
changes are proposals only and have not been applied. v1 remains live.**

- Date: 2026-10-25
- Branch: `feature/anatomy-atlas`
- Source directory: `C:\Users\berek\Desktop\bp3d-source` (outside the repository)
- Phase 1 mapping: [`phase-1-source-mapping.md`](./phase-1-source-mapping.md)
- Provenance README: [`README.md`](./README.md)
- Candidate asset: `apps/web/public/models/anatomy/heart.v2.glb`
- Candidate manifest: `apps/web/public/models/anatomy/heart.v2.manifest.json`
- Live asset (unchanged): `apps/web/public/models/anatomy/heart.v1.glb`
- Live manifest (unchanged): `apps/web/public/models/anatomy/manifest.json`

## 1. What was built

`heart.v2.glb` was built from the approved 26-row mapping: 17 mesh structures
and 9 text-only structures. The 52 unique source files are 42 from the PART-OF
archive and 10 from the IS-A archive. The build read each file from its labelled
archive and verified the file's FMA concept, English name, and SHA-256 against
the source map.

| Field | v1 (live) | v2 (candidate) |
| --- | ---: | ---: |
| File | `heart.v1.glb` | `heart.v2.glb` |
| Bytes | 1,841,176 | **2,003,180** |
| MiB | 1.76 | **1.91** |
| Triangles | 93,842 | **102,568** |
| Mesh structures | 14 | **17** |
| Text-only structures | 0 | **9** |
| Total structures | 14 | **26** |
| Source files | 43 | **52** (42 PART-OF + 10 IS-A) |
| Draw calls | 14 | **17** |
| SHA-256 | `27f4e92c8db1ee48dca4ea49171a8c49c28efb90fc4775a299ad7f9149a4a5fc` | `f3ead239ce9a9cb08a1832d98e633dde19e883d21178d69461f47fdcfc649a61` |

Measured gzip and Brotli sizes (Node `zlib`, maximum settings, 2026-10-25):

| Asset | Raw | gzip | gzip ratio | Brotli | Brotli ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| `heart.v1.glb` | 1,841,176 | 1,521,726 | 82.6% | 1,294,125 | 70.3% |
| `heart.v2.glb` | 2,003,180 | 1,657,033 | 82.7% | 1,410,664 | 70.4% |

The v2 candidate is below the release limits of 5 MB and 150,000 triangles. It
has no textures, no external buffers, and no runtime decoder. It has not been
tested on a physical mobile device.

### Build command

```bash
node apps/web/scripts/build-anatomy-model.mjs \
  --source-dir "PART-OF=C:\Users\berek\Desktop\bp3d-source\partof_extracted\partof_BP3D_4.0_obj_99" \
  --source-dir "IS-A=C:\Users\berek\Desktop\bp3d-source\isa_extracted\isa_BP3D_4.0_obj_99" \
  --out apps/web/public/models/anatomy/heart.v2.glb \
  --manifest apps/web/public/models/anatomy/heart.v2.manifest.json
```

Build output:

```text
Wrote C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\web\public\models\anatomy\heart.v2.glb
  17 mesh structures + 9 text-only, 102,568 triangles, 1.91 MB
Wrote C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\web\public\models\anatomy\heart.v2.manifest.json
  model sha256 f3ead239ce9a9cb08a1832d98e633dde19e883d21178d69461f47fdcfc649a61
```

### Per-structure totals

| Slug | Archive | Files | Triangles |
| --- | --- | ---: | ---: |
| right-atrium | PART-OF | 2 | 20,028 |
| right-ventricle | PART-OF | 4 | 4,336 |
| left-atrium | PART-OF | 2 | 8,608 |
| left-ventricle | PART-OF | 3 | 3,318 |
| tricuspid-valve | PART-OF | 3 | 17,612 |
| pulmonary-valve | PART-OF | 3 | 3,638 |
| mitral-valve | PART-OF | 2 | 11,378 |
| aortic-valve | PART-OF | 3 | 2,150 |
| superior-vena-cava | PART-OF | 1 | 598 |
| inferior-vena-cava | PART-OF | 2 | 3,080 |
| pulmonary-trunk | PART-OF | 1 | 1,302 |
| pulmonary-arteries | IS-A | 2 | 6,128 |
| pulmonary-veins | IS-A | 7 | 2,598 |
| aorta | PART-OF | 2 | 2,686 |
| aortic-arch | IS-A | 1 | 670 |
| coronary-arteries | PART-OF | 9 | 10,756 |
| cardiac-veins | PART-OF | 5 | 3,682 |
| **Total** | | **52** | **102,568** |

The `aorta` node now contains only the ascending and descending thoracic aorta.
The arch of the aorta (`FJ3411`, `FMA3768`) is a separate `aortic_arch` node. The
new pulmonary artery and pulmonary vein nodes use the IS-A representations from
Phase 1. No source file is assigned to two structures.

## 2. Validation and contract checks

### Commands run

| Command | Result |
| --- | --- |
| `node --check apps/web/scripts/build-anatomy-model.mjs` | Passed (no syntax errors) |
| `node --check apps/web/scripts/validate-anatomy-model.mjs` | Passed (no syntax errors) |
| `node apps/web/scripts/validate-anatomy-model.mjs` | Passed: 14 mesh structures, 93,842 triangles, 1.76 MB (live v1) |
| `node apps/web/scripts/validate-anatomy-model.mjs --glb apps/web/public/models/anatomy/heart.v2.glb --manifest apps/web/public/models/anatomy/heart.v2.manifest.json` | Passed: 17 mesh + 9 text-only, 102,568 triangles, 1.91 MB |
| `npm test --workspace=apps/api -- anatomy-model.contract.spec.ts --runInBand` | Passed: 13 tests |

The validator now fails on:

- a missing or duplicate GLB node or mesh name;
- a node without a valid mesh, or a mesh without exactly one primitive;
- a POSITION accessor that is empty, non-VEC3, or has non-finite min/max;
- a NORMAL accessor that is missing or does not match POSITION;
- an index accessor that is empty, not a multiple of 3, or not 16/32-bit;
- a GLB over 5 MB or a model over 150,000 triangles;
- a manifest/model file-name or byte-count mismatch;
- a missing BodyParts3D credit or licence status;
- a v2 manifest without both archives, per-file archive labels, or the nine
  text-only rows;
- a text-only structure that still has a GLB node.

The contract test now has two blocks. The live block still checks the v1 asset
and the 14-row seed. The v2 target block checks the approved 26-row fixture, the
17 candidate nodes, the nine text-only rows, both archives, per-file provenance,
the 102,568-triangle total, and the 5 MB / 150,000-triangle limits. The v2 block
also accepts the live seed as a 14-row subset until the seed change is approved;
when the seed reaches 26 rows, it checks the full target mapping instead.

### What was not run

The full API test suite, TypeScript build, ESLint, web build, Playwright, and
physical-device tests were not run in Phase 2. No database migration, seed run,
or database write was performed. No viewer or UI file was changed.

## 3. Licence wording proposal (not applied)

The v2 candidate currently carries the same interim licence block as v1: the
required credit, the licence URL, and a status saying commercial clearance is
pending written clarification of the CC BY-SA 2.1 Japan headers. The wording
below is the proposed final wording. It has **not** been applied to the credits
page, the manifest, or the GLB.

### 3.1 Exact source credit

Use this string exactly, with the copyright sign U+00A9:

```text
BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
```

The official line has no trailing period. When it is embedded in a sentence, put
the sentence period outside the quoted credit; do not add it to the credit
string itself. Do not replace `©` with a literal `c`.

### 3.2 Proposed credits-page wording

For `/attribution/anatomy`, replace the current attribution, discrepancy, and
“What we changed” sections with the following text.

**Required attribution**

> BodyParts3D, © The Database Center for Life Science licensed under CC
> Attribution 4.0 International
>
> Dataset: BodyParts3D 4.0, PART-OF tree and IS-A tree, 99% polygon reduction.
>
> Archives: `partof_BP3D_4.0_obj_99.zip` and `isa_BP3D_4.0_obj_99.zip`.
>
> Licence page: BodyParts3D licence, last updated 27 February 2025.
>
> Model version: `heart.v2.glb`.
>
> Model SHA-256: `f3ead239ce9a9cb08a1832d98e633dde19e883d21178d69461f47fdcfc649a61`.

**Two licence statements — clarification pending**

> Two licence statements exist for this dataset:
>
> 1. The current BodyParts3D licence page (last updated 27 February 2025) and
>    the official README state: “The license for this database is specified in
>    the Creative Commons Attribution 4.0 International.”
> 2. The header comment in every distributed BodyParts3D 4.0 OBJ file states:
>    “The license for this database is specified in the Creative Commons
>    Attribution-Share Alike 2.1 Japan.”
>
> The official README also links the CC BY 4.0 summary to the CC BY-SA 2.1 Japan
> deed. We have not treated CC BY 4.0 as the only applicable licence. The
> question is pending written clarification from the Database Center for Life
> Science (DBCLS). The model is a development asset; commercial release is
> blocked until that clarification is recorded. Do not reuse the model
> commercially while this notice is present.

**What we changed**

> - Selected 52 source OBJ files from the PART-OF and IS-A trees: 42 PART-OF
>   files and 10 IS-A files.
> - Merged each structure’s source parts into one selectable mesh: 17 selectable
>   nodes.
> - Moved the arch of the aorta out of the `aorta` node into a separate
>   `aortic_arch` node, and added separate `pulmonary_arteries` and
>   `pulmonary_veins` nodes.
> - Converted millimetres and the Z-up axis to metres and Y-up, centred the
>   combined model, and recomputed vertex normals.
> - Exported one uncompressed GLB with stable mesh names. No source colours or
>   textures are used; surface colours are ours.
> - Kept 9 structures as text-only entries because BodyParts3D 4.0 has no
>   independent mesh for them. They show “No 3D model”.
> - Wrote the teaching notes, quizzes, and interface copy for Lor Mentor. They
>   are not copied from BodyParts3D or its documentation.

Footer: “Model built from 17 selectable structures, 9 text-only structures, and
102,568 triangles.”

### 3.3 Proposed manifest wording

Replace the current `license` object in `heart.v2.manifest.json` with the
following object. The `sources` array keeps its existing two entries; each entry
also keeps its `license` and `requiredCredit` fields.

```json
{
  "license": {
    "notice": "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
    "licenseUrl": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
    "dataset": "BodyParts3D 4.0",
    "trees": ["PART-OF", "IS-A"],
    "adaptations": [
      "Selected 52 source OBJ files: 42 from the PART-OF tree and 10 from the IS-A tree.",
      "Merged source parts into 17 selectable nodes; moved the arch of the aorta (FJ3411) from the aorta node to a separate aortic_arch node.",
      "Converted millimetres and Z-up to metres and Y-up, centred the combined model, and recomputed vertex normals.",
      "Assigned original surface colours; no source colours or textures were used.",
      "Kept 9 structures as text-only entries with no GLB node because no independent source mesh exists."
    ],
    "statements": [
      {
        "source": "BodyParts3D licence page (last updated 2025-02-27) and README_e.html",
        "statement": "The license for this database is specified in the Creative Commons Attribution 4.0 International."
      },
      {
        "source": "Header comment in all 3,492 distributed BodyParts3D 4.0 OBJ files",
        "statement": "The license for this database is specified in the Creative Commons Attribution-Share Alike 2.1 Japan."
      }
    ],
    "status": "Both licence statements exist. The question is pending written clarification from DBCLS. This is a development asset; commercial release is blocked.",
    "commercialRelease": "blocked"
  }
}
```

Do not shorten `status` to “CC BY 4.0” or “pending”. Do not remove the
`statements` array or the `commercialRelease` field.

### 3.4 Proposed GLB `asset.copyright` and `asset.extras` wording

`asset.copyright` can carry only the credit string. The dual-licence notice
belongs in `asset.extras`. Proposed GLB metadata:

```json
{
  "asset": {
    "version": "2.0",
    "generator": "LOR Mentor Anatomy Lab model pipeline",
    "copyright": "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
    "extras": {
      "title": "LOR Mentor heart anatomy model",
      "dataset": "BodyParts3D 4.0",
      "sources": [
        {
          "tree": "PART-OF",
          "archive": "partof_BP3D_4.0_obj_99.zip",
          "archiveSha256": "9fbc713fffeee924a5a657d9813d84d7eb957bded63adb854931dd5e3eb61c97"
        },
        {
          "tree": "IS-A",
          "archive": "isa_BP3D_4.0_obj_99.zip",
          "archiveSha256": "40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e"
        }
      ],
      "adaptations": [
        "Selected 52 source OBJ files: 42 from the PART-OF tree and 10 from the IS-A tree.",
        "Merged source parts into 17 selectable nodes; moved the arch of the aorta (FJ3411) from the aorta node to a separate aortic_arch node.",
        "Converted millimetres and Z-up to metres and Y-up, centred the combined model, and recomputed vertex normals.",
        "Assigned original surface colours; no source colours or textures were used.",
        "Kept 9 structures as text-only entries with no GLB node because no independent source mesh exists."
      ],
      "license": {
        "notice": "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
        "licenseUrl": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
        "statements": [
          {
            "source": "BodyParts3D licence page (last updated 2025-02-27) and README_e.html",
            "statement": "The license for this database is specified in the Creative Commons Attribution 4.0 International."
          },
          {
            "source": "Header comment in all 3,492 distributed BodyParts3D 4.0 OBJ files",
            "statement": "The license for this database is specified in the Creative Commons Attribution-Share Alike 2.1 Japan."
          }
        ],
        "status": "Both licence statements exist. The question is pending written clarification from DBCLS. This is a development asset; commercial release is blocked.",
        "commercialRelease": "blocked"
      }
    }
  }
}
```

The `sources` entries in the real GLB also carry the full archive metadata
(`archiveUrl`, `archiveBytes`, `archiveEtag`, `archiveLastModified`,
`extractedObjFiles`, `licenseUrl`, `licenseUpdated`, `license`, and
`requiredCredit`). They are omitted above only to keep this snippet readable.

### 3.5 What must not be said

- Do not state or imply that CC BY 4.0 is the only applicable licence.
- Do not remove the CC BY-SA 2.1 Japan header evidence.
- Do not claim that DBCLS has clarified the discrepancy.
- Do not describe the model as commercially cleared.
- Do not remove the caveat from the credits page, manifest, GLB, or
  `THIRD_PARTY_NOTICES.md`.

### 3.6 Application steps after approval

1. Add `copyright`, `adaptations`, `license.statements`, and
   `commercialRelease` to the build metadata in
   `apps/web/scripts/build-anatomy-model.mjs`.
2. Rebuild `heart.v2.glb` and `heart.v2.manifest.json`.
3. Update the credits page and `THIRD_PARTY_NOTICES.md` with the text above.
4. Extend the validator and contract test to require the new fields.
5. Re-run the validator and contract test.
6. Do not switch the live `manifest.json` or `HEART_SYSTEM.modelUrl` until the
   model and the wording are separately approved.

## 4. Migration proposal (not applied)

The current schema has `meshName String` (non-null) and
`@@unique([systemId, meshName])`. The nine text-only rows need `meshName` to be
nullable. PostgreSQL treats `NULL` values as distinct in a unique index by
default, so the existing unique index still rejects duplicate non-null mesh
names while allowing multiple text-only rows.

### 4.1 Prisma schema change

```prisma
model AnatomyStructure {
  // ...
  meshName      String?
  // ...
}
```

### 4.2 Migration SQL (LF endings)

Proposed file:
`apps/api/prisma/migrations/20261025120000_make_anatomy_meshname_nullable/migration.sql`

```sql
-- Make AnatomyStructure.meshName nullable so text-only structures can exist
-- without a GLB node. PostgreSQL treats NULL values as distinct in a unique
-- index by default, so the existing (systemId, meshName) unique index still
-- rejects duplicate non-null mesh names while allowing multiple text-only rows.
ALTER TABLE "AnatomyStructure"
  ALTER COLUMN "meshName" DROP NOT NULL;
```

No index change is required. Do not add `NULLS NOT DISTINCT` to the unique
index: that would allow only one text-only row per system.

### 4.3 Verification SQL

```sql
-- Expect 26 total, 17 mesh rows, 9 text-only rows.
SELECT
  COUNT(*) AS total,
  COUNT(s."meshName") AS mesh_rows,
  COUNT(*) - COUNT(s."meshName") AS text_only_rows
FROM "AnatomyStructure" AS s
JOIN "AnatomySystem" AS sys ON sys."id" = s."systemId"
WHERE sys."slug" = 'heart';

-- Expect zero rows: no duplicate non-null mesh names.
SELECT s."meshName", COUNT(*) AS occurrences
FROM "AnatomyStructure" AS s
JOIN "AnatomySystem" AS sys ON sys."id" = s."systemId"
WHERE sys."slug" = 'heart'
  AND s."meshName" IS NOT NULL
GROUP BY s."meshName"
HAVING COUNT(*) > 1;

-- Expect the nine text-only slugs and no others.
SELECT s."slug", s."meshName"
FROM "AnatomyStructure" AS s
JOIN "AnatomySystem" AS sys ON sys."id" = s."systemId"
WHERE sys."slug" = 'heart'
  AND s."meshName" IS NULL
ORDER BY s."slug";
```

### 4.4 Rollback

The migration is reversible only after every text-only row has a non-null
`meshName` again. Prefer restoring the pre-migration backup. If a SQL rollback is
required, run it in a transaction:

```sql
BEGIN;

UPDATE "AnatomyStructure" AS s
SET "meshName" = v."legacyMeshName"
FROM (VALUES
  ('interventricular-septum', 'interventricular_septum'),
  ('pericardium', 'pericardium'),
  ('endocardium', 'endocardium'),
  ('myocardium', 'myocardium'),
  ('epicardium', 'epicardium'),
  ('sinoatrial-node', 'sinoatrial_node'),
  ('atrioventricular-node', 'atrioventricular_node'),
  ('bundle-of-his', 'bundle_of_his'),
  ('purkinje-fibers', 'purkinje_fibers')
) AS v(slug, "legacyMeshName")
JOIN "AnatomySystem" AS sys ON sys."slug" = 'heart'
WHERE s."systemId" = sys."id"
  AND s."slug" = v."slug";

ALTER TABLE "AnatomyStructure"
  ALTER COLUMN "meshName" SET NOT NULL;

COMMIT;
```

This rollback restores the old non-null values; it does not delete the three new
mesh rows. Restore the backup if the rows themselves must be removed.

## 5. Seed change proposal (not applied)

The current seed has 14 rows. The approved mapping has 26 rows: the same 14 plus
the 3 new mesh rows and the 9 text-only rows. The 12 restored rows keep their
original teaching text from git history (`7e4c284`, identical in `8ead501`). The
14 retained rows keep the four valve `bloodSupply` corrections. No teaching text
is rewritten.

### 5.1 Type change and validation

```ts
export interface AnatomyStructureSeed {
  // ...
  meshName: string | null;
  // ...
}
```

`validateHeartSeed` should:

- filter `null` out of the mesh-name set before checking duplicates;
- skip the `/[^a-z0-9_]/` check when `meshName` is `null`;
- require exactly 26 rows, 17 non-null mesh names, and 9 nulls;
- require the nine text-only slugs to be exactly the approved set;
- keep the existing related-slug and reference checks.

```ts
const meshNames = new Set(
  HEART_STRUCTURES.map((structure) => structure.meshName).filter(
    (name): name is string => name !== null,
  ),
);
const meshCount = HEART_STRUCTURES.filter(
  (structure) => structure.meshName !== null,
).length;
const textOnlyCount = HEART_STRUCTURES.length - meshCount;

if (meshNames.size !== meshCount) {
  throw new Error('Heart seed contains duplicate mesh names.');
}
if (
  HEART_STRUCTURES.length !== 26 ||
  meshCount !== 17 ||
  textOnlyCount !== 9
) {
  throw new Error(
    `Heart seed must contain exactly 26 structures (17 mesh, 9 text-only), found ${HEART_STRUCTURES.length} (${meshCount} mesh, ${textOnlyCount} text-only).`,
  );
}

const TEXT_ONLY_SLUGS = new Set([
  'interventricular-septum',
  'pericardium',
  'endocardium',
  'myocardium',
  'epicardium',
  'sinoatrial-node',
  'atrioventricular-node',
  'bundle-of-his',
  'purkinje-fibers',
]);
const foundTextOnly = HEART_STRUCTURES.filter(
  (structure) => structure.meshName === null,
).map((structure) => structure.slug);
if (
  foundTextOnly.length !== TEXT_ONLY_SLUGS.size ||
  foundTextOnly.some((slug) => !TEXT_ONLY_SLUGS.has(slug))
) {
  throw new Error(
    `Heart seed text-only rows do not match the approved set: ${foundTextOnly.join(', ')}.`,
  );
}

for (const structure of HEART_STRUCTURES) {
  // ...
  if (
    structure.meshName !== null &&
    /[^a-z0-9_]/.test(structure.meshName)
  ) {
    throw new Error(
      `Structure "${structure.slug}" has an invalid mesh name "${structure.meshName}".`,
    );
  }
}
```

### 5.2 Three new mesh rows

Insert these rows in the seed in the approved order: `pulmonary-arteries` and
`pulmonary-veins` after `pulmonary-trunk`, and `aortic-arch` after `aorta`.

```ts
{
  slug: 'pulmonary-arteries',
  name: 'Pulmonary arteries',
  latinName: 'Arteriae pulmonales',
  summary:
    'The pulmonary arteries carry oxygen-poor blood from the pulmonary trunk to the lungs.',
  location: 'Between the pulmonary trunk and the lungs.',
  function: 'Distribute blood to the left and right lungs for gas exchange.',
  bloodSupply: 'Small bronchial artery branches supply the vessel walls.',
  clinicalNotes:
    'Pulmonary embolism is a blockage in these vessels and can be life-threatening. Urgent care is needed for sudden symptoms.',
  meshName: 'pulmonary_arteries',
  layer: 'great-vessels',
  relatedSlugs: ['pulmonary-trunk', 'pulmonary-veins'],
  references: [
    'FMA:50872 (right pulmonary artery) and FMA:50873 (left pulmonary artery). Foundational Model of Anatomy ontology.',
    "Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Wolters Kluwer; 2018. Chapter 1, Thorax.",
  ],
},
{
  slug: 'pulmonary-veins',
  name: 'Pulmonary veins',
  latinName: 'Venae pulmonales',
  summary:
    'The pulmonary veins carry oxygen-rich blood from the lungs to the left atrium.',
  location: 'Between the lungs and the left atrium.',
  function: 'Return oxygenated blood to the heart.',
  bloodSupply:
    'Small bronchial and pleural branches supply the vessel walls.',
  clinicalNotes:
    'The pulmonary veins are important in some heart rhythm procedures. Their anatomy is mapped before certain treatments.',
  meshName: 'pulmonary_veins',
  layer: 'great-vessels',
  relatedSlugs: ['pulmonary-arteries', 'left-atrium'],
  references: [
    'FMA:49911 (right inferior pulmonary vein), FMA:49913 (left inferior pulmonary vein), FMA:49914 (right superior pulmonary vein), and FMA:49916 (left superior pulmonary vein). Foundational Model of Anatomy ontology.',
    "Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Wolters Kluwer; 2018. Chapter 1, Thorax.",
  ],
},
{
  slug: 'aortic-arch',
  name: 'Aortic arch',
  latinName: 'Arcus aortae',
  summary: 'The aortic arch is the curved upper part of the aorta.',
  location: 'Upper chest, above the heart.',
  function:
    'Gives rise to branches that supply the head, neck, and upper limbs.',
  bloodSupply: 'Vasa vasorum and small branches.',
  clinicalNotes:
    'The arch gives off the brachiocephalic, left common carotid, and left subclavian arteries. Variants are common and usually harmless.',
  meshName: 'aortic_arch',
  layer: 'great-vessels',
  relatedSlugs: ['aorta'],
  references: [
    'FMA:3768 (arch of aorta). Foundational Model of Anatomy ontology.',
    "Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Wolters Kluwer; 2018. Chapter 1, Thorax.",
  ],
},
```

### 5.3 Nine text-only rows

These rows use `meshName: null`. Their teaching text is the recovered original
text, unchanged. The references reuse the textbook citation already used by the
heart seed and add a note that no independent BodyParts3D mesh exists.

```ts
{
  slug: 'interventricular-septum',
  name: 'Interventricular septum',
  latinName: 'Septum interventriculare',
  summary:
    'The interventricular septum is the muscular wall between the right and left ventricles.',
  location: 'Between the right and left ventricular cavities.',
  function:
    'Separates ventricular blood and helps the ventricles contract efficiently.',
  bloodSupply:
    'Branches of the left anterior descending artery and right coronary artery.',
  clinicalNotes:
    'Defects in the septum can allow blood to flow between ventricles. Small defects may cause no symptoms; evaluation is by a clinician.',
  meshName: null,
  layer: 'septum',
  relatedSlugs: ['right-ventricle', 'left-ventricle', 'bundle-of-his'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'pericardium',
  name: 'Pericardium',
  latinName: 'Pericardium',
  summary: 'The pericardium is the sac around the heart.',
  location: 'Surrounding the heart and the roots of the great vessels.',
  function:
    'Holds the heart in place, reduces friction, and helps limit sudden overfilling.',
  bloodSupply:
    'Fibrous pericardium receives small mediastinal vessels; serous pericardium receives coronary and mediastinal branches.',
  clinicalNotes:
    'Fluid can build up in the pericardial space. Large collections can compress the heart and require urgent treatment.',
  meshName: null,
  layer: 'wall-layers',
  relatedSlugs: ['epicardium', 'myocardium'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'endocardium',
  name: 'Endocardium',
  latinName: 'Endocardium',
  summary:
    'The endocardium is the thin inner lining of the heart chambers and valves.',
  location: 'Inner surface of the heart chambers and valves.',
  function:
    'Provides a smooth lining for blood flow and helps regulate the heart wall.',
  bloodSupply: 'Small branches from the coronary circulation.',
  clinicalNotes:
    'The endocardium can become inflamed in some infections. Fever with a new heart murmur needs medical assessment.',
  meshName: null,
  layer: 'wall-layers',
  relatedSlugs: ['myocardium', 'tricuspid-valve', 'mitral-valve'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'myocardium',
  name: 'Myocardium',
  latinName: 'Myocardium',
  summary:
    'The myocardium is the thick middle layer of the heart wall, made of cardiac muscle.',
  location: 'Between the endocardium and epicardium.',
  function: 'Contracts to pump blood.',
  bloodSupply: 'Coronary arteries.',
  clinicalNotes:
    'The myocardium can be injured when its blood supply is reduced. Chest pain or pressure needs urgent evaluation.',
  meshName: null,
  layer: 'wall-layers',
  relatedSlugs: ['epicardium', 'endocardium', 'coronary-arteries'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'epicardium',
  name: 'Epicardium',
  latinName: 'Epicardium',
  summary: 'The epicardium is the outer layer of the heart wall.',
  location: 'Outer surface of the heart, beneath the pericardium.',
  function:
    'Protects the heart surface and contains coronary vessels and fat.',
  bloodSupply: 'Coronary arteries.',
  clinicalNotes:
    'The epicardium is involved in pericardial inflammation. Chest pain that worsens when lying flat needs clinical review.',
  meshName: null,
  layer: 'wall-layers',
  relatedSlugs: ['pericardium', 'myocardium', 'coronary-arteries'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'sinoatrial-node',
  name: 'Sinoatrial node',
  latinName: 'Nodus sinoatrialis',
  summary: 'The sinoatrial node is the natural pacemaker of the heart.',
  location: 'In the wall of the right atrium near the superior vena cava.',
  function: 'Starts electrical impulses that set the normal heart rhythm.',
  bloodSupply:
    'Sinoatrial nodal artery, usually a branch of the right coronary artery.',
  clinicalNotes:
    'Disease of the node can cause slow heart rhythms. Fainting or persistent dizziness needs medical assessment.',
  meshName: null,
  layer: 'conduction',
  relatedSlugs: ['right-atrium', 'atrioventricular-node'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'atrioventricular-node',
  name: 'Atrioventricular node',
  latinName: 'Nodus atrioventricularis',
  summary:
    'The atrioventricular node is a relay station between the atria and ventricles.',
  location: 'Lower part of the interatrial septum, near the tricuspid valve.',
  function: 'Slows electrical signals before they pass to the ventricles.',
  bloodSupply:
    'Atrioventricular nodal artery, usually from the right coronary artery.',
  clinicalNotes:
    'Blocked signals can cause slow or irregular heart rhythms. Symptoms need clinical assessment.',
  meshName: null,
  layer: 'conduction',
  relatedSlugs: ['sinoatrial-node', 'bundle-of-his'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'bundle-of-his',
  name: 'Bundle of His',
  latinName: 'Fasciculus atrioventricularis',
  summary:
    'The bundle of His carries electrical signals from the atrioventricular node into the ventricles.',
  location: 'Upper interventricular septum.',
  function: 'Conducts impulses to the left and right bundle branches.',
  bloodSupply:
    'Branches of the left anterior descending and right coronary arteries.',
  clinicalNotes:
    'Conduction block can cause slow heart rhythms. Fainting or marked fatigue needs medical review.',
  meshName: null,
  layer: 'conduction',
  relatedSlugs: [
    'atrioventricular-node',
    'purkinje-fibers',
    'interventricular-septum',
  ],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
{
  slug: 'purkinje-fibers',
  name: 'Purkinje fibers',
  latinName: 'Rami subendocardiales',
  summary:
    'Purkinje fibers spread electrical signals through the ventricular muscle.',
  location: 'Inner walls of the ventricles.',
  function: 'Help the ventricles contract in a coordinated way.',
  bloodSupply: 'Coronary artery branches.',
  clinicalNotes:
    'Abnormal signals can cause fast or irregular rhythms. Diagnosis requires an ECG and clinical assessment.',
  meshName: null,
  layer: 'conduction',
  relatedSlugs: ['bundle-of-his', 'myocardium'],
  references: [
    "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
  ],
},
```

### 5.4 Existing-row updates

The 14 retained rows keep their teaching text, including the four corrected
valve `bloodSupply` values. Only derived fields change:

- `aorta.references` drops `FMA:3768` because the arch is now `aortic-arch`:
  `FMA:3736 (ascending aorta) and FMA:87217 (descending thoracic aorta).`
- `aorta.relatedSlugs` adds `aortic-arch`.
- `right-atrium.relatedSlugs` adds `sinoatrial-node`.
- `right-ventricle.relatedSlugs` adds `interventricular-septum`.
- `left-atrium.relatedSlugs` adds `pulmonary-veins`.
- `left-ventricle.relatedSlugs` adds `interventricular-septum`.
- `pulmonary-trunk.relatedSlugs` adds `pulmonary-arteries`.
- `sortOrder` follows the 26-row order in the approved mapping.

`HEART_SYSTEM.modelUrl` stays `/models/anatomy/heart.v1.glb` until the model and
licence wording are approved. The proposed later change is:

```ts
modelUrl: '/models/anatomy/heart.v2.glb',
```

### 5.5 Seed script changes

`seed-anatomy.ts` needs three small changes:

1. The stale warning should print `structure.meshName ?? 'no 3D model'` instead
   of `null`.
2. `--reconcile` should update `references`, `sortOrder`, and `relatedSlugs` for
   existing rows. These are derived from the model and navigation graph, not
   faculty writing. It must continue to leave `summary`, `location`, `function`,
   `bloodSupply`, `clinicalNotes`, `name`, `latinName`, and `isReviewed`
   untouched.
3. The create path already spreads `...structure`, so `meshName: null` works once
   the schema is nullable.

```ts
if (reconcile) {
  await prisma.anatomyStructure.update({
    where: { id: existing.id },
    data: {
      references: structure.references,
      sortOrder: index + 1,
      relatedSlugs: structure.relatedSlugs,
    },
  });
  referencesUpdated += 1;
}
```

Do not add `meshName` to this update. The one-off SQL in §5.6 handles legacy
text-only rows whose `meshName` is still non-null. Keeping `meshName` out of
reconcile avoids a unique-constraint conflict if a row was mislabelled.

### 5.6 Safe update path for existing dev rows

This path is for a development database only. It has not been run. Take a backup
before step 2.

1. **Inspect the current state.** Run the verification SQL in §4.3 and record the
   counts and the list of existing slugs.
2. **Back up the database.** In PowerShell:
   ```powershell
   pg_dump $env:DATABASE_URL > anatomy-pre-v2.sql
   ```
   Do not commit the dump. Confirm the dump is readable before continuing.
3. **Apply the migration.** Add the migration file from §4.2 and run the normal
   Prisma migration command for the environment. This is a schema-only change.
4. **Update the seed data and validation.** Apply the §5.1–§5.4 changes in a
   branch, update the live contract block from 14 to 26 rows, then run:
   ```bash
   npm test --workspace=apps/api -- anatomy-model.contract.spec.ts --runInBand
   ```
   The contract test calls `validateHeartSeed()` without a database connection.
   Do not run the seed until this passes. The v2 target block already accepts the
   26-row seed and checks it against the target fixture.
5. **Reconcile the seed.** Run:
   ```bash
   npm run db:seed:anatomy --workspace=apps/api -- --reconcile
   ```
   This creates the missing 12 rows, refreshes `references`, `sortOrder`, and
   `relatedSlugs` on existing rows, and leaves teaching text and `isReviewed`
   alone. Do **not** add `--prune-stale` on this run.
6. **Null the legacy text-only mesh names.** This is idempotent. It is required
   only if the database already had the old 26-row seed with non-null values.
   ```sql
   BEGIN;

   UPDATE "AnatomyStructure" AS s
   SET "meshName" = NULL
   FROM "AnatomySystem" AS sys
   WHERE s."systemId" = sys."id"
     AND sys."slug" = 'heart'
     AND s."slug" IN (
       'interventricular-septum',
       'pericardium',
       'endocardium',
       'myocardium',
       'epicardium',
       'sinoatrial-node',
       'atrioventricular-node',
       'bundle-of-his',
       'purkinje-fibers'
     );

   COMMIT;
   ```
7. **Verify.** Re-run the §4.3 queries. Expect 26 total, 17 mesh rows, 9
   text-only rows, and zero duplicate non-null mesh names. Also verify that every
   `relatedSlugs` target resolves:
   ```sql
   SELECT s."slug", rel."slug" AS missing_related_slug
   FROM "AnatomyStructure" AS s
   JOIN "AnatomySystem" AS sys ON sys."id" = s."systemId"
   CROSS JOIN LATERAL unnest(s."relatedSlugs") AS rel("slug")
   LEFT JOIN "AnatomyStructure" AS target
     ON target."systemId" = s."systemId"
    AND target."slug" = rel."slug"
   WHERE sys."slug" = 'heart'
     AND target."id" IS NULL;
   ```
   Expect zero rows.
8. **Review stale rows.** The seed prints any database rows that are not in the
   seed. The 12 restored rows are now in the seed, so they should not be stale.
   If other rows appear, review them manually. Do not run `--prune-stale` until
   the list is understood and a backup exists.
9. **Switch the live asset only after approval.** Update
   `HEART_SYSTEM.modelUrl`, `manifest.json`, and the credits page in a separate
   change. Re-run the validator and contract test.

### 5.7 What not to do

- Do not run the migration or seed in production.
- Do not use `--prune-stale` as part of this update.
- Do not overwrite the 14 retained rows with the older 26-row text; the four
  valve `bloodSupply` corrections must stay.
- Do not mark any row `isReviewed: true` without a documented faculty review.
- Do not switch the live model URL before the model and licence wording are
  approved.

## 6. Files changed in Phase 2

| File | Change |
| --- | --- |
| `apps/web/scripts/build-anatomy-model.mjs` | Supports labelled PART-OF/IS-A source directories, per-file archive labels, SHA-256 verification, v2 manifests, and derives `model.file` from the output path. |
| `apps/web/scripts/validate-anatomy-model.mjs` | Adds `--glb`/`--manifest`, v2 manifest checks, text-only checks, geometry checks, and the 5 MB / 150,000-triangle limits. |
| `apps/web/scripts/anatomy-heart.source.json` | Local-only v2 source map: both archives, 52 files, 17 mesh structures, 9 text-only rows. |
| `apps/web/public/models/anatomy/heart.v2.glb` | New candidate asset; v1 untouched. |
| `apps/web/public/models/anatomy/heart.v2.manifest.json` | New candidate manifest; live `manifest.json` untouched. |
| `apps/api/src/modules/anatomy/anatomy-heart.v2.fixture.ts` | New 26-row target fixture for the contract test. |
| `apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts` | Adds the v2 target contract while keeping the live v1 contract. |
| `docs/anatomy/provenance/README.md` | Updated for v2 alongside v1, both archives, 17 + 9 structures, and measured sizes. |
| `docs/anatomy/provenance/phase-2-build-and-proposals.md` | This document. |

No viewer, UI, schema, seed, or live manifest file was changed. No database
migration, seed run, or database write was performed.

## 7. Approval requested

Please approve or correct:

1. The v2 build result: 2,003,180 bytes, 102,568 triangles, 17 mesh nodes, 9
   text-only structures, SHA-256
   `f3ead239ce9a9cb08a1832d98e633dde19e883d21178d69461f47fdcfc649a61`.
2. The exact licence wording in §3 for the credits page, manifest, and GLB
   metadata. Nothing in §3 has been applied.
3. The nullable-`meshName` migration SQL in §4.2 and the safe update path in
   §5.6. Nothing in §4 or §5 has been applied.
4. The 26-row seed change in §5, including the nine text-only rows and the
   three new mesh rows. Nothing in §5 has been applied.
5. Switching the live `manifest.json` and `HEART_SYSTEM.modelUrl` to v2 only
   after the model, licence wording, and seed change are approved and applied.

**Phase 2 stops here for approval.** The whole-body plan is a separate
documentation task and does not authorize building any other system.
