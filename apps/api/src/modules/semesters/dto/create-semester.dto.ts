import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateSemesterDto {
  @IsString()
  @IsNotEmpty({ message: 'academicYearId is required' })
  academicYearId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string; // e.g. "Semester 1"
}
