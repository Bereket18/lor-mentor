import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty({ message: 'courseId is required' })
  courseId!: string;

  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters' })
  @MaxLength(150)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}
