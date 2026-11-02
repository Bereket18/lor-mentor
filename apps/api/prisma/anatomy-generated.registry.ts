/**
 * Generated Anatomy Lab seed registry.
 *
 * Do not hand-edit; re-run scripts/generate-anatomy-systems.mjs.
 */

import {
  RESPIRATORY_LAYER_ORDER,
  RESPIRATORY_STRUCTURES,
  RESPIRATORY_SYSTEM,
  validateRESPIRATORYSeed,
} from './anatomy-respiratory.data';
import {
  DIGESTIVE_UPPER_LAYER_ORDER,
  DIGESTIVE_UPPER_STRUCTURES,
  DIGESTIVE_UPPER_SYSTEM,
  validateDIGESTIVEUPPERSeed,
} from './anatomy-digestive-upper.data';
import {
  DIGESTIVE_LOWER_LAYER_ORDER,
  DIGESTIVE_LOWER_STRUCTURES,
  DIGESTIVE_LOWER_SYSTEM,
  validateDIGESTIVELOWERSeed,
} from './anatomy-digestive-lower.data';
import {
  DIGESTIVE_LIVER_LAYER_ORDER,
  DIGESTIVE_LIVER_STRUCTURES,
  DIGESTIVE_LIVER_SYSTEM,
  validateDIGESTIVELIVERSeed,
} from './anatomy-digestive-liver.data';
import {
  DIGESTIVE_HEPATOBILIARY_LAYER_ORDER,
  DIGESTIVE_HEPATOBILIARY_STRUCTURES,
  DIGESTIVE_HEPATOBILIARY_SYSTEM,
  validateDIGESTIVEHEPATOBILIARYSeed,
} from './anatomy-digestive-hepatobiliary.data';
import {
  NERVOUS_LEFT_LAYER_ORDER,
  NERVOUS_LEFT_STRUCTURES,
  NERVOUS_LEFT_SYSTEM,
  validateNERVOUSLEFTSeed,
} from './anatomy-nervous-left.data';
import {
  NERVOUS_RIGHT_LAYER_ORDER,
  NERVOUS_RIGHT_STRUCTURES,
  NERVOUS_RIGHT_SYSTEM,
  validateNERVOUSRIGHTSeed,
} from './anatomy-nervous-right.data';
import {
  NERVOUS_CENTRAL_LAYER_ORDER,
  NERVOUS_CENTRAL_STRUCTURES,
  NERVOUS_CENTRAL_SYSTEM,
  validateNERVOUSCENTRALSeed,
} from './anatomy-nervous-central.data';
import {
  SENSORY_EYE_RIGHT_LAYER_ORDER,
  SENSORY_EYE_RIGHT_STRUCTURES,
  SENSORY_EYE_RIGHT_SYSTEM,
  validateSENSORYEYERIGHTSeed,
} from './anatomy-sensory-eye-right.data';
import {
  SENSORY_EYE_LEFT_LAYER_ORDER,
  SENSORY_EYE_LEFT_STRUCTURES,
  SENSORY_EYE_LEFT_SYSTEM,
  validateSENSORYEYELEFTSeed,
} from './anatomy-sensory-eye-left.data';
import {
  SENSORY_EAR_LAYER_ORDER,
  SENSORY_EAR_STRUCTURES,
  SENSORY_EAR_SYSTEM,
  validateSENSORYEARSeed,
} from './anatomy-sensory-ear.data';
import {
  ENDOCRINE_LAYER_ORDER,
  ENDOCRINE_STRUCTURES,
  ENDOCRINE_SYSTEM,
  validateENDOCRINESeed,
} from './anatomy-endocrine.data';
import {
  LYMPHATIC_LAYER_ORDER,
  LYMPHATIC_STRUCTURES,
  LYMPHATIC_SYSTEM,
  validateLYMPHATICSeed,
} from './anatomy-lymphatic.data';
import {
  MALE_REPRODUCTIVE_LAYER_ORDER,
  MALE_REPRODUCTIVE_STRUCTURES,
  MALE_REPRODUCTIVE_SYSTEM,
  validateMALEREPRODUCTIVESeed,
} from './anatomy-male-reproductive.data';
import {
  BODY_SURFACE_UPPER_LAYER_ORDER,
  BODY_SURFACE_UPPER_STRUCTURES,
  BODY_SURFACE_UPPER_SYSTEM,
  validateBODYSURFACEUPPERSeed,
} from './anatomy-body-surface-upper.data';
import {
  BODY_SURFACE_LOWER_LAYER_ORDER,
  BODY_SURFACE_LOWER_STRUCTURES,
  BODY_SURFACE_LOWER_SYSTEM,
  validateBODYSURFACELOWERSeed,
} from './anatomy-body-surface-lower.data';

