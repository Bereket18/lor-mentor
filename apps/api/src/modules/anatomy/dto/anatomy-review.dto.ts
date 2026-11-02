import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Teaching text is plain text. Rejecting angle brackets is deliberately
 * stricter than parsing HTML: it also blocks malformed tags and entity tricks,
 * and the review form has no rich-text use case.
 */
const NO_HTML = /^[^<>]*$/;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimStringArray(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const items: unknown[] = value;
  return items.map((item) => (typeof item === 'string' ? item.trim() : item));
}
// Route parameter for /anatomy/review/structures/:id. Prisma ids are cuids.
export class ReviewStructureParamsDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+$/)
  id!: string;
}

// Route parameter for /anatomy/review/systems/:slug.
export class ReviewSystemParamsDto {
  @IsString()
  @MaxLength(80)
  @Matches(SLUG)
  slug!: string;
}

export class UpdateAnatomyStructureDto {
  // Optimistic concurrency token: the updatedAt the editor loaded. A mismatch
  // means another reviewer saved first, and the API returns 409.
  @IsDateString()
  updatedAt!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(600)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(800)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  location?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(800)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  function?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(600)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  bloodSupply?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(800)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  clinicalNotes?: string;

  @IsOptional()
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  @Matches(NO_HTML, {
    each: true,
    message: 'HTML tags are not allowed in references.',
  })
  references?: string[];

  @IsOptional()
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Matches(SLUG, { each: true })
  relatedSlugs?: string[];

  // Optional revision note, not a teaching field.
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(300)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  note?: string;
}

export class ReviewStructureDto {
  // The UI sends the updatedAt it is looking at so a stale review cannot
  // approve text that changed in another tab. The API accepts it as optional
  // for scripted use, but the UI always sends it.
  @IsOptional()
  @IsDateString()
  updatedAt?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(300)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  note?: string;
}

export class ReviewSystemDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(300)
  @Matches(NO_HTML, { message: 'HTML tags are not allowed.' })
  note?: string;
}

// Administrator-only lab policy toggle.
export class ReviewSettingsDto {
  @IsBoolean()
  requireSecondReviewer!: boolean;
}
