import { Role } from '@prisma/client';

export { Role };

/**
 * Roles with elevated, cross-user privileges — admin surface, payment review,
 * forum moderation, etc. Centralized so the privilege boundary lives in one
 * place instead of being re-spelled as `['ADMIN', 'SUPER_ADMIN']` everywhere.
 */
export const PRIVILEGED_ROLES: readonly Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

/** True when the given role is an admin/super-admin. */
export function isPrivileged(role: Role | string): boolean {
  return (PRIVILEGED_ROLES as readonly string[]).includes(role);
}
