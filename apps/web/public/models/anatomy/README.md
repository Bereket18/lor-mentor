# Anatomy Lab models

## Mesh naming rule

Every selectable structure in an Anatomy Lab model must have a glTF node (and
mesh) whose `name` exactly matches the structure's `meshName` in
`apps/api/prisma/anatomy-heart.data.ts` or
`apps/api/prisma/anatomy-urinary.data.ts`.

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

## Shipped assets

| System | Live asset | Manifest | Status |
| --- | --- | --- | --- |
| Heart | `heart.v2.glb` | `manifest.json` (identical to `heart.v2.manifest.json`) | Live. `heart.v1.glb` is the verified rollback asset. |
| Urinary | `urinary.v1.glb` | `urinary.v1.manifest.json` | Draft. Registered in `seed-anatomy.ts`; `isPublished` is `false`. |

Both assets are generated from the BodyParts3D 4.0 source archives by the
committed pipeline; the archives themselves are not committed.

## Seeding

The anatomy seed reads `apps/api/prisma/anatomy-registry.ts`, which currently
registers `heart` and `urinary`. The default is create-only for every registered
system. `--system` limits a run to one system:

```bash
npm run db:seed:anatomy --workspace=apps/api
npm run db:seed:anatomy --workspace=apps/api -- --system urinary
npm run db:seed:anatomy --workspace=apps/api -- --reconcile --system heart
npm run db:seed:anatomy --workspace=apps/api -- --reconcile --prune-stale
```

The script prints the full plan before writing. `--reconcile` refreshes system
metadata and the derived citation, sort-order, and related-structure fields. It
never overwrites `name`, `latinName`, `summary`, `location`, `function`,
`bloodSupply`, `clinicalNotes`, `meshName`, or `isReviewed`. `--prune-stale`
refuses to delete faculty-reviewed rows.

```bash
# Heart (live)
node scripts/build-anatomy-model.mjs --system heart \
  --source-dir "PART-OF=<extracted-partof-dir>" \
  --source-dir "IS-A=<extracted-isa-dir>"

# Urinary (draft)
node scripts/build-anatomy-model.mjs --system urinary \
  --source-dir "PART-OF=<extracted-partof-dir>" \
  --source-dir "IS-A=<extracted-isa-dir>"

# Validate either system
node scripts/validate-anatomy-model.mjs --system heart
node scripts/validate-anatomy-model.mjs --system urinary
```

- `--system` selects the checked-in source map:
  `apps/web/scripts/anatomy-heart.source.json` or
  `apps/web/scripts/anatomy-urinary.source.json`.
- Each manifest records source files, FMA concepts, triangle counts, shared
  structures, orientation checks, and SHA-256 digests for the GLB and every
  source OBJ.
- `apps/api/src/modules/anatomy/anatomy-model.contract.spec.ts` verifies that
  each seed fixture and its asset cannot drift apart.
- Heart provenance and licence records live in
  `docs/anatomy/provenance/README.md`. The urinary build record is
  `docs/anatomy/provenance/urinary-v1-build.md`, and the second-system
  readiness audit is `docs/anatomy/provenance/second-system-audit.md`.

## Deprecated placeholder

`heart.glb` is the old low-poly placeholder. It exists only so environments
that have not run the seed reconciliation keep loading something. New
deployments must use `heart.v2.glb`. Delete the placeholder once every
environment has run:

```bash
npm run db:seed:anatomy --workspace=apps/api -- --reconcile --prune-stale
```

after a database backup and a review of the printed stale rows.
