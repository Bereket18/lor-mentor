/**
 * Phase 1 target mapping for urinary.v1.
 *
 * This fixture is a review artifact. It is not imported by the seed or by the
 * API. It records the approved 15-row urinary mapping so the contract test can
 * check the candidate GLB and manifest before the seed is wired in.
 *
 * Ten rows have a mesh. The five text-only renal parts have no independent
 * BodyParts3D mesh, so they must have `meshName: null` and no GLB node.
 */

export interface UrinaryV1TargetStructure {
  slug: string;
  meshName: string | null;
  layer: string;
  laterality: 'left' | 'right' | 'midline' | 'bilateral';
  sharedWith?: string[];
  canonicalOwner?: string;
  textOnlyReason?: string;
}

export const URINARY_V1_TARGET_STRUCTURES: UrinaryV1TargetStructure[] = [
  {
    slug: 'right-kidney',
    meshName: 'right_kidney',
    layer: 'kidneys',
    laterality: 'right',
  },
  {
    slug: 'left-kidney',
    meshName: 'left_kidney',
    layer: 'kidneys',
    laterality: 'left',
  },
  {
    slug: 'right-ureter',
    meshName: 'right_ureter',
    layer: 'ureters',
    laterality: 'right',
  },
  {
    slug: 'left-ureter',
    meshName: 'left_ureter',
    layer: 'ureters',
    laterality: 'left',
  },
  {
    slug: 'urinary-bladder',
    meshName: 'urinary_bladder',
    layer: 'bladder',
    laterality: 'midline',
  },
  {
    slug: 'urethra',
    meshName: 'urethra',
    layer: 'urethra',
    laterality: 'midline',
  },
  {
    slug: 'right-renal-artery',
    meshName: 'right_renal_artery',
    layer: 'renal-vessels',
    laterality: 'right',
    sharedWith: ['cardiovascular'],
    canonicalOwner: 'cardiovascular',
  },
  {
    slug: 'left-renal-artery',
    meshName: 'left_renal_artery',
    layer: 'renal-vessels',
    laterality: 'left',
    sharedWith: ['cardiovascular'],
    canonicalOwner: 'cardiovascular',
  },
  {
    slug: 'right-renal-vein',
    meshName: 'right_renal_vein',
    layer: 'renal-vessels',
    laterality: 'right',
    sharedWith: ['cardiovascular'],
    canonicalOwner: 'cardiovascular',
  },
  {
    slug: 'left-renal-vein',
    meshName: 'left_renal_vein',
    layer: 'renal-vessels',
    laterality: 'left',
    sharedWith: ['cardiovascular'],
    canonicalOwner: 'cardiovascular',
  },
  {
    slug: 'renal-cortex',
    meshName: null,
    layer: 'renal-parts',
    laterality: 'bilateral',
    textOnlyReason:
      'No renal-cortex concept in either parts list or either inclusion-relation list; no independent mesh.',
  },
  {
    slug: 'renal-medulla-and-pyramids',
    meshName: null,
    layer: 'renal-parts',
    laterality: 'bilateral',
    textOnlyReason:
      'No renal-medulla or renal-pyramid concept in either parts list or either inclusion-relation list; no independent mesh.',
  },
  {
    slug: 'renal-papillae',
    meshName: null,
    layer: 'renal-parts',
    laterality: 'bilateral',
    textOnlyReason:
      'No renal-papilla concept in either parts list or either inclusion-relation list; no independent mesh.',
  },
  {
    slug: 'renal-calyces',
    meshName: null,
    layer: 'renal-parts',
    laterality: 'bilateral',
    textOnlyReason:
      'No renal-calyx or renal-calix concept in either parts list or either inclusion-relation list; no independent mesh.',
  },
  {
    slug: 'renal-pelvis',
    meshName: null,
    layer: 'renal-parts',
    laterality: 'bilateral',
    textOnlyReason:
      'No renal-pelvis concept in either parts list or either inclusion-relation list; no independent mesh.',
  },
];

export const URINARY_V1_MESH_STRUCTURES = URINARY_V1_TARGET_STRUCTURES.filter(
  (structure): structure is UrinaryV1TargetStructure & { meshName: string } =>
    structure.meshName !== null,
);

export const URINARY_V1_TEXT_ONLY_STRUCTURES =
  URINARY_V1_TARGET_STRUCTURES.filter(
    (structure): structure is UrinaryV1TargetStructure & { meshName: null } =>
      structure.meshName === null,
  );
