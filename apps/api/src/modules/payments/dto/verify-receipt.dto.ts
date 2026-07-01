import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const SUPPORTED_BANKS = [
  'cbe',
  'dashen',
  'awash',
  'boa',
  'zemen',
  'tele',
] as const;

export type SupportedBank = (typeof SUPPORTED_BANKS)[number];

/**
 * Student submits a bank transaction reference (or full receipt URL) to be
 * verified against the bank. Either `reference` or `url` must be present —
 * enforced in the service so we can return a clean domain error.
 */
export class VerifyReceiptDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsIn(SUPPORTED_BANKS, {
    message: `bank must be one of: ${SUPPORTED_BANKS.join(', ')}`,
  })
  bank!: SupportedBank;

  // FT / transaction / receipt-id (CBE, Telebirr, and where a bare ref works).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  // Full receipt URL — required for banks that don't accept a bare reference.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  // CBE only: last 8 digits (or full) of the account, needed to build the URL.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  account?: string;
}
