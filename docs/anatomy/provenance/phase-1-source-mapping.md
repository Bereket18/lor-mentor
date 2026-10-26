# Phase 1 — Heart source mapping (BodyParts3D 4.0)

**Status: proposed, awaiting approval.** Phase 1 records the official sources and
maps all 26 heart structures. No database writes, migrations, seed runs, package
installs, or model rebuilds were performed.

- Date: 2026-10-25
- Branch: `feature/anatomy-atlas`
- Source directory: `C:\Users\berek\Desktop\bp3d-source` (outside the repository)
- Machine-readable record: [`phase-1-sources.json`](./phase-1-sources.json)
- Scope: heart only. Whole-body and other-organ work remains out of scope.

## 1. Sources acquired

Both official BodyParts3D 4.0 archives were downloaded from
`dbarchive.biosciencedbc.jp` on 2026-10-25. The server throttled single
connections to roughly 14 KB/s, so the files were fetched with parallel HTTP
range requests; both final sizes match the server's `Content-Length`, and both
SHA-256 values are recorded below.

| Tree | Archive and URL | Retrieved | Bytes | ETag | Last-Modified | SHA-256 | OBJ files |
| --- | --- | --- | ---: | --- | --- | --- | ---: |
| PART-OF | `partof_BP3D_4.0_obj_99.zip`<br><https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip> | 2026-10-25 | 64,888,505 | `"3de1eb9-4dd48e9fe8d00"` | Wed, 22 May 2013 06:45:40 GMT | `9fbc713fffeee924a5a657d9813d84d7eb957bded63adb854931dd5e3eb61c97` | 1,258 |
| IS-A | `isa_BP3D_4.0_obj_99.zip`<br><https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip> | 2026-10-25 | 142,903,898 | `"8848a5a-4dd48ec9df000"` | Wed, 22 May 2013 06:46:24 GMT | `40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e` | 2,234 |

The parts lists, element-parts lists, inclusion-relation lists, README, and the
licence page were also saved. All were retrieved on 2026-10-25.

| File | URL | Bytes | ETag | Last-Modified | SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| `README_e.html` | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html> | 19,263 | `"4b3f-62f16ad16c300"` | Thu, 27 Feb 2025 02:45:00 GMT | `f9a90b4d945ad0fe50db45c712e931aa54e52667187b30d7085b6cc394f40107` |
| `isa_parts_list_e.txt` | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_parts_list_e.txt> | 128,086 | `"1f456-4dd45f8977500"` | Wed, 22 May 2013 03:15:00 GMT | `ab7796deedd49205e77f3609a1cb8c53e2bbee14ecb5c9a6ca05227469780513` |
| `partof_parts_list_e.txt` | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_parts_list_e.txt> | 59,351 | `"e7d7-4dd45f8977500"` | Wed, 22 May 2013 03:15:00 GMT | `9224080557053e6f1322f1e13ab27f0ecde0db19bb3b505f0631afad230eeebd` |
| `partof_inclusion_relation_list.txt` | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_inclusion_relation_list.txt> | 91,241 | `"16469-4dd485e296e80"` | Wed, 22 May 2013 06:06:34 GMT | `1b40738270931e3c1d955ce34e0fce0d8d10d8c5ad543463e40b4b4c0243007c` |
| `isa_inclusion_relation_list.txt` | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_inclusion_relation_list.txt> | 207,664 | `"32b30-4dd485e0aea00"` | Wed, 22 May 2013 06:06:32 GMT | `26e7d818e03a8c909fe09c561f38d0d513423c87681f9450a803bc38f5b07564` |
| `isa_element_parts.txt` | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_element_parts.txt> | 1,142,159 | `"116d8f-4dd482e3d5d80"` | Wed, 22 May 2013 05:53:10 GMT | `a3de74423f943b0d724ae8f59b3a817f87c423a544f8db98113b1980817cbeaf` |
| `partof_element_parts.txt` | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_element_parts.txt> | 651,179 | `"9efab-4dd482e3d5d80"` | Wed, 22 May 2013 05:53:10 GMT | `3f5f6df1028eb122b30de77c711597b6bb8e5541658e5985859fd228adbf88ea` |
| `licence_page_2026-10-25.html` | <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html> | 14,694 | `W/"cc8ecd3f09912424346dcc1a4e608b1f"` | — (dynamic page) | `cc8ecd3f09912424346dcc1a4e608b1ff4c29988f6304cf316e414440b1e18ad` |

