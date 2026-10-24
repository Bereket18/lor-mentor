# Third-party notices

Lor Mentor includes third-party data and open-source software. This file records
the required notices. It is not a substitute for the full licence texts.

## Anatomy model data

### BodyParts3D 4.0

The Anatomy Lab heart model is derived from BodyParts3D 4.0, distributed by the
Database Center for Life Science (DBCLS), Japan.

Required credit:

> BodyParts3D, © The Database Center for Life Science licensed under CC
> Attribution 4.0 International.

- Dataset: BodyParts3D 4.0, PART-OF tree, 99% polygon reduction
  (`partof_BP3D_4.0_obj_99.zip`).
- Source: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>
- Licence page (last updated 27 February 2025):
  <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0),
  <https://creativecommons.org/licenses/by/4.0/>

Modifications: selected a subset of source meshes, merged each structure's
parts into one selectable mesh, converted millimetres/Z-up coordinates to
metres/Y-up, centred the combined model, recomputed normals, and exported a
single GLB. Surface colours are original to Lor Mentor. No source textures are
used. The downloaded archive is not redistributed; only the derived model and
the provenance records are committed.

**Licence discrepancy — commercial use blocked.** The current BodyParts3D
licence page states CC BY 4.0, but the header comments inside the distributed
4.0 OBJ files still reference CC Attribution-Share Alike 2.1 Japan. The model is
published as a development asset under the current CC BY 4.0 terms with the
required credit. Commercial release remains blocked until DBCLS clarifies the
discrepancy in writing. See `docs/anatomy/provenance/README.md`.

### Foundational Model of Anatomy (FMA)

BodyParts3D source files carry FMA concept identifiers. FMA identifiers are used
only for traceability, not reproduced as a dataset. FMA is developed by the
Structural Informatics Group at the University of Washington:
<https://si.washington.edu/projects/fma>.

## Runtime and build dependencies

The following packages are used under their respective licences. Versions are
pinned in `package-lock.json`.

| Package | Licence | Copyright |
| --- | --- | --- |
| Next.js | MIT | © Vercel, Inc. |
| React, React DOM | MIT | © Meta Platforms, Inc. and affiliates |
| three.js | MIT | © 2010-2025 three.js authors |
| @react-three/fiber | MIT | © 2022 Poimandres |
| @react-three/drei | MIT | © 2022 Poimandres |
| NestJS | MIT | © Kamil Myśliwiec |
| Prisma ORM | Apache-2.0 | © Prisma Data, Inc. |
| Tailwind CSS | MIT | © Tailwind Labs, Inc. |
| lucide-react | ISC | © Lucide Contributors |
| framer-motion | MIT | © Framer B.V. |
| Axios | MIT | © Matt Zabriskie and contributors |

Full licence texts are available in `node_modules/<package>/LICENSE` and from
each project's repository. If you redistribute a built copy of the application,
include this file and the licence texts for the dependencies you ship.

## Written content

The anatomy summaries, clinical notes, quizzes, and interface copy in Anatomy
Lab were written for Lor Mentor. They cite standard anatomy textbooks where
relevant. See the attribution page at `/attribution/anatomy` and
`apps/api/prisma/anatomy-heart.data.ts`.

## Questions

If you believe this notice is incomplete or inaccurate, contact the Lor Mentor
maintainers before redistributing the Anatomy Lab assets.
