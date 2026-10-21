import {
  bankAccountsMatch,
  extractLegacyCbeLinkDigits,
  isCompanyAccount,
} from './bank-account-match';

describe('bankAccountsMatch', () => {
  it('matches identical accounts', () => {
    expect(bankAccountsMatch('1000123456789', '1000123456789')).toBe(true);
  });

  it('matches when the receipt masks the middle', () => {
    expect(bankAccountsMatch('1000123456789', '1000****56789')).toBe(true);
    expect(bankAccountsMatch('1000123456789', '1000XXXXX6789')).toBe(true);
  });

  it('matches CBE collapsed masks where the star run hides many digits', () => {
    // Real CBE format: first digit + fixed "****" + last 4 digits. Seen live
    // as "1****3036" for the configured receiving account 1000423923036 (8
    // hidden digits, only 4 stars), so positional alignment cannot match it.
    expect(bankAccountsMatch('1000423923036', '1****3036')).toBe(true);
  });

  it('rejects collapsed masks whose visible ends disagree', () => {
    expect(bankAccountsMatch('1000423923036', '9****3036')).toBe(false);
    expect(bankAccountsMatch('1000423923036', '1****3037')).toBe(false);
    expect(bankAccountsMatch('1000423923036', '2****3394')).toBe(false);
    expect(bankAccountsMatch('1000423923036', '1****')).toBe(false);
    expect(bankAccountsMatch('1000423923036', '****')).toBe(false);
  });

  it('matches when the receipt shows only a suffix', () => {
    // Receipt prints a shorter, right-aligned tail of the same account.
    expect(bankAccountsMatch('1000123456789', '456789')).toBe(true);
  });

  it('rejects a different account (visible digits disagree)', () => {
    expect(bankAccountsMatch('1000123456789', '1000****56700')).toBe(false);
    expect(bankAccountsMatch('1000123456789', '9999123456780')).toBe(false);
  });

  it('rejects when fewer than the minimum visible digits line up', () => {
    expect(bankAccountsMatch('1000123456789', '****6789')).toBe(true); // 4 visible
    expect(bankAccountsMatch('1000123456789', '***789')).toBe(false); // 3 visible
    expect(bankAccountsMatch('1000123456789', '****')).toBe(false);
  });

  it('ignores separators and whitespace', () => {
    expect(bankAccountsMatch('1000-1234-56789', '1000 1234 56789')).toBe(true);
  });

  it('rejects empty / garbage input', () => {
    expect(bankAccountsMatch('', '1000123456789')).toBe(false);
    expect(bankAccountsMatch('1000123456789', '')).toBe(false);
    expect(bankAccountsMatch('1000123456789', 'N/A')).toBe(false);
  });
});

describe('isCompanyAccount', () => {
  const ours = ['1000123456789', '0900112233'];

  it('matches any account in the list', () => {
    expect(isCompanyAccount(ours, '1000****56789')).toBe(true);
    expect(isCompanyAccount(ours, '0900112233')).toBe(true);
  });

  it('matches the live CBE collapsed mask (configured receiving account)', () => {
    expect(isCompanyAccount(['1000423923036', '85802844'], '1****3036')).toBe(
      true,
    );
  });

  it('rejects an account not in the list', () => {
    expect(isCompanyAccount(ours, '5555666677778')).toBe(false);
  });

  it('rejects against an empty list', () => {
    expect(isCompanyAccount([], '1000123456789')).toBe(false);
  });
});

describe('extractLegacyCbeLinkDigits', () => {
  it('extracts the account digits from a legacy CBE receipt link', () => {
    expect(
      extractLegacyCbeLinkDigits(
        'https://apps.cbe.com.et:100/?id=FT26287CZTG923923036',
      ),
    ).toBe('23923036');
  });

  it('accepts lowercase FT and full account numbers', () => {
    expect(
      extractLegacyCbeLinkDigits(
        'https://apps.cbe.com.et:100/?id=ft26287cztg91000423923036',
      ),
    ).toBe('1000423923036');
  });

  it('returns null for other hosts and shapes', () => {
    expect(
      extractLegacyCbeLinkDigits('https://mbreciept.cbe.com.et/AbC123xyz'),
    ).toBeNull();
    expect(
      extractLegacyCbeLinkDigits('https://apps.cbe.com.et:100/?id=FT26287CZTG9'),
    ).toBeNull();
    expect(
      extractLegacyCbeLinkDigits('https://apps.cbe.com.et:100/?id=ABC23923036'),
    ).toBeNull();
    expect(extractLegacyCbeLinkDigits('not a url')).toBeNull();
    expect(extractLegacyCbeLinkDigits('')).toBeNull();
  });
});
