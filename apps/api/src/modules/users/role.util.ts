// ── Role hierarchy rules ─────────────────────────────────────────
// Single source of truth for "who may act on whom". Enforced in the
// service from the actor's role; the route still requires ADMIN/SUPER_ADMIN.

export const ALL_ROLES = [
  'STUDENT',
  'TEACHER',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

const PRIVILEGED = ['ADMIN', 'SUPER_ADMIN'];

export function isPrivileged(role: string): boolean {
  return PRIVILEGED.includes(role);
}

// Which target roles an actor may CREATE.
export function canCreateRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'SUPER_ADMIN') {
    return (ALL_ROLES as readonly string[]).includes(targetRole);
  }
  if (actorRole === 'ADMIN') {
    return targetRole === 'STUDENT' || targetRole === 'TEACHER';
  }
  return false;
}

// Whether an actor may change a user's role from `current` to `next`.
export function canChangeRole(
  actorRole: string,
  currentRole: string,
  nextRole: string,
): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  if (actorRole === 'ADMIN') {
    // Admins may not touch other admins/super-admins, nor grant those roles
    if (isPrivileged(currentRole) || isPrivileged(nextRole)) return false;
    return nextRole === 'STUDENT' || nextRole === 'TEACHER';
  }
  return false;
}

// Whether an actor may delete a user with `targetRole`.
// (self / last-super-admin checks live in the service.)
export function canDeleteRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  if (actorRole === 'ADMIN') {
    return targetRole === 'STUDENT' || targetRole === 'TEACHER';
  }
  return false;
}
