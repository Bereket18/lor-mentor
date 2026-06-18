import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
