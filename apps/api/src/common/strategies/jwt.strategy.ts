import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../modules/users/users.service';
import type { RequestUser } from '../types/request-user';

// What is inside our JWT token payload
// We put these in when we created the token in AuthService
interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
  /** Session version at issue time; absent on tokens minted before this field. */
  ver?: number;
  /** Authentication method; absent on legacy password tokens. */
  am?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const accessSecret = config.get<string>('JWT_ACCESS_SECRET');
    // Never fall back to '' — an empty signing key makes every token forgeable.
    // env.validation.ts guarantees this is set, but fail loudly if it ever isn't
    // rather than silently accepting unsigned-equivalent tokens.
    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }

    super({
      // Tell Passport where to find the token
      // We read it from the HTTP-only cookie called 'access_token'
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request): string | null => {
          // express cookie-parser adds cookies to req but types it as any;
          // we safely cast to Record then extract the string value
          const cookies = request?.cookies as
            | Record<string, string>
            | undefined;
          return cookies?.access_token ?? null;
        },
      ]),

      // If the token is expired reject the request
      ignoreExpiration: false,

      // The secret used to verify the token signature
      // Must match the secret used when creating the token
      secretOrKey: accessSecret,

      // Pass the full request to validate() so we can access cookies
      passReqToCallback: false,
    });
  }

  // This runs automatically after the token signature is verified
  // Whatever we return here is attached to request.user
  // So in any controller we can use @CurrentUser() to get this
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    // Session version: a password reset or account recovery increments the
    // column, which invalidates every access token minted before it. Legacy
    // tokens without the claim are treated as version 0, which is correct while
    // an account has never been revoked.
    const version = payload.ver ?? 0;
    if (version !== user.sessionVersion) {
      throw new UnauthorizedException(
        'Session has been revoked. Please sign in again.',
      );
    }

    // Administrator roles may only hold password sessions. Checked here as well
    // as at issue and refresh time, so a promotion takes effect on the very
    // next request instead of at token expiry.
    const method = payload.am ?? 'PASSWORD';
    if (method !== 'PASSWORD' && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      throw new UnauthorizedException(
        'Administrators must sign in with a password.',
      );
    }

    // This gets attached to request.user everywhere
    return user;
  }
}
