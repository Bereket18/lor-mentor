import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  // The exact text of the option the student picked
  @IsString()
  selected!: string;
}

export class SubmitAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];

  // Seconds spent — optional, recorded for analytics
  @IsOptional()
  @IsInt()
  @Min(0)
  timeTaken?: number;
}
