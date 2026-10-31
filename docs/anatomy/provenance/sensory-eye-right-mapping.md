# Sensory system - right eye - source mapping

**Status: mapping not yet owner-reviewed.** Building does not wait
for this review; publishing does. The seed rows are unpublished and
their teaching text is empty.

- Module slug: `sensory-eye-right`
- Source: BodyParts3D 4.0 PART-OF and IS-A trees
- Source files: 22
- Selectable structures: 21
- Triangles: 125,714
- Model: `sensory-eye-right.v1.glb`
- Manifest: `sensory-eye-right.v1.manifest.json`

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
- Sort order: 11

## Mapping table

| Slug | English name | FMA | Layer | Files | Triangles | Laterality | Canonical owner |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `right-sclera` | Right sclera | FMA58271 | eyeball | FJ1368 | 39,524 | right | - |
| `right-choroid` | Right choroid | FMA58299 | eyeball | FJ1336, FJ1337 | 35,586 | right | - |
| `suspensory-ligament-of-right-lens` | Suspensory ligament of right lens | FMA58839 | eyeball | FJ1371 | 7,376 | right | - |
| `right-vitreous-body` | Right vitreous body | FMA58828 | eyeball | FJ1382 | 5,436 | right | - |
| `right-cornea` | Right cornea | FMA58239 | eyeball | FJ1340 | 4,606 | right | - |
| `right-iris` | Right iris | FMA58236 | eyeball | FJ1348 | 3,248 | right | - |
| `right-lens` | Right lens | FMA58242 | eyeball | FJ1356 | 1,598 | right | - |
| `right-levator-palpebrae-superioris` | Right levator palpebrae superioris | FMA49048 | extraocular-muscles | FJ1357 | 4,360 | right | musculoskeletal |
| `right-superior-oblique` | Right superior oblique | FMA49052 | extraocular-muscles | FJ1373 | 3,546 | right | musculoskeletal |
| `right-inferior-rectus` | Right inferior rectus | FMA49046 | extraocular-muscles | FJ1346 | 3,542 | right | musculoskeletal |
| `right-lateral-rectus` | Right lateral rectus | FMA49054 | extraocular-muscles | FJ1355 | 3,276 | right | musculoskeletal |
| `right-superior-rectus` | Right superior rectus | FMA49044 | extraocular-muscles | FJ1374 | 2,812 | right | musculoskeletal |
| `right-medial-rectus` | Right medial rectus | FMA49056 | extraocular-muscles | FJ1359 | 2,548 | right | musculoskeletal |
| `right-inferior-oblique` | Right inferior oblique | FMA49050 | extraocular-muscles | FJ1345 | 2,342 | right | musculoskeletal |
| `right-lacrimal-gland` | Right lacrimal gland | FMA59102 | lacrimal | FJ1350 | 1,812 | right | - |
| `right-lacrimal-canaliculus` | Right lacrimal canaliculus | FMA59582 | lacrimal | FJ1349 | 526 | right | - |
| `right-nasolacrimal-duct` | Right nasolacrimal duct | FMA59555 | lacrimal | FJ1353 | 444 | right | - |
| `right-lacrimal-sac` | Right lacrimal sac | FMA59545 | lacrimal | FJ1360 | 384 | right | - |
| `right-lacrimal-lake` | Right lacrimal lake | FMA59541 | lacrimal | FJ1352 | 248 | right | - |
| `tarsal-plate-of-right-upper-eyelid` | Tarsal plate of right upper eyelid | FMA59091 | eyelids | FJ1375 | 1,474 | right | - |
| `tarsal-plate-of-right-lower-eyelid` | Tarsal plate of right lower eyelid | FMA59089 | eyelids | FJ1379 | 1,026 | right | - |

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

