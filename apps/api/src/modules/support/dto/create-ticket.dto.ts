import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Categories a student can file a ticket under. */
export const SUPPORT_CATEGORIES = [
  'PAYMENT',
  'ACCOUNT',
  'COURSE',
  'TECHNICAL',
  'OTHER',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export class CreateTicketDto {
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  subject!: string;

  @IsOptional()
  @IsIn(SUPPORT_CATEGORIES, {
    message: `category must be one of: ${SUPPORT_CATEGORIES.join(', ')}`,
  })
  category?: SupportCategory;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  body!: string;

  /**
   * Optional reference the student already has at hand (payment reference,
   * receipt number). Kept as free text: it is a hint for the agent, never an
   * identifier the server trusts.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class ReplyTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}
