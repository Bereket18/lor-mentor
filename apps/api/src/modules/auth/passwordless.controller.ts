import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthCsrfGuard } from '../../common/guards/auth-csrf.guard';
import {
  authCookieName,
  authCookieOptions,
  clearedAuthCookieOptions,
} from '../../common/auth-cookies';
import {
  CHALLENGE_BASE,
  CSRF_BASE,
  ENROLLMENT_BASE,
} from '../../common/auth-cookie-names';
import { writeSessionCookies } from '../../common/session-cookies';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { PasswordlessAuthService, type AuthCompletion } from './passwordless.service';
import {
  CompleteProfileDto,
  EmailCodeDto,
  EmailConfirmDto,
  ResendEmailDto,
  StartEmailDto,
} from './dto/passwordless.dto';
import {
  CHALLENGE_TTL_MS,
  CODE_BROWSER_PER_TEN_MINUTES,
  CODE_IP_PER_TEN_MINUTES,
  CONFIRM_BROWSER_PER_TEN_MINUTES,
  CONFIRM_IP_PER_TEN_MINUTES,
  ENROLLMENT_TTL_MS,
  PROFILE_GRANT_PER_TEN_MINUTES,
  PROFILE_IP_PER_TEN_MINUTES,
  PUBLIC_READ_IP_PER_MINUTE,
  START_IP_PER_HOUR,
  START_IP_PER_MINUTE,
  WINDOW_HOUR_MS,
  WINDOW_MINUTE_MS,
  WINDOW_TEN_MINUTES_MS,
  randomToken,
} from './auth-policy';

/**
 * Browser-facing passwordless endpoints under `/api/v1/auth`.
 *
 * Every state-changing route:
 *   - requires JSON and an exact Origin plus a synchronizer CSRF token
 *     (`AuthCsrfGuard`);
 *   - is rate-limited per IP here, on top of the per-address budgets enforced
 *     in the service;
 *   - is disabled entirely (503) unless its feature flag is on.
 *
 * No route returns a token in JSON. Session tokens are written only as
 * HttpOnly cookies, and the profile grant token only as an HttpOnly cookie.
 */
@Controller('auth')
export class PasswordlessController {
  constructor(
    private readonly service: PasswordlessAuthService,
    private readonly limits: AuthRateLimitService,
    private readonly config: ConfigService,
  ) {}

  private readCookies(req: Request): Record<string, string | undefined> {
    return (req.cookies ?? {}) as Record<string, string | undefined>;
  }

  private challengeCookie(): string {
    return authCookieName(CHALLENGE_BASE, this.config);
  }

  private enrollmentCookie(): string {
    return authCookieName(ENROLLMENT_BASE, this.config);
  }

  /** Effective method flags. Public and never account-dependent. */
  @Get('methods')
  async methods(@Req() req: Request) {
    await this.limits.enforceRequest(req, 'methods', {
      ip: { limit: PUBLIC_READ_IP_PER_MINUTE, windowMs: WINDOW_MINUTE_MS },
    });
    return this.service.methodFlags();
  }

