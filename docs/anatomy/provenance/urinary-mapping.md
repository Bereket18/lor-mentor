# Urinary system source mapping (BodyParts3D 4.0)

**Status: proposed, awaiting approval. Analysis only.** This document maps the
urinary system from the verified BodyParts3D 4.0 archives. No seed, database
write, model build, UI change, or teaching text was produced.

- Date: 2026-10-26
- Branch: `integration/anatomy-hardening`
- Base commit: `aa277ae`
- Source directory: `C:\Users\berek\Desktop\bp3d-source` (outside the repository)
- Machine-readable record: [`urinary-mapping.json`](./urinary-mapping.json)
- Scope: urinary system only. Adrenal glands are excluded as endocrine organs.

## 1. Source verification

Both archives and all eight supporting files were checked against
[`phase-1-sources.json`](./phase-1-sources.json) before extraction. Every byte
count and SHA-256 matched. The verified archives were extracted to
`C:\Users\berek\Desktop\bp3d-source\extracted`; extracted data is outside the
repository and is not committed.

| Tree | Archive | Bytes | SHA-256 | OBJ files |
| --- | --- | ---: | --- | ---: |
| PART-OF | `partof_BP3D_4.0_obj_99.zip` | 64,888,505 | `9fbc713fffeee924a5a657d9813d84d7eb957bded63adb854931dd5e3eb61c97` | 1,258 |
| IS-A | `isa_BP3D_4.0_obj_99.zip` | 142,903,898 | `40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e` | 2,234 |

| Supporting file | Bytes | SHA-256 |
| --- | ---: | --- |
| `README_e.html` | 19,263 | `f9a90b4d945ad0fe50db45c712e931aa54e52667187b30d7085b6cc394f40107` |
| `isa_parts_list_e.txt` | 128,086 | `ab7796deedd49205e77f3609a1cb8c53e2bbee14ecb5c9a6ca05227469780513` |
| `partof_parts_list_e.txt` | 59,351 | `9224080557053e6f1322f1e13ab27f0ecde0db19bb3b505f0631afad230eeebd` |
| `partof_inclusion_relation_list.txt` | 91,241 | `1b40738270931e3c1d955ce34e0fce0d8d10d8c5ad543463e40b4b4c0243007c` |
| `isa_inclusion_relation_list.txt` | 207,664 | `26e7d818e03a8c909fe09c561f38d0d513423c87681f9450a803bc38f5b07564` |
| `isa_element_parts.txt` | 1,142,159 | `a3de74423f943b0d724ae8f59b3a817f87c423a544f8db98113b1980817cbeaf` |
| `partof_element_parts.txt` | 651,179 | `3f5f6df1028eb122b30de77c711597b6bb8e5541658e5985859fd228adbf88ea` |
| `licence_page_2026-10-25.html` | 14,694 | `cc8ecd3f09912424346dcc1a4e608b1ff4c29988f6304cf316e414440b1e18ad` |

## 2. Official hierarchy evidence

The mapping follows the official PART-OF inclusion relations, not a system label
on a mesh. The urinary hierarchy is:

| Parent | Child |
| --- | --- |
| `FMA20394` human body | `FMA7159` urinary system |
| `FMA7159` urinary system | `FMA45659` lower urinary tract |
| `FMA7159` urinary system | `FMA71102` right upper urinary tract |
| `FMA7159` urinary system | `FMA71103` left upper urinary tract |
| `FMA45659` lower urinary tract | `FMA15900` urinary bladder |
| `FMA45659` lower urinary tract | `FMA19667` urethra |
| `FMA71102` right upper urinary tract | `FMA7204` right kidney |
| `FMA71102` right upper urinary tract | `FMA15571` right ureter |
| `FMA71103` left upper urinary tract | `FMA7205` left kidney |
| `FMA71103` left upper urinary tract | `FMA15572` left ureter |

The PART-OF parts list also contains `FMA7159`, `FMA45659`, `FMA71102`, and
`FMA71103`, but they are compound concepts: their element rows resolve to the
same six organ files (`FJ3144`–`FJ3149`) and add no unique mesh. The six organ
files are therefore the complete urinary mesh set in the PART-OF tree.

