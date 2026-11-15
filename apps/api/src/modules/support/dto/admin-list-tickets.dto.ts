import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORT_CATEGORIES, type SupportCategory } from './create-ticket.dto';
import { SUPPORT_STATUSES, type SupportStatus } from './list-tickets.dto';

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/**
 * Admin inbox filters. Search covers the subject, the quoted reference, the
 * ticket number (`T-123`), and the student's name/email, because the person
 * running the queue usually has one of those at hand and none of the ids.
 */
export class AdminListTicketsDto {
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @IsOptional()
  @IsIn(SUPPORT_CATEGORIES)
  category?: SupportCategory;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** `me` = assigned to the caller; `unassigned` = nobody yet. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedTo?: string;

  /** Only tickets with an unread student message. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

/** Bulk action: close RESOLVED tickets untouched for `olderThanDays`. */
export class BulkCloseResolvedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  olderThanDays?: number;
}