The licence page is dynamically generated; the saved snapshot is 14,694 bytes
with the ETag shown above. The page itself states it was last updated
**2025-02-27**.

## 2. The 26-structure mapping

Seventeen structures have a mesh; nine are text-only and must be labelled
**“No 3D model”** in the viewer. The `meshName` column shows the original seed
value for text-only rows; those rows do not get a GLB node. Phase 2 proposes the
schema treatment and waits for approval.

| # | Slug | meshName | Type | Source archive | Element IDs | FMA IDs | Layer | Triangles (v2) |
|---:|---|---|---|---|---|---|---|---:|
| 1 | `right-atrium` | `right_atrium` | Mesh | PART-OF | `FJ2424`, `FJ2439` | `FMA11359`, `FMA9457` | `chambers` | 20,028 |
| 2 | `right-ventricle` | `right_ventricle` | Mesh | PART-OF | `FJ2423`, `FJ2419`, `FJ2430`, `FJ2437` | `FMA9291`, `FMA7260`, `FMA7261`, `FMA7262` | `chambers` | 4,336 |
| 3 | `left-atrium` | `left_atrium` | Mesh | PART-OF | `FJ2425`, `FJ2438` | `FMA9465`, `FMA9531` | `chambers` | 8,608 |
| 4 | `left-ventricle` | `left_ventricle` | Mesh | PART-OF | `FJ2422`, `FJ2418`, `FJ2429` | `FMA9466`, `FMA7265`, `FMA7264` | `chambers` | 3,318 |
| 5 | `interventricular-septum` | `interventricular_septum` | Text-only — “No 3D model” | — | — | — (see §7) | `septum` | — |
| 6 | `tricuspid-valve` | `tricuspid_valve` | Mesh | PART-OF | `FJ2421`, `FJ2433`, `FJ2436` | `FMA7238`, `FMA7239`, `FMA7240` | `valves` | 17,612 |
| 7 | `pulmonary-valve` | `pulmonary_valve` | Mesh | PART-OF | `FJ2417`, `FJ2427`, `FJ2434` | `FMA7247`, `FMA7250`, `FMA7249` | `valves` | 3,638 |
| 8 | `mitral-valve` | `mitral_valve` | Mesh | PART-OF | `FJ2420`, `FJ2432` | `FMA7242`, `FMA7243` | `valves` | 11,378 |
| 9 | `aortic-valve` | `aortic_valve` | Mesh | PART-OF | `FJ2435`, `FJ2426`, `FJ2431` | `FMA7253`, `FMA7254`, `FMA7252` | `valves` | 2,150 |
| 10 | `superior-vena-cava` | `superior_vena_cava` | Mesh | PART-OF | `FJ3645` | `FMA4720` | `great-vessels` | 598 |
| 11 | `inferior-vena-cava` | `inferior_vena_cava` | Mesh | PART-OF | `FJ3441`, `FJ3659` | `FMA10951` | `great-vessels` | 3,080 |
| 12 | `pulmonary-trunk` | `pulmonary_trunk` | Mesh | PART-OF | `FJ2966` | `FMA8612` | `great-vessels` | 1,302 |
| 13 | `pulmonary-arteries` | `pulmonary_arteries` | Mesh (merged) | IS-A | `FJ3019`, `FJ2924` | `FMA50872`, `FMA50873` | `great-vessels` | 6,128 |
| 14 | `pulmonary-veins` | `pulmonary_veins` | Mesh (merged) | IS-A | `FJ3040`, `FJ2944`, `FJ2950`, `FJ2955`, `FJ3020`, `FJ2925`, `FJ2933` | `FMA49911`, `FMA49913`, `FMA49914`, `FMA49916` | `great-vessels` | 2,598 |
| 15 | `aorta` | `aorta` | Mesh | PART-OF | `FJ3413`, `FJ1931` | `FMA3736`, `FMA87217` | `great-vessels` | 2,686 |
| 16 | `aortic-arch` | `aortic_arch` | Mesh | IS-A | `FJ3411` | `FMA3768` | `great-vessels` | 670 |
| 17 | `coronary-arteries` | `coronary_arteries` | Mesh | PART-OF | `FJ2723`, `FJ2737`, `FJ2631`, `FJ2649`, `FJ2650`, `FJ2651`, `FJ2652`, `FJ2653`, `FJ2654` | `FMA3802`, `FMA3855`, `FMA74912`, `FMA3895` | `coronary-circulation` | 10,756 |
| 18 | `cardiac-veins` | `cardiac_veins` | Mesh | PART-OF | `FJ2655`, `FJ2656`, `FJ2678`, `FJ2724`, `FJ2731` | `FMA4706`, `FMA4707`, `FMA4713`, `FMA4714` | `coronary-circulation` | 3,682 |
| 19 | `pericardium` | `pericardium` | Text-only — “No 3D model” | — | — | — (see §7) | `wall-layers` | — |
| 20 | `endocardium` | `endocardium` | Text-only — “No 3D model” | — | — | — (subendocardial only; §7) | `wall-layers` | — |
| 21 | `myocardium` | `myocardium` | Text-only — “No 3D model” | — | — | — (regional only; §7) | `wall-layers` | — |
| 22 | `epicardium` | `epicardium` | Text-only — “No 3D model” | — | — | — (see §7) | `wall-layers` | — |
| 23 | `sinoatrial-node` | `sinoatrial_node` | Text-only — “No 3D model” | — | — | — (see §7) | `conduction` | — |
| 24 | `atrioventricular-node` | `atrioventricular_node` | Text-only — “No 3D model” | — | — | — (see §7) | `conduction` | — |
| 25 | `bundle-of-his` | `bundle_of_his` | Text-only — “No 3D model” | — | — | — (see §7) | `conduction` | — |
| 26 | `purkinje-fibers` | `purkinje_fibers` | Text-only — “No 3D model” | — | — | — (see §7) | `conduction` | — |
| | **Total** | **17 mesh + 9 text-only = 26** | | | | | | **102,568** |

