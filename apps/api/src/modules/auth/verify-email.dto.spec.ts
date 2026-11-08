import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyEmailDto } from './dto/verify-email.dto';

const VALID_EMAIL = 'student@example.com';
const VALID_CODE = '123456';

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
  it('accepts a well-formed email and six-digit code', async () => {
    await expect(
      errorsFor({ email: VALID_EMAIL, code: VALID_CODE }),
    ).resolves.toHaveLength(0);
  });

  it("accepts codes with leading zeroes as six characters", async () => {
    for (const code of ['000000', '000042', '007007']) {
      await expect(errorsFor({ email: VALID_EMAIL, code })).resolves.toHaveLength(
        0,
      );
    }
  });

  it('rejects a missing code or a missing email', async () => {
    const noCode = await errorsFor({ email: VALID_EMAIL });
    expect(noCode.map((e) => e.property)).toEqual(['code']);

    const noEmail = await errorsFor({ code: VALID_CODE });
    expect(noEmail.map((e) => e.property)).toEqual(['email']);
  });

  it('rejects codes that are not exactly six digits', async () => {
    for (const code of [
      '',
      '   ',
      '12345', // too short
      '1234567', // too long
      '12345a', // not all digits
      'abcdef',
      '12 456', // internal space
      '+123456',
      123456, // a number, not a string
      null,
      {},
      [VALID_CODE],
    ]) {
      await expect(
        errorsFor({ email: VALID_EMAIL, code }),
      ).resolves.not.toHaveLength(0);
    }
  });

  it('rejects 123456 as a number rather than coercing it', async () => {
    // The distinction matters beyond type strictness: a numeric transform would
    // also turn "000042" into 42 and destroy codes with leading zeroes.
    const errors = await errorsFor({ email: VALID_EMAIL, code: 123456 });
    expect(errors.map((e) => e.property)).toEqual(['code']);
    expect(Object.keys(errors[0].constraints ?? {})).toContain('isString');
  });

  it('rejects malformed email addresses', async () => {
    for (const email of ['', 'not-an-email', 'a@', '@example.com', 42, null]) {
      await expect(
        errorsFor({ email, code: VALID_CODE }),
      ).resolves.not.toHaveLength(0);
    }
  });

  it('trims surrounding whitespace on the code', async () => {
    // Includes a trailing newline: pasting a code out of an email or a terminal
    // commonly drags one along, and it is not something the user typed.
    for (const code of [`  ${VALID_CODE}  `, `\n${VALID_CODE}\n`, `\t${VALID_CODE}`]) {
      const dto = (await transform({
        email: VALID_EMAIL,
        code,
      })) as VerifyEmailDto;
      expect(dto.code).toBe(VALID_CODE);
    }
  });

  it('lowercases and trims the email so it matches the stored form', async () => {
    const dto = (await transform({
      email: '  Student@Example.COM ',
      code: VALID_CODE,
    })) as VerifyEmailDto;
    expect(dto.email).toBe(VALID_EMAIL);
  });

  it('rejects unexpected fields', async () => {
    const reason = await rejectionReason({
      email: VALID_EMAIL,
      code: VALID_CODE,
      role: 'SUPER_ADMIN',
    });
    expect(reason).toMatch(/role/);
    expect(reason).toMatch(/should not exist/);
  });

  it('rejects the old bare-shape abuse the endpoint used to allow', async () => {
    // `@Body('token')` accepted any JSON object as long as `token` existed,
    // including one carrying unrelated privileged-looking keys.
    const reason = await rejectionReason({
      email: VALID_EMAIL,
      code: VALID_CODE,
      isVerified: true,
    });
    expect(reason).toMatch(/isVerified/);
  });

  it('no longer accepts the removed `token` field', async () => {
    const reason = await rejectionReason({
      email: VALID_EMAIL,
      token: 'a'.repeat(64),
    });
    expect(reason).toMatch(/token/);
    expect(reason).toMatch(/should not exist/);
  });
});
