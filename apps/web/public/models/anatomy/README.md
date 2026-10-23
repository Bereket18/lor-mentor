# Anatomy Lab models

## Mesh naming rule

Every selectable structure in an Anatomy Lab model must have a glTF node (and
mesh) whose `name` exactly matches the structure's `meshName` in
`apps/api/prisma/seed-anatomy.ts`.

- Use the seed spelling exactly, including snake_case. Do not use the
  human-readable `name`, slug, or material name.
- Each `meshName` must appear on exactly one selectable node in the model.
- The viewer resolves a click by calling `scene.getObjectByName(meshName)`, so
  renaming a node during export breaks selection for that structure.
- If a structure is added to the seed, add a mesh with the same `meshName` to the
  model and regenerate or update the asset.

## Placeholder model

`heart.glb` is generated from a committed script:

```bash
npm run generate:anatomy-model --workspace=apps/web
```

The script reads `meshName` values directly from
`apps/api/prisma/seed-anatomy.ts` and creates one low-poly, selectable sphere per
structure. It is intentionally a placeholder; replace it with the production
heart model while preserving the names above.

The placeholder layout is a compact grid so every mesh can be inspected. The
real asset may use any geometry, materials, and hierarchy as long as the
selectable node names follow the rule.
