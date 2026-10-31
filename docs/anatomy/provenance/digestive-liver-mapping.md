# Digestive system - liver - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `digestive-liver`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 9
- Selectable structures: 8
- Triangles: 127,788
- Model: `digestive-liver.v1.glb`
- Manifest: `digestive-liver.v1.manifest.json`

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

- Layer order: liver
- Sort order: 6

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `hepatovenous-segment-viii` | Hepatovenous segment VIII | FMA15746 | liver | FJ2823, FJ2824 | 40,748 | - | - |
| `hepatovenous-segment-vi` | Hepatovenous segment VI | FMA15744 | liver | FJ2822 | 19,450 | - | - |
| `hepatovenous-segment-iv` | Hepatovenous segment IV | FMA15742 | liver | FJ2820 | 17,942 | - | - |
| `hepatovenous-segment-ii` | Hepatovenous segment II | FMA15739 | liver | FJ2818 | 14,326 | - | - |
| `hepatovenous-segment-v` | Hepatovenous segment V | FMA15743 | liver | FJ2821 | 11,442 | - | - |
| `hepatovenous-segment-iii` | Hepatovenous segment III | FMA15741 | liver | FJ2819 | 10,326 | - | - |
| `hepatovenous-segment-vii` | Hepatovenous segment VII | FMA15745 | liver | FJ2409 | 8,534 | - | - |
| `caudate-lobe-of-liver` | Caudate lobe of liver | FMA13365 | liver | FJ2816 | 5,020 | - | - |

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

