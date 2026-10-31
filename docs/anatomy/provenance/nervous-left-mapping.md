# Nervous system - left-sided structures - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `nervous-left`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 21
- Selectable structures: 21
- Triangles: 104,652
- Model: `nervous-left.v1.glb`
- Manifest: `nervous-left.v1.manifest.json`

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
- Sort order: 8

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `white-matter-of-left-cerebral-hemisphere` | White matter of left cerebral hemisphere | FMA260794 | cerebrum | FJ1758 | 25,542 | left | - |
| `left-internal-capsule` | Left internal capsule | FMA72907 | cerebrum | FJ1750 | 10,740 | left | - |
| `left-superior-frontal-gyrus` | Left superior frontal gyrus | FMA72654 | cerebrum | FJ1833 | 6,452 | left | - |
| `left-superior-parietal-lobule` | Left superior parietal lobule | FMA72672 | cerebrum | FJ1835 | 5,364 | left | - |
| `left-occipital-lobe` | Left occipital lobe | FMA72976 | cerebrum | FJ1791 | 4,390 | left | - |
| `left-precentral-gyrus` | Left precentral gyrus | FMA72662 | cerebrum | FJ1800 | 4,042 | left | - |
| `left-postcentral-gyrus` | Left postcentral gyrus | FMA72666 | cerebrum | FJ1797 | 3,604 | left | - |
| `left-angular-gyrus` | Left angular gyrus | FMA72670 | cerebrum | FJ1732 | 3,588 | left | - |
| `left-middle-frontal-gyrus` | Left middle frontal gyrus | FMA72656 | cerebrum | FJ1787 | 3,416 | left | - |
| `left-inferior-frontal-gyrus` | Left inferior frontal gyrus | FMA72658 | cerebrum | FJ1744 | 3,290 | left | - |
| `left-inferior-temporal-gyrus` | Left inferior temporal gyrus | FMA72688 | cerebrum | FJ1746 | 2,732 | left | - |
| `left-middle-temporal-gyrus` | Left middle temporal gyrus | FMA72686 | cerebrum | FJ1789 | 2,710 | left | - |
| `left-insula` | Left insula | FMA72978 | cerebrum | FJ1748 | 2,448 | left | - |
| `left-cingulate-gyrus` | Left cingulate gyrus | FMA72718 | cerebrum | FJ1739 | 2,416 | left | - |
| `left-supramarginal-gyrus` | Left supramarginal gyrus | FMA72668 | cerebrum | FJ1841 | 2,344 | left | - |
| `left-fusiform-gyrus` | Left fusiform gyrus | FMA72690 | cerebrum | FJ1783 | 1,550 | left | - |
| `left-hippocampus` | Left hippocampus | FMA72714 | cerebrum | FJ1759 | 980 | left | - |
| `left-parahippocampal-gyrus` | Left parahippocampal gyrus | FMA72706 | cerebrum | FJ1785 | 740 | left | - |
| `left-superior-colliculus` | Left superior colliculus | FMA73423 | brainstem | FJ1779 | 180 | left | - |
| `left-inferior-colliculus` | Left inferior colliculus | FMA73435 | brainstem | FJ1762 | 156 | left | - |
| `left-lateral-ventricle` | Left lateral ventricle | FMA78450 | ventricles | FJ1767 | 17,968 | left | - |

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

