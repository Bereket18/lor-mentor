/**
 * Anatomy Lab seed — Heart and circulation.
 *
 * This script is intentionally separate from prisma/seed.ts so the core
 * academic seed and the anatomy content can be run independently.
 *
 * Run: npm run db:seed:anatomy
 *
 * Safety rule: create only. Existing systems and structures are never updated,
 * so faculty edits and isReviewed values survive re-seeding.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface AnatomyStructureSeed {
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
}

const HEART_SYSTEM = {
  slug: 'heart',
  name: 'Heart and circulation',
  latinName: 'Systema cardiovasculare',
  description:
    'Explore the chambers, valves, great vessels, wall layers, and conduction system of the heart. This sample is a free preview and is pending faculty review.',
  modelUrl: '/models/anatomy/heart.glb',
  isSample: true,
  isPublished: true,
  sortOrder: 1,
};

// Content is deliberately conservative and educational. Clinical notes point
// to assessment and urgent care where appropriate; they are not diagnostic.
const HEART_STRUCTURES: AnatomyStructureSeed[] = [
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
      'sinoatrial-node',
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
    relatedSlugs: [
      'right-atrium',
      'pulmonary-valve',
      'interventricular-septum',
      'pulmonary-trunk',
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
    relatedSlugs: ['left-ventricle', 'mitral-valve', 'pulmonary-veins'],
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
    relatedSlugs: [
      'left-atrium',
      'aortic-valve',
      'interventricular-septum',
      'aorta',
      'coronary-arteries',
    ],
  },
  {
    slug: 'interventricular-septum',
    name: 'Interventricular septum',
    latinName: 'Septum interventriculare',
    summary:
      'The interventricular septum is the muscular wall between the right and left ventricles.',
    location: 'Between the right and left ventricular cavities.',
    function:
      'Separates ventricular blood and helps the ventricles contract efficiently.',
    bloodSupply:
      'Branches of the left anterior descending artery and right coronary artery.',
    clinicalNotes:
      'Defects in the septum can allow blood to flow between ventricles. Small defects may cause no symptoms; evaluation is by a clinician.',
    meshName: 'interventricular_septum',
    layer: 'septum',
    relatedSlugs: ['right-ventricle', 'left-ventricle', 'bundle-of-his'],
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
    bloodSupply: 'Right coronary artery branches.',
    clinicalNotes:
      'The valve can leak or narrow. Murmurs and symptoms are assessed with examination and echocardiography.',
    meshName: 'tricuspid_valve',
    layer: 'valves',
    relatedSlugs: ['right-atrium', 'right-ventricle'],
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
    bloodSupply: 'Right coronary artery branches.',
    clinicalNotes:
      'Narrowing or leakage can affect flow to the lungs. Diagnosis requires clinical assessment and imaging.',
    meshName: 'pulmonary_valve',
    layer: 'valves',
    relatedSlugs: ['right-ventricle', 'pulmonary-trunk'],
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
    bloodSupply: 'Circumflex artery and branches of the left coronary artery.',
    clinicalNotes:
      'Mitral valve problems can cause breathlessness or fatigue. A clinician confirms the cause with examination and echocardiography.',
    meshName: 'mitral_valve',
    layer: 'valves',
    relatedSlugs: ['left-atrium', 'left-ventricle'],
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
      'The coronary arteries arise just above the valve; the valve itself is supplied by small branches.',
    clinicalNotes:
      'Narrowing or leakage can reduce forward flow. Symptoms such as exertional chest pain or fainting need urgent medical review.',
    meshName: 'aortic_valve',
    layer: 'valves',
    relatedSlugs: ['left-ventricle', 'aorta'],
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
    relatedSlugs: ['right-ventricle', 'pulmonary-valve', 'pulmonary-arteries'],
  },
  {
    slug: 'pulmonary-arteries',
    name: 'Pulmonary arteries',
    latinName: 'Arteriae pulmonales',
    summary:
      'The pulmonary arteries carry oxygen-poor blood from the pulmonary trunk to the lungs.',
    location: 'Between the pulmonary trunk and the lungs.',
    function: 'Distribute blood to the left and right lungs for gas exchange.',
    bloodSupply: 'Small bronchial artery branches supply the vessel walls.',
    clinicalNotes:
      'Pulmonary embolism is a blockage in these vessels and can be life-threatening. Urgent care is needed for sudden symptoms.',
    meshName: 'pulmonary_arteries',
    layer: 'great-vessels',
    relatedSlugs: ['pulmonary-trunk', 'pulmonary-veins'],
  },
  {
    slug: 'pulmonary-veins',
    name: 'Pulmonary veins',
    latinName: 'Venae pulmonales',
    summary:
      'The pulmonary veins carry oxygen-rich blood from the lungs to the left atrium.',
    location: 'Between the lungs and the left atrium.',
    function: 'Return oxygenated blood to the heart.',
    bloodSupply:
      'Small bronchial and pleural branches supply the vessel walls.',
    clinicalNotes:
      'The pulmonary veins are important in some heart rhythm procedures. Their anatomy is mapped before certain treatments.',
    meshName: 'pulmonary_veins',
    layer: 'great-vessels',
    relatedSlugs: ['pulmonary-arteries', 'left-atrium'],
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
    relatedSlugs: [
      'left-ventricle',
      'aortic-valve',
      'aortic-arch',
      'coronary-arteries',
    ],
  },
  {
    slug: 'aortic-arch',
    name: 'Aortic arch',
    latinName: 'Arcus aortae',
    summary: 'The aortic arch is the curved upper part of the aorta.',
    location: 'Upper chest, above the heart.',
    function:
      'Gives rise to branches that supply the head, neck, and upper limbs.',
    bloodSupply: 'Vasa vasorum and small branches.',
    clinicalNotes:
      'The arch gives off the brachiocephalic, left common carotid, and left subclavian arteries. Variants are common and usually harmless.',
    meshName: 'aortic_arch',
    layer: 'great-vessels',
    relatedSlugs: ['aorta'],
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
  },
  {
    slug: 'pericardium',
    name: 'Pericardium',
    latinName: 'Pericardium',
    summary: 'The pericardium is the sac around the heart.',
    location: 'Surrounding the heart and the roots of the great vessels.',
    function:
      'Holds the heart in place, reduces friction, and helps limit sudden overfilling.',
    bloodSupply:
      'Fibrous pericardium receives small mediastinal vessels; serous pericardium receives coronary and mediastinal branches.',
    clinicalNotes:
      'Fluid can build up in the pericardial space. Large collections can compress the heart and require urgent treatment.',
    meshName: 'pericardium',
    layer: 'wall-layers',
    relatedSlugs: ['epicardium', 'myocardium'],
  },
  {
    slug: 'endocardium',
    name: 'Endocardium',
    latinName: 'Endocardium',
    summary:
      'The endocardium is the thin inner lining of the heart chambers and valves.',
    location: 'Inner surface of the heart chambers and valves.',
    function:
      'Provides a smooth lining for blood flow and helps regulate the heart wall.',
    bloodSupply: 'Small branches from the coronary circulation.',
    clinicalNotes:
      'The endocardium can become inflamed in some infections. Fever with a new heart murmur needs medical assessment.',
    meshName: 'endocardium',
    layer: 'wall-layers',
    relatedSlugs: ['myocardium', 'tricuspid-valve', 'mitral-valve'],
  },
  {
    slug: 'myocardium',
    name: 'Myocardium',
    latinName: 'Myocardium',
    summary:
      'The myocardium is the thick middle layer of the heart wall, made of cardiac muscle.',
    location: 'Between the endocardium and epicardium.',
    function: 'Contracts to pump blood.',
    bloodSupply: 'Coronary arteries.',
    clinicalNotes:
      'The myocardium can be injured when its blood supply is reduced. Chest pain or pressure needs urgent evaluation.',
    meshName: 'myocardium',
    layer: 'wall-layers',
    relatedSlugs: ['epicardium', 'endocardium', 'coronary-arteries'],
  },
  {
    slug: 'epicardium',
    name: 'Epicardium',
    latinName: 'Epicardium',
    summary: 'The epicardium is the outer layer of the heart wall.',
    location: 'Outer surface of the heart, beneath the pericardium.',
    function:
      'Protects the heart surface and contains coronary vessels and fat.',
    bloodSupply: 'Coronary arteries.',
    clinicalNotes:
      'The epicardium is involved in pericardial inflammation. Chest pain that worsens when lying flat needs clinical review.',
    meshName: 'epicardium',
    layer: 'wall-layers',
    relatedSlugs: ['pericardium', 'myocardium', 'coronary-arteries'],
  },
  {
    slug: 'sinoatrial-node',
    name: 'Sinoatrial node',
    latinName: 'Nodus sinoatrialis',
    summary: 'The sinoatrial node is the natural pacemaker of the heart.',
    location: 'In the wall of the right atrium near the superior vena cava.',
    function: 'Starts electrical impulses that set the normal heart rhythm.',
    bloodSupply:
      'Sinoatrial nodal artery, usually a branch of the right coronary artery.',
    clinicalNotes:
      'Disease of the node can cause slow heart rhythms. Fainting or persistent dizziness needs medical assessment.',
    meshName: 'sinoatrial_node',
    layer: 'conduction',
    relatedSlugs: ['right-atrium', 'atrioventricular-node'],
  },
  {
    slug: 'atrioventricular-node',
    name: 'Atrioventricular node',
    latinName: 'Nodus atrioventricularis',
    summary:
      'The atrioventricular node is a relay station between the atria and ventricles.',
    location: 'Lower part of the interatrial septum, near the tricuspid valve.',
    function: 'Slows electrical signals before they pass to the ventricles.',
    bloodSupply:
      'Atrioventricular nodal artery, usually from the right coronary artery.',
    clinicalNotes:
      'Blocked signals can cause slow or irregular heart rhythms. Symptoms need clinical assessment.',
    meshName: 'atrioventricular_node',
    layer: 'conduction',
    relatedSlugs: ['sinoatrial-node', 'bundle-of-his'],
  },
  {
    slug: 'bundle-of-his',
    name: 'Bundle of His',
    latinName: 'Fasciculus atrioventricularis',
    summary:
      'The bundle of His carries electrical signals from the atrioventricular node into the ventricles.',
    location: 'Upper interventricular septum.',
    function: 'Conducts impulses to the left and right bundle branches.',
    bloodSupply:
      'Branches of the left anterior descending and right coronary arteries.',
    clinicalNotes:
      'Conduction block can cause slow heart rhythms. Fainting or marked fatigue needs medical review.',
    meshName: 'bundle_of_his',
    layer: 'conduction',
    relatedSlugs: [
      'atrioventricular-node',
      'purkinje-fibers',
      'interventricular-septum',
    ],
  },
  {
    slug: 'purkinje-fibers',
    name: 'Purkinje fibers',
    latinName: 'Rami subendocardiales',
    summary:
      'Purkinje fibers spread electrical signals through the ventricular muscle.',
    location: 'Inner walls of the ventricles.',
    function: 'Help the ventricles contract in a coordinated way.',
    bloodSupply: 'Coronary artery branches.',
    clinicalNotes:
      'Abnormal signals can cause fast or irregular rhythms. Diagnosis requires an ECG and clinical assessment.',
    meshName: 'purkinje_fibers',
    layer: 'conduction',
    relatedSlugs: ['bundle-of-his', 'myocardium'],
  },
];

function validateSeedData() {
  const slugs = new Set(HEART_STRUCTURES.map((structure) => structure.slug));
  if (slugs.size !== HEART_STRUCTURES.length) {
    throw new Error('Heart seed contains duplicate structure slugs.');
  }

  for (const structure of HEART_STRUCTURES) {
    for (const relatedSlug of structure.relatedSlugs) {
      if (!slugs.has(relatedSlug)) {
        throw new Error(
          `Structure "${structure.slug}" references unknown related slug "${relatedSlug}".`,
        );
      }
    }
  }

  if (HEART_STRUCTURES.length < 20) {
    throw new Error('Heart seed must contain at least 20 structures.');
  }
}

async function main() {
  validateSeedData();

  const existingSystem = await prisma.anatomySystem.findUnique({
    where: { slug: HEART_SYSTEM.slug },
    select: { id: true },
  });

  let systemId: string;
  if (existingSystem) {
    systemId = existingSystem.id;
    console.log(
      `Anatomy system "${HEART_SYSTEM.slug}" already exists; leaving it unchanged.`,
    );
  } else {
    const system = await prisma.anatomySystem.create({
      data: HEART_SYSTEM,
      select: { id: true },
    });
    systemId = system.id;
    console.log(`Created anatomy system "${HEART_SYSTEM.slug}".`);
  }

  let created = 0;
  let skipped = 0;

  for (const [index, structure] of HEART_STRUCTURES.entries()) {
    const existingStructure = await prisma.anatomyStructure.findUnique({
      where: {
        systemId_slug: {
          systemId,
          slug: structure.slug,
        },
      },
      select: { id: true },
    });

    if (existingStructure) {
      skipped += 1;
      continue;
    }

    await prisma.anatomyStructure.create({
      data: {
        systemId,
        ...structure,
        sortOrder: index + 1,
        isReviewed: false,
      },
    });
    created += 1;
  }

  const total = await prisma.anatomyStructure.count({
    where: { systemId },
  });

  console.log(
    `Heart seed complete: ${created} created, ${skipped} already existed, ${total} total.`,
  );
}

main()
  .catch((error) => {
    console.error('Anatomy seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
