/**
 * Anatomy Lab seed data — Urinary system.
 *
 * DRAFT teaching text. The source text is an AI-generated draft in
 * docs/anatomy/drafts/urinary-teaching-draft.md and has not been verified
 * against a source. isReviewed stays false until faculty sign-off.
 *
 * Owner decisions applied:
 * - "Renal medulla" and "Renal pyramids" are one text-only row,
 *   "renal-medulla-and-pyramids", using the combined draft text once.
 * - "Renal papillae" is a separate text-only row using the draft text.
 * - Mesh references contain only the FMA identifier from the mapping. The
 *   textbook reference line has been removed.
 * - The four renal-vessel rows use the committed heart vessel wall-supply
 *   convention instead of the draft placeholder.
 *
 * This module is seed data only. The anatomy seed registry imports it; the
 * urinary system stays unpublished until an explicit publish decision.
 */

import type { AnatomyStructureSeed } from './anatomy-heart.data';

// Teaching order for the urinary layer filters. The seed uses this to assign
// sortOrder so the viewer can derive layer order from structure data alone.
export const URINARY_LAYER_ORDER = [
  'kidneys',
  'renal-parts',
  'renal-vessels',
  'ureters',
  'bladder',
  'urethra',
] as const;

export const URINARY_SYSTEM = {
  slug: 'urinary',
  name: 'Urinary system',
  latinName: 'Systema urinarium',
  description:
    'Explore the kidneys, ureters, urinary bladder, urethra, and main renal vessels. This module is a draft pending faculty review and is not published. See the attribution page for BodyParts3D credit and licence details.',
  modelUrl: '/models/anatomy/urinary.v1.glb',
  isSample: false,
  isPublished: false,
  sortOrder: 2,
} as const;

