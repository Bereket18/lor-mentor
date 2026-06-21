import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

// The shape of the user object attached to the request by JwtStrategy.validate()
interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
}

// Usage in controllers:
// async myRoute(@CurrentUser() user: RequestUser) { ... }
//
// This extracts request.user which was set by JwtStrategy.validate()
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    return request.user;
  },
);
