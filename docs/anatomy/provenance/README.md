# Anatomy Lab — heart model provenance

This directory records where the Anatomy Lab heart model came from, how it was
built, and what is still unresolved. The source archive is deliberately kept
outside the repository.

- Release asset: `apps/web/public/models/anatomy/heart.v1.glb`
- Provenance manifest: `apps/web/public/models/anatomy/manifest.json`
- Source map (committed): `apps/web/scripts/anatomy-heart.source.json`
- Build script: `apps/web/scripts/build-anatomy-model.mjs`
- Validator: `apps/web/scripts/validate-anatomy-model.mjs`
- Contract test: `apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts`

## 1. Source dataset

| Field | Value |
| --- | --- |
| Dataset | BodyParts3D 4.0, PART-OF tree, 99% polygon reduction |
| Archive | `partof_BP3D_4.0_obj_99.zip` |
| URL | <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip> |
| Archive size | 64,888,505 bytes |
| ETag | `"3de1eb9-4dd48e9fe8d00"` |
| Last-Modified | `Wed, 22 May 2013 06:45:40 GMT` |
| Retrieved | 2026-10-24 (HTTP range requests for selected OBJ members) |
| Dataset home | <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/> |
| Licence page | <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html> (last updated 2025-02-27) |
| Required credit | BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. |

The full archive was not downloaded in this environment, so no whole-archive
SHA-256 is recorded. Integrity is enforced at build time: every selected OBJ is
checked against the committed concept ID and English name, and its SHA-256 is
written into `manifest.json`. A mismatched or substituted file fails the build.

### Licence status

The current licence page states **CC BY 4.0**. The header comment inside every
distributed 4.0 OBJ still says:

> The license for this database is specified in the Creative Commons
> Attribution-Share Alike 2.1 Japan.

This discrepancy is unresolved. The model is published as a **development
asset** under the current CC BY 4.0 terms with the required credit.
**Commercial release is blocked** until DBCLS provides written clarification.
Do not remove this caveat without a written record of that clarification.

## 2. Selected structures

Fourteen structures have an independently selectable mesh in this release.
Meshes marked with the same FMA concept come from multiple source OBJ parts and
are merged into one node.

| Slug | Mesh name | Layer | Source files | Triangles | FMA concepts |
| --- | --- | --- | ---: | ---: | --- |
| right-atrium | `right_atrium` | chambers | 2 | 20,028 | FMA11359, FMA9457 |
| right-ventricle | `right_ventricle` | chambers | 4 | 4,336 | FMA9291, FMA7260, FMA7261, FMA7262 |
| left-atrium | `left_atrium` | chambers | 2 | 8,608 | FMA9465, FMA9531 |
| left-ventricle | `left_ventricle` | chambers | 3 | 3,318 | FMA9466, FMA7265, FMA7264 |
| tricuspid-valve | `tricuspid_valve` | valves | 3 | 17,612 | FMA7238, FMA7239, FMA7240 |
| pulmonary-valve | `pulmonary_valve` | valves | 3 | 3,638 | FMA7247, FMA7250, FMA7249 |
| mitral-valve | `mitral_valve` | valves | 2 | 11,378 | FMA7242, FMA7243 |
| aortic-valve | `aortic_valve` | valves | 3 | 2,150 | FMA7253, FMA7254, FMA7252 |
| superior-vena-cava | `superior_vena_cava` | great-vessels | 1 | 598 | FMA4720 |
| inferior-vena-cava | `inferior_vena_cava` | great-vessels | 2 | 3,080 | FMA10951 |
| pulmonary-trunk | `pulmonary_trunk` | great-vessels | 1 | 1,302 | FMA8612 |
| aorta | `aorta` | great-vessels | 3 | 3,356 | FMA3736, FMA3768, FMA87217 |
| coronary-arteries | `coronary_arteries` | coronary-circulation | 9 | 10,756 | FMA3802, FMA3855, FMA74912, FMA3895 |
| cardiac-veins | `cardiac_veins` | coronary-circulation | 5 | 3,682 | FMA4706, FMA4707, FMA4713, FMA4714 |

Total: 43 source OBJ files, 93,842 triangles, 14 selectable nodes.

