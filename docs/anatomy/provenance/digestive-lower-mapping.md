# Digestive system - lower tract - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `digestive-lower`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 67
- Selectable structures: 19
- Triangles: 116,642
- Model: `digestive-lower.v1.glb`
- Manifest: `digestive-lower.v1.manifest.json`

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

- Layer order: small-intestine -> large-intestine -> mesentery
- Sort order: 5

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `distal-part-of-jejunum` | Distal part of jejunum | FMA16983 | small-intestine | FJ2611, FJ2612, FJ2613, FJ2614, FJ2615, FJ2616, FJ2618, FJ2619, FJ2620, FJ2621 | 2,856 | - | - |
| `proximal-part-of-ileum` | Proximal part of ileum | FMA14964 | small-intestine | FJ2574, FJ2575, FJ2585, FJ2596, FJ2600, FJ2601, FJ2602, FJ2603, FJ2604, FJ2605 | 2,728 | - | - |
| `distal-part-of-ileum` | Distal part of ileum | FMA14966 | small-intestine | FJ2587, FJ2588, FJ2589, FJ2590, FJ2591, FJ2592, FJ2593, FJ2594, FJ2595, FJ2597, FJ2598 | 2,654 | - | - |
| `middle-part-of-ileum` | Middle part of ileum | FMA14965 | small-intestine | FJ2576, FJ2577, FJ2578, FJ2579, FJ2580, FJ2581, FJ2582, FJ2583, FJ2584, FJ2586 | 2,502 | - | - |
| `proximal-part-of-jejunum` | Proximal part of jejunum | FMA16981 | small-intestine | FJ2606, FJ2617, FJ2622, FJ2623, FJ2624, FJ2625, FJ2626, FJ2627 | 1,944 | - | - |
| `duodenum` | Duodenum | FMA7206 | small-intestine | FJ2573 | 1,860 | - | - |
| `middle-part-of-jejunum` | Middle part of jejunum | FMA16982 | small-intestine | FJ2607, FJ2608, FJ2609, FJ2610, FJ2628 | 1,226 | - | - |
| `ileocecal-junction` | Ileocecal junction | FMA11338 | small-intestine | FJ2599 | 288 | - | - |
| `taenia-omentalis` | Taenia omentalis | FMA15043 | large-intestine | FJ2570 | 15,922 | - | - |
| `taenia-libera` | Taenia libera | FMA15044 | large-intestine | FJ2568 | 15,244 | - | - |
| `taenia-mesocolica` | Taenia mesocolica | FMA15042 | large-intestine | FJ2569 | 13,342 | - | - |
| `descending-colon` | Descending colon | FMA14547 | large-intestine | FJ2567 | 5,588 | - | - |
| `transverse-colon` | Transverse colon | FMA14546 | large-intestine | FJ2572 | 3,472 | - | - |
| `ascending-colon` | Ascending colon | FMA14545 | large-intestine | FJ2566 | 3,310 | - | - |
| `rectum` | Rectum | FMA14544 | large-intestine | FJ2571 | 2,118 | - | - |
| `appendix` | Appendix | FMA14542 | large-intestine | FJ2565 | 442 | - | - |
| `mesentery-of-small-intestine` | Mesentery of small intestine | FMA14643 | mesentery | FJ3396 | 38,274 | - | - |
| `transverse-mesocolon` | Transverse mesocolon | FMA14647 | mesentery | FJ3398 | 1,484 | - | - |
| `mesoappendix` | Mesoappendix | FMA16549 | mesentery | FJ3397 | 1,388 | - | - |

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