Source totals: 52 unique OBJ files (42 PART-OF + 10 IS-A), 17 selectable nodes,
102,568 triangles. The v1 model was 43 files and 93,842 triangles. The v2 change
is +9 files, +8,726 triangles net: −670 for the arch moved out of `aorta`, plus
9,396 for the three new structures.

## 3. IS-A versus PART-OF: the premise check

The question was whether the pulmonary arteries, pulmonary veins, and aortic arch
exist in IS-A but not in PART-OF. **They exist in both trees.** The difference is
fragmentation, not availability.

| Structure | PART-OF representation | IS-A representation | Decision |
| --- | --- | --- | --- |
| Pulmonary arteries | `FMA50872` right pulmonary artery: 55 element files. `FMA50873` left pulmonary artery: 38 element files. Many are intrapulmonary branches. | `FJ3019` (`FMA50872`, 678 triangles) + `FJ2924` (`FMA50873`, 5,450 triangles), two main-vessel files. | Use IS-A. |
| Pulmonary veins | `FMA49911` 24 files; `FMA49913` 15 files; `FMA49914` 27 files; `FMA49916` 26 files. | `FJ3040` (`FMA49911`); `FJ2944`, `FJ2950`, `FJ2955` (`FMA49913`); `FJ3020` (`FMA49914`); `FJ2925`, `FJ2933` (`FMA49916`). Seven files, 2,598 triangles. | Use IS-A. |
| Aortic arch | `FJ3411` (`FMA3768`), 670 triangles. | `FJ3411` (`FMA3768`), 670 triangles; identical geometry. | Use IS-A for the new node; remove `FJ3411` from `aorta`. |

Additional findings:

- The PART-OF `pulmonary arterial tree` concept `FMA45842` has 94 element files
  and includes the pulmonary trunk `FJ2966`. It is not used: it would mix the
  trunk into the artery node and duplicate branches.