  /**
   * Bootstrap a CSRF token. Sets an HttpOnly cookie and returns the same value
   * so the page can keep it in memory and echo it in `x-auth-csrf`.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('csrf')
  async csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.limits.enforceRequest(req, 'csrf', {
      ip: { limit: PUBLIC_READ_IP_PER_MINUTE, windowMs: WINDOW_MINUTE_MS },
    });
    const token = randomToken(32);
    res.cookie(
      authCookieName(CSRF_BASE, this.config),
      token,
      authCookieOptions(this.config, CHALLENGE_TTL_MS),
    );
    return { csrfToken: token };
  }

  @UseGuards(AuthCsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('email/start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startEmail(
    @Body() dto: StartEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.enforceRequest(req, 'email:start', {
      ip: { limit: START_IP_PER_MINUTE, windowMs: WINDOW_MINUTE_MS },
    });
    await this.limits.enforceRequest(req, 'email:start:hour', {
      ip: { limit: START_IP_PER_HOUR, windowMs: WINDOW_HOUR_MS },
    });
    const { result, browserNonce } = await this.service.startEmail(
      dto.email,
      dto.returnTo,
    );
    if (browserNonce) {
      res.cookie(
        this.challengeCookie(),
        browserNonce,
        authCookieOptions(this.config, CHALLENGE_TTL_MS),
      );
    }
    return result;
  }

  @UseGuards(AuthCsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendEmail(
    @Body() dto: ResendEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.enforceRequest(req, 'email:start', {
      ip: { limit: START_IP_PER_MINUTE, windowMs: WINDOW_MINUTE_MS },
    });
    await this.limits.enforceRequest(req, 'email:start:hour', {
      ip: { limit: START_IP_PER_HOUR, windowMs: WINDOW_HOUR_MS },
    });
    const { result, browserNonce } = await this.service.resendEmail(
      dto.challengeId,
      this.readCookies(req)[this.challengeCookie()],
    );
    if (browserNonce) {
      res.cookie(
        this.challengeCookie(),
        browserNonce,
        authCookieOptions(this.config, CHALLENGE_TTL_MS),
      );
    }
    return result;
  }

  @UseGuards(AuthCsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @Post('email/code')
  @HttpCode(HttpStatus.OK)
  async emailCode(
    @Body() dto: EmailCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.enforceRequest(req, 'email:code', {
      ip: { limit: CODE_IP_PER_TEN_MINUTES, windowMs: WINDOW_TEN_MINUTES_MS },
      browser: {
        limit: CODE_BROWSER_PER_TEN_MINUTES,
        windowMs: WINDOW_TEN_MINUTES_MS,
      },
    });
    const completion = await this.service.verifyCode(
      dto.challengeId,
      dto.code,
      this.readCookies(req)[this.challengeCookie()],
    );
    return this.finish(completion, res);
  }

  @UseGuards(AuthCsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @Post('email/confirm')
  @HttpCode(HttpStatus.OK)
  async emailConfirm(
    @Body() dto: EmailConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.enforceRequest(req, 'email:confirm', {
      ip: {
        limit: CONFIRM_IP_PER_TEN_MINUTES,
        windowMs: WINDOW_TEN_MINUTES_MS,
      },
      browser: {
        limit: CONFIRM_BROWSER_PER_TEN_MINUTES,
        windowMs: WINDOW_TEN_MINUTES_MS,
      },
    });
    const completion = await this.service.confirmLink(
      dto.challengeId,
      dto.token,
    );
    return this.finish(completion, res);
  }

  /** Safe status for the profile page. No consumption; no session. */
  @Get('profile-completion')
  async profileCompletion(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const status = await this.service.grantStatus(
      this.readCookies(req)[this.enrollmentCookie()],
    );
    // A profile page is never cacheable and never a referrer.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return status;
  }

  @UseGuards(AuthCsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @Post('profile-completion')
  @HttpCode(HttpStatus.OK)
  async completeProfile(
    @Body() dto: CompleteProfileDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.enforceRequest(req, 'profile:complete', {
      ip: { limit: PROFILE_IP_PER_TEN_MINUTES, windowMs: WINDOW_TEN_MINUTES_MS },
    });
    await this.limits.enforceGrant(
      req,
      this.readCookies(req)[this.enrollmentCookie()],
      {
        limit: PROFILE_GRANT_PER_TEN_MINUTES,
        windowMs: WINDOW_TEN_MINUTES_MS,
      },
    );
    const completion = await this.service.completeProfile(
      this.readCookies(req)[this.enrollmentCookie()],
      dto,
    );
    return this.finish(completion, res);
  }

  /**
   * Turn a service completion into cookies and a body that never contains a
   * token. The proof state (challenge or grant cookie) is always cleared.
   */
  private finish(completion: AuthCompletion, res: Response) {
    // The proof has been consumed either way, so the transient cookies are
    // useless from here on.
    res.clearCookie(this.challengeCookie(), clearedAuthCookieOptions(this.config));

    if (completion.next === 'signed_in') {
      writeSessionCookies(res, this.config, completion.session);
      res.clearCookie(
        this.enrollmentCookie(),
        clearedAuthCookieOptions(this.config),
      );
      res.setHeader('Cache-Control', 'no-store');
      return {
        next: 'signed_in' as const,
        redirectTo: completion.redirectTo,
        user: completion.user,
      };
    }

    res.cookie(
      this.enrollmentCookie(),
      completion.grantToken,
      authCookieOptions(this.config, ENROLLMENT_TTL_MS),
    );
    res.setHeader('Cache-Control', 'no-store');
    return {
      next: 'complete_profile' as const,
      redirectTo: completion.redirectTo,
    };
  }
}
