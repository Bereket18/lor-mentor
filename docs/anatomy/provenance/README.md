# Anatomy Lab — model provenance

This directory records where the Anatomy Lab models came from, how they were
built, and what is still unresolved. The source archives are deliberately kept
outside the repository.

**Current local state:** `heart.v2.glb` is the live heart release. `heart.v1.glb`
is kept as the verified rollback asset. The heart API seed has 26 rows: 17 mesh
structures and 9 text-only structures. The nullable-`meshName` migration and the
text-only viewer treatment are applied. The v2 switch and the exact rollback
procedure are recorded in [`v2-switch.md`](./v2-switch.md).

`urinary.v1.glb` and `urinary.v1.manifest.json` are built as a draft: 10 mesh
structures, 5 text-only structures, and 20,364 triangles. The urinary seed is
registered in `anatomy-registry.ts` and imported by `seed-anatomy.ts`; it remains
unpublished (`URINARY_SYSTEM.isPublished` is `false`) and no urinary row is marked
reviewed. See [`urinary-v1-build.md`](./urinary-v1-build.md) for the build record
and [`second-system-audit.md`](./second-system-audit.md) for the readiness audit.

- Live heart release asset: `apps/web/public/models/anatomy/heart.v2.glb`
- Live heart provenance manifest: `apps/web/public/models/anatomy/manifest.json` (identical to `heart.v2.manifest.json`)
- Heart rollback asset: `apps/web/public/models/anatomy/heart.v1.glb`
- Heart v2 provenance manifest: `apps/web/public/models/anatomy/heart.v2.manifest.json`
- Urinary draft asset: `apps/web/public/models/anatomy/urinary.v1.glb`
- Urinary draft manifest: `apps/web/public/models/anatomy/urinary.v1.manifest.json`
- Attribution index: `/attribution/anatomy`
- Heart attribution detail: `/attribution/anatomy/heart`
- Urinary attribution detail: `/attribution/anatomy/urinary`
- Heart source map (committed, sanitised): `apps/web/scripts/anatomy-heart.source.json`
- Urinary source map (committed, sanitised): `apps/web/scripts/anatomy-urinary.source.json`
- Build script (both systems): `apps/web/scripts/build-anatomy-model.mjs`
- Validator (both systems): `apps/web/scripts/validate-anatomy-model.mjs`
- Contract test: `apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts`
- Phase 1 mapping: [`phase-1-source-mapping.md`](./phase-1-source-mapping.md)
- Phase 2 build and change proposals: [`phase-2-build-and-proposals.md`](./phase-2-build-and-proposals.md)
- Urinary mapping: [`urinary-mapping.md`](./urinary-mapping.md)
- Urinary v1 build: [`urinary-v1-build.md`](./urinary-v1-build.md)
- Second-system audit: [`second-system-audit.md`](./second-system-audit.md)
- v2 switch and rollback: [`v2-switch.md`](./v2-switch.md)

## 1. Source dataset

Both official BodyParts3D 4.0 archives were downloaded in full on 2026-10-25.
The server throttled single connections, so the files were fetched with parallel
HTTP range requests. The final sizes match the server's `Content-Length`, and the
SHA-256 values below cover the complete archives.

| Tree | Archive and URL | Bytes | ETag | Last-Modified | SHA-256 | OBJ files |
| --- | --- | ---: | --- | --- | --- | ---: |
| PART-OF | `partof_BP3D_4.0_obj_99.zip`<br><https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip> | 64,888,505 | `"3de1eb9-4dd48e9fe8d00"` | Wed, 22 May 2013 06:45:40 GMT | `9fbc713fffeee924a5a657d9813d84d7eb957bded63adb854931dd5e3eb61c97` | 1,258 |
| IS-A | `isa_BP3D_4.0_obj_99.zip`<br><https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip> | 142,903,898 | `"8848a5a-4dd48ec9df000"` | Wed, 22 May 2013 06:46:24 GMT | `40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e` | 2,234 |

| Field | Value |
| --- | --- |
| Dataset | BodyParts3D 4.0, PART-OF and IS-A trees, 99% polygon reduction |
| Dataset home | <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/> |
| Licence page | <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html> (last updated 2025-02-27) |
| Required credit | BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. |

Integrity is enforced at build time. The source map records each file's archive,
FMA concept, English name, and SHA-256. The build fails if a file is missing, is
read from the wrong labelled archive, has a mismatched header, or has a different
SHA-256. The live v2 asset uses 52 unique files: 42 from PART-OF and 10 from IS-A.

### Licence status

Two licence statements exist for this dataset:

