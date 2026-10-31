# Digestive system - hepatobiliary and pancreas - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `digestive-hepatobiliary`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 58
- Selectable structures: 48
- Triangles: 84,834
- Model: `digestive-hepatobiliary.v1.glb`
- Manifest: `digestive-hepatobiliary.v1.manifest.json`

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

- Layer order: hepatic-vessels -> biliary -> pancreas
- Sort order: 7

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `left-portal-vein` | Left portal vein | FMA15415 | hepatic-vessels | FJ1893, FJ2404 | 8,060 | left | cardiovascular |
| `right-portal-vein` | Right portal vein | FMA15414 | hepatic-vessels | FJ1913, FJ2405 | 6,516 | right | cardiovascular |
| `anterior-inferior-segmental-tributary-of-middle-hepatic-vein` | Anterior inferior segmental tributary of middle hepatic vein | FMA15800 | hepatic-vessels | FJ3083, FJ3086 | 3,796 | - | cardiovascular |
| `right-hepatic-vein` | Right hepatic vein | FMA14338 | hepatic-vessels | FJ2416 | 3,538 | right | cardiovascular |
| `anterior-inferior-segmental-branch-of-right-portal-vein` | Anterior inferior segmental branch of right portal vein | FMA15421 | hepatic-vessels | FJ3074 | 2,832 | right | cardiovascular |
| `posterior-superior-segmental-branch-of-right-portal-vein` | Posterior superior segmental branch of right portal vein | FMA15423 | hepatic-vessels | FJ3112, FJ3113 | 2,812 | right | cardiovascular |
| `posterior-superior-segmental-hepatic-artery` | Posterior superior segmental hepatic artery | FMA70445 | hepatic-vessels | FJ3115, FJ3116 | 2,430 | - | cardiovascular |
| `lateral-superior-segmental-branch-of-left-portal-vein` | Lateral superior segmental branch of left portal vein | FMA15431 | hepatic-vessels | FJ3126 | 2,364 | left | cardiovascular |
| `lateral-inferior-segmental-branch-of-left-portal-vein` | Lateral inferior segmental branch of left portal vein | FMA15432 | hepatic-vessels | FJ3125 | 2,284 | left | cardiovascular |
| `posterior-inferior-segmental-branch-of-right-portal-vein` | Posterior inferior segmental branch of right portal vein | FMA15424 | hepatic-vessels | FJ3111 | 2,194 | right | cardiovascular |
| `anterior-inferior-segmental-hepatic-artery` | Anterior inferior segmental hepatic artery | FMA70443 | hepatic-vessels | FJ3075 | 1,666 | - | cardiovascular |
| `medial-inferior-segmental-branch-of-left-portal-vein` | Medial inferior segmental branch of left portal vein | FMA15429 | hepatic-vessels | FJ3128 | 1,660 | left | cardiovascular |
| `left-hepatic-vein` | Left hepatic vein | FMA14339 | hepatic-vessels | FJ2415 | 1,386 | left | cardiovascular |
| `trunk-of-left-hepatic-artery` | Trunk of left hepatic artery | FMA70457 | hepatic-vessels | FJ3095 | 1,328 | left | cardiovascular |
| `lateral-superior-segmental-hepatic-artery` | Lateral superior segmental hepatic artery | FMA70452 | hepatic-vessels | FJ3091, FJ3093 | 1,256 | - | cardiovascular |
| `medial-superior-segmental-branch-of-left-portal-vein` | Medial superior segmental branch of left portal vein | FMA15428 | hepatic-vessels | FJ3127 | 1,162 | left | cardiovascular |
| `anterior-superior-segmental-hepatic-artery` | Anterior superior segmental hepatic artery | FMA70442 | hepatic-vessels | FJ3076 | 892 | - | cardiovascular |
| `posterior-inferior-segmental-hepatic-artery` | Posterior inferior segmental hepatic artery | FMA70446 | hepatic-vessels | FJ3114 | 772 | - | cardiovascular |
| `anterior-superior-segmental-branch-of-right-portal-vein` | Anterior superior segmental branch of right portal vein | FMA15420 | hepatic-vessels | FJ3073 | 770 | right | cardiovascular |
| `medial-inferior-segmental-hepatic-artery` | Medial inferior segmental hepatic artery | FMA70450 | hepatic-vessels | FJ3106 | 754 | - | cardiovascular |
| `trunk-of-left-portal-vein` | Trunk of left portal vein | FMA82697 | hepatic-vessels | FJ3102 | 730 | left | cardiovascular |
| `caudate-lobe-branch-of-right-hepatic-artery` | Caudate lobe branch of right hepatic artery | FMA70447 | hepatic-vessels | FJ1916, FJ2386 | 724 | right | cardiovascular |
| `lateral-inferior-segmental-hepatic-artery` | Lateral inferior segmental hepatic artery | FMA70453 | hepatic-vessels | FJ3092 | 618 | - | cardiovascular |
| `medial-superior-segmental-hepatic-artery` | Medial superior segmental hepatic artery | FMA70449 | hepatic-vessels | FJ3107 | 612 | - | cardiovascular |
| `caudate-lobe-branch-of-left-portal-vein` | Caudate lobe branch of left portal vein | FMA15425 | hepatic-vessels | FJ3124 | 494 | left | cardiovascular |
| `trunk-of-right-hepatic-artery` | Trunk of right hepatic artery | FMA70456 | hepatic-vessels | FJ3117 | 442 | right | cardiovascular |
| `caudate-lobe-branch-of-left-hepatic-artery` | Caudate lobe branch of left hepatic artery | FMA70455 | hepatic-vessels | FJ3077 | 430 | left | cardiovascular |
| `hepatic-artery-proper` | Hepatic artery proper | FMA14772 | hepatic-vessels | FJ3081 | 358 | - | cardiovascular |
| `caudate-lobe-branch-of-right-portal-vein` | Caudate lobe branch of right portal vein | FMA82706 | hepatic-vessels | FJ1914 | 316 | right | cardiovascular |
| `trunk-of-right-portal-vein` | Trunk of right portal vein | FMA82695 | hepatic-vessels | FJ3122 | 206 | right | cardiovascular |
| `gallbladder` | Gallbladder | FMA7202 | biliary | FJ2817 | 2,396 | - | - |
| `posterior-superior-tributary-of-right-hepatic-biliary-tree` | Posterior superior tributary of right hepatic biliary tree | FMA71869 | biliary | FJ3109, FJ3110 | 1,824 | right | - |
| `anterior-inferior-tributary-of-right-hepatic-biliary-tree` | Anterior inferior tributary of right hepatic biliary tree | FMA71868 | biliary | FJ3072 | 1,708 | right | - |
| `lateral-superior-tributary-of-left-hepatic-biliary-tree` | Lateral superior tributary of left hepatic biliary tree | FMA71887 | biliary | FJ3088, FJ3090 | 1,416 | left | - |
| `common-hepatic-duct` | Common hepatic duct | FMA14668 | biliary | FJ3079 | 1,364 | - | - |
| `medial-superior-tributary-of-left-hepatic-biliary-tree` | Medial superior tributary of left hepatic biliary tree | FMA71885 | biliary | FJ3104, FJ3105 | 1,064 | left | - |
| `posterior-inferior-tributary-of-right-hepatic-biliary-tree` | Posterior inferior tributary of right hepatic biliary tree | FMA71870 | biliary | FJ3108 | 870 | right | - |
| `left-hepatic-duct` | Left hepatic duct | FMA14670 | biliary | FJ3096 | 848 | left | - |
| `medial-inferior-tributary-of-left-hepatic-biliary-tree` | Medial inferior tributary of left hepatic biliary tree | FMA71886 | biliary | FJ3103 | 698 | left | - |
| `anterior-superior-tributary-of-right-hepatic-biliary-tree` | Anterior superior tributary of right hepatic biliary tree | FMA71867 | biliary | FJ3071 | 686 | right | - |
| `lateral-inferior-tributary-of-left-hepatic-biliary-tree` | Lateral inferior tributary of left hepatic biliary tree | FMA71888 | biliary | FJ3089 | 664 | left | - |
| `caudate-lobe-tributary-of-left-hepatic-biliary-tree` | Caudate lobe tributary of left hepatic biliary tree | FMA71889 | biliary | FJ1883 | 428 | left | - |
| `cystic-duct` | Cystic duct | FMA14539 | biliary | FJ3080 | 278 | - | - |
| `right-hepatic-duct` | Right hepatic duct | FMA14669 | biliary | FJ3123 | 226 | right | - |
| `pancreas` | Pancreas | FMA7198 | pancreas | FJ1895 | 4,890 | - | - |
| `pancreatic-duct-tree` | Pancreatic duct tree | FMA63103 | pancreas | FJ2630 | 4,432 | - | - |
| `parenchyma-of-pancreas` | Parenchyma of pancreas | FMA63120 | pancreas | FJ2629 | 4,272 | - | - |
| `pancreatic-duct` | Pancreatic duct | FMA10419 | pancreas | FJ1896 | 3,368 | - | - |

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

