import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty({ message: 'semesterId is required' })
  semesterId!: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
