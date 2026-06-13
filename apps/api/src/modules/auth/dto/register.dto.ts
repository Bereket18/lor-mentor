import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

// This class defines what a register request must look like
// If the request does not match — NestJS rejects it automatically
// No extra validation code needed in the controller or service

export class RegisterDto {
  // Must be a string — cannot be empty
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(100, { message: 'Full name must be less than 100 characters' })
  fullName!: string;

  // Must be a valid email format
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  // Must be a string with minimum 8 characters
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password must be less than 100 characters' })
  password!: string;
}
