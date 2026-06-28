import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty({ message: 'message is required' })
  @MaxLength(2000)
  message!: string;

  // Optional grounding scope — answer using this course's / material's AI content
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  materialId?: string;
}
