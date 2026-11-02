# Male reproductive system - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `male-reproductive`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 10
- Selectable structures: 10
- Triangles: 5,130
- Model: `male-reproductive.v1.glb`
- Manifest: `male-reproductive.v1.manifest.json`

## Derivation

1. Read the official PART-OF and IS-A inclusion tables and
   element-parts tables.
2. Compute the FMA system membership recursively from the official
   roots; the counts were checked against
   `docs/anatomy/whole-body-plan.md` before generation.
3. Exclude files owned by the heart or urinary builds. Record
   remaining shared files with a canonical owner.
4. Group files by the OBJ header Concept ID and English name. This is
   the authoritative one-structure-per-named-structure key; the
   inclusion tables attach files to many ancestors and are ambiguous.
5. Assign a kebab-case slug and snake_case mesh name, a layer from the
   FMA hierarchy/English name, and related slugs from the nearest
   selected parent/children.

## Module split

The viewer supports one GLB per system and each GLB must stay below
150,000 triangles. This module is one part of that split:

- Layer order: testis -> epididymis -> seminal-vesicle -> prostate -> penis
- Sort order: 16

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `right-testis` | Right testis | FMA7211 | testis | FJ3142 | 212 | right | - |
| `left-testis` | Left testis | FMA7212 | testis | FJ3138 | 210 | left | - |
| `left-epididymis` | Left epididymis | FMA18257 | epididymis | FJ3136 | 238 | left | - |
| `right-epididymis` | Right epididymis | FMA18256 | epididymis | FJ3141 | 76 | right | - |
| `left-seminal-vesicle` | Left seminal vesicle | FMA19388 | seminal-vesicle | FJ3137 | 370 | left | - |
| `right-seminal-vesicle` | Right seminal vesicle | FMA19387 | seminal-vesicle | FJ3143 | 360 | right | - |
| `prostate` | Prostate | FMA9600 | prostate | FJ3139 | 442 | - | - |
| `glans-penis` | Glans penis | FMA18247 | penis | FJ3134 | 1,374 | - | - |
| `corpus-cavernosum-of-penis` | Corpus cavernosum of penis | FMA19618 | penis | FJ3132 | 1,272 | - | - |
| `corpus-spongiosum-of-penis` | Corpus spongiosum of penis | FMA19617 | penis | FJ3133 | 576 | - | - |

## Verification

- Every OBJ header Concept ID and English name is checked by the
  build script.
- Every source SHA-256 is checked by the build script.
- The GLB is checked by `validate-anatomy-model.mjs` for the 5 MB
  and 150,000-triangle limits, unique mesh names, licence metadata,
  and manifest agreement.
- Left/right pairs are checked by the build orientation guard and by
  the cross-module guard for pairs split across modules.

## Limitations

- BodyParts3D has no ductus deferens, scrotum, or full penis root mesh
  in this set. The module contains the structures that have geometry.
- The mapping has not been owner-reviewed. Do not publish this module
  until that review is recorded.

