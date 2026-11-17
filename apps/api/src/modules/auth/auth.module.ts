import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import Redis from 'ioredis';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordlessController } from './passwordless.controller';
import { PasswordlessAuthService } from './passwordless.service';
import { AuthMethodsConfig } from './auth-methods.config';
import {
  AUTH_RATE_LIMIT_CLIENT,
  AuthRateLimitService,
} from './auth-rate-limit.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { TokenDenylistService } from '../../common/redis/token-denylist.service';

@Module({
  imports: [UsersModule, MailModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController, PasswordlessController],
  // JwtStrategy must be in providers so Passport knows about it
  providers: [
    AuthService,
    PasswordlessAuthService,
    AuthMethodsConfig,
    AuthRateLimitService,
    {
      // Dedicated connection: a slow rate-limit command must not queue behind
      // other Redis users, and shutdown closes only this client.
      provide: AUTH_RATE_LIMIT_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: parseInt(config.get<string>('REDIS_PORT') ?? '6379', 10),
          // Bounded retries then reject: the service turns that into the
          // design's fail-closed 503 instead of hanging the request.
          maxRetriesPerRequest: 2,
          connectTimeout: 2000,
        }),
    },
    JwtStrategy,
    TokenDenylistService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
