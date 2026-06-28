import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReactionDto {
  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  replyId?: string;

  @IsIn(['LIKE', 'LOVE', 'TARGET', 'FIRE'])
  type!: 'LIKE' | 'LOVE' | 'TARGET' | 'FIRE';
}
