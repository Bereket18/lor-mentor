# Sensory system - left eye - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `sensory-eye-left`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 23
- Selectable structures: 22
- Triangles: 128,994
- Model: `sensory-eye-left.v1.glb`
- Manifest: `sensory-eye-left.v1.manifest.json`

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

- Layer order: eyeball -> extraocular-muscles -> lacrimal -> eyelids
- Sort order: 12

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `left-sclera` | Left sclera | FMA58272 | eyeball | FJ1317 | 39,504 | left | - |
| `left-choroid` | Left choroid | FMA58300 | eyeball | FJ1285, FJ1286 | 35,622 | left | - |
| `suspensory-ligament-of-left-lens` | Suspensory ligament of left lens | FMA58840 | eyeball | FJ1320 | 7,256 | left | - |
| `left-vitreous-body` | Left vitreous body | FMA58829 | eyeball | FJ1331 | 5,448 | left | - |
| `left-cornea` | Left cornea | FMA58240 | eyeball | FJ1289 | 4,602 | left | - |
| `left-iris` | Left iris | FMA58237 | eyeball | FJ1297 | 3,286 | left | - |
| `anterior-chamber-of-left-eyeball` | Anterior chamber of left eyeball | FMA58082 | eyeball | FJ1282 | 3,064 | left | - |
| `left-lens` | Left lens | FMA58243 | eyeball | FJ1305 | 1,606 | left | - |
| `left-levator-palpebrae-superioris` | Left levator palpebrae superioris | FMA49049 | extraocular-muscles | FJ1306 | 4,360 | left | musculoskeletal |
| `left-superior-oblique` | Left superior oblique | FMA49053 | extraocular-muscles | FJ1322 | 3,604 | left | musculoskeletal |
| `left-inferior-rectus` | Left inferior rectus | FMA49047 | extraocular-muscles | FJ1295 | 3,560 | left | musculoskeletal |
| `left-lateral-rectus` | Left lateral rectus | FMA49055 | extraocular-muscles | FJ1304 | 3,316 | left | musculoskeletal |
| `left-superior-rectus` | Left superior rectus | FMA49045 | extraocular-muscles | FJ1323 | 2,836 | left | musculoskeletal |
| `left-medial-rectus` | Left medial rectus | FMA49057 | extraocular-muscles | FJ1308 | 2,576 | left | musculoskeletal |
| `left-inferior-oblique` | Left inferior oblique | FMA49051 | extraocular-muscles | FJ1294 | 2,360 | left | musculoskeletal |
| `left-lacrimal-gland` | Left lacrimal gland | FMA59103 | lacrimal | FJ1299 | 1,768 | left | - |
| `left-lacrimal-canaliculus` | Left lacrimal canaliculus | FMA59583 | lacrimal | FJ1298 | 634 | left | - |
| `left-nasolacrimal-duct` | Left nasolacrimal duct | FMA59556 | lacrimal | FJ1302 | 444 | left | - |
| `left-lacrimal-sac` | Left lacrimal sac | FMA59546 | lacrimal | FJ1309 | 382 | left | - |
| `left-lacrimal-lake` | Left lacrimal lake | FMA59542 | lacrimal | FJ1301 | 248 | left | - |
| `tarsal-plate-of-left-upper-eyelid` | Tarsal plate of left upper eyelid | FMA59092 | eyelids | FJ1324 | 1,484 | left | - |
| `tarsal-plate-of-left-lower-eyelid` | Tarsal plate of left lower eyelid | FMA59090 | eyelids | FJ1328 | 1,034 | left | - |

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

