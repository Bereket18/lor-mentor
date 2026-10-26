# Urinary model v1 build provenance

This record covers the local build of `urinary.v1.glb` and its provenance
manifest. The source archives are not committed. The build is reproducible from
the sanitised source map and the two official BodyParts3D 4.0 archives.

- Branch: `integration/anatomy-hardening`
- Base commit before the build work: `304908b` (`feat(api): add urinary seed data`)
- Source map: `apps/web/scripts/anatomy-urinary.source.json`
- Build script: `apps/web/scripts/build-anatomy-model.mjs` (`--system urinary`)
- Validator: `apps/web/scripts/validate-anatomy-model.mjs` (`--system urinary`)
- Asset: `apps/web/public/models/anatomy/urinary.v1.glb`
- Manifest: `apps/web/public/models/anatomy/urinary.v1.manifest.json`
- Contract fixture: `apps/api/src/modules/anatomy/anatomy-urinary.v1.fixture.ts`
- Contract test: `apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts`

The model is a draft. It is not imported by `apps/api/prisma/seed-anatomy.ts`,
no seed has been run, and `URINARY_SYSTEM.isPublished` remains `false`. No
database writes were performed while building or validating it.

## 1. Source dataset

Both archives were downloaded in full on 2026-10-25 and verified against the
checksums recorded in `docs/anatomy/provenance/phase-1-sources.json`.

| Tree    | Archive                      |       Bytes | ETag                      | Last-Modified                 | SHA-256                                                            | OBJ files |
| ------- | ---------------------------- | ----------: | ------------------------- | ----------------------------- | ------------------------------------------------------------------ | --------: |
| PART-OF | `partof_BP3D_4.0_obj_99.zip` |  64,888,505 | `"3de1eb9-4dd48e9fe8d00"` | Wed, 22 May 2013 06:45:40 GMT | `9fbc713fffeee924a5a657d9813d84d7eb957bded63adb854931dd5e3eb61c97` |     1,258 |
| IS-A    | `isa_BP3D_4.0_obj_99.zip`    | 142,903,898 | `"8848a5a-4dd48ec9df000"` | Wed, 22 May 2013 06:46:24 GMT | `40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e` |     2,234 |

Dataset: BodyParts3D 4.0, PART-OF and IS-A trees, 99% polygon reduction.
Licence page: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>
(last updated 2025-02-27).

The build uses 12 unique source files: 6 from PART-OF and 6 from IS-A. The
source map records each file's archive, FMA concept, English name, and SHA-256.
The build fails if a file is missing, is read from the wrong labelled archive,
has a mismatched header, or has a different SHA-256.

## 2. Source element files

| Structure            | Element ID | Archive | FMA      | English name       | Triangles | SHA-256                                                            |
| -------------------- | ---------- | ------- | -------- | ------------------ | --------: | ------------------------------------------------------------------ |
| `right-kidney`       | `FJ3147`   | PART-OF | FMA7204  | Right kidney       |     2,310 | `e21e2ebd5224b1cbf8caabbf4fa788d894819a328a006dcdb2eb8aa6eee5875a` |
| `left-kidney`        | `FJ3145`   | PART-OF | FMA7205  | Left kidney        |     2,982 | `b52066a987f767ad9e5c3092958bf5dd760d9f05f1497d1fc7f7ff11539bdfd2` |
| `right-ureter`       | `FJ3146`   | PART-OF | FMA15571 | Right ureter       |     1,924 | `780889608ce700962d98be95432f94d58ca121b240099adeb83d8278ca8a779d` |
| `left-ureter`        | `FJ3144`   | PART-OF | FMA15572 | Left ureter        |     2,062 | `1235a492a66c738eceafaafa512def0ed82785741367a29835aae2fdb706d59a` |
| `urinary-bladder`    | `FJ3149`   | PART-OF | FMA15900 | Urinary bladder    |       226 | `b49f40d01bf28550094a7d17901e33e7066039f3a0fb8cf44d79fff2472f9926` |
| `urethra`            | `FJ3148`   | PART-OF | FMA19667 | Urethra            |       440 | `9a973d2cfe578e9030f33763f34bf2056e3fe84aeb57a40dae3c2a5cb3a8feb2` |
| `right-renal-artery` | `FJ2038`   | IS-A    | FMA14752 | Right renal artery |       206 | `2bf3da140369524e15335694773718b4e83b254234bc3e8376a4708565276045` |
| `left-renal-artery`  | `FJ2046`   | IS-A    | FMA14753 | Left renal artery  |       288 | `b1a9ce8a37cd9c89fbf4c90a68a554184bf2919dbad391c552c0f4c8dd788845` |
| `right-renal-vein`   | `FJ3577`   | IS-A    | FMA14335 | Right renal vein   |       332 | `36125db169fc547f88860a3f8ea873742437d8be55b6f5f1a7f877219b759449` |
| `right-renal-vein`   | `FJ3578`   | IS-A    | FMA14335 | Right renal vein   |     4,682 | `ccb15ddc46ef6b11ef62fa8dd6923b6fdeedb9b3371ab80513ff11a0fc120734` |
| `left-renal-vein`    | `FJ3477`   | IS-A    | FMA14336 | Left renal vein    |       652 | `3299a1375f6f86c5d523d7f3abd1bce371f13d0b4b586e53bf95600b6ed17adf` |
| `left-renal-vein`    | `FJ3478`   | IS-A    | FMA14336 | Left renal vein    |     4,260 | `06a4b0b274aac5458aeb7ff33881f05afcd2a15e776ddfb9af59e61a06b4b2a1` |

