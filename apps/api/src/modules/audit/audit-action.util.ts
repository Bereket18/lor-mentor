export interface AuditDescriptor {
  action: string;
  label: string;
  entityType: string;
  category: string;
}

interface EntityDefinition {
  entityType: string;
  noun: string;
  category: string;
}

const CONTROLLERS: Record<string, EntityDefinition> = {
  Users: { entityType: 'User', noun: 'user', category: 'Users' },
  Departments: {
    entityType: 'Department',
    noun: 'department',
    category: 'Academic',
  },
  AcademicYears: {
    entityType: 'AcademicYear',
    noun: 'academic year',
    category: 'Academic',
  },
  Semesters: {
    entityType: 'Semester',
    noun: 'semester',
    category: 'Academic',
  },
  Courses: { entityType: 'Course', noun: 'course', category: 'Academic' },
  Materials: {
    entityType: 'Material',
    noun: 'material',
    category: 'Academic',
  },
  Plans: { entityType: 'Plan', noun: 'plan', category: 'Billing' },
  Payments: {
    entityType: 'Payment',
    noun: 'payment',
    category: 'Billing',
  },
  Forum: { entityType: 'Forum', noun: 'forum', category: 'Moderation' },
};

const VERBS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  remove: 'Removed',
  archive: 'Archived',
  restore: 'Restored',
  createUser: 'Created',
  deleteUser: 'Deleted',
  changeRole: 'Changed role for',
  changeStatus: 'Changed status of',
  assignDepartment: 'Changed program for',
  deleteInactive: 'Deleted inactive',
  resolveReport: 'Resolved',
  removePost: 'Deleted',
  removeReply: 'Deleted',
  regenerateAi: 'Regenerated AI content for',
  upload: 'Uploaded',
  createYoutube: 'Added YouTube',
  addBank: 'Added',
  updateBank: 'Updated',
  setBankAccount: 'Updated',
  clearBankAccount: 'Cleared',
  removeBank: 'Removed',
  getReceipt: 'Viewed',
};

