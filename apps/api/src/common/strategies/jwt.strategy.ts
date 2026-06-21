import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../modules/users/users.service';

// What is inside our JWT token payload
// We put these in when we created the token in AuthService
interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
}

// The shape returned by UsersService.findById — excludes passwordHash
interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarPath: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
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
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? '',

      // Pass the full request to validate() so we can access cookies
      passReqToCallback: false,
    });
  }

  // This runs automatically after the token signature is verified
  // Whatever we return here is attached to request.user
  // So in any controller we can use @CurrentUser() to get this
  async validate(payload: JwtPayload): Promise<SafeUser> {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    // This gets attached to request.user everywhere
    return user;
  }
}