- The parent pulmonary-vein concepts `FMA49908` (superior pulmonary vein, 3 IS-A
  files), `FMA49910` (inferior pulmonary vein, 4 IS-A files), and `FMA66643`
  (pulmonary vein, 84 IS-A files) exist only in IS-A. They are not used because
  the four named pulmonary veins give exact, non-overlapping coverage.
- No element ID is used by two structures. The v2 source list has 52 unique IDs.

## 4. Coordinate-frame check

The two archives must share one coordinate frame if they are combined. Two
meshes present in both were compared vertex-for-vertex, and then all 43 v1 source
files were compared across the archives.

| Element | Concept | Archive | Representation ID | Build-up logic | Vertices | Faces | Bounds min (mm) | Bounds max (mm) | SHA-256 |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
| `FJ3411` | `FMA3768` | PART-OF | `BP10404` | `FMA 3.0 part_of` | 381 | 670 | `(-6.83046, -137.163, 1281.900)` | `(34.8378, -49.8449, 1317.090)` | `7f1bbd874b05ea618649bfd5a51ac2675523f419dd3e5f5e160d90f47bd413db` |
| `FJ3411` | `FMA3768` | IS-A | `BP10322` | `FMA 3.0 is_a` | 381 | 670 | `(-6.83046, -137.163, 1281.900)` | `(34.8378, -49.8449, 1317.090)` | `9eeb5e5a627e8145f03961c661c9c66d8fdc55ed1234d04b84212b87a21d902c` |
| `FJ2966` | `FMA8612` | PART-OF | `BP9912` | `FMA 3.0 part_of` | 871 | 1,302 | `(11.2747, -158.864, 1256.500)` | `(42.0750, -116.516, 1293.610)` | `5da4132e171716c7a0f78806a14520bee79b993f814de83b1e1f2f2f8cf95edd` |
| `FJ2966` | `FMA8612` | IS-A | `BP8690` | `FMA 3.0 is_a` | 871 | 1,302 | `(11.2747, -158.864, 1256.500)` | `(42.0750, -116.516, 1293.610)` | `7d4fbfbeebdb541b4053e62e6ba9e55bdbc8d1354de8192f94d7c6008812ab3f` |

The bounds above are computed from the vertex data. The `FJ3411` OBJ header
rounds the first minimum to `-6.830500`; the computed minimum is `-6.83046`.

All 43 v1 source files have identical vertex counts, face counts, bounds, and
non-comment geometry lines in both archives. Their SHA-256 values differ only
because the headers contain different `Representation ID` and `Build-up logic`
values. **Conclusion: the archives share one coordinate frame; combining them is
safe.**

## 5. Licence evidence

### 5.1 OBJ headers

Every OBJ in both archives contains the same 300-character header line:

```text
# The license for this database is specified in the Creative Commons Attribution-Share Alike 2.1 Japan. If you use data from this database, please be sure attribute this database as follows: "BodyParts3D, (c)  The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan".
```

| Archive | OBJ files | Files with the line | Different licence wordings | Files missing the line |
| --- | ---: | ---: | ---: | ---: |
| PART-OF | 1,258 | 1,258 | 0 | 0 |
| IS-A | 2,234 | 2,234 | 0 | 0 |
| **Total** | **3,492** | **3,492** | **0** | **0** |

### 5.2 README and website

The official `README_e.html` and the current licence page both state:

> The license for this database is specified in the Creative Commons Attribution
> 4.0 International.

Both give this exact credit line:

> BodyParts3D, © The Database Center for Life Science licensed under CC
> Attribution 4.0 International

The HTML source renders the copyright sign as `c`, but the character is
**U+00A9 (©)**. The credit line must keep the `©`; do not replace it with a
literal `c`.

### 5.3 Unresolved licence caveat

The OBJ headers say **CC BY-SA 2.1 Japan**, while the README and current website
say **CC BY 4.0 International**. The README also links the “summary of the
Creative Commons Attribution 4.0 International” to the **CC BY-SA 2.1 Japan**
deed at `http://creativecommons.org/licenses/by-sa/2.1/jp/deed.en_US`.

