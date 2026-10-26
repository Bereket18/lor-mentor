# Anatomy Lab models

## Mesh naming rule

Every selectable structure in an Anatomy Lab model must have a glTF node (and
mesh) whose `name` exactly matches the structure's `meshName` in
`apps/api/prisma/anatomy-heart.data.ts`.

- Use the seed spelling exactly, including snake_case. Do not use the
  human-readable `name`, slug, material name, or the FMA concept ID.
- Each `meshName` must appear on exactly one selectable node in the model.
- The viewer resolves a click by calling `scene.getObjectByName(meshName)`, so
  renaming a node during export breaks selection for that structure.
- The node's `extras.layer` must match the seed `layer`. The layer filter uses
  it, and the contract test asserts it.
- If a structure is added to the seed, add a mesh with the same `meshName` to the
  model and bump the model version. Do not reuse a versioned filename for
  different bytes.

## Shipped asset

`heart.v1.glb` is the production heart model. It is generated from the
BodyParts3D 4.0 source archive by a committed pipeline; the archive itself is
not committed.

```bash
node scripts/build-anatomy-model.mjs --source-dir <path-to-extracted-obj-dir>
npm run validate:anatomy-model --workspace=apps/web
```

- `manifest.json` records source files, FMA concepts, triangle counts, and
  SHA-256 digests for the GLB and every source OBJ.
- `apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts` verifies that
  the seed and the asset cannot drift apart.
- Provenance, licence, and deferred-structure records live in
  `docs/anatomy/provenance/README.md`.

## Deprecated placeholder

`heart.glb` is the old low-poly placeholder. It exists only so environments
that have not run the seed reconciliation keep loading something. New
deployments must use `heart.v1.glb`. Delete the placeholder once every
environment has run:

```bash
npm run db:seed:anatomy --workspace=apps/api -- --reconcile --prune-stale
```

after a database backup and a review of the printed stale rows.
