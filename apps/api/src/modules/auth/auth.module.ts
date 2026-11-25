import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordlessController } from './passwordless.controller';
import { PasswordlessAuthService } from './passwordless.service';
import { AuthMethodsConfig } from './auth-methods.config';
import { AUTH_MAIL_QUEUE } from './auth-mail.constants';
import { AuthMailCryptoService } from './auth-mail.crypto';
import { AuthMailProcessor } from './auth-mail.processor';
import { AuthMailService } from './auth-mail.service';
import { AuthCleanupService } from './auth-cleanup.service';
import {
  AUTH_RATE_LIMIT_CLIENT,
  AuthRateLimitService,
} from './auth-rate-limit.service';
import { GoogleOidcClient } from './google-oidc.client';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { TokenDenylistService } from '../../common/redis/token-denylist.service';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.register({}),
    BullModule.registerQueue({
      name: AUTH_MAIL_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        // Failed jobs contain only ciphertext, but there is no operational
        // reason to retain them; the audit event is the durable record.
        removeOnFail: true,
      },
    }),
  ],
  controllers: [AuthController, PasswordlessController],
  // JwtStrategy must be in providers so Passport knows about it
  providers: [
    AuthService,
    PasswordlessAuthService,
    AuthMethodsConfig,
    AuthMailCryptoService,
    AuthMailService,
    AuthMailProcessor,
    AuthCleanupService,
    AuthRateLimitService,
    GoogleOidcClient,
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