This discrepancy is unresolved. The model remains a **development asset** under
the current CC BY 4.0 terms with the required credit. **Commercial release is
blocked** until DBCLS provides written clarification. Do not change the licence
wording or remove the caveat without a written record of that clarification.

## 6. Restored teaching text for the 12 pruned rows

`C:\Users\berek\Desktop\lor-backups` does not exist in this environment. The
original text was recovered from git history instead:

```text
git show 7e4c284:apps/api/prisma/seed-anatomy.ts
```

The 12 rows are identical in `7e4c284` and `8ead501`. The hash below is SHA-256
over the UTF-8 JSON array `[summary, location, function, bloodSupply,
clinicalNotes]` for each row.

| Slug | Original teaching-text SHA-256 |
| --- | --- |
| `interventricular-septum` | `bf2b5f85b6240cba0079cd64fc31ddf99b13fdd3081b6a6ddb3ee8fbb580fb86` |
| `pulmonary-arteries` | `d19ed50c6bfb549b3824f8b0473d57dce3e2ebdcd41a38406008b455a25ce3e5` |
| `pulmonary-veins` | `b0f1efb15d265e89deb2028ec31c530796ee31157bd225bad3ab3b016155124b` |
| `aortic-arch` | `5460d22f56ea1a4f360e089d077192474d12d8a460558c1503ebc88a788f6cd7` |
| `pericardium` | `e93e3b70cfc74e27dc01cd640d478d85feff9c5eb7c1c4855b8dee6009bf43e4` |
| `endocardium` | `d533db4d2ff6c9404ab11ab41a7e15fa9eaba4fc568071638a13f59d715894fb` |
| `myocardium` | `142ca64942cff99df65c71b597f16e432703f826e6e01b69b5b00ae196d07115` |
| `epicardium` | `250a2c727ecef57f82ef77eb07ba58d91afccdc1ff5edecb16eb02bdd276094b` |
| `sinoatrial-node` | `f1504b57e80d56888b6c49a0ef70c4ee5a6011cf6cdbf781cf231cf4620fc12b` |
| `atrioventricular-node` | `49c6045585fd92c43e8a494963968275c551ce07654b47b31c9fd758a71f466d` |
| `bundle-of-his` | `babc3907144a05588e4afadd74c727276ede9cddb3d86820d5355e74c1804f75` |
| `purkinje-fibers` | `49b40df5cd823f46340aaaa76457c2a39e82ed12a654ba1e3dec02127656e82e` |

The 14 retained rows differ from the original 26-row seed only in four
`bloodSupply` corrections (tricuspid, pulmonary, mitral, and aortic valves).
Those corrections stay; do not overwrite the current 14 rows with the older
text. All 26 rows keep `isReviewed = false` until faculty review.

## 7. Text-only rationale

These nine structures have no independent 3D concept in BodyParts3D 4.0. No
schematic or substitute mesh will be used. The viewer must show **“No 3D model”**
and keep the teaching text, search, and keyboard tree working.

| Slug | Why there is no mesh |
| --- | --- |
| `interventricular-septum` | No ventricular-septum concept in either parts list. No separate septum mesh is available; the chamber meshes are not a substitute. |
| `pericardium` | No pericardium concept in either parts list. |
| `endocardium` | No endocardium concept. Only subendocardial layer concepts `FMA84856` and `FMA84857` exist; they are not the endocardium itself. |
| `myocardium` | No whole-myocardium concept. Thirteen regional or partial concepts exist: `FMA9535`, `FMA9558`, `FMA83447`, `FMA83448`, `FMA84856`, `FMA84857`, `FMA84931`, `FMA84932`, `FMA86056`, `FMA86063`, `FMA86064`, `FMA87178`, `FMA87179`. Their element files overlap the papillary-muscle geometry already used by the chamber nodes. |
| `epicardium` | No epicardium concept in either parts list. |
| `sinoatrial-node` | No sinoatrial node concept in either parts list. |
| `atrioventricular-node` | No atrioventricular node concept in either parts list. |
| `bundle-of-his` | No bundle of His or atrioventricular bundle concept in either parts list. |
| `purkinje-fibers` | No Purkinje fibre concept in either parts list. |

## 8. Proposed Phase 2 work (not applied)

