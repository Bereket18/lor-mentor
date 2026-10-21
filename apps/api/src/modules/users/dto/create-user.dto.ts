import {
  ArrayMaxSize,
  IsArray,
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

  // Teachers only: optional course pre-assignment performed atomically with
  // account creation, so a newly created teacher already sees their courses
  // on the dashboard (no second manual assignment step on the course page).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  courseIds?: string[];
}
