import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest to give a clearer error message
  // By default Passport gives a generic error
  // The `info` parameter is intentionally unused — Passport provides it
  // but the message is not useful to forward to the client
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _info: unknown,
  ): TUser {
    // If there is an error or no user was found
    if (err || !user) {
      throw new UnauthorizedException(
        'You must be logged in to access this resource',
      );
    }
    return user;
  }
}
