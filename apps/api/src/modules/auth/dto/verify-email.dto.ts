import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { normalizeEmailValue } from '../../../common/normalize-email';

/**
 * Body for POST /auth/verify-email.
 *
 * This endpoint used to declare `@Body('token') token: string` — a type-only
 * annotation. The global ValidationPipe only strips unknown fields and rejects
 * extra ones for **DTO classes**, so without a class metatype `whitelist` and
 * `forbidNonWhitelisted` did nothing and any JSON shape was accepted. A DTO
 * makes the contract explicit and enforced.
 *
 * Email is part of the body because a six-digit code has only 10^6 possible
 * values: looking the code up on its own could match a different account's row,
 * so the request has to say which account it means and the service compares
 * within that one account. The email is trimmed and lowercased to match how it
 * is stored on registration.
 *
 * The code is a **string of exactly six digits**, never a number. `@IsNumber`
 * or a numeric transform would turn "000042" into 42 and drop the leading
 * zeroes the generator deliberately preserves.
 */
export class VerifyEmailDto {
  @Transform(({ value }) => normalizeEmailValue(value))
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString({ message: 'Verification code must be a string' })
  @IsNotEmpty({ message: 'Verification code is required' })
  @Matches(/^\d{6}$/, {
    message: 'Verification code must be 6 digits',
  })
  code!: string;
}
