import { IsString, Matches, MaxLength } from 'class-validator';

// Both anatomy slugs are lowercase, hyphen-separated identifiers
// (for example "heart" and "bundle-of-his"). Validate before the service runs.
export class AnatomyStructureParamsDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  structureSlug!: string;
}
