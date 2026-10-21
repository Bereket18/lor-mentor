import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BANK_CODES } from '../bank-catalog';

/** Add a bank from the catalog to the college's accepted list. */
export class AddBankDto {
  @IsIn(BANK_CODES, {
    message: `code must be one of: ${BANK_CODES.join(', ')}`,
  })
  code!: string;
}

/** Show/hide an adopted bank. */
export class UpdateBankDto {
  @IsBoolean()
  isActive!: boolean;
}

/**
 * Set the college's receiving account for an adopted bank. The number is
 * normalised to digits and checked by the service (at least 8 digits, plus
 * the bank-specific Cheki lookup rule). Keep `accountName` for the student
 * transfer panel (e.g. "LOR MENTOR PLC").
 */
export class SetBankAccountDto {
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  @Matches(/^[0-9\s-]+$/, {
    message: 'accountNumber must contain only digits (spaces and dashes allowed).',
  })
  accountNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName?: string;
}
