import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmailValue } from '../../../common/normalize-email';

/**
 * Inputs for the passwordless flow.
 *
 * Every DTO is a whitelist: the global ValidationPipe rejects unknown fields,
 * so a client cannot smuggle `role`, `userId`, `isEmailVerified` or an account
 * number into a request that creates or signs in an account.
 */

export class StartEmailDto {
  @Transform(({ value }) => normalizeEmailValue(value))
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email!: string;

  /** Optional local path to return to after sign-in (allowlisted server-side). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  returnTo?: string;
}

export class ResendEmailDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  challengeId!: string;
}

export class EmailCodeDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  challengeId!: string;

  // One text input, exactly six digits. Leading zeroes are preserved because
  // this is a string, not a number.
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the six-digit code from the email' })
  code!: string;
}

export class EmailConfirmDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  challengeId!: string;

  /** The high-entropy secret from the email's URL fragment. */
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  /**
   * Explicit consent to sign in on THIS device. Opening the link alone must not
   * complete anything, so the value is required and fixed.
   */
  @Equals('current-browser', {
    message: 'Confirm sign-in on this device to continue',
  })
  destination!: string;
}

export class CompleteProfileDto {
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(100, { message: 'Full name must be less than 100 characters' })
  fullName!: string;

  @IsString()
  @MinLength(9, { message: 'Please enter a valid phone number' })
  @MaxLength(15, { message: 'Phone number is too long' })
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty({ message: 'Please select your department' })
  departmentId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Please select your academic year' })
  academicYearId!: string;
}
