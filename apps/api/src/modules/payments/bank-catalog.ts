/**
 * Catalog of banks the college can accept payments from.
 *
 * Sourced from Cheki's public bank catalog (GET https://cheki.et/api/banks).
 * `auto: true` means our verification stack can confirm a receipt with the
 * bank automatically (Cheki primary, local verifier fallback). `auto: false`
 * means a submitted reference is queued for manual review — never approved
 * from the student's word alone.
 *
 * Admins choose which entries are enabled for the college (AcceptedBank
 * table); they cannot invent codes here, so the DTO whitelist and the bank
 * pipeline can never drift apart.
 */
export type BankInputMode = 'cbe' | 'ref' | 'url';

export interface CatalogBank {
  /** Stable id used by the API/DB (Cheki's code, except our legacy `tele`). */
  code: string;
  label: string;
  /** What the student is asked for on the payment page. */
  input: BankInputMode;
  /** Whether an automated bank lookup exists for this bank. */
  auto: boolean;
  /**
   * Cheki's typed-reference lookup needs the last N digits of the account
   * (CBE legacy FT = 8, BOA = 5). The admin still stores the full receiving
   * account; this is only the derived lookup requirement.
   */
  accountDigits?: number;
}

export const BANK_CATALOG: readonly CatalogBank[] = [
  // ── Automatically verifiable ────────────────────────────────
  {
    code: 'cbe',
    label: 'Commercial Bank of Ethiopia (CBE)',
    input: 'cbe',
    auto: true,
    accountDigits: 8,
  },
  { code: 'tele', label: 'Telebirr', input: 'ref', auto: true },
  { code: 'dashen', label: 'Dashen Bank', input: 'url', auto: true },
  { code: 'awash', label: 'Awash Bank', input: 'url', auto: true },
  {
    code: 'boa',
    label: 'Bank of Abyssinia (BOA)',
    input: 'ref',
    auto: true,
    accountDigits: 5,
  },
  { code: 'zemen', label: 'Zemen Bank', input: 'url', auto: true },
  { code: 'mpesa', label: 'M-Pesa Ethiopia', input: 'ref', auto: true },
  { code: 'siinqee', label: 'Siinqee Bank', input: 'url', auto: true },
  { code: 'ebirr', label: 'eBirr', input: 'url', auto: true },
  { code: 'zamzam', label: 'ZamZam Bank', input: 'ref', auto: true },

  // ── Manual review only (no automated lookup yet) ────────────
  // Cheki lists these banks but has no working automated format for them
  // (or the format needs data our form does not collect). References are
  // accepted and queued for an admin, never auto-approved.
  { code: 'abay', label: 'Abay Bank', input: 'ref', auto: false },
  {
    code: 'addis',
    label: 'Addis International Bank',
    input: 'ref',
    auto: false,
  },
  { code: 'ahadu', label: 'Ahadu Bank', input: 'ref', auto: false },
  { code: 'amhara', label: 'Amhara Bank', input: 'ref', auto: false },
  {
    code: 'berhan',
    label: 'Berhan International Bank',
    input: 'ref',
    auto: false,
  },
  {
    code: 'bunna',
    label: 'Bunna International Bank',
    input: 'ref',
    auto: false,
  },
  { code: 'cbebirr', label: 'CBE Birr', input: 'ref', auto: false },
  { code: 'enat', label: 'Enat Bank', input: 'ref', auto: false },
  { code: 'gadaa', label: 'Gadaa Bank', input: 'ref', auto: false },
  { code: 'global', label: 'Global Bank Ethiopia', input: 'ref', auto: false },
  { code: 'goh', label: 'Goh Betoch Bank', input: 'ref', auto: false },
  { code: 'hibret', label: 'Hibret Bank', input: 'ref', auto: false },
  { code: 'hijra', label: 'Hijra Bank', input: 'ref', auto: false },
  { code: 'kaafi', label: 'KAAFI Microfinance', input: 'ref', auto: false },
  { code: 'lion', label: 'Lion International Bank', input: 'ref', auto: false },
  { code: 'nib', label: 'Nib International Bank', input: 'ref', auto: false },
  {
    code: 'oromia',
    label: 'Oromia International Bank',
    input: 'ref',
    auto: false,
  },
  { code: 'rammis', label: 'Rammis Bank', input: 'ref', auto: false },
  { code: 'shabelle', label: 'Shabelle Bank', input: 'ref', auto: false },
  { code: 'tsedey', label: 'Tsedey Bank', input: 'ref', auto: false },
  { code: 'wegagen', label: 'Wegagen Bank', input: 'ref', auto: false },
];

/** Every accepted bank id (used by the DTO whitelist). */
export const BANK_CODES: string[] = BANK_CATALOG.map((b) => b.code);

export function catalogBank(code: string): CatalogBank | null {
  return BANK_CATALOG.find((b) => b.code === code) ?? null;
}

/** Banks the local verification stack can look up automatically. */
export const AUTO_BANK_CODES = new Set(
  BANK_CATALOG.filter((b) => b.auto).map((b) => b.code),
);
