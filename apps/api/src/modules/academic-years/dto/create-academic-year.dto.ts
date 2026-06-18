import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateAcademicYearDto {
  @IsString()
  @IsNotEmpty({ message: 'departmentId is required' })
  departmentId!: string;

  @IsString()
  @MinLength(2, { message: 'Label must be at least 2 characters' })
  @MaxLength(50)
  label!: string; // e.g. "Year 1", "Year 2"
}
