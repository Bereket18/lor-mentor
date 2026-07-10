import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { TokenDenylistService } from '../../common/redis/token-denylist.service';

@Module({
  imports: [UsersModule, MailModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  // JwtStrategy must be in providers so Passport knows about it
  providers: [AuthService, JwtStrategy, TokenDenylistService],
  exports: [AuthService],
})
export class AuthModule {}
