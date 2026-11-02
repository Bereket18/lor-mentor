# Digestive system - upper tract - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `digestive-upper`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 12
- Selectable structures: 12
- Triangles: 61,140
- Model: `digestive-upper.v1.glb`
- Manifest: `digestive-upper.v1.manifest.json`

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

- Layer order: mouth -> esophagus -> stomach
- Sort order: 4

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `left-tensor-veli-palatini` | Left tensor veli palatini | FMA46732 | mouth | FJ2748 | 13,872 | left | - |
| `right-tensor-veli-palatini` | Right tensor veli palatini | FMA46731 | mouth | FJ2760 | 13,872 | right | - |
| `left-levator-veli-palatini` | Left levator veli palatini | FMA46729 | mouth | FJ2741 | 12,318 | left | - |
| `right-levator-veli-palatini` | Right levator veli palatini | FMA46728 | mouth | FJ2753 | 12,312 | right | - |
| `gingiva-of-lower-jaw` | Gingiva of lower jaw | FMA59764 | mouth | FJ1253 | 1,918 | - | - |
| `gingiva-of-upper-jaw` | Gingiva of upper jaw | FMA59763 | mouth | FJ1252 | 1,848 | - | - |
| `uvular-muscle` | Uvular muscle | FMA46733 | mouth | FJ2762 | 1,632 | - | - |
| `tongue` | Tongue | FMA54640 | mouth | FJ2761 | 524 | - | - |
| `left-submandibular-gland` | Left submandibular gland | FMA59803 | mouth | FJ2766 | 228 | left | - |
| `right-submandibular-gland` | Right submandibular gland | FMA59802 | mouth | FJ2768 | 228 | right | - |
| `esophagus` | Esophagus | FMA7131 | esophagus | FJ2563 | 578 | - | - |
| `stomach` | Stomach | FMA7148 | stomach | FJ2564 | 1,810 | - | - |

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

- The mapping has not been owner-reviewed. Do not publish this module
  until that review is recorded.