1. The current licence page (last updated 2025-02-27) and the official
   `README_e.html` state: **CC BY 4.0 International**.
2. The header comment inside all 3,492 distributed 4.0 OBJ files (1,258 PART-OF
   and 2,234 IS-A) states: **CC BY-SA 2.1 Japan**.

The official README also links the CC BY 4.0 summary to the CC BY-SA 2.1 Japan
deed. This discrepancy is unresolved. The model is published as a **development
asset**. **Commercial release is blocked** until DBCLS provides written
clarification. Do not describe CC BY 4.0 as the only applicable licence, and do
not remove this caveat without a written record of that clarification.

The exact credits-page, manifest, and GLB metadata wording proposed in
[`phase-2-build-and-proposals.md`](./phase-2-build-and-proposals.md) §3 has
**not** been applied. The live v2 asset and the credits page currently carry the
same interim licence block and required credit as v1, so the caveat above still
applies.

## 2. Selected structures

The live v2 asset has 17 independently selectable mesh nodes. Nine further
structures are text-only and show **“No 3D model”**. Meshes marked with the
same FMA concept come from multiple source OBJ parts and are merged into one node.

| Slug | Mesh name | Archive | Layer | Source files | Triangles | FMA concepts |
| --- | --- | --- | --- | ---: | ---: | --- |
| right-atrium | `right_atrium` | PART-OF | chambers | 2 | 20,028 | FMA11359, FMA9457 |
| right-ventricle | `right_ventricle` | PART-OF | chambers | 4 | 4,336 | FMA9291, FMA7260, FMA7261, FMA7262 |
| left-atrium | `left_atrium` | PART-OF | chambers | 2 | 8,608 | FMA9465, FMA9531 |
| left-ventricle | `left_ventricle` | PART-OF | chambers | 3 | 3,318 | FMA9466, FMA7265, FMA7264 |
| tricuspid-valve | `tricuspid_valve` | PART-OF | valves | 3 | 17,612 | FMA7238, FMA7239, FMA7240 |
| pulmonary-valve | `pulmonary_valve` | PART-OF | valves | 3 | 3,638 | FMA7247, FMA7250, FMA7249 |
| mitral-valve | `mitral_valve` | PART-OF | valves | 2 | 11,378 | FMA7242, FMA7243 |
| aortic-valve | `aortic_valve` | PART-OF | valves | 3 | 2,150 | FMA7253, FMA7254, FMA7252 |
| superior-vena-cava | `superior_vena_cava` | PART-OF | great-vessels | 1 | 598 | FMA4720 |
| inferior-vena-cava | `inferior_vena_cava` | PART-OF | great-vessels | 2 | 3,080 | FMA10951 |
| pulmonary-trunk | `pulmonary_trunk` | PART-OF | great-vessels | 1 | 1,302 | FMA8612 |
| pulmonary-arteries | `pulmonary_arteries` | IS-A | great-vessels | 2 | 6,128 | FMA50872, FMA50873 |
| pulmonary-veins | `pulmonary_veins` | IS-A | great-vessels | 7 | 2,598 | FMA49911, FMA49913, FMA49914, FMA49916 |
| aorta | `aorta` | PART-OF | great-vessels | 2 | 2,686 | FMA3736, FMA87217 |
| aortic-arch | `aortic_arch` | IS-A | great-vessels | 1 | 670 | FMA3768 |
| coronary-arteries | `coronary_arteries` | PART-OF | coronary-circulation | 9 | 10,756 | FMA3802, FMA3855, FMA74912, FMA3895 |
| cardiac-veins | `cardiac_veins` | PART-OF | coronary-circulation | 5 | 3,682 | FMA4706, FMA4707, FMA4713, FMA4714 |

Total: 52 source OBJ files (42 PART-OF + 10 IS-A), 102,568 triangles, 17
selectable nodes, 9 text-only structures.

The per-file source IDs, archive labels, concept IDs, names, triangle counts, and
SHA-256 digests are in `heart.v2.manifest.json`. The build fails if a source
file's header or hash does not match the committed expectation.

### Text-only structures

These nine structures have no independent BodyParts3D 4.0 mesh. No schematic or
substitute mesh is used. The nullable `meshName` field and the **“No 3D model”**
treatment are applied: the viewer keeps the teaching text, search, keyboard tree,
and camera still for these rows.

