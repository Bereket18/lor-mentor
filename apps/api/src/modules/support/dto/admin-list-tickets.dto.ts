import { Type } from 'class-transformer';
import {
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

/**
 * Admin inbox filters. Search covers the subject, the quoted reference and the
 * student's name/email, because the person running the queue usually has one
 * of those three at hand and none of the ids.
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
