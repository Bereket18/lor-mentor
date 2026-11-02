# Lymphatic system - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `lymphatic`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 3
- Selectable structures: 3
- Triangles: 3,410
- Model: `lymphatic.v1.glb`
- Manifest: `lymphatic.v1.manifest.json`

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

- Layer order: spleen -> thymus
- Sort order: 15

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `spleen` | Spleen | FMA7196 | spleen | FJ2561 | 1,330 | - | - |
| `left-lobe-of-thymus` | Left lobe of thymus | FMA71195 | thymus | FJ3150 | 1,050 | left | - |
| `right-lobe-of-thymus` | Right lobe of thymus | FMA71194 | thymus | FJ3151 | 1,030 | right | - |

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

- BodyParts3D has no lymph-node or lymph-vessel meshes in this set.
  The module contains the spleen and the two thymus lobes.
- The mapping has not been owner-reviewed. Do not publish this module
  until that review is recorded.

