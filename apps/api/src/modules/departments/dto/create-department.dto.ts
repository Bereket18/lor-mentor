import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2, { message: 'Department name must be at least 2 characters' })
  @MaxLength(100, {
    message: 'Department name must be less than 100 characters',
  })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be less than 500 characters' })
  description?: string;
}
