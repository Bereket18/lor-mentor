# Anatomy Lab — third-party model notices

Every Anatomy Lab 3D model is derived from the **BodyParts3D 4.0** dataset. The
credit line below and the licence-status paragraph are the same text the app
renders on its attribution pages
(`apps/web/src/app/attribution/anatomy/page.tsx` and
`.../attribution/anatomy/[slug]/page.tsx`); they are copied here so the notice
travels with the model files themselves.

## Shipped models

| File | Structures | Triangles | SHA-256 |
| --- | ---: | ---: | --- |
| `heart.v2.glb` | 17 mesh + 9 text-only (26 total) | 102,568 | `b1fac8e02842b40b9cd123e3e896d868254d07b63ed3bc856977d511b879541d` |
| `urinary.v1.glb` | 10 mesh + 5 text-only (15 total) | 20,364 | `e5d842eebda1a7f208058f563528b0296b88192419ddb412b9a270ff45f9b073` |

The heart model is the live free preview. The urinary model is an unpublished
teacher-only draft. Both are shipped with the text-only structures listed in
their manifests.

## Required attribution

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

## Licence status

> Which licence applies is being clarified with the Database Center for Life Science (DBCLS). The adapted model file is offered under the same terms as the stricter statement, CC BY-SA 2.1 Japan.

The two statements this status is based on:

- **BodyParts3D licence page (last updated 2025-02-27) and README_e.html:** The license for this database is specified in the Creative Commons Attribution 4.0 International.
- **Header comment in all 3,492 distributed BodyParts3D 4.0 OBJ files:** The license for this database is specified in the Creative Commons Attribution-Share Alike 2.1 Japan.

Licence page: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>

## What we changed

- Selected source OBJ files from the BodyParts3D 4.0 PART-OF and IS-A trees and merged each structure's source parts into one selectable mesh (heart: 52 source files → 17 nodes; urinary: 12 source files → 10 nodes).
- Converted millimetres and the Z-up axis to metres and Y-up, centred the combined model, and recomputed vertex normals.
- Exported one uncompressed GLB per system with stable mesh names. No source colours or textures are used; surface colours are chosen for Lor Mentor.
- Kept structures with no independent BodyParts3D mesh as text-only entries that show "No 3D model" while retaining their teaching text.
- In the urinary model, the four renal vessels are marked `sharedWith: cardiovascular` with `cardiovascular` as canonical owner, so a future whole-body view can avoid drawing them twice.
- Wrote the teaching notes, quizzes, and interface copy for Lor Mentor; these are not copied from BodyParts3D or its documentation.

Full per-file provenance, source archives, and source hashes are in each
model's manifest (`heart` → `manifest.json`, `urinary` →
`urinary.v1.manifest.json`) and in `docs/anatomy/provenance/README.md`.

## Content status

The written anatomy content is pending faculty review. Structures marked
"Pending review" in the viewer have not yet been signed off by a member of
faculty and must not be treated as clinical guidance. The urinary model is an
unpublished draft.

See also the repository's `THIRD_PARTY_NOTICES.md`.
