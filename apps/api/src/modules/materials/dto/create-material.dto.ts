import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
  IsUrl,
} from 'class-validator';

export enum MaterialTypeInput {
  PDF = 'PDF',
  IMAGE = 'IMAGE',
  YOUTUBE = 'YOUTUBE',
}

export class CreateMaterialDto {
  @IsString()
  @IsNotEmpty({ message: 'courseId is required' })
  courseId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title!: string;

  @IsEnum(MaterialTypeInput, { message: 'type must be PDF, IMAGE, or YOUTUBE' })
  type!: MaterialTypeInput;

  // Only required when type is YOUTUBE — validated manually in the service
  // since class-validator can't easily express "required if X"
  @IsOptional()
  @IsUrl({}, { message: 'Please provide a valid YouTube URL' })
  youtubeUrl?: string;
}
