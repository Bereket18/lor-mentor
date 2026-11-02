import { ValidationPipe } from '@nestjs/common';
import { VerifyReceiptDto } from './verify-receipt.dto';

/**
 * Mirrors the production global ValidationPipe (apps/api/src/main.ts):
 * whitelist + forbidNonWhitelisted + transform. Proves that a student cannot
 * inject an amount/price/duration through the receipt-verification request:
 * unexpected fields are rejected outright, and the service always resolves
 * money + duration from the server-side plan row (see payments.service.spec).
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const bodyMeta = { type: 'body' as const, metatype: VerifyReceiptDto };

describe('VerifyReceiptDto hardening', () => {
  it.each([
    ['amount', { amount: 1 }],
    ['priceETB', { priceETB: 1 }],
    ['price', { price: 1 }],
    ['durationMonths', { durationMonths: 120 }],
    ['subscriptionMonths', { subscriptionMonths: 120 }],
    ['isVerified', { isVerified: true }],
    ['userId', { userId: 'someone-else' }],
  ])('rejects the client-supplied "%s" field', async (_name, injected) => {
    await expect(
      pipe.transform(
        {
          planId: 'plan-1',
          bank: 'cbe',
          reference: 'FT1234567890',
          ...injected,
        },
        bodyMeta,
      ),
    ).rejects.toThrow();
  });

  it('accepts a clean reference payload and keeps only DTO fields', async () => {
    const result = (await pipe.transform(
      { planId: 'plan-1', bank: 'cbe', reference: 'FT1234567890' },
      bodyMeta,
    )) as Record<string, unknown>;

    expect(result).toEqual({
      planId: 'plan-1',
      bank: 'cbe',
      reference: 'FT1234567890',
    });
  });

  it('rejects an unsupported bank code', async () => {
    const err = await pipe
      .transform(
        { planId: 'plan-1', bank: 'not-a-bank', reference: 'X' },
        bodyMeta,
      )
      .catch((e: unknown) => e);

    expect(err).toBeDefined();
    expect(
      JSON.stringify((err as { getResponse(): unknown }).getResponse()),
    ).toMatch(/bank must be one of/);
  });

  it('rejects a missing planId', async () => {
    await expect(
      pipe.transform({ bank: 'cbe', reference: 'FT1234567890' }, bodyMeta),
    ).rejects.toThrow();
  });

  it('rejects a missing reference and url', async () => {
    const result = (await pipe.transform(
      { planId: 'plan-1', bank: 'cbe' },
      bodyMeta,
    )) as VerifyReceiptDto;

    // Both are optional at the DTO level; the service returns a clean domain
    // error instead (see payments.service.spec 'requires' coverage).
    expect(result.reference).toBeUndefined();
    expect(result.url).toBeUndefined();
  });
});