| Slug | Layer | Why there is no mesh |
| --- | --- | --- |
| `interventricular-septum` | septum | No ventricular-septum concept in either parts list. No separate septum mesh is available; the chamber meshes are not a substitute. |
| `pericardium` | wall-layers | No pericardium concept in either parts list. |
| `endocardium` | wall-layers | No endocardium concept. Only subendocardial layer concepts `FMA84856` and `FMA84857` exist; they are not the endocardium itself. |
| `myocardium` | wall-layers | No whole-myocardium concept. Thirteen regional or partial concepts exist; their element files overlap the papillary-muscle geometry already used by the chamber nodes. |
| `epicardium` | wall-layers | No epicardium concept in either parts list. |
| `sinoatrial-node` | conduction | No sinoatrial node concept in either parts list. |
| `atrioventricular-node` | conduction | No atrioventricular node concept in either parts list. |
| `bundle-of-his` | conduction | No bundle of His or atrioventricular bundle concept in either parts list. |
| `purkinje-fibers` | conduction | No Purkinje fibre concept in either parts list. |

## 3. Coordinate transform

BodyParts3D geometry is in millimetres with a Z-up axis. The pipeline applies:

```text
x' =  x / 1000
y' =  z / 1000
z' = -y / 1000
```

then recentres the combined model on its bounding-box centre. Result is metres,
Y-up, in a right-handed glTF coordinate system. Normals are recomputed after the
transform and centre. Indices use unsigned 16-bit values where a structure has
at most 65,535 vertices, otherwise 32-bit.

The PART-OF and IS-A archives share one coordinate frame. Phase 1 compared all
43 shared v1 files vertex-for-vertex, face-for-face, and by bounds; the geometry
is identical. The SHA-256 values differ only because the headers contain
different `Representation ID` and `Build-up logic` fields.

## 4. Build and validate

The source archives are not committed. Extract them, or place the selected
`FJ*.obj` files in a directory, then run the build.

For the live heart v2 asset, pass one labelled directory per archive so each
file is read from the archive recorded in the source map:

```bash
node apps/web/scripts/build-anatomy-model.mjs --system heart \
  --source-dir "PART-OF=C:\path\to\partof_BP3D_4.0_obj_99" \
  --source-dir "IS-A=C:\path\to\isa_BP3D_4.0_obj_99"
```

That writes `heart.v2.glb` and updates `manifest.json` by default. To regenerate
the separate v2 provenance manifest instead, add:

```bash
node apps/web/scripts/build-anatomy-model.mjs --system heart \
  --source-dir "PART-OF=C:\path\to\partof_BP3D_4.0_obj_99" \
  --source-dir "IS-A=C:\path\to\isa_BP3D_4.0_obj_99" \
  --out apps/web/public/models/anatomy/heart.v2.glb \
  --manifest apps/web/public/models/anatomy/heart.v2.manifest.json
```

Build the urinary draft asset:

```bash
node apps/web/scripts/build-anatomy-model.mjs --system urinary \
  --source-dir "PART-OF=C:\path\to\partof_BP3D_4.0_obj_99" \
  --source-dir "IS-A=C:\path\to\isa_BP3D_4.0_obj_99"
```

Validate the live heart v2 asset (the default system):

```bash
npm run validate:anatomy-model --workspace=apps/web
```

Validate either system explicitly:

```bash
node apps/web/scripts/validate-anatomy-model.mjs --system heart
node apps/web/scripts/validate-anatomy-model.mjs --system urinary
```

The seed-to-model contract test also checks the preserved v1 rollback asset and
its hash, verifies that the live manifest is identical to the v2 provenance
manifest, and checks the urinary draft fixture against its GLB and manifest.

The heart build reads `apps/web/scripts/anatomy-heart.source.json`. The urinary
build reads `apps/web/scripts/anatomy-urinary.source.json`. Both maps are
committed and sanitised; they record the source archives, every file hash, the
text-only rows, and any shared structures.

## 5. Current asset checksums

| Field | v1 (rollback) | v2 (live) |
| --- | ---: | ---: |
| File | `heart.v1.glb` | `heart.v2.glb` |
| Bytes | 1,841,856 | 2,003,856 |
| MiB | 1.76 | 1.91 |
| Triangles | 93,842 | 102,568 |
| Mesh structures | 14 | 17 |
| Text-only structures | 0 | 9 |
| Total structures | 14 | 26 |
| SHA-256 | `e7723082d617b7d9198210200c7c4e82a052e699cec5cdc2faf6c652fc6f0db0` | `b1fac8e02842b40b9cd123e3e896d868254d07b63ed3bc856977d511b879541d` |

The manifests are the source of truth. The live v2 values are also in
`manifest.json` and `heart.v2.manifest.json`; the v1 values are checked by the
contract test against the preserved rollback asset.

## 6. Content review status

