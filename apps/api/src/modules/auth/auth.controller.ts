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
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // POST /api/v1/auth/verify-email
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // POST /api/v1/auth/login
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
  logout(@Res({ passthrough: true }) res: Response) {
    // Clear both cookies
    res.clearCookie('access_token', cookieOptions());
    res.clearCookie('refresh_token', cookieOptions());
    return { message: 'Logged out successfully' };
  }

  // POST /api/v1/auth/forgot-password
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  // POST /api/v1/auth/reset-password
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
