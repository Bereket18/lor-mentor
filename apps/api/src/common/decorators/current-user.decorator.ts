import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Usage in controllers:
// async myRoute(@CurrentUser() user: User) { ... }
//
// This extracts request.user which was set by JwtStrategy.validate()
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
