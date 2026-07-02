/**
 * Match a known full bank account against the (possibly masked) receiver
 * account printed on a receipt.
 *
 * Ethiopian bank receipts frequently mask the middle of an account, e.g.
 * "1****6789" or "1000XXXX789". We align both numbers on the right and treat
 * '*' / 'X' as wildcards, requiring every VISIBLE digit to agree and at least
 * `minVisible` visible digits to line up — so a heavily-masked value like
 * "****" can never match by accident.
 *
 * This is the security-critical check that gates auto-approval: a payment is
 * only auto-approved when its receiver is one of OUR accounts.
 */
export function bankAccountsMatch(
  ours: string,
  receipt: string,
  minVisible = 4,
): boolean {
  const oursDigits = (ours ?? '').replace(/\D/g, '');
  const masked = (receipt ?? '').replace(/[^0-9*Xx]/g, '');
  if (!oursDigits || !masked) return false;

  const o = oursDigits.split('').reverse();
  const r = masked.split('').reverse();
  const len = Math.min(o.length, r.length);
  if (len < minVisible) return false;

  let visible = 0;
  for (let i = 0; i < len; i++) {
    const rc = r[i];
    if (rc === '*' || rc === 'X' || rc === 'x') continue;
    if (rc !== o[i]) return false;
    visible++;
  }
  return visible >= minVisible;
}

/** True when `receiverAccount` matches any account in the list. */
export function isCompanyAccount(
  companyAccounts: string[],
  receiverAccount: string,
): boolean {
  return companyAccounts.some((ours) =>
    bankAccountsMatch(ours, receiverAccount),
  );
}
