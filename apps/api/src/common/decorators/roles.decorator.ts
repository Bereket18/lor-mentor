import { SetMetadata } from '@nestjs/common';

// The key used to store role metadata on the route
export const ROLES_KEY = 'roles';

// Usage in controllers:
// @Roles('ADMIN')
// @Roles('TEACHER', 'ADMIN')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
