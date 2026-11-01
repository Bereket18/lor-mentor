import { IsBoolean } from 'class-validator';

// Admin action: grant or revoke a teacher's anatomy reviewer access.
export class SetAnatomyReviewerDto {
  @IsBoolean()
  isAnatomyReviewer!: boolean;
}
