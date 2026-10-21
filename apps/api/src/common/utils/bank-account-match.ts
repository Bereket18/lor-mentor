/**
 * Match a known full bank account against the (possibly masked) receiver
 * account printed on a receipt.
 *
 * Ethiopian bank receipts frequently mask the middle of an account. Two mask
 * shapes occur in the wild:
 *  - positional masks, where each '*' lines up with one hidden digit, e.g.
 *    "1000****56789" or "1000XXXXX6789";
 *  - collapsed masks, where a fixed run of stars stands in for any number of
 *    hidden digits. Real example: CBE prints "1****3036" for an account that
 *    ends in "…3923036" — here the star count (4) does not equal the number
 *    of hidden digits (8), so position-by-position alignment fails.
 *
 * We first align both numbers on the right and treat '*' / 'X' as wildcards,
 * requiring every VISIBLE digit to agree and at least `minVisible` visible
 * digits to line up — so a heavily-masked value like "****" can never match
 * by accident. If that fails, we retry as a collapsed mask: the leading
 * visible run must match the START of our account, the trailing run must
 * match the END, and any middle runs must appear in order between them.
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

  return (
    rightAlignedMatch(oursDigits, masked, minVisible) ||
    collapsedMaskMatch(oursDigits, masked, minVisible)
  );
}

function isWildcard(char: string | undefined): boolean {
  return char === '*' || char === 'X' || char === 'x';
}

function rightAlignedMatch(
  oursDigits: string,
  masked: string,
  minVisible: number,
): boolean {
  const o = oursDigits.split('').reverse();
  const r = masked.split('').reverse();
  const len = Math.min(o.length, r.length);
  if (len < minVisible) return false;

  let visible = 0;
  for (let i = 0; i < len; i++) {
    const rc = r[i];
    if (isWildcard(rc)) continue;
    if (rc !== o[i]) return false;
    visible++;
  }
  return visible >= minVisible;
}

/**
 * Handle collapsed masks like CBE's "1****3036" for "1000423923036": anchor
 * the first visible run at the start of our account and the last visible run
 * at its end (unless the mask itself starts/ends with stars), then require
 * any middle runs to appear in order between the anchors.
 */
function collapsedMaskMatch(
  oursDigits: string,
  masked: string,
  minVisible: number,
): boolean {
  if (!/[*Xx]/.test(masked)) return false;

  const parts = masked.split(/[*Xx]+/).filter(Boolean);
  const visible = parts.join('').length;
  if (!parts.length || visible < minVisible) return false;

  const startsWithStar = isWildcard(masked[0]);
  const endsWithStar = isWildcard(masked[masked.length - 1]);

  let from = 0;
  let to = oursDigits.length;

  if (!startsWithStar) {
    const prefix = parts[0];
    if (!oursDigits.startsWith(prefix)) return false;
    from = prefix.length;
  }
  if (!endsWithStar) {
    const suffix = parts[parts.length - 1];
    if (!oursDigits.endsWith(suffix)) return false;
    to -= suffix.length;
  }
  if (to < from) return false;

  const middles = parts.slice(
    startsWithStar ? 0 : 1,
    endsWithStar ? parts.length : parts.length - 1,
  );
  for (const part of middles) {
    const at = oursDigits.indexOf(part, from);
    if (at < 0 || at + part.length > to) return false;
    from = at + part.length;
  }
  return true;
}

/**
 * Extract the account digits embedded in a legacy CBE receipt link
 * (`https://apps.cbe.com.et:100/?id=<FT number><account digits>`).
 *
 * Used to keep the scraper guard in the payments flow: for a pasted legacy
 * link the digits come from the URL instead of a form field, so they must
 * still be checked against the college's receiving accounts before verifying.
 * Returns null when the URL is not a legacy CBE link or has no digit suffix.
 */
export function extractLegacyCbeLinkDigits(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'apps.cbe.com.et') return null;
    const id = (parsed.searchParams.get('id') ?? '').trim();
    const match = /^FT[0-9A-Za-z]{10}(\d{8,})$/i.exec(id);
    return match ? match[1] : null;
  } catch {
    return null;
  }
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