export const GENERATED_ANATOMY_SEED_REGISTRY = [
  {
    system: RESPIRATORY_SYSTEM,
    structures: RESPIRATORY_STRUCTURES,
    layerOrder: RESPIRATORY_LAYER_ORDER,
    validate: validateRESPIRATORYSeed,
  },
  {
    system: DIGESTIVE_UPPER_SYSTEM,
    structures: DIGESTIVE_UPPER_STRUCTURES,
    layerOrder: DIGESTIVE_UPPER_LAYER_ORDER,
    validate: validateDIGESTIVEUPPERSeed,
  },
  {
    system: DIGESTIVE_LOWER_SYSTEM,
    structures: DIGESTIVE_LOWER_STRUCTURES,
    layerOrder: DIGESTIVE_LOWER_LAYER_ORDER,
    validate: validateDIGESTIVELOWERSeed,
  },
  {
    system: DIGESTIVE_LIVER_SYSTEM,
    structures: DIGESTIVE_LIVER_STRUCTURES,
    layerOrder: DIGESTIVE_LIVER_LAYER_ORDER,
    validate: validateDIGESTIVELIVERSeed,
  },
  {
    system: DIGESTIVE_HEPATOBILIARY_SYSTEM,
    structures: DIGESTIVE_HEPATOBILIARY_STRUCTURES,
    layerOrder: DIGESTIVE_HEPATOBILIARY_LAYER_ORDER,
    validate: validateDIGESTIVEHEPATOBILIARYSeed,
  },
  {
    system: NERVOUS_LEFT_SYSTEM,
    structures: NERVOUS_LEFT_STRUCTURES,
    layerOrder: NERVOUS_LEFT_LAYER_ORDER,
    validate: validateNERVOUSLEFTSeed,
  },
  {
    system: NERVOUS_RIGHT_SYSTEM,
    structures: NERVOUS_RIGHT_STRUCTURES,
    layerOrder: NERVOUS_RIGHT_LAYER_ORDER,
    validate: validateNERVOUSRIGHTSeed,
  },
  {
    system: NERVOUS_CENTRAL_SYSTEM,
    structures: NERVOUS_CENTRAL_STRUCTURES,
    layerOrder: NERVOUS_CENTRAL_LAYER_ORDER,
    validate: validateNERVOUSCENTRALSeed,
  },
  {
    system: SENSORY_EYE_RIGHT_SYSTEM,
    structures: SENSORY_EYE_RIGHT_STRUCTURES,
    layerOrder: SENSORY_EYE_RIGHT_LAYER_ORDER,
    validate: validateSENSORYEYERIGHTSeed,
  },
  {
    system: SENSORY_EYE_LEFT_SYSTEM,
    structures: SENSORY_EYE_LEFT_STRUCTURES,
    layerOrder: SENSORY_EYE_LEFT_LAYER_ORDER,
    validate: validateSENSORYEYELEFTSeed,
  },
  {
    system: SENSORY_EAR_SYSTEM,
    structures: SENSORY_EAR_STRUCTURES,
    layerOrder: SENSORY_EAR_LAYER_ORDER,
    validate: validateSENSORYEARSeed,
  },
  {
    system: ENDOCRINE_SYSTEM,
    structures: ENDOCRINE_STRUCTURES,
    layerOrder: ENDOCRINE_LAYER_ORDER,
    validate: validateENDOCRINESeed,
  },
  {
    system: LYMPHATIC_SYSTEM,
    structures: LYMPHATIC_STRUCTURES,
    layerOrder: LYMPHATIC_LAYER_ORDER,
    validate: validateLYMPHATICSeed,
  },
  {
    system: MALE_REPRODUCTIVE_SYSTEM,
    structures: MALE_REPRODUCTIVE_STRUCTURES,
    layerOrder: MALE_REPRODUCTIVE_LAYER_ORDER,
    validate: validateMALEREPRODUCTIVESeed,
  },
  {
    system: BODY_SURFACE_UPPER_SYSTEM,
    structures: BODY_SURFACE_UPPER_STRUCTURES,
    layerOrder: BODY_SURFACE_UPPER_LAYER_ORDER,
    validate: validateBODYSURFACEUPPERSeed,
  },
  {
    system: BODY_SURFACE_LOWER_SYSTEM,
    structures: BODY_SURFACE_LOWER_STRUCTURES,
    layerOrder: BODY_SURFACE_LOWER_LAYER_ORDER,
    validate: validateBODYSURFACELOWERSeed,
  },
] as const;
