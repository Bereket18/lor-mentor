import { IsString, Matches, MaxLength } from 'class-validator';

// Anatomy system slugs are lowercase, hyphen-separated identifiers
// (for example "heart"). Validate the route parameter before it reaches the
// database so malformed or oversized values fail fast with a 400.
export class GetSystemParamsDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
