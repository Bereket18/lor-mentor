# Nervous system - central midline structures - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `nervous-central`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 18
- Selectable structures: 12
- Triangles: 112,058
- Model: `nervous-central.v1.glb`
- Manifest: `nervous-central.v1.manifest.json`

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
- Sort order: 10

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `cerebellum` | Cerebellum | FMA67944 | cerebellum | FJ1781, FJ1830 | 47,700 | - | - |
| `pons` | Pons | FMA67943 | brainstem | FJ1775, FJ1822 | 20,650 | - | - |
| `midbrain` | Midbrain | FMA61993 | brainstem | FJ1770, FJ1817 | 12,908 | - | - |
| `medulla-oblongata` | Medulla oblongata | FMA62004 | brainstem | FJ1769, FJ1831 | 12,096 | - | - |
| `fourth-ventricle` | Fourth ventricle | FMA78469 | ventricles | FJ1731 | 6,940 | - | - |
| `third-ventricle` | Third ventricle | FMA78454 | ventricles | FJ1730 | 3,870 | - | - |
| `central-canal-of-spinal-cord` | Central canal of spinal cord | FMA78497 | ventricles | FJ1737 | 728 | - | - |
| `cerebral-aqueduct` | Cerebral aqueduct | FMA78467 | ventricles | FJ1738 | 518 | - | - |
| `hypothalamus` | Hypothalamus | FMA62008 | deep-structures | FJ1760, FJ1808 | 4,078 | - | - |
| `tuber-cinereum` | Tuber cinereum | FMA62327 | deep-structures | FJ1780, FJ1828 | 1,606 | - | - |
| `pineal-body` | Pineal body | FMA62033 | deep-structures | FJ1795 | 580 | - | - |
| `habenula` | Habenula | FMA62032 | deep-structures | FJ1743 | 384 | - | - |

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