The IS-A tree has **no system-level urinary hierarchy**. It contains organ-level
relations only:

| Parent | Child |
| --- | --- |
| `FMA7203` kidney | `FMA7204` right kidney |
| `FMA7203` kidney | `FMA7205` left kidney |
| `FMA9704` ureter | `FMA15571` right ureter |
| `FMA9704` ureter | `FMA15572` left ureter |

`FMA15900` urinary bladder and `FMA19667` urethra are standalone organ concepts
in the IS-A tree. This is why the mapping uses PART-OF for the urinary hierarchy
and IS-A only where it is the better source for a single organ file.

## 3. Endocrine exclusion

The adrenal glands are endocrine organs and are not part of `FMA7159` urinary
system:

| Parent | Child | Element file | Triangles |
| --- | --- | --- | ---: |
| `FMA9668` endocrine system | `FMA15629` right adrenal gland | `FJ3130` | 2,294 |
| `FMA9668` endocrine system | `FMA15630` left adrenal gland | `FJ3129` | 3,996 |

Both adrenal files are excluded. The right and left inferior suprarenal artery
files (`FJ3584` and `FJ3467`) are also excluded because they supply the adrenal
glands, not the urinary tract. They are discussed further in section 4.

## 4. Renal vessel sourcing

The main renal vessels are present, but they are **not** children of the urinary
system in either official tree. They are cardiovascular structures that are
included as shared context because the urinary task explicitly asks for the main
renal vessels if present.

The PART-OF parent concept is a trap for the arteries. `FMA14752` right renal
artery has five element rows, not one:

| Concept | Element file | Triangles | Role |
| --- | --- | ---: | --- |
| `FMA14752` right renal artery | `FJ2038` | 206 | main right renal artery |
| `FMA66363` trunk of right renal artery | `FJ3576` | 282 | proximal trunk subsegment |
| `FMA70492` ureteric segment of right renal artery | `FJ3581` | 468 | ureteric branch |
| `FMA70492` ureteric segment of right renal artery | `FJ3582` | 606 | ureteric branch |
| `FMA69265` right inferior suprarenal artery | `FJ3584` | 754 | endocrine branch |

`FMA14753` left renal artery has the same pattern: `FJ2046` main, `FJ3476`
trunk, `FJ3481` ureteric segment, and `FJ3467` left inferior suprarenal artery.
Using the full PART-OF parent concept would pull the inferior suprarenal
arteries into the urinary model. The mapping therefore uses the **IS-A
single-file main arteries** `FJ2038` and `FJ2046`, whose headers are exactly
`FMA14752` and `FMA14753`.

The renal veins are IS-A only. The PART-OF tree has no renal vein concept, only
suprarenal veins. The mapping uses the IS-A files:

| Concept | Element files | Triangles |
| --- | --- | ---: |
| `FMA14335` right renal vein | `FJ3577` + `FJ3578` | 332 + 4,682 = 5,014 |
| `FMA14336` left renal vein | `FJ3477` + `FJ3478` | 652 + 4,260 = 4,912 |

The official cardiovascular placement is explicit:

- PART-OF `FMA7161` cardiovascular system → `FMA45623` systemic arterial system
  and `FMA49894` systemic arterial tree → `FMA14752` / `FMA14753`.
- IS-A `FMA66464` systemic artery → `FMA14751` renal artery → `FMA14752` /
  `FMA14753`.
- IS-A `FMA78049` subdivision of inferior vena caval tree → `FMA14334` renal vein
  → `FMA14335` / `FMA14336`.

## 5. Candidate inventory (19 files)

All triangle counts are computed from the OBJ `f` lines. Every face in all 19
files is a triangle. The official English name is the exact lowercase form in
the parts list; the OBJ header capitalises the first letter. Both forms are
recorded in the JSON.

