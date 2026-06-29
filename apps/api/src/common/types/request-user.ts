import type { Role } from '@prisma/client';

/**
 * The canonical shape attached to `request.user` by `JwtStrategy.validate()`
 * (i.e. the result of `UsersService.findById`, minus the password hash).
 *
 * This is the single source of truth — controllers import it via
 * `@CurrentUser() user: RequestUser` instead of each redefining their own
 * partial `AuthUser` interface (which had drifted: some declared `phoneNumber`
 * that `findById` never actually selected).
 */
export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phoneNumber: string | null;
  avatarPath: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
}