The per-file source IDs, concept IDs, names, triangle counts, and SHA-256
digests are in `manifest.json`. The build fails if a source file's header does
not match the committed expectation.

## 3. Coordinate transform

BodyParts3D geometry is in millimetres with a Z-up axis. The pipeline applies:

```
x' =  x / 1000
y' =  z / 1000
z' = -y / 1000
```

then recentres the combined model on its bounding-box centre. Result is metres,
Y-up, in a right-handed glTF coordinate system. Normals are recomputed after
the transform and centre. Indices use unsigned 16-bit values where a structure
has at most 65,535 vertices, otherwise 32-bit.

## 4. Build and validate

The source archive is not committed. Extract it, or place the selected
`FJ*.obj` files in a directory, then run:

```bash
node apps/web/scripts/build-anatomy-model.mjs --source-dir <path-to-obj-directory>
node apps/web/scripts/validate-anatomy-model.mjs
```

Or through npm:

```bash
npm run build:anatomy-model --workspace=apps/web -- --source-dir <path>
npm run validate:anatomy-model --workspace=apps/web
```

To re-download only the selected members, use HTTP range requests against the
archive URL and the local-header offsets from the ZIP central directory. The
committed source map is the authority for which members are needed.

## 5. Current asset checksum

| Field | Value |
| --- | --- |
| File | `heart.v1.glb` |
| Bytes | 1,841,176 |
| Triangles | 93,842 |
| Structures | 14 |
| SHA-256 | see `manifest.json` (`model.sha256`) |

The manifest is the source of truth; the value above will change whenever the
asset is rebuilt.

## 6. Deferred structures

These are intentionally **not** in the v1 seed. Do not add them without a
verified, independently selectable mesh and a UI treatment that does not
misrepresent overlapping geometry.

| Structure | Reason deferred |
| --- | --- |
| Interventricular septum | No separate selectable septum mesh was identified in the PART-OF tree used for this release; septal surfaces belong to the chamber meshes. |
| Pericardium | Not available as an independent mesh in the PART-OF selection reviewed. |
| Endocardium, myocardium, epicardium | Wall-layer meshes overlap the chamber meshes. Showing them separately requires an explicit layer/opacity design; merging them would double the surface. |
| Sinoatrial node, atrioventricular node, bundle of His, Purkinje fibres | No independently selectable conduction-system mesh in the PART-OF selection reviewed. |
| Pulmonary arteries and pulmonary veins | Separate source meshes exist but were out of scope for the v1 release. They can be added in a later model version with their own selection nodes. |
| Aortic arch as a separate structure | The arch is already merged into the `aorta` mesh, so it cannot be selected independently without splitting the mesh. |

## 7. Content review status

All seeded structures have `isReviewed = false`. The written notes cite standard
textbooks and FMA concepts, but no faculty member has signed them off yet.
Change `isReviewed` only after a documented faculty review, and keep the review
record with the content change.

## 8. Delivery and performance

Measured on 2026-10-24 from the built asset (Node `zlib`, maximum settings):

| Encoding | Bytes | Size | Ratio |
| --- | ---: | ---: | ---: |
| Raw GLB | 1,841,176 | 1.76 MiB | 100% |
| gzip | 1,521,726 | 1.45 MiB | 82.6% |
| Brotli | 1,294,113 | 1.23 MiB | 70.3% |

The model has 14 draw calls, no textures, no external buffers, and no runtime
decoder. Enable gzip or Brotli for `.glb` at the static host or CDN; the
versioned filename makes long-lived caching safe.

**Validation gap:** physical-device testing on low-end phones and throttled
connections was not possible in this environment. Before release, test the
viewer on a mid-range Android device and a simulated Slow 3G connection, and
record first-render time and interaction smoothness. If the model is expanded
substantially, evaluate meshopt or Draco compression with the corresponding
loader support.

## 9. Reproducibility notes

- The pipeline is deterministic: the same source files produce the same GLB
  bytes and SHA-256.
- GLB output is uncompressed. The asset is 1.76 MiB, small enough to avoid a
  decoder dependency. Re-evaluate compression if the structure count grows.
- The model ships with no textures and no external buffers.
- Browser caching is handled by the static host; the versioned filename
  (`heart.v1.glb`) makes cache busting explicit when the model changes.
