import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExplainStructureDto {
  // Optional follow-up question for the tutor. The structure notes are always
  // included; this only adds a student-authored question.
  @IsOptional()
  @IsString()
  @MaxLength(800)
  question?: string;
}
