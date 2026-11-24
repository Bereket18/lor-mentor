import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import type { Response } from 'express';
import { NoStoreInterceptor } from './no-store.interceptor';

function contextWith(response: Partial<Response>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('NoStoreInterceptor', () => {
  it('sets no-store and no-referrer before the handler runs', () => {
    const setHeader = jest.fn();
    const interceptor = new NoStoreInterceptor();
    let headersAtHandleTime: string[] = [];
    const next: CallHandler = {
      handle: jest.fn(() => {
        headersAtHandleTime = setHeader.mock.calls.map((call) => call[0]);
        return of(null);
      }),
    };

    interceptor
      .intercept(contextWith({ setHeader } as Partial<Response>), next)
      .subscribe();

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(headersAtHandleTime).toEqual(['Cache-Control', 'Referrer-Policy']);
  });
});
