/**
 * Anatomy Lab seed data — Heart and circulation.
 *
 * This module is the single source of truth for the heart system and its
 * selectable structures. It is imported by the seed script and by the
 * seed-to-model contract test, which verifies that every `meshName` here
 * exists exactly once in the shipped GLB.
 *
 * Scope rule: a structure is included only when the BodyParts3D source has a
 * mesh that represents that structure on its own. Deferred structures are
 * listed in docs/anatomy/provenance/README.md. Do not add a structure without
 * a verified source mesh.
 *
 * Content rule: summaries are original teaching text. `references` record the
 * FMA concepts used for the mesh and the textbook sources used for the notes.
 * `isReviewed` stays false until a faculty member signs the content off.
 */

export interface AnatomyStructureSeed {
  slug: string;
  name: string;
  latinName: string;
  summary: string;
  location: string;
  function: string;
  bloodSupply: string;
  clinicalNotes: string;
  meshName: string;
  layer: string;
  relatedSlugs: string[];
  references: string[];
}

export const HEART_SYSTEM = {
  slug: 'heart',
  name: 'Heart and circulation',
  latinName: 'Systema cardiovasculare',
  description:
    'Explore the chambers, valves, great vessels, and coronary circulation of the heart. This sample is a free preview and is pending faculty review. Model geometry is derived from BodyParts3D 4.0; see the attribution page for credit and licence details.',
  modelUrl: '/models/anatomy/heart.v1.glb',
  isSample: true,
  isPublished: true,
  sortOrder: 1,
} as const;

