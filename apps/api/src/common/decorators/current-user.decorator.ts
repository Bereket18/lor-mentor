import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { RequestUser } from '../types/request-user';

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