/**
 * Full labels for handlers whose natural-sounding phrasing does not fall out of
 * the generic "verb + entity" rule.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  'Users.createUser': 'Created user',
  'Users.deleteInactive': 'Deleted inactive users',
  'Users.changeRole': 'Changed user role',
  'Users.deleteUser': 'Deleted user',
  'Users.assignDepartment': 'Changed program assignment',
  'Users.changeStatus': 'Changed account status',
  'Departments.create': 'Created department',
  'Departments.update': 'Updated department',
  'Departments.archive': 'Archived department',
  'Departments.restore': 'Restored department',
  'AcademicYears.create': 'Created academic year',
  'AcademicYears.update': 'Updated academic year',
  'AcademicYears.archive': 'Archived academic year',
  'Semesters.create': 'Created semester',
  'Semesters.update': 'Updated semester',
  'Semesters.archive': 'Archived semester',
  'Courses.create': 'Created course',
  'Courses.update': 'Updated course',
  'Courses.archive': 'Archived course',
  'Materials.regenerateAi': 'Regenerated AI content',
  'Materials.uploadFile': 'Uploaded material',
  'Materials.createYoutube': 'Added YouTube material',
  'Materials.update': 'Updated material',
  'Materials.remove': 'Removed material',
  'Plans.create': 'Created plan',
  'Plans.update': 'Updated plan',
  'Payments.addBank': 'Added accepted bank',
  'Payments.updateBank': 'Updated accepted bank',
  'Payments.setBankAccount': 'Updated bank account',
  'Payments.clearBankAccount': 'Cleared bank account',
  'Payments.removeBank': 'Removed accepted bank',
  'Payments.getReceipt': 'Viewed payment receipt',
  'Payments.getDocument': 'Downloaded payment receipt',
  'Forum.resolveReport': 'Resolved forum report',
  'Forum.removePost': 'Deleted forum post',
  'Forum.removeReply': 'Deleted forum reply',
};

const LEGACY_LABELS: Record<string, string> = {
  USER_ACTIVATED: 'User activated',
  USER_DEACTIVATED: 'User deactivated',
  AUTH_LOGIN_FAILED: 'Login failed',
  AUTH_ACCOUNT_LOCKED: 'Account locked after repeated login failures',
  PAYMENT_APPROVED: 'Payment approved',
  PAYMENT_REJECTED: 'Payment rejected',
  PAYMENT_REVERSED: 'Payment reversed',
  ANATOMY_STRUCTURE_UPDATE: 'Anatomy structure edited',
  ANATOMY_STRUCTURE_REVIEW: 'Anatomy structure reviewed',
  ANATOMY_STRUCTURE_REVOKE: 'Anatomy review revoked',
  ANATOMY_SYSTEM_REVIEW: 'Anatomy system reviewed',
  ANATOMY_REVIEWER_GRANT: 'Anatomy reviewer access granted',
  ANATOMY_REVIEWER_REVOKE: 'Anatomy reviewer access revoked',
};

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function humanizeEntityType(value: string): string {
  const words = humanizeIdentifier(value).split(' ').filter(Boolean);
  if (!words.length) return value;
  return words
    .map((word, index) => (index === 0 ? capitalize(word) : word))
    .join(' ');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function entityForAction(
  controllerName: string,
  handlerName: string,
): EntityDefinition {
  if (
    controllerName === 'Payments' &&
    [
      'addBank',
      'updateBank',
      'removeBank',
      'setBankAccount',
      'clearBankAccount',
    ].includes(handlerName)
  ) {
    return {
      entityType: 'PaymentBank',
      noun: ['setBankAccount', 'clearBankAccount'].includes(handlerName)
        ? 'bank account'
        : 'accepted bank',
      category: 'Billing',
    };
  }

  if (controllerName === 'Forum') {
    if (handlerName === 'resolveReport') {
      return {
        entityType: 'ForumReport',
        noun: 'forum report',
        category: 'Moderation',
      };
    }
    if (handlerName === 'removePost' || handlerName === 'createPost') {
      return {
        entityType: 'ForumPost',
        noun: 'forum post',
        category: 'Moderation',
      };
    }
    if (handlerName === 'removeReply' || handlerName === 'createReply') {
      return {
        entityType: 'ForumReply',
        noun: 'forum reply',
        category: 'Moderation',
      };
    }
  }

  return (
    CONTROLLERS[controllerName] ?? {
      entityType: controllerName,
      noun: humanizeIdentifier(controllerName),
      category: 'System',
    }
  );
}

function verbForHandler(handlerName: string): string {
  return VERBS[handlerName] ?? capitalize(humanizeIdentifier(handlerName));
}

export function describeAuditEvent(
  controllerName: string,
  handlerName: string,
): AuditDescriptor {
  const entity = entityForAction(controllerName, handlerName);
  const key = `${controllerName}.${handlerName}`;
  const label =
    LABEL_OVERRIDES[key] ?? `${verbForHandler(handlerName)} ${entity.noun}`;
  const controllerSlug =
    controllerName.charAt(0).toLowerCase() + controllerName.slice(1);

  return {
    action: `${controllerSlug}.${handlerName}`,
    label,
    entityType: entity.entityType,
    category: entity.category,
  };
}

/**
 * Turn an action key stored in the database into a human label. This is used
 * for filter facets and as a fallback for records written before `meta.label`
 * was introduced.
 */
export function auditLabelForAction(action: string): string {
  const legacy = LEGACY_LABELS[action];
  if (legacy) return legacy;

  if (action.includes('.')) {
    const [controllerSlug, handlerName] = action.split('.');
    if (controllerSlug && handlerName) {
      const controllerName =
        controllerSlug.charAt(0).toUpperCase() + controllerSlug.slice(1);
      return describeAuditEvent(controllerName, handlerName).label;
    }
  }

  const words = action
    .split('_')
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (!words.length) return action;
  words[0] = capitalize(words[0]);
  return words.join(' ');
}