| Element | FMA | Official English name | Archive | Triangles | Decision |
| --- | --- | --- | --- | ---: | --- |
| `FJ3147` | `FMA7204` | right kidney | PART-OF | 2,310 | use — `right-kidney` |
| `FJ3145` | `FMA7205` | left kidney | PART-OF | 2,982 | use — `left-kidney` |
| `FJ3146` | `FMA15571` | right ureter | PART-OF | 1,924 | use — `right-ureter` |
| `FJ3144` | `FMA15572` | left ureter | PART-OF | 2,062 | use — `left-ureter` |
| `FJ3149` | `FMA15900` | urinary bladder | PART-OF | 226 | use — `urinary-bladder` |
| `FJ3148` | `FMA19667` | urethra | PART-OF | 440 | use — `urethra` |
| `FJ2038` | `FMA14752` | right renal artery | IS-A | 206 | use — `right-renal-artery` |
| `FJ2046` | `FMA14753` | left renal artery | IS-A | 288 | use — `left-renal-artery` |
| `FJ3577` | `FMA14335` | right renal vein | IS-A | 332 | use — `right-renal-vein` (part 1/2) |
| `FJ3578` | `FMA14335` | right renal vein | IS-A | 4,682 | use — `right-renal-vein` (part 2/2) |
| `FJ3477` | `FMA14336` | left renal vein | IS-A | 652 | use — `left-renal-vein` (part 1/2) |
| `FJ3478` | `FMA14336` | left renal vein | IS-A | 4,260 | use — `left-renal-vein` (part 2/2) |
| `FJ3576` | `FMA66363` | trunk of right renal artery | PART-OF | 282 | not used — subsegment of `FJ2038` |
| `FJ3581` | `FMA70492` | ureteric segment of right renal artery | PART-OF | 468 | not used — branch segment |
| `FJ3582` | `FMA70492` | ureteric segment of right renal artery | PART-OF | 606 | not used — branch segment |
| `FJ3584` | `FMA69265` | right inferior suprarenal artery | PART-OF | 754 | exclude — endocrine target |
| `FJ3476` | `FMA66364` | trunk of left renal artery | PART-OF | 258 | not used — subsegment of `FJ2046` |
| `FJ3481` | `FMA70493` | ureteric segment of left renal artery | PART-OF | 1,296 | not used — branch segment |
| `FJ3467` | `FMA69266` | left inferior suprarenal artery | PART-OF | 954 | exclude — endocrine target |

Verification results for all 19 files:

- concept ID present in the archive's official parts list: **19/19**
- OBJ header English name matches the official table case-insensitively:
  **19/19**
- atomic element row present for the file's own concept: **19/19**
- BodyParts3D licence header present: **19/19**
- triangle-only faces, no negative indices: **19/19**
- files present in both trees: **15/19**; the four renal-vein files are IS-A only
- for the 15 shared files, the non-comment geometry SHA-256 is identical across
  the two trees; the whole-file SHA-256 differs only because the headers record
  a different representation ID and build-up logic. Both hashes are in the JSON.

## 6. Proposed structures (15)

### 6.1 Mesh structures (10)

| Slug | Seed display name | `meshName` | Layer | Laterality | FMA | Source files | Triangles |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| `right-kidney` | Right kidney | `right_kidney` | `kidneys` | right | `FMA7204` | `FJ3147` | 2,310 |
| `left-kidney` | Left kidney | `left_kidney` | `kidneys` | left | `FMA7205` | `FJ3145` | 2,982 |
| `right-ureter` | Right ureter | `right_ureter` | `ureters` | right | `FMA15571` | `FJ3146` | 1,924 |
| `left-ureter` | Left ureter | `left_ureter` | `ureters` | left | `FMA15572` | `FJ3144` | 2,062 |
| `urinary-bladder` | Urinary bladder | `urinary_bladder` | `bladder` | midline | `FMA15900` | `FJ3149` | 226 |
| `urethra` | Urethra | `urethra` | `urethra` | midline | `FMA19667` | `FJ3148` | 440 |
| `right-renal-artery` | Right renal artery | `right_renal_artery` | `renal-vessels` | right | `FMA14752` | `FJ2038` | 206 |
| `left-renal-artery` | Left renal artery | `left_renal_artery` | `renal-vessels` | left | `FMA14753` | `FJ2046` | 288 |
| `right-renal-vein` | Right renal vein | `right_renal_vein` | `renal-vessels` | right | `FMA14335` | `FJ3577` + `FJ3578` | 5,014 |
| `left-renal-vein` | Left renal vein | `left_renal_vein` | `renal-vessels` | left | `FMA14336` | `FJ3477` + `FJ3478` | 4,912 |

