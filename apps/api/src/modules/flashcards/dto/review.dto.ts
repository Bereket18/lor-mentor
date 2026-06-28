import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class ReviewDto {
  @IsString()
  @IsNotEmpty()
  cardId!: string;

  @IsBoolean()
  isKnown!: boolean;
}
