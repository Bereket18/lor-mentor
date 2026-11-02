import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyEmailDto } from './dto/verify-email.dto';

const VALID_TOKEN = 'a'.repeat(64);

/** The exact pipe configured in main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

async function errorsFor(body: unknown) {
  return validate(plainToInstance(VerifyEmailDto, body));
}

async function transform(body: unknown): Promise<unknown> {
  // `ValidationPipe.transform` is typed `any`; narrow it at the boundary so the
  // rest of the file stays type-safe.
  const value = (await pipe.transform(body, {
    type: 'body',
    metatype: VerifyEmailDto,
  })) as unknown;
  return value;
}

/**
 * The pipe rejects with a BadRequestException whose `.message` is the generic
 * "Bad Request Exception"; the useful detail is in the response body, which is
 * what an API caller actually sees.
 */
async function rejectionReason(body: unknown): Promise<string> {
  try {
    await transform(body);
  } catch (error) {
    return JSON.stringify(
      (error as { getResponse: () => unknown }).getResponse(),
    );
  }
  throw new Error('expected the validation pipe to reject this body');
}

describe('VerifyEmailDto', () => {
  it('accepts a well-formed token', async () => {
    await expect(errorsFor({ token: VALID_TOKEN })).resolves.toHaveLength(0);
  });

  it('rejects a missing token', async () => {
    const errors = await errorsFor({});
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('token');
  });

  it('rejects empty, whitespace-only and non-string tokens', async () => {
    for (const token of ['', '    ', 12345, null, {}, ['a'.repeat(64)]]) {
      await expect(errorsFor({ token })).resolves.not.toHaveLength(0);
    }
  });

  it('rejects malformed lengths', async () => {
    await expect(errorsFor({ token: 'abc' })).resolves.not.toHaveLength(0);
    await expect(
      errorsFor({ token: 'a'.repeat(257) }),
    ).resolves.not.toHaveLength(0);
  });

  it('trims surrounding whitespace before validating', async () => {
    const dto = (await transform({
      token: `  ${VALID_TOKEN}  `,
    })) as VerifyEmailDto;
    expect(dto.token).toBe(VALID_TOKEN);
  });

  it('rejects unexpected fields', async () => {
    const reason = await rejectionReason({
      token: VALID_TOKEN,
      role: 'SUPER_ADMIN',
    });
    expect(reason).toMatch(/role/);
    expect(reason).toMatch(/should not exist/);
  });

  it('rejects the old bare-shape abuse the endpoint used to allow', async () => {
    // `@Body('token')` accepted any JSON object as long as `token` existed,
    // including one carrying unrelated privileged-looking keys.
    const reason = await rejectionReason({
      token: VALID_TOKEN,
      isVerified: true,
    });
    expect(reason).toMatch(/isVerified/);
  });
});