If this mapping is approved, Phase 2 will:

1. Build `heart.v2.glb` from the 52 source files above, keeping
   `heart.v1.glb` untouched until v2 passes validation.
2. Merge multi-part structures into one node per structure. Every selectable
   node must be named exactly its `meshName`, unique per system.
3. Split `FJ3411` out of `aorta` and create the separate `aortic_arch` node.
4. Update `manifest.json` and the provenance README with the mixed-archive
   source record, per-file hashes, 17 nodes, and 102,568 triangles.
5. Extend the validator to fail on missing or duplicate node names, NaN or empty
   geometry, a file over 5 MB, or more than 150,000 triangles.
6. Propose — but not apply — a nullable-`meshName` migration (or equivalent
   text-only representation) with SQL, and wait for approval.
7. Propose the text-only seed change and a safe update path for existing
   development rows, and wait for approval.

The estimated v2 GLB size is about 2.0 MB, based on the v1 bytes-per-triangle
ratio. It has not been built.

## 9. Verification performed

| Command | Result |
| --- | --- |
| `Expand-Archive` on both ZIPs | 1,258 PART-OF OBJ files; 2,234 IS-A OBJ files |
| `node scan-obj-headers.mjs <partof_extracted>` | 1,258/1,258 files carry the same CC BY-SA 2.1 Japan line; 0 variants; 0 missing |
| `node scan-obj-headers.mjs <isa_extracted>` | 2,234/2,234 files carry the same CC BY-SA 2.1 Japan line; 0 variants; 0 missing |
| `node verify-bp3d-sources.mjs` | 43/43 shared files geometry-identical; 10/10 new files match Concept ID and English name; 0 failures; v2 total 102,568 triangles |
| `node check-phase1-json.mjs` | `phase-1-sources.json` matches all measured archive, small-file, bounds, hash, and triangle values; 0 failures |
| `Get-FileHash` on both ZIPs | SHA-256 values in §1 |

Not run in Phase 1: TypeScript build, ESLint, API tests, web build, Playwright,
model build, and model validation. Phase 1 changes only documentation; the
toolchain checks and the v2 build belong to Phases 2 and 4.

## 10. Files changed, risks, and what remains

Files added in Phase 1:

- `docs/anatomy/provenance/phase-1-source-mapping.md` (this report)
- `docs/anatomy/provenance/phase-1-sources.json` (machine-readable sources)

No existing application, seed, schema, model, or manifest file was changed. No
database writes, migrations, seed runs, package installs, or commits to a remote
were performed.

Risks and open items:

- The CC BY-SA 2.1 Japan versus CC BY 4.0 International discrepancy is unresolved.
  Commercial release remains blocked pending written clarification.
- The nine text-only structures need a UI treatment that is honest and does not
  imply a missing model is a rendering failure.
- The mixed-archive build depends on the verified shared coordinate frame. If
  either archive is replaced, re-run the geometry comparison before rebuilding.
- The v2 size is an estimate until the GLB is built and validated.
- The current schema has a non-null `meshName` and a unique constraint; the
  text-only representation needs the Phase 2 proposal and approval.
- The existing `docs/anatomy/provenance/README.md` still describes v1 and says the
  full archive was not downloaded. It must be updated in Phase 2 after v2
  validates.
- The current contract test expects 14 seed rows and one GLB node per row. Phase 2
  must update it for 26 rows, 17 nodes, and mixed archives.
- The original text came from git history, not `lor-backups`, because that
  directory does not exist here.

## 11. Approval requested

Please approve or correct:

1. The 26-row mapping and the 17-mesh / 9-text-only split.
2. Using IS-A for `pulmonary_arteries`, `pulmonary_veins`, and `aortic_arch`,
   with `FJ3411` removed from `aorta`.
3. The nine text-only structures and the **“No 3D model”** treatment.
4. Proceeding to Phase 2 to build and validate `heart.v2.glb` and to prepare the
   migration and seed-change proposals. The migration and seed changes will not
   be applied without a separate approval.
5. Keeping the licence caveat and the exact credit line unchanged until DBCLS
   provides written clarification.

**Phase 1 stops here for approval.**
