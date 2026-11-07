import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { redactSensitiveFields } from '../redact-sensitive';

/**
 * Pathname only, for anything sent to an external tracker. A query string can
 * carry a live secret (`?token=…`, `?code=…`), and a fragment never leaves the
 * client — so both are stripped before the URL is used as a tag.
 */
function trackerPath(url: string | undefined): string {
  return (url ?? '').split('?')[0].split('#')[0];
}

/**
 * Catches everything and returns ONE consistent error envelope:
 *
 *   { statusCode, error, message, path, timestamp }
 *
 * Before this, error shapes varied (raw Nest exceptions vs unhandled errors),
 * and an unhandled throw could leak a stack/internal details to the client.
 * Now: HttpExceptions are passed through faithfully; anything else becomes a
 * generic 500 (logged in full server-side, but not exposed to the caller).
 *
 * If Sentry is configured, unexpected 500s and high-severity exceptions are
 * reported for triage.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
        error = exception.name;
      } else if (response && typeof response === 'object') {
        const body = response as {
          message?: string | string[];
          error?: string;
        };
        message = body.message ?? exception.message;
        error = body.error ?? exception.name;
      }
      // Report 5xx exceptions to Sentry (server errors, not client mistakes).
      if (status >= 500) {
        Sentry.captureException(exception, {
          tags: { statusCode: status, path: trackerPath(req.url) },
        });
      }
    } else if (exception instanceof Error) {
      // body-parser raises plain Error objects (not HttpException) for an
      // oversized request body. Preserve its 413 instead of reporting a 500.
      const bodyParserError = exception as Error & {
        type?: string;
        status?: number;
        statusCode?: number;
      };
      const parserStatus = bodyParserError.statusCode ?? bodyParserError.status;
      if (
        bodyParserError.type === 'entity.too.large' ||
        parserStatus === HttpStatus.PAYLOAD_TOO_LARGE
      ) {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        message = 'Request body is too large';
        error = 'PayloadTooLarge';
      } else {
        // Unexpected server-side failure: log everything, expose nothing.
        this.logger.error(
          `Unhandled ${exception.name}: ${exception.message}`,
          exception.stack,
        );
        // Always report unhandled exceptions to Sentry. The body is redacted
        // first: on the auth routes it carries a live credential (the
        // verification code, a password, a reset token), and an error tracker
        // is not a place to send a secret.
        Sentry.captureException(exception, {
          tags: { path: trackerPath(req.url) },
          extra: {
            method: req.method,
            body: redactSensitiveFields(req.body),
          },
        });
      }
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
