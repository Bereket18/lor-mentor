/**
 * Phase 2 target mapping for heart.v2.
 *
 * This fixture is a proposal artifact. It is not imported by the seed or by
 * the API. It records the approved 26-row mapping so the contract test can
 * check the candidate GLB and manifest before the schema and seed changes are
 * applied. When the seed is promoted to 26 rows, this fixture should become
 * unnecessary; the seed itself will be the source of truth.
 *
 * Seventeen rows have a mesh. The nine text-only rows keep their original
 * teaching text but have no independently selectable BodyParts3D mesh, so they
 * must have `meshName: null` and no GLB node.
 */

export interface HeartV2TargetStructure {
  slug: string;
  meshName: string | null;
  layer: string;
  legacyMeshName?: string;
  textOnlyReason?: string;
}

export const HEART_V2_TARGET_STRUCTURES: HeartV2TargetStructure[] = [
  { slug: 'right-atrium', meshName: 'right_atrium', layer: 'chambers' },
  { slug: 'right-ventricle', meshName: 'right_ventricle', layer: 'chambers' },
  { slug: 'left-atrium', meshName: 'left_atrium', layer: 'chambers' },
  { slug: 'left-ventricle', meshName: 'left_ventricle', layer: 'chambers' },
  {
    slug: 'interventricular-septum',
    meshName: null,
    layer: 'septum',
    legacyMeshName: 'interventricular_septum',
    textOnlyReason:
      'No ventricular-septum concept in either parts list. No separate septum mesh is available; the chamber meshes are not a substitute.',
  },
  { slug: 'tricuspid-valve', meshName: 'tricuspid_valve', layer: 'valves' },
  { slug: 'pulmonary-valve', meshName: 'pulmonary_valve', layer: 'valves' },
  { slug: 'mitral-valve', meshName: 'mitral_valve', layer: 'valves' },
  { slug: 'aortic-valve', meshName: 'aortic_valve', layer: 'valves' },
  {
    slug: 'superior-vena-cava',
    meshName: 'superior_vena_cava',
    layer: 'great-vessels',
  },
  {
    slug: 'inferior-vena-cava',
    meshName: 'inferior_vena_cava',
    layer: 'great-vessels',
  },
  {
    slug: 'pulmonary-trunk',
    meshName: 'pulmonary_trunk',
    layer: 'great-vessels',
  },
  {
    slug: 'pulmonary-arteries',
    meshName: 'pulmonary_arteries',
    layer: 'great-vessels',
  },
  {
    slug: 'pulmonary-veins',
    meshName: 'pulmonary_veins',
    layer: 'great-vessels',
  },
  { slug: 'aorta', meshName: 'aorta', layer: 'great-vessels' },
  { slug: 'aortic-arch', meshName: 'aortic_arch', layer: 'great-vessels' },
  {
    slug: 'coronary-arteries',
    meshName: 'coronary_arteries',
    layer: 'coronary-circulation',
  },
  {
    slug: 'cardiac-veins',
    meshName: 'cardiac_veins',
    layer: 'coronary-circulation',
  },
  {
    slug: 'pericardium',
    meshName: null,
    layer: 'wall-layers',
    legacyMeshName: 'pericardium',
    textOnlyReason: 'No pericardium concept in either parts list.',
  },
  {
    slug: 'endocardium',
    meshName: null,
    layer: 'wall-layers',
    legacyMeshName: 'endocardium',
    textOnlyReason:
      'No endocardium concept. Only subendocardial layer concepts FMA84856/FMA84857 exist, which are not the endocardium itself.',
  },
  {
    slug: 'myocardium',
    meshName: null,
    layer: 'wall-layers',
    legacyMeshName: 'myocardium',
    textOnlyReason:
      'No whole-myocardium concept. Thirteen regional or partial concepts exist; their element files overlap the papillary-muscle geometry already used by the chamber nodes.',
  },
  {
    slug: 'epicardium',
    meshName: null,
    layer: 'wall-layers',
    legacyMeshName: 'epicardium',
    textOnlyReason: 'No epicardium concept in either parts list.',
  },
  {
    slug: 'sinoatrial-node',
    meshName: null,
    layer: 'conduction',
    legacyMeshName: 'sinoatrial_node',
    textOnlyReason: 'No sinoatrial node concept in either parts list.',
  },
  {
    slug: 'atrioventricular-node',
    meshName: null,
    layer: 'conduction',
    legacyMeshName: 'atrioventricular_node',
    textOnlyReason: 'No atrioventricular node concept in either parts list.',
  },
  {
    slug: 'bundle-of-his',
    meshName: null,
    layer: 'conduction',
    legacyMeshName: 'bundle_of_his',
    textOnlyReason:
      'No bundle of His or atrioventricular bundle concept in either parts list.',
  },
  {
    slug: 'purkinje-fibers',
    meshName: null,
    layer: 'conduction',
    legacyMeshName: 'purkinje_fibers',
    textOnlyReason: 'No Purkinje fibre concept in either parts list.',
  },
];

export const HEART_V2_MESH_STRUCTURES = HEART_V2_TARGET_STRUCTURES.filter(
  (structure): structure is HeartV2TargetStructure & { meshName: string } =>
    structure.meshName !== null,
);

export const HEART_V2_TEXT_ONLY_STRUCTURES = HEART_V2_TARGET_STRUCTURES.filter(
  (structure): structure is HeartV2TargetStructure & { meshName: null } =>
    structure.meshName === null,
);
