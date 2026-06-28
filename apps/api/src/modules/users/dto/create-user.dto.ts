import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsIn(['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'])
  role!: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN';

  // Required for students; optional for staff
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}
