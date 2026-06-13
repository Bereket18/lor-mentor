import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get the required roles from the route decorator
    // Example: @Roles('ADMIN') → requiredRoles = ['ADMIN']
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @Roles() decorator is on this route
    // allow any authenticated user through
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get the user from the request
    // JwtAuthGuard already attached this via JwtStrategy.validate()
    const { user } = context.switchToHttp().getRequest();

    // Check if the user's role matches any required role
    const hasRole = requiredRoles.includes(user?.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