All seeded structures have `isReviewed = false`. The written notes cite standard
textbooks and FMA concepts, but no faculty member has signed them off yet.
Change `isReviewed` only after a documented faculty review, and keep the review
record with the content change. The 12 restored rows keep their original
teaching text from git history; the 14 retained rows keep the four valve
`bloodSupply` corrections. No teaching text was rewritten in Phase 2.

## 7. Delivery and performance

Measured on 2026-10-25 from the built assets (Node `zlib`, maximum settings):

| Asset | Raw bytes | Raw MiB | gzip | gzip ratio | Brotli | Brotli ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `heart.v1.glb` | 1,841,856 | 1.76 | 1,521,870 | 82.6% | 1,295,306 | 70.3% |
| `heart.v2.glb` | 2,003,856 | 1.91 | 1,657,284 | 82.7% | 1,411,174 | 70.4% |

The v1 rollback asset has 14 draw calls; the live v2 asset has 17. Both have no
textures, no external buffers, and no runtime decoder. Enable gzip or Brotli for
`.glb` at the static host or CDN; the versioned filenames make long-lived caching
safe.

**Validation gap:** physical-device testing on low-end phones and throttled
connections was not possible in this environment. Before release, test the
viewer on a mid-range Android device and a simulated Slow 3G connection, and
record first-render time and interaction smoothness. The live v2 asset is still
below the 5 MB and 150,000-triangle release limits, but it has not been checked
on a device.

## 8. Reproducibility notes

- The pipeline is deterministic: the same source files and source map produce
  the same GLB bytes and SHA-256.
- The heart source map records a SHA-256 for every one of the 52 files; the
  urinary source map records 12. Both builds verify each hash and fail on a
  mismatch.
- GLB output is uncompressed. The live heart v2 asset is 1.91 MiB and the
  urinary draft is 0.44 MiB, small enough to avoid a decoder dependency.
  Re-evaluate compression if the structure count grows substantially.
- The models ship with no textures and no external buffers.
- Browser caching is handled by the static host; the versioned filenames
  (`heart.v1.glb`, `heart.v2.glb`, `urinary.v1.glb`) make cache busting explicit
  when a model changes.
- The live heart v2 asset is built from the same coordinate frame as v1. If
  either archive is replaced, re-run the Phase 1 geometry comparison before
  rebuilding.

## 9. Urinary draft asset

`urinary.v1.glb` is built and validated but not published. It uses the same
millimetre/Z-up to metre/Y-up transform and centring convention as heart v2, and
records the scale and offset in its manifest. The output frame keeps patient-left
`+X`, and the build verifies four left/right pairs (kidneys, ureters, renal
arteries, renal veins) in both the source and output frames.

| Field | Value |
| --- | ---: |
| File | `urinary.v1.glb` |
| Bytes | 465,208 |
| MiB | 0.4436 |
| Triangles | 20,364 |
| Mesh structures | 10 |
| Text-only structures | 5 |
| Total structures | 15 |
| SHA-256 | `e5d842eebda1a7f208058f563528b0296b88192419ddb412b9a270ff45f9b073` |

The four renal vessels are marked as shared cardiovascular context in the
manifest and in the GLB node extras. The five text-only renal rows have no GLB
node. The full source-file table, transform values, orientation centroids, and
verification results are in [`urinary-v1-build.md`](./urinary-v1-build.md).

## 10. Rollback and remaining work

The v2 switch is applied in this working tree. The exact code and database
rollback procedure is in [`v2-switch.md`](./v2-switch.md). No schema migration or
teaching-text update was needed for the switch: the seed reconcile set the system
`modelUrl` and refreshed derived fields, and all 26 protected teaching-text
hashes matched before and after.

The following work is still open:

- the final licence wording proposed in
  [`phase-2-build-and-proposals.md`](./phase-2-build-and-proposals.md) §3 has not
  been applied; commercial release remains blocked until DBCLS clarifies the
  licence;
- the live v2 asset has not been tested on a physical low-end phone or a
  throttled connection;
- no faculty member has reviewed the teaching text (`isReviewed` is still
  `false` for every row);
- the urinary content remains a draft: it is seeded in local databases but
  `URINARY_SYSTEM.isPublished` is still `false`, and publishing it requires an
  explicit product and faculty-review decision;
- `npm run anatomy:review --workspace=apps/api` can export a read-only faculty
  packet (`--export`), validate a completed packet (`--validate`), and record a
  sign-off or revocation (`--confirm` / `--revoke`). The export and validation
  paths never change teaching text, `isReviewed`, or `isPublished`. The
  sign-off has not been run with `--confirm`; no review has been applied to
  either system;
- the urinary teaching text is a draft and has not been reviewed by faculty.

The switch has not been pushed or deployed from this working tree.