// Content is deliberately conservative and educational. Clinical notes point
// to assessment and urgent care where appropriate; they are not diagnostic.
export const HEART_STRUCTURES: AnatomyStructureSeed[] = [
  {
    slug: 'right-atrium',
    name: 'Right atrium',
    latinName: 'Atrium dextrum',
    summary:
      'The right atrium is the upper right chamber. It receives oxygen-poor blood from the body and passes it to the right ventricle.',
    location: 'Upper right side of the heart, above the right ventricle.',
    function:
      'Collects blood from the superior and inferior venae cavae and moves it through the tricuspid valve.',
    bloodSupply:
      'Right coronary artery branches, including the sinoatrial nodal artery in most people.',
    clinicalNotes:
      'The right atrium contains the sinoatrial node and receives the venae cavae. Enlargement or pressure changes can occur in several conditions and are interpreted with clinical context.',
    meshName: 'right_atrium',
    layer: 'chambers',
    relatedSlugs: [
      'right-ventricle',
      'tricuspid-valve',
      'superior-vena-cava',
      'inferior-vena-cava',
    ],
    references: [
      'FMA:11359 (cavity of right atrium) and FMA:9457 (wall of right atrium). Foundational Model of Anatomy ontology.',
      "Drake RL, Vogl AW, Mitchell AWM. Gray's Anatomy for Students. 4th ed. Elsevier; 2020. Chapter 3, Thorax: the heart.",
    ],
  },
  {
    slug: 'right-ventricle',
    name: 'Right ventricle',
    latinName: 'Ventriculus dexter',
    summary:
      'The right ventricle is the lower right chamber. It pumps oxygen-poor blood to the lungs through the pulmonary valve.',
    location: 'Lower right side of the heart, below the right atrium.',
    function:
      'Contracts to push blood into the pulmonary trunk and pulmonary arteries.',
    bloodSupply:
      'Right coronary artery, with additional supply from the left coronary artery in some people.',
    clinicalNotes:
      'The right ventricle normally pumps against low pressure. Increased lung resistance can strain it over time and is assessed by a clinician.',
    meshName: 'right_ventricle',
    layer: 'chambers',
    relatedSlugs: ['right-atrium', 'pulmonary-valve', 'pulmonary-trunk'],
    references: [
      'FMA:9291 (cavity of right ventricle) with FMA:7260, FMA:7261, and FMA:7262 (papillary muscles). Foundational Model of Anatomy ontology.',
      "Drake RL, Vogl AW, Mitchell AWM. Gray's Anatomy for Students. 4th ed. Elsevier; 2020. Chapter 3, Thorax: the heart.",
    ],
  },
  {
    slug: 'left-atrium',
    name: 'Left atrium',
    latinName: 'Atrium sinistrum',
    summary:
      'The left atrium is the upper left chamber. It receives oxygen-rich blood from the lungs and passes it to the left ventricle.',
    location: 'Upper left side of the heart, behind the right atrium.',
    function:
      'Collects blood from the pulmonary veins and moves it through the mitral valve.',
    bloodSupply: 'Branches of the circumflex artery and right coronary artery.',
    clinicalNotes:
      'The left atrium is a common site for abnormal heart rhythms in some conditions. Symptoms need clinical assessment.',
    meshName: 'left_atrium',
    layer: 'chambers',
    relatedSlugs: ['left-ventricle', 'mitral-valve'],
    references: [
      'FMA:9465 (cavity of left atrium) and FMA:9531 (wall of left atrium). Foundational Model of Anatomy ontology.',
      "Drake RL, Vogl AW, Mitchell AWM. Gray's Anatomy for Students. 4th ed. Elsevier; 2020. Chapter 3, Thorax: the heart.",
    ],
  },
  {
    slug: 'left-ventricle',
    name: 'Left ventricle',
    latinName: 'Ventriculus sinister',
    summary:
      'The left ventricle is the lower left chamber. It pumps oxygen-rich blood into the aorta and out to the body.',
    location: 'Lower left side of the heart, below the left atrium.',
    function: 'Contracts forcefully to maintain blood flow to the body.',
    bloodSupply:
      'Left anterior descending and circumflex arteries, usually branches of the left coronary artery.',
    clinicalNotes:
      'The left ventricle has a thicker muscular wall because it pumps against systemic pressure. Its function is measured with imaging and other tests.',
    meshName: 'left_ventricle',
    layer: 'chambers',
    relatedSlugs: ['left-atrium', 'aortic-valve', 'aorta', 'coronary-arteries'],
    references: [
      'FMA:9466 (cavity of left ventricle) with FMA:7264 and FMA:7265 (papillary muscle). Foundational Model of Anatomy ontology.',
      "Drake RL, Vogl AW, Mitchell AWM. Gray's Anatomy for Students. 4th ed. Elsevier; 2020. Chapter 3, Thorax: the heart.",
    ],
  },
  {
    slug: 'tricuspid-valve',
    name: 'Tricuspid valve',
    latinName: 'Valva tricuspidalis',
    summary:
      'The tricuspid valve sits between the right atrium and right ventricle.',
    location:
      'Right side of the heart, between the right atrium and right ventricle.',
    function:
      'Opens to let blood enter the right ventricle and closes to prevent backflow.',
    bloodSupply:
      'Leaflets are largely avascular and nourished by diffusion; only the valve ring receives small branches from nearby coronary arteries.',
    clinicalNotes:
      'The valve can leak or narrow. Murmurs and symptoms are assessed with examination and echocardiography.',
    meshName: 'tricuspid_valve',
    layer: 'valves',
    relatedSlugs: ['right-atrium', 'right-ventricle'],
    references: [
      'FMA:7238, FMA:7239, and FMA:7240 (anterior, posterior, and septal leaflets). Foundational Model of Anatomy ontology.',
      "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    ],
  },
  {
    slug: 'pulmonary-valve',
    name: 'Pulmonary valve',
    latinName: 'Valva pulmonaria',
    summary:
      'The pulmonary valve sits between the right ventricle and pulmonary trunk.',
    location: 'Exit of the right ventricle.',
    function:
      'Opens when the right ventricle contracts and closes to prevent blood returning to the ventricle.',
    bloodSupply:
      'Leaflets are largely avascular and nourished by diffusion; only the valve ring receives small branches from nearby coronary arteries.',
    clinicalNotes:
      'Narrowing or leakage can affect flow to the lungs. Diagnosis requires clinical assessment and imaging.',
    meshName: 'pulmonary_valve',
    layer: 'valves',
    relatedSlugs: ['right-ventricle', 'pulmonary-trunk'],
    references: [
      'FMA:7247, FMA:7249, and FMA:7250 (cusps of the pulmonary valve). Foundational Model of Anatomy ontology.',
      "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    ],
  },
  {
    slug: 'mitral-valve',
    name: 'Mitral valve',
    latinName: 'Valva mitralis',
    summary:
      'The mitral valve sits between the left atrium and left ventricle.',
    location:
      'Left side of the heart, between the left atrium and left ventricle.',
    function:
      'Lets oxygen-rich blood enter the left ventricle and closes to prevent backflow.',
    bloodSupply:
      'Leaflets are largely avascular and nourished by diffusion; only the valve ring receives small branches from nearby coronary arteries.',
    clinicalNotes:
      'Mitral valve problems can cause breathlessness or fatigue. A clinician confirms the cause with examination and echocardiography.',
    meshName: 'mitral_valve',
    layer: 'valves',
    relatedSlugs: ['left-atrium', 'left-ventricle'],
    references: [
      'FMA:7242 and FMA:7243 (anterior and posterior leaflets). Foundational Model of Anatomy ontology.',
      "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    ],
  },
  {
    slug: 'aortic-valve',
    name: 'Aortic valve',
    latinName: 'Valva aortae',
    summary: 'The aortic valve sits between the left ventricle and the aorta.',
    location: 'Exit of the left ventricle.',
    function:
      'Opens during ventricular contraction and closes to keep blood from flowing back into the heart.',
    bloodSupply:
      'Leaflets are largely avascular and nourished by diffusion; only the valve ring receives small branches from nearby coronary arteries.',
    clinicalNotes:
      'Narrowing or leakage can reduce forward flow. Symptoms such as exertional chest pain or fainting need urgent medical review.',
    meshName: 'aortic_valve',
    layer: 'valves',
    relatedSlugs: ['left-ventricle', 'aorta', 'coronary-arteries'],
    references: [
      'FMA:7253, FMA:7254, and FMA:7252 (cusps of the aortic valve). Foundational Model of Anatomy ontology.',
      "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    ],
  },
  {
    slug: 'superior-vena-cava',
    name: 'Superior vena cava',
    latinName: 'Vena cava superior',
    summary:
      'The superior vena cava is a large vein that returns oxygen-poor blood from the head, neck, and upper limbs to the right atrium.',
    location: 'Upper right side of the heart, entering the right atrium.',
    function: 'Drains venous blood from the upper body into the right atrium.',
    bloodSupply:
      'Its wall receives small local vessels; it carries venous blood.',
    clinicalNotes:
      'Compression or blockage can cause facial swelling and prominent chest veins. These signs need clinical assessment.',
    meshName: 'superior_vena_cava',
    layer: 'great-vessels',
    relatedSlugs: ['right-atrium'],
    references: [
      'FMA:4720 (superior vena cava). Foundational Model of Anatomy ontology.',
      "Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Wolters Kluwer; 2018. Chapter 1, Thorax.",
    ],
  },
  {
    slug: 'inferior-vena-cava',
    name: 'Inferior vena cava',
    latinName: 'Vena cava inferior',
    summary:
      'The inferior vena cava is a large vein that returns oxygen-poor blood from the lower body to the right atrium.',
    location: 'Lower right side of the heart, entering the right atrium.',
    function:
      'Drains venous blood from the abdomen, pelvis, and lower limbs into the right atrium.',
    bloodSupply:
      'Its wall receives small local vessels; it carries venous blood.',
    clinicalNotes:
      'Blockage or raised pressure in the inferior vena cava can cause leg swelling. The cause is assessed by a clinician.',
    meshName: 'inferior_vena_cava',
    layer: 'great-vessels',
    relatedSlugs: ['right-atrium'],
    references: [
      'FMA:10951 (inferior vena cava). Foundational Model of Anatomy ontology.',
      "Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Wolters Kluwer; 2018. Chapter 1, Thorax.",
    ],
  },
  {
    slug: 'pulmonary-trunk',
    name: 'Pulmonary trunk',
    latinName: 'Truncus pulmonalis',
    summary:
      'The pulmonary trunk is the large vessel that carries oxygen-poor blood from the right ventricle toward the lungs.',
    location:
      'Upper part of the right ventricle, before it divides into the pulmonary arteries.',
    function: 'Delivers blood to the left and right pulmonary arteries.',
    bloodSupply:
      'Small branches from the coronary arteries and nearby vessels.',
    clinicalNotes:
      'A clot in the pulmonary circulation can be serious. Sudden breathlessness or chest pain needs urgent medical help.',
    meshName: 'pulmonary_trunk',
    layer: 'great-vessels',
    relatedSlugs: ['right-ventricle', 'pulmonary-valve'],
    references: [
      'FMA:8612 (pulmonary trunk). Foundational Model of Anatomy ontology.',
      "Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Wolters Kluwer; 2018. Chapter 1, Thorax.",
    ],
  },
  {
    slug: 'aorta',
    name: 'Aorta',
    latinName: 'Aorta',
    summary:
      'The aorta is the main artery that carries oxygen-rich blood from the left ventricle to the body.',
    location:
      'Central chest, arching upward and then downward behind the heart.',
    function: 'Distributes blood to the body through its branches.',
    bloodSupply: 'The aortic wall is supplied by small vasa vasorum vessels.',
    clinicalNotes:
      'Aortic enlargement or tears can be emergencies. Sudden severe chest or back pain needs urgent medical attention.',
    meshName: 'aorta',
    layer: 'great-vessels',
    relatedSlugs: ['left-ventricle', 'aortic-valve', 'coronary-arteries'],
    references: [
      'FMA:3736 (ascending aorta), FMA:3768 (arch of aorta), and FMA:87217 (descending thoracic aorta). Foundational Model of Anatomy ontology.',
      "Moore KL, Dalley AF, Agur AMR. Clinically Oriented Anatomy. 8th ed. Wolters Kluwer; 2018. Chapter 1, Thorax.",
    ],
  },
  {
    slug: 'coronary-arteries',
    name: 'Coronary arteries',
    latinName: 'Arteriae coronariae',
    summary: 'The coronary arteries supply blood to the heart muscle itself.',
    location: 'On the surface of the heart, arising from the aortic root.',
    function: 'Deliver oxygen and nutrients to the myocardium.',
    bloodSupply:
      'They are the supply vessels themselves; small branches penetrate the muscle.',
    clinicalNotes:
      'Narrowing can cause chest pain or heart attack. Sudden chest pain, breathlessness, or nausea needs urgent medical help.',
    meshName: 'coronary_arteries',
    layer: 'coronary-circulation',
    relatedSlugs: ['left-ventricle', 'aorta', 'cardiac-veins'],
    references: [
      'FMA:3802 (right coronary trunk), FMA:3855 (left coronary trunk), FMA:74912 (anterior interventricular trunk), and FMA:3895 (circumflex branch). Foundational Model of Anatomy ontology.',
      "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    ],
  },
  {
    slug: 'cardiac-veins',
    name: 'Cardiac veins',
    latinName: 'Venae cardiacae',
    summary:
      'The cardiac veins collect oxygen-poor blood from the heart muscle and return it to the right atrium.',
    location: 'On the surface of the heart, draining into the coronary sinus.',
    function: 'Drain venous blood from the myocardium.',
    bloodSupply:
      'They carry venous blood; their walls receive small local branches.',
    clinicalNotes:
      'The coronary sinus is a common route for some heart procedures. Its anatomy is checked before those procedures.',
    meshName: 'cardiac_veins',
    layer: 'coronary-circulation',
    relatedSlugs: ['coronary-arteries', 'right-atrium'],
    references: [
      'FMA:4706 (coronary sinus), FMA:4707 (great cardiac vein), FMA:4713 (middle cardiac vein), and FMA:4714 (small cardiac vein). Foundational Model of Anatomy ontology.',
      "Standring S, ed. Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Elsevier; 2020. Section 6, Thorax: heart and mediastinum.",
    ],
  },
];

export function validateHeartSeed(): void {
  const slugs = new Set(HEART_STRUCTURES.map((structure) => structure.slug));
  if (slugs.size !== HEART_STRUCTURES.length) {
    throw new Error('Heart seed contains duplicate structure slugs.');
  }

  const meshNames = new Set(
    HEART_STRUCTURES.map((structure) => structure.meshName),
  );
  if (meshNames.size !== HEART_STRUCTURES.length) {
    throw new Error('Heart seed contains duplicate mesh names.');
  }

  for (const structure of HEART_STRUCTURES) {
    for (const relatedSlug of structure.relatedSlugs) {
      if (!slugs.has(relatedSlug)) {
        throw new Error(
          `Structure "${structure.slug}" references unknown related slug "${relatedSlug}".`,
        );
      }
    }
    if (structure.references.length === 0) {
      throw new Error(`Structure "${structure.slug}" has no references.`);
    }
    if (/[^a-z0-9_]/.test(structure.meshName)) {
      throw new Error(
        `Structure "${structure.slug}" has an invalid mesh name "${structure.meshName}".`,
      );
    }
  }

  // The heart release is deliberately limited to the verified, selectable
  // structures. Changing this number requires a model rebuild and review.
  if (HEART_STRUCTURES.length !== 14) {
    throw new Error(
      `Heart seed must contain exactly 14 structures, found ${HEART_STRUCTURES.length}.`,
    );
  }
}