All ten rows above have `status: mesh`.

Left and right are separate structures because the source has separate meshes
and laterality is clinically meaningful. The bladder and urethra are single
midline structures. The two renal-vein structures each merge two source files
that share the same concept ID; the source files do not share vertices, so the
merge is a union of complementary venous geometry.

### 6.2 Text-only structures (5)

| Slug | Seed display name | `meshName` | Layer | Laterality | FMA | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `renal-cortex` | Renal cortex | `null` | `renal-parts` | bilateral | none | text-only |
| `renal-medulla` | Renal medulla | `null` | `renal-parts` | bilateral | none | text-only |
| `renal-pyramids` | Renal pyramids | `null` | `renal-parts` | bilateral | none | text-only |
| `renal-calyces` | Renal calyces | `null` | `renal-parts` | bilateral | none | text-only |
| `renal-pelvis` | Renal pelvis | `null` | `renal-parts` | bilateral | none | text-only |

These five are **not** BodyParts3D concepts. They are proposed as teaching-only
rows because the urinary task asks for them if present. They have no independent
mesh and no FMA ID. If faculty prefer a strictly source-backed system, they can
be omitted; the ten mesh structures remain complete without them.

## 7. Shared-file ownership

Only the six renal vessel files (four structures) are shared with another
system. The six urinary organ files are not shared with another system; their
only parent outside the urinary hierarchy is `FMA20394` human body.

| Files | Structure | Other system | Evidence | Canonical owner | Role in urinary model |
| --- | --- | --- | --- | --- | --- |
| `FJ2038` | right renal artery | cardiovascular | PART-OF element row includes `FMA7161` cardiovascular system; `FMA49894` → `FMA14752` | cardiovascular | shared context |
| `FJ2046` | left renal artery | cardiovascular | PART-OF element row includes `FMA7161` cardiovascular system; `FMA49894` → `FMA14753` | cardiovascular | shared context |
| `FJ3577` + `FJ3578` | right renal vein | cardiovascular | IS-A `FMA78049` → `FMA14334` → `FMA14335` | cardiovascular | shared context |
| `FJ3477` + `FJ3478` | left renal vein | cardiovascular | IS-A `FMA78049` → `FMA14334` → `FMA14336` | cardiovascular | shared context |
| `FJ3147`, `FJ3145`, `FJ3146`, `FJ3144`, `FJ3149`, `FJ3148` | kidneys, ureters, bladder, urethra | none | PART-OF rows are `FMA7159`, the upper/lower tract, and `FMA20394` only | urinary | native |

**Recommendation:** cardiovascular owns the renal vessels. The urinary system
may include them as shared context in its model, but they should not be described
as urinary-system organs. If the atlas later needs one canonical system per
structure, the shared-structure policy must be decided before seeding; the
database unique constraint is per system, so duplicate slugs across systems are
technically possible but need a UI/API rule.

## 8. Text-only rationale

Searches were run against both parts lists and both inclusion-relation lists.
The following patterns returned **0 hits** in all four files:

`renal cortex`, `cortex of kidney`, `kidney cortex`, `renal medulla`,
`medulla of kidney`, `kidney medulla`, `renal pyramid`, `pyramid of kidney`,
`kidney pyramid`, `renal calyx`, `renal calix`, `calyx of kidney`,
`calix of kidney`, `minor calyx`, `major calyx`, `calyces`, `calices`,
`renal pelvis`, `pelvis of kidney`, `kidney pelvis`, `nephron`, `glomerulus`,
`collecting duct`, `renal lobe`, `renal column`, `renal sinus`, `renal capsule`.

Additional patterns also returned **0 hits**: `trigone`, `detrusor`,
`urethral sphincter`, `prostatic urethra`, `membranous urethra`,
`spongy urethra`, `renal papilla`, `ureteropelvic junction`,
`ureterovesical junction`.

The compound-concept element rows confirm there is no hidden mesh:

