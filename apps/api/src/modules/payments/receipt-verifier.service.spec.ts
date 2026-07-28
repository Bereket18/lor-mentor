import type { ConfigService } from '@nestjs/config';
import { ReceiptVerifierService } from './receipt-verifier.service';

describe('ReceiptVerifierService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('aborts extraction at the configured timeout', async () => {
    jest.useFakeTimers();
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          RECEIPT_VERIFIER_URL: 'http://127.0.0.1:8000',
          RECEIPT_VERIFIER_TOKEN: 'test-token',
          RECEIPT_VERIFIER_TIMEOUT_MS: '5000',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('request aborted'));
        });
      });
    });

    const service = new ReceiptVerifierService(config);
    const resultPromise = service.extract({
      bank: 'dashen',
      url: 'https://receipt.dashensuperapp.com/receipt/ABC',
    });

    await jest.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void resultPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      code: 'UNREACHABLE',
      message: 'request aborted',
    });
  });
});
