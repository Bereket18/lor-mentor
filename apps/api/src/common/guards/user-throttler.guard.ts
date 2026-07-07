import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits per authenticated USER rather than per IP.
 *
 * The global ThrottlerGuard keys on IP, which is the wrong unit for expensive
 * authenticated actions like the AI tutor: many students behind one college
 * NAT would share (and collectively exhaust) a single IP bucket, while a single
 * abusive account rotating IPs would slip past. Applying this guard AFTER
 * JwtAuthGuard (so `req.user` is populated) caps spend per account instead.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    const ip =
      (req.ip as string | undefined) ??
      ((req.ips as string[] | undefined)?.[0] ?? 'unknown');
    return Promise.resolve(user?.id ? `user:${user.id}` : `ip:${ip}`);
  }
}