| Concept | Element rows |
| --- | --- |
| `FMA7203` kidney | `FJ3145`, `FJ3147` only |
| `FMA9704` ureter | `FJ3144`, `FJ3146` only |
| `FMA7159` urinary system | `FJ3144`–`FJ3149` only |
| `FMA45659` lower urinary tract | `FJ3148`, `FJ3149` |
| `FMA71102` right upper urinary tract | `FJ3146`, `FJ3147` |
| `FMA71103` left upper urinary tract | `FJ3144`, `FJ3145` |

Therefore the five renal parts cannot be given a mesh or an FMA reference. They
are text-only or omitted; they must not be described as BodyParts3D-derived
geometry.

## 9. Size estimate

This is an **estimate only**; no urinary GLB has been built. The method matches
the heart v2 binary layout exactly: 24 bytes per vertex (POSITION + NORMAL,
VEC3 float32) plus 6 bytes per triangle (uint16 indices, three per triangle).

| Structure | Vertices | Triangles | Estimated binary bytes |
| --- | ---: | ---: | ---: |
| right kidney | 1,163 | 2,310 | 41,772 |
| left kidney | 1,497 | 2,982 | 53,820 |
| right ureter | 1,132 | 1,924 | 38,712 |
| left ureter | 1,125 | 2,062 | 39,372 |
| urinary bladder | 127 | 226 | 4,404 |
| urethra | 358 | 440 | 11,232 |
| right renal artery | 124 | 206 | 4,212 |
| left renal artery | 166 | 288 | 5,712 |
| right renal vein | 4,037 | 5,014 | 126,972 |
| left renal vein | 3,991 | 4,912 | 125,256 |
| **Total** | **13,720** | **20,364** | **451,464** |

With an estimated 12–20 KB of JSON and 28 bytes of GLB container overhead, the
GLB would be about **463–471 KB** (0.442–0.450 MiB; 0.463–0.471 MB decimal).
Heart v2 is 2,003,856 bytes (1.911 MiB; 2.004 MB decimal) and 102,568 triangles.
The urinary model is therefore about **19.9% of heart v2's triangles** and
**23.1–23.5% of its file size**.

The four renal vessel structures account for 10,420 triangles (51.2% of the
model); the two renal veins alone account for 9,926 triangles (48.7%). If the
urinary model needs to be smaller, the veins are the first place to look, but
there is no separate extraparenchymal venous concept in the source. Any
decimation would be a new modelling decision and would need its own provenance
note.

## 10. Coordinate convention and manifest proposal

The official `README_e.html` documents the OBJ format and the 99% polygon
reduction rate, but it **does not state units or coordinate axes**. The source
units are millimetres because every OBJ header prints `Bounds(mm)`. The Z-up
assumption is the project's existing pipeline convention, not a README quote.

The pipeline mapping is:

```text
x_gltf = x_mm / 1000
y_gltf = z_mm / 1000
z_gltf = -y_mm / 1000
then subtract the combined bounding-box centre
```

### 10.1 Heart v2 offset (read-only computation)

The heart v2 manifest records the transform but not the applied offset. The
offset was computed read-only from the v2 source files and the build script, and
verified against the GLB accessors:

| Field | Value |
| --- | --- |
| `appliedScale` | `0.001` |
| `appliedOffsetM` | `[0.0114353, 1.133991, 0.11163145]` |
| source-frame centre (mm) | `(11.4353, -111.63145, 1133.991)` |
| final GLB bounds (m) | `[-0.070381, -0.183099, -0.061787]` to `[0.070381, 0.183099, 0.061787]` |

### 10.2 Proposed urinary offset (preview, not applied)

| Field | Value |
| --- | --- |
| `appliedScale` | `0.001` |
| `appliedOffsetM` | `[0.0014038, 0.8995045, 0.12034965]` |
| source-frame centre (mm) | `(1.4038, -120.34965, 899.5045)` |
| source bounds (mm) | `[-87.5754, -184.174, 708.569]` to `[90.383, -56.5253, 1090.44]` |
| transformed bounds (m) | `[-0.0875754, 0.708569, 0.0565253]` to `[0.090383, 1.09044, 0.184174]` |
| final model bounds (m) | `[-0.0889792, -0.1909355, -0.06382435]` to `[0.0889792, 0.1909355, 0.06382435]` |

