import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Req,
  Ip,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

// All routes in this controller start with /api/v1/auth
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/register
  // Tight throttle: registration triggers an email send and creates a row —
  // limit automated account/email-bomb abuse.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // POST /api/v1/auth/verify-email
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // POST /api/v1/auth/login
  // Strict per-IP throttle on top of the per-account lockout in AuthService —
  // blunts credential-stuffing and brute-force attempts.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, ip);

    // Store tokens in HTTP-only cookies
    // JavaScript cannot read these — they are secure
    res.cookie('access_token', result.accessToken, {
      ...cookieOptions(),
      maxAge: 15 * 60 * 1000, // 15 minutes in milliseconds
    });

    res.cookie('refresh_token', result.refreshToken, {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    });

    // Do not send tokens in the response body
    // They are in the cookies — that is enough
    return {
      message: result.message,
      user: result.user,
    };
  }

  // POST /api/v1/auth/refresh
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Cast req.cookies to a record type so TS safely checks it
    const cookies = req.cookies as Record<string, string | undefined>;
    const refreshToken = cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }

    try {
      const payload = await this.authService.verifyRefreshToken(refreshToken);
      // Reject a token that was revoked on logout or already rotated away.
      await this.authService.assertRefreshTokenActive(payload.jti);
      // Rotation reuse-detection: burn the presented token so a stolen copy
      // can't be replayed after the legitimate client rotates.
      await this.authService.revokeRefreshPayload(payload);
      const tokens = await this.authService.refreshTokens(payload.sub);

      res.cookie('access_token', tokens.accessToken, {
        ...cookieOptions(),
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('refresh_token', tokens.refreshToken, {
        ...cookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return { message: 'Token refreshed' };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // POST /api/v1/auth/logout
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Revoke the refresh token server-side so a copied token can't be reused
    // after logout — not just cleared from this browser.
    const cookies = req.cookies as Record<string, string | undefined>;
    const refreshToken = cookies?.refresh_token;
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    res.clearCookie('access_token', cookieOptions());
    res.clearCookie('refresh_token', cookieOptions());
    return { message: 'Logged out successfully' };
  }

  // POST /api/v1/auth/forgot-password
  // Tight throttle: each call sends an email — prevents inbox flooding of a
  // victim and email-provider rate-limit exhaustion.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  // POST /api/v1/auth/reset-password
  // Tight throttle: blunts brute-forcing of the reset token.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
