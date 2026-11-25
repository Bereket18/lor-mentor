import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The authorization-code response: the `code` Google issued and the `state` we
 * minted. Both are opaque to the client; the pairing is what makes the POST
 * redeemable.
 */
export class GoogleCallbackDto {
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  code!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(128)
  state!: string;
}