export const URINARY_STRUCTURES: AnatomyStructureSeed[] = [
  {
    slug: 'right-kidney',
    name: 'Right kidney',
    latinName: 'Ren dexter',
    summary:
      'One of two bean-shaped organs that filter the blood and produce urine. It usually sits slightly lower than the left because of the liver above it.',
    location:
      'Retroperitoneal, against the back wall of the abdomen beside the spine, roughly between the T12 and L3 vertebral levels. In front of it lie the liver, the descending part of the duodenum and the right colic flexure. The adrenal gland sits on its upper pole.',
    function:
      'Filters blood plasma to form urine and regulates fluid volume, electrolyte levels and acid-base balance. It also helps control blood pressure through renin, produces erythropoietin, and activates vitamin D.',
    bloodSupply:
      'Supplied by the right renal artery, a branch of the abdominal aorta, which divides into segmental arteries. Blood drains through the right renal vein into the inferior vena cava.',
    clinicalNotes:
      'Kidney stones, infection that ascends to the kidney (pyelonephritis) and chronic kidney disease are common. The lower ribs, surrounding fat and the renal fascia protect the kidney, but flank trauma can still injure it.',
    meshName: 'right_kidney',
    layer: 'kidneys',
    relatedSlugs: [
      'left-kidney',
      'right-ureter',
      'right-renal-artery',
      'right-renal-vein',
      'renal-cortex',
    ],
    references: [
      'FMA:7204 (right kidney). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'left-kidney',
    name: 'Left kidney',
    latinName: 'Ren sinister',
    summary:
      'One of two bean-shaped organs that filter the blood and produce urine. It usually sits slightly higher than the right.',
    location:
      'Retroperitoneal, against the back wall of the abdomen beside the spine, roughly between the T12 and L3 vertebral levels. In front of it lie the stomach, spleen, pancreas and the left colic flexure. The adrenal gland sits on its upper pole.',
    function:
      'Filters blood plasma to form urine and regulates fluid volume, electrolyte levels and acid-base balance. It also helps control blood pressure through renin, produces erythropoietin, and activates vitamin D.',
    bloodSupply:
      'Supplied by the left renal artery, a branch of the abdominal aorta, which divides into segmental arteries. Blood drains through the left renal vein, which crosses in front of the aorta to reach the inferior vena cava.',
    clinicalNotes:
      'Kidney stones, infection that ascends to the kidney (pyelonephritis) and chronic kidney disease are common. The lower ribs, surrounding fat and the renal fascia protect the kidney, but flank trauma can still injure it.',
    meshName: 'left_kidney',
    layer: 'kidneys',
    relatedSlugs: [
      'right-kidney',
      'left-ureter',
      'left-renal-artery',
      'left-renal-vein',
      'renal-cortex',
    ],
    references: [
      'FMA:7205 (left kidney). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'right-ureter',
    name: 'Right ureter',
    latinName: 'Ureter dexter',
    summary:
      'A muscular tube, about 25 cm long, that carries urine from the kidney to the urinary bladder.',
    location:
      'Runs behind the peritoneum down the front of the psoas major muscle, crosses the pelvic brim near the bifurcation of the common iliac artery, then follows the pelvic side wall to enter the back of the bladder at an oblique angle. In males the ductus deferens crosses over it near the bladder. The abdominal part lies close to the inferior vena cava.',
    function:
      'Moves urine by waves of muscular contraction (peristalsis). Its oblique entry into the bladder acts as a one-way valve that limits backflow of urine.',
    bloodSupply:
      'Supplied in segments by nearby arteries: the renal artery (upper part), the gonadal artery or branches of the aorta and common iliac artery (middle part), and branches of the internal iliac artery such as the vesical arteries (lower part).',
    clinicalNotes:
      "Kidney stones tend to lodge at three narrow points: the junction with the renal pelvis, the pelvic brim, and where the ureter enters the bladder. Pain often radiates from the loin to the groin. The ureter's close relations in the pelvis put it at risk during pelvic and colorectal surgery.",
    meshName: 'right_ureter',
    layer: 'ureters',
    relatedSlugs: ['right-kidney', 'left-ureter', 'urinary-bladder'],
    references: [
      'FMA:15571 (right ureter). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'left-ureter',
    name: 'Left ureter',
    latinName: 'Ureter sinister',
    summary:
      'A muscular tube, about 25 cm long, that carries urine from the kidney to the urinary bladder.',
    location:
      'Runs behind the peritoneum down the front of the psoas major muscle, crosses the pelvic brim near the bifurcation of the common iliac artery, then follows the pelvic side wall to enter the back of the bladder at an oblique angle. In males the ductus deferens crosses over it near the bladder. The pelvic part lies behind the sigmoid mesocolon.',
    function:
      'Moves urine by waves of muscular contraction (peristalsis). Its oblique entry into the bladder acts as a one-way valve that limits backflow of urine.',
    bloodSupply:
      'Supplied in segments by nearby arteries: the renal artery (upper part), the gonadal artery or branches of the aorta and common iliac artery (middle part), and branches of the internal iliac artery such as the vesical arteries (lower part).',
    clinicalNotes:
      "Kidney stones tend to lodge at three narrow points: the junction with the renal pelvis, the pelvic brim, and where the ureter enters the bladder. Pain often radiates from the loin to the groin. The ureter's close relations in the pelvis put it at risk during pelvic and colorectal surgery.",
    meshName: 'left_ureter',
    layer: 'ureters',
    relatedSlugs: ['left-kidney', 'right-ureter', 'urinary-bladder'],
    references: [
      'FMA:15572 (left ureter). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'urinary-bladder',
    name: 'Urinary bladder',
    latinName: 'Vesica urinaria',
    summary:
      'A hollow muscular organ that stores urine and expels it during urination.',
    location:
      'In the pelvis behind the pubic symphysis, below the peritoneum when empty. It rises into the lower abdomen as it fills. In the male it lies in front of the rectum, with the prostate below its neck.',
    function:
      'Stores urine at low pressure and contracts its detrusor muscle to empty. Filling and emptying are coordinated by autonomic and somatic nerves.',
    bloodSupply:
      'Superior vesical arteries and, in males, inferior vesical arteries, from the internal iliac artery. Veins drain through the vesical venous plexus to the internal iliac veins.',
    clinicalNotes:
      'Urinary tract infection (cystitis), bladder stones, urinary retention and bladder cancer are important conditions. A full bladder rises above the pubic bone with the peritoneum lifted off its front wall, which allows suprapubic catheterization.',
    meshName: 'urinary_bladder',
    layer: 'bladder',
    relatedSlugs: ['right-ureter', 'left-ureter', 'urethra'],
    references: [
      'FMA:15900 (urinary bladder). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'urethra',
    name: 'Urethra',
    latinName: 'Urethra masculina',
    summary:
      'The tube that carries urine from the bladder to the outside. In males it also carries semen. This description applies to the male reference body.',
    location:
      'Runs from the bladder neck through the prostate (prostatic part), the pelvic floor (membranous part, surrounded by the external urethral sphincter) and the penis (spongy part), ending at the external urethral opening. It is about 18 to 20 cm long.',
    function:
      'Conducts urine during urination and semen during ejaculation. The internal and external sphincters help maintain continence.',
    bloodSupply:
      'The prostatic part is supplied by branches of the inferior vesical and middle rectal arteries; the membranous and spongy parts by branches of the internal pudendal artery.',
    clinicalNotes:
      'Urethral strictures, infection (urethritis) and obstruction from an enlarged prostate are common. Pelvic fractures can injure the membranous part, and straddle injuries can injure the bulbar part of the spongy urethra.',
    meshName: 'urethra',
    layer: 'urethra',
    relatedSlugs: ['urinary-bladder'],
    references: [
      'FMA:19667 (urethra). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'right-renal-artery',
    name: 'Right renal artery',
    latinName: 'Arteria renalis dextra',
    summary:
      'A large paired branch of the abdominal aorta that delivers blood to the kidney. It is usually longer than the left.',
    location:
      'Arises from the abdominal aorta just below the origin of the superior mesenteric artery, at about the L1 to L2 level, and runs to the hilum of the kidney where it divides into segmental branches. It passes behind the inferior vena cava.',
    function:
      'Supplies the kidney with a large share of the cardiac output for filtration.',
    bloodSupply: 'The arterial wall is supplied by small vasa vasorum vessels.',
    clinicalNotes:
      'Renal artery stenosis can cause high blood pressure and kidney damage. Extra (accessory) renal arteries are a common variant that matters in transplant and vascular surgery.',
    meshName: 'right_renal_artery',
    layer: 'renal-vessels',
    relatedSlugs: ['right-kidney', 'left-renal-artery', 'right-renal-vein'],
    references: [
      'FMA:14752 (right renal artery). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'left-renal-artery',
    name: 'Left renal artery',
    latinName: 'Arteria renalis sinistra',
    summary:
      'A large paired branch of the abdominal aorta that delivers blood to the kidney. It is usually shorter than the right.',
    location:
      'Arises from the abdominal aorta just below the origin of the superior mesenteric artery, at about the L1 to L2 level, and runs to the hilum of the kidney where it divides into segmental branches. It passes behind the left renal vein.',
    function:
      'Supplies the kidney with a large share of the cardiac output for filtration.',
    bloodSupply: 'The arterial wall is supplied by small vasa vasorum vessels.',
    clinicalNotes:
      'Renal artery stenosis can cause high blood pressure and kidney damage. Extra (accessory) renal arteries are a common variant that matters in transplant and vascular surgery.',
    meshName: 'left_renal_artery',
    layer: 'renal-vessels',
    relatedSlugs: ['left-kidney', 'right-renal-artery', 'left-renal-vein'],
    references: [
      'FMA:14753 (left renal artery). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'right-renal-vein',
    name: 'Right renal vein',
    latinName: 'Vena renalis dextra',
    summary:
      'A large vein that carries filtered blood from the kidney to the inferior vena cava. It is short.',
    location:
      'Leaves the hilum of the kidney in front of the renal artery and runs to the inferior vena cava. It passes almost directly into the inferior vena cava.',
    function:
      'Returns blood from the kidney to the systemic venous circulation.',
    bloodSupply:
      'Its wall receives small local vessels; it carries venous blood.',
    clinicalNotes:
      'Renal vein thrombosis can occur with some kidney diseases and cancers. The short right vein makes right-sided live donor nephrectomy technically harder.',
    meshName: 'right_renal_vein',
    layer: 'renal-vessels',
    relatedSlugs: ['right-kidney', 'left-renal-vein', 'right-renal-artery'],
    references: [
      'FMA:14335 (right renal vein). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'left-renal-vein',
    name: 'Left renal vein',
    latinName: 'Vena renalis sinistra',
    summary:
      'A large vein that carries filtered blood from the kidney to the inferior vena cava. It is longer than the right.',
    location:
      'Leaves the hilum of the kidney in front of the renal artery and runs to the inferior vena cava. It crosses in front of the abdominal aorta, below the origin of the superior mesenteric artery, and receives the left gonadal vein and the left suprarenal vein.',
    function:
      'Returns blood from the kidney to the systemic venous circulation.',
    bloodSupply:
      'Its wall receives small local vessels; it carries venous blood.',
    clinicalNotes:
      'Renal vein thrombosis can occur with some kidney diseases and cancers. It can be compressed between the superior mesenteric artery and the aorta (nutcracker phenomenon), and the entry of the left gonadal vein is relevant to left-sided varicocele.',
    meshName: 'left_renal_vein',
    layer: 'renal-vessels',
    relatedSlugs: ['left-kidney', 'right-renal-vein', 'left-renal-artery'],
    references: [
      'FMA:14336 (left renal vein). Foundational Model of Anatomy ontology.',
    ],
  },
  {
    slug: 'renal-cortex',
    name: 'Renal cortex',
    latinName: 'Cortex renalis',
    summary: 'The outer layer of kidney tissue beneath the capsule.',
    location:
      'Lies just under the renal capsule and extends between the renal pyramids as the renal columns.',
    function:
      'Contains the renal corpuscles (glomeruli) and convoluted tubules, where blood is filtered and much of the filtrate is reabsorbed.',
    bloodSupply:
      'Interlobular (cortical radiate) arteries, branches of the arcuate arteries.',
    clinicalNotes:
      'Cortical thinning is seen in chronic kidney disease, and scarring can follow repeated infection. Renal cell carcinoma usually arises from tubule cells in the cortex.',
    meshName: null,
    layer: 'renal-parts',
    relatedSlugs: [
      'renal-medulla-and-pyramids',
      'renal-papillae',
      'renal-calyces',
    ],
    references: [
      'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
    ],
  },
  {
    slug: 'renal-medulla-and-pyramids',
    name: 'Renal medulla and pyramids',
    latinName: 'Medulla renalis, Pyramides renales',
    summary:
      'The inner part of the kidney, arranged as cone-shaped renal pyramids.',
    location:
      'Deep to the cortex; the base of each pyramid faces the cortex and its tip points toward a minor calyx.',
    function:
      'Contains the loops of Henle and collecting ducts that concentrate the urine.',
    bloodSupply:
      'Straight arterioles (vasa recta) arising from the arcuate arteries.',
    clinicalNotes:
      'Papillary necrosis and medullary sponge kidney affect this region.',
    meshName: null,
    layer: 'renal-parts',
    relatedSlugs: ['renal-cortex', 'renal-papillae', 'renal-calyces'],
    references: [
      'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
    ],
  },
  {
    slug: 'renal-papillae',
    name: 'Renal papillae',
    latinName: 'Papillae renales',
    summary:
      'The tips of the renal pyramids, where urine leaves the kidney tissue.',
    location: 'At the apex of each pyramid, projecting into a minor calyx.',
    function:
      'Collecting ducts open here and release urine into the minor calyx.',
    bloodSupply:
      'Small branches from the vasa recta and surrounding arterial branches.',
    clinicalNotes:
      'Papillary necrosis can damage the papillae in conditions such as diabetes, sickle cell disease and long-term painkiller misuse.',
    meshName: null,
    layer: 'renal-parts',
    relatedSlugs: [
      'renal-medulla-and-pyramids',
      'renal-calyces',
      'renal-pelvis',
    ],
    references: [
      'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
    ],
  },
  {
    slug: 'renal-calyces',
    name: 'Renal calyces',
    latinName: 'Calyces renales minores et majores',
    summary:
      'Cup-shaped channels that collect urine from the papillae and pass it on to the renal pelvis.',
    location:
      'In the renal sinus. Several minor calyces join to form major calyces, and the major calyces join to form the renal pelvis.',
    function: 'Collect and funnel urine toward the renal pelvis.',
    bloodSupply: 'Small branches of the renal artery within the renal sinus.',
    clinicalNotes:
      'Stones can form or lodge in the calyces. Blunted or dilated calyces on imaging can indicate scarring or obstruction (hydronephrosis).',
    meshName: null,
    layer: 'renal-parts',
    relatedSlugs: ['renal-papillae', 'renal-pelvis'],
    references: [
      'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
    ],
  },
  {
    slug: 'renal-pelvis',
    name: 'Renal pelvis',
    latinName: 'Pelvis renalis',
    summary:
      'A funnel-shaped space that collects urine from the major calyces and drains into the ureter.',
    location:
      'In the renal sinus, behind the renal vessels at the hilum, narrowing into the ureter at the pelviureteric junction.',
    function: 'Collects urine from the calyces and passes it into the ureter.',
    bloodSupply: 'Small branches of the renal artery.',
    clinicalNotes:
      'Obstruction at the pelviureteric junction can cause hydronephrosis. Stones and infection (pyelonephritis) commonly involve the renal pelvis.',
    meshName: null,
    layer: 'renal-parts',
    relatedSlugs: ['renal-calyces', 'right-ureter', 'left-ureter'],
    references: [
      'No independent BodyParts3D 4.0 mesh; this is a text-only entry.',
    ],
  },
];

export function validateUrinarySeed(): void {
  const slugs = new Set(URINARY_STRUCTURES.map((structure) => structure.slug));
  if (slugs.size !== URINARY_STRUCTURES.length) {
    throw new Error('Urinary seed contains duplicate structure slugs.');
  }

  const meshNames = new Set(
    URINARY_STRUCTURES.map((structure) => structure.meshName).filter(
      (name): name is string => name !== null,
    ),
  );
  const meshCount = URINARY_STRUCTURES.filter(
    (structure) => structure.meshName !== null,
  ).length;
  const textOnlyCount = URINARY_STRUCTURES.length - meshCount;

  if (meshNames.size !== meshCount) {
    throw new Error('Urinary seed contains duplicate mesh names.');
  }
  if (
    URINARY_STRUCTURES.length !== 15 ||
    meshCount !== 10 ||
    textOnlyCount !== 5
  ) {
    throw new Error(
      `Urinary seed must contain exactly 15 structures (10 mesh, 5 text-only), found ${URINARY_STRUCTURES.length} (${meshCount} mesh, ${textOnlyCount} text-only).`,
    );
  }

  const TEXT_ONLY_SLUGS = new Set([
    'renal-cortex',
    'renal-medulla-and-pyramids',
    'renal-papillae',
    'renal-calyces',
    'renal-pelvis',
  ]);
  const foundTextOnly = URINARY_STRUCTURES.filter(
    (structure) => structure.meshName === null,
  ).map((structure) => structure.slug);
  if (
    foundTextOnly.length !== TEXT_ONLY_SLUGS.size ||
    foundTextOnly.some((slug) => !TEXT_ONLY_SLUGS.has(slug))
  ) {
    throw new Error(
      `Urinary seed text-only rows do not match the approved set: ${foundTextOnly.join(', ')}.`,
    );
  }

  for (const structure of URINARY_STRUCTURES) {
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
    if (structure.meshName !== null && /[^a-z0-9_]/.test(structure.meshName)) {
      throw new Error(
        `Structure "${structure.slug}" has an invalid mesh name "${structure.meshName}".`,
      );
    }
  }
}
