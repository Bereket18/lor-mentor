import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for POST /auth/verify-email.
 *
 * This endpoint used to declare `@Body('token') token: string` — a type-only
 * annotation. The global ValidationPipe only strips unknown fields and rejects
 * extra ones for **DTO classes**, so without a class metatype `whitelist` and
 * `forbidNonWhitelisted` did nothing and any JSON shape was accepted. A DTO
 * makes the contract explicit and enforced.
 *
 * The generated token is 32 random bytes hex-encoded (64 chars). The bounds are
 * deliberately looser than that exact format so a link emailed by an older
 * build (different length, same property) still verifies; the service remains
 * the authority on whether the token exists and is unexpired.
 */
export class VerifyEmailDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString({ message: 'Verification token must be a string' })
  @IsNotEmpty({ message: 'Verification token is required' })
  @MinLength(16, { message: 'Verification token is malformed' })
  @MaxLength(256, { message: 'Verification token is malformed' })
  token!: string;
}