The right and left renal veins each combine two element files with the same FMA
concept. The other eight structures use one element file each.

## 3. Selectable structures

| Slug                 | Mesh name            | Layer         | Laterality | Triangles | FMA      | Source IDs     |
| -------------------- | -------------------- | ------------- | ---------- | --------: | -------- | -------------- |
| `right-kidney`       | `right_kidney`       | kidneys       | right      |     2,310 | FMA7204  | FJ3147         |
| `left-kidney`        | `left_kidney`        | kidneys       | left       |     2,982 | FMA7205  | FJ3145         |
| `right-ureter`       | `right_ureter`       | ureters       | right      |     1,924 | FMA15571 | FJ3146         |
| `left-ureter`        | `left_ureter`        | ureters       | left       |     2,062 | FMA15572 | FJ3144         |
| `urinary-bladder`    | `urinary_bladder`    | bladder       | midline    |       226 | FMA15900 | FJ3149         |
| `urethra`            | `urethra`            | urethra       | midline    |       440 | FMA19667 | FJ3148         |
| `right-renal-artery` | `right_renal_artery` | renal-vessels | right      |       206 | FMA14752 | FJ2038         |
| `left-renal-artery`  | `left_renal_artery`  | renal-vessels | left       |       288 | FMA14753 | FJ2046         |
| `right-renal-vein`   | `right_renal_vein`   | renal-vessels | right      |     5,014 | FMA14335 | FJ3577, FJ3578 |
| `left-renal-vein`    | `left_renal_vein`    | renal-vessels | left       |     4,912 | FMA14336 | FJ3477, FJ3478 |

Totals: 10 selectable nodes, 13,720 vertices, 20,364 triangles.

## 4. Text-only structures

These five rows have no independent BodyParts3D 4.0 mesh. They keep their
teaching text and must not have a GLB node.

| Slug                         | Layer       | Laterality | Reason                                                                                                                 |
| ---------------------------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `renal-cortex`               | renal-parts | bilateral  | No renal-cortex concept in either parts list or either inclusion-relation list; no independent mesh.                   |
| `renal-medulla-and-pyramids` | renal-parts | bilateral  | No renal-medulla or renal-pyramid concept in either parts list or either inclusion-relation list; no independent mesh. |
| `renal-papillae`             | renal-parts | bilateral  | No renal-papilla concept in either parts list or either inclusion-relation list; no independent mesh.                  |
| `renal-calyces`              | renal-parts | bilateral  | No renal-calyx or renal-calix concept in either parts list or either inclusion-relation list; no independent mesh.     |
| `renal-pelvis`               | renal-parts | bilateral  | No renal-pelvis concept in either parts list or either inclusion-relation list; no independent mesh.                   |

Total rows: 10 mesh + 5 text-only = 15.

## 5. Shared renal vessels

The four renal vessels are included as cardiovascular context. They are marked
in the GLB node extras, the manifest structure rows, and the top-level
`sharedStructures` list.

| Slug                 | Mesh name            | Shared with    | Canonical owner | Source IDs     |
| -------------------- | -------------------- | -------------- | --------------- | -------------- |
| `right-renal-artery` | `right_renal_artery` | cardiovascular | cardiovascular  | FJ2038         |
| `left-renal-artery`  | `left_renal_artery`  | cardiovascular | cardiovascular  | FJ2046         |
| `right-renal-vein`   | `right_renal_vein`   | cardiovascular | cardiovascular  | FJ3577, FJ3578 |
| `left-renal-vein`    | `left_renal_vein`    | cardiovascular | cardiovascular  | FJ3477, FJ3478 |

## 6. Transform and orientation

BodyParts3D geometry is in millimetres with a Z-up axis. The pipeline applies:

```text
x' =  x / 1000
y' =  z / 1000
z' = -y / 1000
```

then centres the combined model on its bounding-box centre.

| Field                    | Value                                         |
| ------------------------ | --------------------------------------------- |
| Scale                    | `0.001`                                       |
| Source centre (mm)       | `[1.403801, -120.349651, 899.504513]`         |
| Offset (m)               | `[0.001404, 0.899505, 0.12035]`               |
| Offset convention        | `bodyPosition = modelPosition + offsetMetres` |
| Source patient-left axis | `+X`                                          |
| Output patient-left axis | `+X`                                          |

The build compares paired left/right structures in both the source frame and
the centred output frame. It fails if any pair is reversed or if the two frames
disagree about which X direction is patient left. The recorded centroids are:

| Left                | Right                | Source left X (mm) | Source right X (mm) | Output left X (m) | Output right X (m) |
| ------------------- | -------------------- | -----------------: | ------------------: | ----------------: | -----------------: |
| `left_kidney`       | `right_kidney`       |          57.709698 |          -53.009168 |          0.056306 |          -0.054413 |
| `left_ureter`       | `right_ureter`       |          52.994489 |          -46.822028 |          0.051591 |          -0.048226 |
| `left_renal_artery` | `right_renal_artery` |          20.835500 |          -15.799521 |          0.019432 |          -0.017203 |
| `left_renal_vein`   | `right_renal_vein`   |          56.875695 |          -52.458757 |          0.055472 |          -0.053863 |

The viewer camera sits at `[0, 0, 7]` looking at the origin, so `+X` is the
viewer's right and the patient's left. The viewer renders no on-screen
orientation marker. The manifest records the viewer convention next to the
measured centroids.

## 7. Output asset

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| File                  | `urinary.v1.glb`                                                   |
| Bytes                 | 465,208                                                            |
| MiB (1,048,576 bytes) | 0.4436                                                             |
| MB (1,000,000 bytes)  | 0.4652                                                             |
| Triangles             | 20,364                                                             |
| Vertices              | 13,720                                                             |
| Mesh nodes            | 10                                                                 |
| Text-only structures  | 5                                                                  |
| Total structures      | 15                                                                 |
| SHA-256               | `e5d842eebda1a7f208058f563528b0296b88192419ddb412b9a270ff45f9b073` |

The planning estimate was about 0.45 MB and 20,364 triangles. The built asset
is 0.4436 MiB (0.4652 MB decimal), within the size estimate, and the triangle
count matches exactly.

The GLB is uncompressed, has no textures and no external buffers, and uses one
draw call per selectable node.

## 8. Build and validation commands

The source archives were extracted outside the repository. The commands below
use placeholders for those local paths; the committed source map contains no
absolute paths.

Build the urinary asset and manifest:

```powershell
node apps/web/scripts/build-anatomy-model.mjs --system urinary `
  --source-dir "PART-OF=<extracted>\partof_BP3D_4.0_obj_99" `
  --source-dir "IS-A=<extracted>\isa_BP3D_4.0_obj_99"
```

Rebuild the heart asset to a temporary directory and compare it with the
committed release:

```powershell
node apps/web/scripts/build-anatomy-model.mjs --system heart `
  --source-dir "PART-OF=<extracted>\partof_BP3D_4.0_obj_99" `
  --source-dir "IS-A=<extracted>\isa_BP3D_4.0_obj_99" `
  --out "<temp>\heart.v2.glb" `
  --manifest "<temp>\manifest.json"
```

Validate both assets:

```powershell
node apps/web/scripts/validate-anatomy-model.mjs --system heart
node apps/web/scripts/validate-anatomy-model.mjs --system urinary
```

Run the seed-to-model contract test:

```powershell
npm test --workspace=apps/api -- --runInBand anatomy-model.contract.spec.ts
```

## 9. Verification results

- Heart rebuild: the temporary `heart.v2.glb` is byte-identical to the
  committed asset. Both have SHA-256
  `b1fac8e02842b40b9cd123e3e896d868254d07b63ed3bc856977d511b879541d`,
  2,003,856 bytes, 17 nodes, 57,042 vertices, and 102,568 triangles. The BIN
  chunk SHA-256 is
  `3c6c880bc6bf10d370a250c7c5b1cb852fb5631c4c82379415706b0525958ce6` for both.
  The rebuilt manifest parses to the same JSON as `heart.v2.manifest.json`;
  only line endings differ in the working tree.
- Heart validator: passed, 17 mesh + 9 text-only, 102,568 triangles, 1.91 MB.
- Urinary validator: passed, 10 mesh + 5 text-only, 20,364 triangles, 0.44 MB.
- Left/right guard: a temporary copy of the urinary GLB and manifest with the
  four left/right node names exchanged failed validation with exit code 1 and
  four `Left/right swap detected` messages.
- Contract test: 23 tests passed, including the 10-node/5-text-only urinary
  fixture checks, shared-vessel metadata, transform, orientation, and licence
  parity with heart v2.
- Full API test suite: 22 suites and 248 tests passed.

## 10. Licence and metadata

The urinary manifest and GLB use the same `asset.copyright` wording and the same
`asset.extras.license` object as `heart.v2.glb`. The urinary-specific
`asset.extras.adaptations` list records the six adaptations in the source map.
The four shared vessels are recorded in `sharedStructures` and in each affected
structure row and GLB node.

The manifest and GLB metadata contain no release-status flags and no
"development asset" wording.

## 11. Open items

- `apps/api/prisma/seed-anatomy.ts` is still heart-only. The urinary seed data is
  committed but not wired in, and `URINARY_SYSTEM.isPublished` remains `false`.
- The viewer layer registry, library icon, and attribution page still assume a
  single heart system. See
  [`second-system-audit.md`](./second-system-audit.md) for the read-only audit
  and the changes needed before publishing a second system.
- No faculty member has reviewed the urinary teaching text. `isReviewed`
  remains `false` in the seed data.
- The source archives remain outside the repository and are not distributed
  with the model.
