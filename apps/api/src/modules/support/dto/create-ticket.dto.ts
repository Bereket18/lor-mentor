import { Transform } from 'class-transformer';
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

/** Multipart bodies send every field as a string; `''` means "not supplied". */
const optionalTrimmed = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

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
   * Free text the student already has at hand (payment reference, or the
   * number of an older ticket when filing "about T-000123"). A hint for the
   * agent, never an identifier the server trusts.
   */
  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(120)
  reference?: string;

  /**
   * One of the caller's OWN payments. The service re-checks ownership; the
   * field is only an id, never a copied amount or plan.
   */
  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(64)
  paymentId?: string;
}

export class ReplyTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}

export class CreateInternalNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}

export class AssignTicketDto {
  /** `null` unassigns. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedToId?: string | null;
}
