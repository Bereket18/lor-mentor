import { bankAccountsMatch, isCompanyAccount } from './bank-account-match';

describe('bankAccountsMatch', () => {
  it('matches identical accounts', () => {
    expect(bankAccountsMatch('1000123456789', '1000123456789')).toBe(true);
  });

  it('matches when the receipt masks the middle', () => {
    expect(bankAccountsMatch('1000123456789', '1000****56789')).toBe(true);
    expect(bankAccountsMatch('1000123456789', '1000XXXXX6789')).toBe(true);
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

  it('rejects an account not in the list', () => {
    expect(isCompanyAccount(ours, '5555666677778')).toBe(false);
  });

  it('rejects against an empty list', () => {
    expect(isCompanyAccount([], '1000123456789')).toBe(false);
  });
});
