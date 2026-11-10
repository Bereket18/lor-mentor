import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { normalizeEmailValue } from '../../../common/normalize-email';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(100, { message: 'Full name must be less than 100 characters' })
  fullName!: string;

  // Normalised before validation, so "  Abebe@X.com " both passes @IsEmail and
  // is stored in the same form a later login, verify or resend will look it up
  // by. UsersService.create normalises again; this keeps the value that reaches
  // the service already canonical rather than relying on that alone.
  @Transform(({ value }) => normalizeEmailValue(value))
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password must be less than 100 characters' })
  password!: string;

  // ── New fields for academic structure + payments ────────────
  @IsString()
  @IsNotEmpty({ message: 'Please select your department' })
  departmentId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Please select your academic year' })
  academicYearId!: string;

  @IsString()
  @MinLength(9, { message: 'Please enter a valid phone number' })
  @MaxLength(15, { message: 'Phone number is too long' })
  phoneNumber!: string;
}
