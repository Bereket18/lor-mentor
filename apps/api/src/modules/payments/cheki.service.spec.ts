import type { ConfigService } from '@nestjs/config';
import { ChekiService } from './cheki.service';

/**
 * Contract tests for the Cheki adapter. All responses are MOCKED so the
 * suite is deterministic; a couple of live probes against the real service
 * are documented in docs/audit/REGRESSION-TEST-RESULTS.md.
 *
 * The security-critical invariants under test:
 *  - only `verified === true` yields a receipt (decodedOnly / fallbackUrl /
 *    errors must NOT auto-approve downstream),
 *  - per-bank request shapes follow the documented Cheki formats,
 *  - rate limits are surfaced (not retried), outages degrade safely,
 *  - the result cache reduces duplicate calls.
 */
describe('ChekiService', () => {
  const REAL_FETCH = globalThis.fetch;

  function makeService(env: Record<string, string> = {}): ChekiService {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    return new ChekiService(config);
  }

  function jsonResponse(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
      text: async () =>
        typeof body === 'string' ? body : JSON.stringify(body),
    } as unknown as Response;
  }

  const verifiedBody = {
    success: true,
    senderName: '251910593394',
    senderAccount: '2****3394',
    receiverName: 'BEREKET ADAMSEGED ASRES',
    receiverAccount: '1****3036',
    amount: 500,
    currency: 'ETB',
    date: '10/13/2026 8:02:00 PM',
    reference: 'FT26287CZTG9',
    branch: 'HEAD OFFICE',
    verified: true,
    bank: 'Commercial Bank of Ethiopia',
    bankCode: 'cbe',
    sourceUrl: 'https://apps.cbe.com.et:100/?id=FT26287CZTG923923036',
    durationMs: 9336,
    cached: false,
  };

  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, verifiedBody));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    void REAL_FETCH;
  });

  it('maps a bank-confirmed response into the internal receipt contract', async () => {
    const service = makeService();

    const outcome = await service.verify({
      bank: 'cbe',
      reference: 'FT26287CZTG9',
      account: '1000423923036',
    });

    expect(outcome.kind).toBe('VERIFIED');
    if (outcome.kind !== 'VERIFIED') throw new Error('unreachable');
    expect(outcome.receipt).toMatchObject({
      bank: 'cbe',
      reference: 'FT26287CZTG9',
      amount: 500,
      currency: 'ETB',
      receiverAccount: '1****3036',
      receiverName: 'BEREKET ADAMSEGED ASRES',
      payerName: '251910593394',
      payerAccount: '2****3394',
      status: null,
      statusKnown: false,
      source: 'cheki',
    });
    expect(outcome.receipt.date).toBe(
      new Date('10/13/2026 8:02:00 PM').toISOString(),
    );
    expect(outcome.receipt.raw).toMatchObject({
      source: 'cheki',
      verified: true,
      sourceUrl: verifiedBody.sourceUrl,
      branch: 'HEAD OFFICE',
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toEqual({
      bank: 'cbe',
      reference: 'FT26287CZTG9',
      accountNumber: '1000423923036',
    });
  });

  it('accepts a `result`-wrapped payload (docs shape) as forward compatibility', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        result: {
          verified: true,
          amount: '1000',
          currency: 'ETB',
          receiverAccount: '1000123456789',
          reference: 'TX-1',
        },
      }),
    );
    const service = makeService();

    const outcome = await service.verify({ bank: 'dashen', reference: 'TX-1' });

    expect(outcome.kind).toBe('VERIFIED');
    if (outcome.kind !== 'VERIFIED') throw new Error('unreachable');
    expect(outcome.receipt.amount).toBe(1000);
    expect(outcome.receipt.receiverAccount).toBe('1000123456789');
  });

  it('never yields a receipt for decodedOnly responses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        decodedOnly: true,
        verified: false,
        amount: 500,
      }),
    );
    const service = makeService();

    const outcome = await service.verify({
      bank: 'boa',
      url: 'https://cs.bankofabyssinia.com/slip/?trx=ABC',
    });

    expect(outcome).toEqual({
      kind: 'DECODED_ONLY',
      message: 'Cheki decoded the receipt but the bank did not confirm it',
    });
  });

  it('treats a bare verified:false response as unusable (never verified)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, verified: false }),
    );
    const service = makeService();

    const outcome = await service.verify({
      bank: 'cbe',
      reference: 'FT1234567890',
    });

    expect(outcome.kind).toBe('FAILED');
    expect(outcome).not.toHaveProperty('receipt');
  });

  it('treats a fallbackUrl as unverifiable (no receipt)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        verified: false,
        fallbackUrl: 'https://transactioninfo.ethiotelecom.et/receipt/XYZ',
      }),
    );
    const service = makeService();

    const outcome = await service.verify({ bank: 'tele', reference: 'XYZ' });

    expect(outcome).toMatchObject({
      kind: 'FAILED',
      code: 'FALLBACK_REQUIRED',
    });
  });

  it('surfaces rate limits with Retry-After instead of retrying', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        429,
        { error: 'too many requests' },
        { 'retry-after': '30' },
      ),
    );
    const service = makeService();

    const outcome = await service.verify({
      bank: 'cbe',
      reference: 'FT1234567890',
    });

    expect(outcome).toMatchObject({ kind: 'FAILED', code: 'RATE_LIMITED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps HTTP errors to a safe failure (no receipt, no throw)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(502, {
        success: false,
        error:
          '[Commercial Bank of Ethiopia] CBE receipt service unavailable. Try again.',
      }),
    );
    const service = makeService();

    const outcome = await service.verify({
      bank: 'cbe',
      reference: 'FT1234567890',
    });

    expect(outcome).toMatchObject({ kind: 'FAILED', code: 'HTTP_ERROR' });
  });

  it('rejects unreadable JSON as MALFORMED', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, '<html>not json</html>'));
    const service = makeService();

    const outcome = await service.verify({
      bank: 'cbe',
      reference: 'FT1234567890',
    });

    expect(outcome).toMatchObject({ kind: 'FAILED', code: 'MALFORMED' });
  });

  it('times out unreachable requests via AbortController', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('This operation was aborted')),
          );
        }),
    );
    const service = makeService({ CHEKI_TIMEOUT_MS: '10' });

    const outcome = await service.verify({
      bank: 'cbe',
      reference: 'FT1234567890',
    });

    expect(outcome).toMatchObject({ kind: 'FAILED', code: 'UNREACHABLE' });
  });

  it('refuses unsupported banks without calling Cheki', async () => {
    const service = makeService();

    const outcome = await service.verify({ bank: 'abay', reference: 'X' });

    expect(outcome).toMatchObject({ kind: 'FAILED', code: 'UNSUPPORTED_BANK' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses legacy CBE links into FT reference + account digits', async () => {
    const service = makeService();

    await service.verify({
      bank: 'cbe',
      url: 'https://apps.cbe.com.et:100/?id=FT26287CZTG923923036',
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toEqual({
      bank: 'cbe',
      reference: 'FT26287CZTG9',
      accountNumber: '23923036',
    });
  });

  it('passes mbreciept short links through as the reference', async () => {
    const service = makeService();
    const link = 'https://mbreciept.cbe.com.et/AbCdEf0123456789';

    await service.verify({ bank: 'cbe', url: link });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toEqual({ bank: 'cbe', reference: link });
  });

  it('extracts the Telebirr reference from a receipt link and maps the bank id', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        verified: true,
        amount: 500,
        currency: 'ETB',
        reference: 'CHQ0FJ403O',
      }),
    );
    const service = makeService();

    const outcome = await service.verify({
      bank: 'tele',
      url: 'https://transactioninfo.ethiotelecom.et/receipt/CHQ0FJ403O',
    });

    expect(outcome.kind).toBe('VERIFIED');
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toEqual({ bank: 'telebirr', reference: 'CHQ0FJ403O' });
  });

  it('sends BOA account digits only for bare references', async () => {
    const service = makeService();

    await service.verify({
      bank: 'boa',
      reference: 'ABC123',
      account: '56789',
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toEqual({
      bank: 'boa',
      reference: 'ABC123',
      accountNumber: '56789',
    });
  });

  it('caches definitive answers to protect the per-IP rate limit', async () => {
    const service = makeService();

    await service.verify({ bank: 'cbe', reference: 'FT26287CZTG9' });
    const second = await service.verify({
      bank: 'cbe',
      reference: 'FT26287CZTG9',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.kind).toBe('VERIFIED');

    service.clearCache();
    await service.verify({ bank: 'cbe', reference: 'FT26287CZTG9' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures so recovery is never hidden', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { success: false, error: 'boom' }),
    );
    const service = makeService();

    await service.verify({ bank: 'cbe', reference: 'FT1234567890' });
    await service.verify({ bank: 'cbe', reference: 'FT1234567890' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is disabled by CHEKI_ENABLED=false without calling Cheki', async () => {
    const service = makeService({ CHEKI_ENABLED: 'false' });

    expect(service.enabled).toBe(false);
    const outcome = await service.verify({
      bank: 'cbe',
      reference: 'FT1234567890',
    });
    expect(outcome).toMatchObject({ kind: 'FAILED', code: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a reference or url', async () => {
    const service = makeService();

    const outcome = await service.verify({ bank: 'cbe' });

    expect(outcome).toMatchObject({ kind: 'FAILED', code: 'BAD_INPUT' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('OCR (scanReceiptImage)', () => {
    it('returns a FOUND lookup for a receipt-link QR without verifying anything by itself', async () => {
      // Contract mirrors a live probe of POST /api/ocr (docs/audit notes).
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          success: true,
          source: 'qr',
          text: 'https://apps.cbe.com.et:100/?id=FT26140P01YB60536171',
          bank: 'cbe',
          reference: 'FT26140P01YB',
          confidence: 'high',
          candidates: ['FT26140P01YB'],
        }),
      );
      const service = makeService();

      const outcome = await service.scanReceiptImage(Buffer.from('fake-png'), {
        filename: 'receipt.png',
        mimeType: 'image/png',
      });

      expect(outcome).toMatchObject({
        kind: 'FOUND',
        bankCode: 'cbe',
        bank: 'cbe',
        reference: 'FT26140P01YB',
        text: 'https://apps.cbe.com.et:100/?id=FT26140P01YB60536171',
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://cheki.et/api/ocr');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);
    });

    it('maps Cheki bank codes to our bank ids (telebirr → tele)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          success: true,
          source: 'qr',
          text: 'DET8FJGUJ4',
          bank: 'telebirr',
          reference: 'DET8FJGUJ4',
        }),
      );

      const outcome = await makeService().scanReceiptImage(Buffer.from('x'));

      expect(outcome).toMatchObject({ kind: 'FOUND', bank: 'tele' });
    });

    it('flags banks we do not support instead of guessing', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          success: true,
          source: 'qr',
          text: 'raw-qr',
          bank: 'nib',
          reference: 'NIB-REF-123',
        }),
      );

      const outcome = await makeService().scanReceiptImage(Buffer.from('x'));

      expect(outcome).toMatchObject({
        kind: 'FOUND',
        bankCode: 'nib',
        bank: null,
      });
    });

    it('returns NONE when the image has no QR (manually reviewed instead)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          success: true,
          source: 'none',
          text: '',
          qrDetected: false,
        }),
      );

      const outcome = await makeService().scanReceiptImage(Buffer.from('x'));

      expect(outcome).toEqual({ kind: 'NONE' });
    });

    it('surfaces rate limits without retrying', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          429,
          { success: false, error: 'Too many requests' },
          { 'retry-after': '42' },
        ),
      );

      const outcome = await makeService().scanReceiptImage(Buffer.from('x'));

      expect(outcome).toMatchObject({ kind: 'FAILED', code: 'RATE_LIMITED' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('degrades to FAILED on HTTP errors and unreadable bodies', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(500, { success: false, error: 'ocr exploded' }),
      );
      expect(
        await makeService().scanReceiptImage(Buffer.from('x')),
      ).toMatchObject({
        kind: 'FAILED',
        code: 'HTTP_ERROR',
        message: 'ocr exploded',
      });

      fetchMock.mockResolvedValue(jsonResponse(200, 'not-json'));
      expect(
        await makeService().scanReceiptImage(Buffer.from('x')),
      ).toMatchObject({
        kind: 'FAILED',
        code: 'MALFORMED',
      });
    });

    it('degrades to FAILED when the network is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const outcome = await makeService().scanReceiptImage(Buffer.from('x'));

      expect(outcome).toMatchObject({ kind: 'FAILED', code: 'UNREACHABLE' });
    });

    it('rejects empty/oversized images and a disabled adapter without calling Cheki', async () => {
      const service = makeService();

      expect(await service.scanReceiptImage(Buffer.alloc(0))).toMatchObject({
        kind: 'FAILED',
        code: 'MALFORMED',
      });
      expect(
        await service.scanReceiptImage(Buffer.alloc(10 * 1024 * 1024 + 1)),
      ).toMatchObject({ kind: 'FAILED', code: 'MALFORMED' });
      expect(fetchMock).not.toHaveBeenCalled();

      const off = makeService({ CHEKI_ENABLED: 'false' });
      expect(await off.scanReceiptImage(Buffer.from('x'))).toMatchObject({
        kind: 'FAILED',
        code: 'NOT_CONFIGURED',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
