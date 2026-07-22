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
          tags: { statusCode: status, path: req.url },
        });
      }
    } else if (exception instanceof Error) {
      // Unexpected server-side failure: log everything, expose nothing.
      this.logger.error(
        `Unhandled ${exception.name}: ${exception.message}`,
        exception.stack,
      );
      // Always report unhandled exceptions to Sentry.
      Sentry.captureException(exception, {
        tags: { path: req.url },
        extra: { method: req.method, body: req.body },
      });
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