### 10.3 Proposed manifest fields

The urinary manifest should add these fields so cross-system body placement is
reproducible without re-reading the source geometry:

```json
{
  "transform": {
    "sourceUnits": "millimetres",
    "sourceUpAxis": "Z",
    "targetUnits": "metres",
    "targetUpAxis": "Y",
    "mapping": "x/1000, z/1000, -y/1000; then centre on the combined bounding box",
    "appliedScale": 0.001,
    "appliedOffset": [0.0014038, 0.8995045, 0.12034965],
    "offsetConvention": "bodyPosition = modelPosition + appliedOffset",
    "sourceBoundsMm": {
      "min": [-87.5754, -184.174, 708.569],
      "max": [90.383, -56.5253, 1090.44]
    },
    "transformedBoundsM": {
      "min": [-0.0875754, 0.708569, 0.0565253],
      "max": [0.090383, 1.09044, 0.184174]
    },
    "modelBoundsM": {
      "min": [-0.0889792, -0.1909355, -0.06382435],
      "max": [0.0889792, 0.1909355, 0.06382435]
    },
    "bodyFrame": {
      "units": "metres",
      "upAxis": "Y",
      "mapping": "x/1000, z/1000, -y/1000"
    }
  }
}
```

`appliedOffset` is the transformed source-frame centre in metres. Because the
same whole-body BodyParts3D frame underlies both models, adding each model's
offset places its vertices back into a common body frame. Heart v2 currently
lacks these fields; adding them to the urinary manifest is a proposal, and
backfilling heart v2 is optional follow-up work.

## 11. Seed fields and faculty-review template

### 11.1 Required seed fields

Structure rows:

`slug`, `name`, `latinName`, `summary`, `location`, `function`,
`bloodSupply`, `clinicalNotes`, `meshName` (string or `null`), `layer`,
`relatedSlugs`, `references`.

The seed adds `systemId`, `sortOrder` (index + 1), and `isReviewed: false` on
create. `--reconcile` refreshes `references`, `sortOrder`, and `relatedSlugs` but
never overwrites summaries, notes, names, or `isReviewed`.

System row:

`slug`, `name`, `latinName`, `description`, `modelUrl`, `isSample`,
`isPublished`, `sortOrder`.

Constraints: `AnatomySystem.slug` is unique; `AnatomyStructure` is unique on
`[systemId, slug]` and `[systemId, meshName]`. PostgreSQL permits multiple
`null` mesh names, so the five text-only rows are compatible with the mesh-name
constraint.

### 11.2 Review index

No teaching text has been written. The review fields for every row below are
intentionally blank for faculty input.

| # | Slug | Name | Mesh | Layer | Laterality | FMA | Triangles | Review |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
| 1 | `right-kidney` | Right kidney | `right_kidney` | `kidneys` | right | `FMA7204` | 2,310 | pending |
| 2 | `left-kidney` | Left kidney | `left_kidney` | `kidneys` | left | `FMA7205` | 2,982 | pending |
| 3 | `right-ureter` | Right ureter | `right_ureter` | `ureters` | right | `FMA15571` | 1,924 | pending |
| 4 | `left-ureter` | Left ureter | `left_ureter` | `ureters` | left | `FMA15572` | 2,062 | pending |
| 5 | `urinary-bladder` | Urinary bladder | `urinary_bladder` | `bladder` | midline | `FMA15900` | 226 | pending |
| 6 | `urethra` | Urethra | `urethra` | `urethra` | midline | `FMA19667` | 440 | pending |
| 7 | `right-renal-artery` | Right renal artery | `right_renal_artery` | `renal-vessels` | right | `FMA14752` | 206 | pending |
| 8 | `left-renal-artery` | Left renal artery | `left_renal_artery` | `renal-vessels` | left | `FMA14753` | 288 | pending |
| 9 | `right-renal-vein` | Right renal vein | `right_renal_vein` | `renal-vessels` | right | `FMA14335` | 5,014 | pending |
| 10 | `left-renal-vein` | Left renal vein | `left_renal_vein` | `renal-vessels` | left | `FMA14336` | 4,912 | pending |
| 11 | `renal-cortex` | Renal cortex | `null` | `renal-parts` | bilateral | none | — | pending |
| 12 | `renal-medulla` | Renal medulla | `null` | `renal-parts` | bilateral | none | — | pending |
| 13 | `renal-pyramids` | Renal pyramids | `null` | `renal-parts` | bilateral | none | — | pending |
| 14 | `renal-calyces` | Renal calyces | `null` | `renal-parts` | bilateral | none | — | pending |
| 15 | `renal-pelvis` | Renal pelvis | `null` | `renal-parts` | bilateral | none | — | pending |

