import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

/**
 * Mark every response from a controller as non-cacheable and non-referring.
 *
 * Applied to the passwordless auth controller (P1-10): these bodies carry
 * account state (method flags, profile status, sign-in outcome) and the
 * responses set or clear auth cookies. A shared proxy, a browser back/forward
 * cache or a screenshotting extension must not retain them, and a page that
 * links onward must not leak the path through `Referer`.
 *
 * Handlers may set the same headers again; repeating the value is harmless and
 * keeps the guarantee if a handler is ever moved to another controller.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return next.handle();
  }
}
