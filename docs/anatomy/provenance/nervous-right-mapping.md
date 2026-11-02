# Nervous system - right-sided structures - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `nervous-right`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 21
- Selectable structures: 21
- Triangles: 106,280
- Model: `nervous-right.v1.glb`
- Manifest: `nervous-right.v1.manifest.json`

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

- Layer order: cerebrum -> cerebellum -> brainstem -> ventricles -> deep-structures
- Sort order: 9

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `white-matter-of-right-cerebral-hemisphere` | White matter of right cerebral hemisphere | FMA260791 | cerebrum | FJ1806 | 26,512 | right | - |
| `right-internal-capsule` | Right internal capsule | FMA72906 | cerebrum | FJ1751 | 10,742 | right | - |
| `right-superior-frontal-gyrus` | Right superior frontal gyrus | FMA72653 | cerebrum | FJ1834 | 6,450 | right | - |
| `right-superior-parietal-lobule` | Right superior parietal lobule | FMA72671 | cerebrum | FJ1836 | 5,640 | right | - |
| `right-occipital-lobe` | Right occipital lobe | FMA72975 | cerebrum | FJ1792 | 4,564 | right | - |
| `right-precentral-gyrus` | Right precentral gyrus | FMA72661 | cerebrum | FJ1801 | 4,042 | right | - |
| `right-postcentral-gyrus` | Right postcentral gyrus | FMA72665 | cerebrum | FJ1798 | 3,604 | right | - |
| `right-angular-gyrus` | Right angular gyrus | FMA72669 | cerebrum | FJ1733 | 3,554 | right | - |
| `right-middle-frontal-gyrus` | Right middle frontal gyrus | FMA72655 | cerebrum | FJ1788 | 3,326 | right | - |
| `right-inferior-frontal-gyrus` | Right inferior frontal gyrus | FMA72657 | cerebrum | FJ1745 | 3,292 | right | - |
| `right-inferior-temporal-gyrus` | Right inferior temporal gyrus | FMA72687 | cerebrum | FJ1747 | 2,768 | right | - |
| `right-middle-temporal-gyrus` | Right middle temporal gyrus | FMA72685 | cerebrum | FJ1790 | 2,754 | right | - |
| `right-insula` | Right insula | FMA72977 | cerebrum | FJ1749 | 2,448 | right | - |
| `right-cingulate-gyrus` | Right cingulate gyrus | FMA72717 | cerebrum | FJ1740 | 2,346 | right | - |
| `right-supramarginal-gyrus` | Right supramarginal gyrus | FMA72667 | cerebrum | FJ1842 | 2,314 | right | - |
| `right-fusiform-gyrus` | Right fusiform gyrus | FMA72689 | cerebrum | FJ1784 | 1,626 | right | - |
| `right-hippocampus` | Right hippocampus | FMA72713 | cerebrum | FJ1807 | 1,020 | right | - |
| `right-parahippocampal-gyrus` | Right parahippocampal gyrus | FMA72705 | cerebrum | FJ1786 | 882 | right | - |
| `right-inferior-colliculus` | Right inferior colliculus | FMA73434 | brainstem | FJ1810 | 204 | right | - |
| `right-superior-colliculus` | Right superior colliculus | FMA73422 | brainstem | FJ1826 | 176 | right | - |
| `right-lateral-ventricle` | Right lateral ventricle | FMA78449 | ventricles | FJ1814 | 18,016 | right | - |

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