### 11.3 Per-row review block

Repeat this block for each of the 15 rows. Fields are blank by design.

| Field | Faculty entry |
| --- | --- |
| `summary` | |
| `location` | |
| `function` | |
| `bloodSupply` | |
| `clinicalNotes` | |
| `references` | |
| Reviewer name | |
| Review date | |
| Decision (`approved` / `approved-with-edits` / `rejected`) | |
| Comments | |

For the ten mesh rows, `references` should cite the FMA concept and the textbook
used for the notes. For the five text-only renal parts, there is no FMA concept,
so references must be textbook-only and the notes must make clear that no
independent BodyParts3D mesh exists.

## 12. Risks and open questions

1. **Renal vessels are not urinary organs.** They are included as shared
   cardiovascular context at the task's request. If the atlas enforces one system
   per structure, this needs an explicit shared-structure policy.
2. **Five text-only renal parts have no FMA concept.** They can be taught, but
   they cannot be described as BodyParts3D-derived and cannot carry an FMA
   reference. Omitting them is a valid alternative.
3. **Left/right split doubles rows.** It gives independent selection and matches
   the source, but a merged kidney/ureter row would be simpler. The bladder and
   urethra are already single midline rows.
4. **Renal veins dominate the model.** They are 9,926 of 20,364 triangles
   (48.7%). There is no separate extraparenchymal venous concept, so reducing
   them would require a new modelling decision.
5. **Unused branch segments.** The trunk and ureteric segments of the renal
   arteries add 2,910 triangles if included later. They would duplicate part of
   the main artery territory and are not proposed now.
6. **Adrenal exclusion is deliberate.** The adrenal files `FJ3129`/`FJ3130` and
   the inferior suprarenal arteries `FJ3584`/`FJ3467` should belong to an
   endocrine or cardiovascular model, not the urinary model.
7. **Header name case.** The official tables print lowercase names; the OBJ
   headers capitalise the first letter. The source map validator must compare
   names case-insensitively or store the exact expected form.
8. **Coordinate convention is a project assumption.** The official README does
   not state units or axes. The millimetre/Z-up convention comes from the OBJ
   `Bounds(mm)` header and the existing heart pipeline. Cross-system placement
   depends on that convention remaining consistent.
9. **Licence ambiguity is inherited.** The current licence page says CC BY 4.0;
   the source OBJ headers say CC BY-SA 2.1 Japan. The heart project already
   records this and offers the adapted model under the stricter statement. The
   urinary model should do the same and keep the attribution.
10. **The size figure is an estimate.** The actual GLB may differ because of
    normal generation, index width, JSON size, and alignment. Build and validate
    before publishing any size claim.
11. **No teaching text exists yet.** `isReviewed` must stay false until a faculty
    member signs each row off. The seed's create-only and reconcile behaviour
    already protects reviewed content.

## 13. Approval requested

Please approve or amend:

- [ ] 10 mesh structures + 5 text-only structures = 15 total.
- [ ] Left/right split for kidneys, ureters, renal arteries, and renal veins.
- [ ] Bladder and urethra as single midline structures.
- [ ] Renal vessels included as shared cardiovascular context, with
      cardiovascular as canonical owner.
- [ ] The five text-only renal parts, despite having no FMA concept.
- [ ] The proposed manifest transform fields and the preview offset.
- [ ] The next phase: source map, model build, seed, UI, and teaching text.

Until approval, no seed, database write, model build, UI change, or teaching text
will be produced.
