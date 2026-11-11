import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { REDACTED } from '../redact-sensitive';

jest.mock('@sentry/node', () => ({
  __esModule: true,
  captureException: jest.fn(),
}));

const captureException = Sentry.captureException as jest.Mock;

/** Minimal ArgumentsHost: the filter only reads the request and the response. */
function makeHost(request: Record<string, unknown>) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter();
  });

  describe('unhandled errors reported to Sentry', () => {
    it('redacts the verification code before reporting the request body', () => {
      const { host } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        body: { email: 'student@example.com', code: '428193' },
      });

      filter.catch(new Error('database is unreachable'), host);

      expect(captureException).toHaveBeenCalledTimes(1);
      const [exception, context] = captureException.mock.calls[0] as [
        unknown,
        { extra: { method: string; body: Record<string, unknown> } },
      ];

      expect((exception as Error).message).toBe('database is unreachable');
      expect(context.extra.method).toBe('POST');
      expect(context.extra.body).toEqual({
        email: 'student@example.com',
        code: REDACTED,
      });
      // The regression this guards: the code must not survive anywhere in the
      // payload that leaves the process.
      expect(JSON.stringify(context)).not.toContain('428193');
    });

    it('redacts the password on register and login', () => {
      const { host } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/register',
        body: { email: 'a@b.com', password: 'correct horse', fullName: 'A B' },
      });

      filter.catch(new Error('smtp exploded'), host);

      const [, context] = captureException.mock.calls[0] as [
        unknown,
        { extra: { body: Record<string, unknown> } },
      ];
      expect(context.extra.body.password).toBe(REDACTED);
      expect(context.extra.body.email).toBe('a@b.com');
      expect(JSON.stringify(context)).not.toContain('correct horse');
    });

    it('still reports the failure to the client as a generic 500', () => {
      const { host, status, json } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        body: { email: 'student@example.com', code: '428193' },
      });

      filter.catch(new Error('database is unreachable'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
          error: 'InternalServerError',
        }),
      );
      // Neither the secret nor the internal error text reaches the caller.
      expect(JSON.stringify(json.mock.calls[0])).not.toContain('428193');
      expect(JSON.stringify(json.mock.calls[0])).not.toContain(
        'database is unreachable',
      );
    });

    it('reports an oversized-body error as 413 without a Sentry report', () => {
      const { host, status } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        body: {},
      });
      const tooLarge = Object.assign(new Error('request entity too large'), {
        type: 'entity.too.large',
      });

      filter.catch(tooLarge, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(captureException).not.toHaveBeenCalled();
    });
  });

  describe('Sentry path tag never carries a query string or fragment', () => {
    it('strips ?token=abc&code=123456 from an unhandled-error report, body redaction unchanged', () => {
      const { host } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/reset-password?token=abc&code=123456',
        body: { token: 'abc', newPassword: 'hunter2hunter2' },
      });

      filter.catch(new Error('boom'), host);

      expect(captureException).toHaveBeenCalledTimes(1);
      const [, context] = captureException.mock.calls[0] as [
        unknown,
        { tags: { path: string }; extra: { body: Record<string, unknown> } },
      ];
      expect(context.tags.path).toBe('/api/v1/auth/reset-password');
      expect(JSON.stringify(context)).not.toContain('token=abc');
      expect(JSON.stringify(context)).not.toContain('123456');
      // The path fix must not change body redaction.
      expect(context.extra.body).toEqual({
        token: REDACTED,
        newPassword: REDACTED,
      });
    });

    it('leaves a query-less URL unchanged', () => {
      const { host } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        body: { email: 'a@b.com', code: '000000' },
      });

      filter.catch(new Error('boom'), host);

      const [, context] = captureException.mock.calls[0] as [
        unknown,
        { tags: { path: string } },
      ];
      expect(context.tags.path).toBe('/api/v1/auth/verify-email');
    });

    it('strips the query on a 5xx HttpException report too', () => {
      const { host } = makeHost({
        method: 'GET',
        url: '/api/v1/legacy?token=secretvalue',
        body: {},
      });

      filter.catch(new HttpException('db down', 503), host);

      const [, context] = captureException.mock.calls[0] as [
        unknown,
        { tags: { statusCode: number; path: string } },
      ];
      expect(context.tags).toEqual({ statusCode: 503, path: '/api/v1/legacy' });
      expect(JSON.stringify(context)).not.toContain('secretvalue');
    });

    it('strips a fragment-only URL', () => {
      const { host } = makeHost({ method: 'GET', url: '/x#section', body: {} });

      filter.catch(new Error('boom'), host);

      const [, context] = captureException.mock.calls[0] as [
        unknown,
        { tags: { path: string } },
      ];
      expect(context.tags.path).toBe('/x');
    });
  });

  describe('HttpExceptions', () => {
    it('does not send a client error (4xx) to Sentry', () => {
      const { host, status, json } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        body: { email: 'student@example.com', code: '000000' },
      });

      filter.catch(
        new HttpException('That verification code is incorrect', 400),
        host,
      );

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(captureException).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('reports a 5xx HttpException by tags only, never by body', () => {
      const { host } = makeHost({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        body: { email: 'student@example.com', code: '428193' },
      });

      filter.catch(new HttpException('Email service is down', 503), host);

      expect(captureException).toHaveBeenCalledTimes(1);
      const [, context] = captureException.mock.calls[0] as [
        unknown,
        { tags: Record<string, unknown>; extra?: unknown },
      ];

      expect(context.tags).toEqual({
        statusCode: 503,
        path: '/api/v1/auth/verify-email',
      });
      expect(context.extra).toBeUndefined();
      expect(JSON.stringify(context)).not.toContain('428193');
    });
  });
});
