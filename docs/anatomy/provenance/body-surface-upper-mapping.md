# Body surface - upper region - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `body-surface-upper`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 1
- Selectable structures: 1
- Triangles: 101,691
- Model: `body-surface-upper.v1.glb`
- Manifest: `body-surface-upper.v1.manifest.json`

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

- Layer order: skin-upper
- Sort order: 17

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `skin-upper-body` | Skin | FMA7163 | skin-upper | FJ2810U | 101,691 | - | - |

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

- The skin is one 203,382-triangle mesh in BodyParts3D. This module is
  a derived regional partition by triangle centroid Z, not a separate
  FMA concept. No triangles are duplicated or decimated.
- The mapping has not been owner-reviewed. Do not publish this module
  until that review is recorded.

