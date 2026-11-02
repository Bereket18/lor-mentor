# Respiratory system - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `respiratory`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 108
- Selectable structures: 26
- Triangles: 139,164
- Model: `respiratory.v1.glb`
- Manifest: `respiratory.v1.manifest.json`

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

- Layer order: trachea -> bronchi -> segmental-bronchi -> vessels -> diaphragm
- Sort order: 3

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `trachea` | Trachea | FMA7394 | trachea | FJ2541 | 4,996 | - | - |
| `right-main-bronchus-proper` | Right main bronchus proper | FMA68418 | bronchi | FJ2539 | 4,468 | right | - |
| `left-main-bronchus` | Left main bronchus | FMA7396 | bronchi | FJ2450 | 4,136 | left | - |
| `inferior-lingular-bronchial-tree` | Inferior lingular bronchial tree | FMA68227 | bronchi | FJ2441, FJ2475 | 1,348 | - | - |
| `superior-lingular-bronchial-tree` | Superior lingular bronchial tree | FMA68226 | bronchi | FJ2476, FJ2477, FJ2478, FJ2540 | 664 | - | - |
| `right-superior-segmental-bronchial-tree` | Right superior segmental bronchial tree | FMA68216 | segmental-bronchi | FJ2459, FJ2495, FJ2496, FJ2497, FJ2498, FJ2499, FJ2500, FJ2501, FJ2502 | 7,716 | right | - |
| `right-anterior-segmental-bronchial-tree` | Right anterior segmental bronchial tree | FMA68212 | segmental-bronchi | FJ2453, FJ2509, FJ2510, FJ2511, FJ2512, FJ2513, FJ2514 | 5,608 | right | - |
| `medial-segmental-bronchial-tree` | Medial segmental bronchial tree | FMA68214 | segmental-bronchi | FJ2451, FJ2506, FJ2507, FJ2508 | 5,346 | - | - |
| `lateral-segmental-bronchial-tree` | Lateral segmental bronchial tree | FMA68215 | segmental-bronchi | FJ2449, FJ2503, FJ2504, FJ2505 | 4,520 | - | - |
| `right-apical-segmental-bronchial-tree` | Right apical segmental bronchial tree | FMA68211 | segmental-bronchi | FJ2454, FJ2520, FJ2521, FJ2522, FJ2523, FJ2524, FJ2525, FJ2526 | 4,504 | right | - |
| `right-posterior-segmental-bronchial-tree` | Right posterior segmental bronchial tree | FMA68213 | segmental-bronchi | FJ2458, FJ2515, FJ2516, FJ2517, FJ2518, FJ2519 | 4,336 | right | - |
| `right-posterior-basal-segmental-bronchial-tree` | Right posterior basal segmental bronchial tree | FMA68221 | segmental-bronchi | FJ2457, FJ2470, FJ2481, FJ2486, FJ2487, FJ2489 | 4,158 | right | - |
| `right-lateral-basal-segmental-bronchial-tree` | Right lateral basal segmental bronchial tree | FMA68220 | segmental-bronchi | FJ2455, FJ2490, FJ2491, FJ2492 | 2,928 | right | - |
| `right-anterior-basal-segmental-bronchial-tree` | Right anterior basal segmental bronchial tree | FMA68321 | segmental-bronchi | FJ2452, FJ2493, FJ2494 | 2,260 | right | - |
| `left-anterior-segmental-bronchial-tree` | Left anterior segmental bronchial tree | FMA68222 | segmental-bronchi | FJ2443, FJ2467, FJ2468, FJ2469, FJ2471, FJ2472, FJ2473, FJ2474 | 1,626 | left | - |
| `left-posterior-basal-segmental-bronchial-tree` | Left posterior basal segmental bronchial tree | FMA68233 | segmental-bronchi | FJ2446, FJ2527, FJ2528, FJ2529, FJ2530, FJ2531 | 1,460 | left | - |
| `left-apical-segmental-bronchial-tree` | Left apical segmental bronchial tree | FMA68223 | segmental-bronchi | FJ2444, FJ2460, FJ2461, FJ2462, FJ2463, FJ2464 | 1,226 | left | - |
| `left-superior-segmental-bronchial-tree` | Left superior segmental bronchial tree | FMA68228 | segmental-bronchi | FJ2448, FJ2479, FJ2480, FJ2482, FJ2483, FJ2484, FJ2485 | 1,144 | left | - |
| `left-lateral-basal-segmental-bronchial-tree` | Left lateral basal segmental bronchial tree | FMA68232 | segmental-bronchi | FJ2445, FJ2532, FJ2533, FJ2534 | 1,126 | left | - |
| `right-medial-basal-segmental-bronchial-tree` | Right medial basal segmental bronchial tree | FMA68218 | segmental-bronchi | FJ2456, FJ2488 | 902 | right | - |
| `left-medial-basal-segmental-bronchial-tree` | Left medial basal segmental bronchial tree | FMA68230 | segmental-bronchi | FJ2442, FJ2537 | 822 | left | - |
| `left-anterior-basal-segmental-bronchial-tree` | Left anterior basal segmental bronchial tree | FMA68231 | segmental-bronchi | FJ2535, FJ2536, FJ2538 | 732 | left | - |
| `left-posterior-segmental-bronchial-tree` | Left posterior segmental bronchial tree | FMA68225 | segmental-bronchi | FJ2447, FJ2465, FJ2466 | 440 | left | - |
| `inferior-lingular-artery` | Inferior lingular artery | FMA8640 | vessels | FJ2896, FJ2897 | 2,598 | - | cardiovascular |
| `superior-lingular-artery` | Superior lingular artery | FMA8639 | vessels | FJ2898, FJ2899, FJ2900, FJ2901 | 1,578 | - | cardiovascular |
| `diaphragm` | Diaphragm | FMA13295 | diaphragm | FJ3131 | 68,522 | - | musculoskeletal |

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

- BodyParts3D 4.0 has no lung-parenchyma surface mesh. This build is
  bronchi, the trachea, the diaphragm, and a few lingular arteries;
  the pulmonary vessels remain cardiovascular-owned and are not drawn.
- The mapping has not been owner-reviewed. Do not publish this module
  until that review is recorded.

