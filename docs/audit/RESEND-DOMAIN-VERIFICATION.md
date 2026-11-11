# Resend Sending-Domain Verification (F-8)

**Status:** DEFERRED TO DEPLOYMENT (operator decision 2026-10-19) — this is the
procedure to run on the VPS; consolidated checklist also in
`docs/deployer/82-PRODUCTION-GATES-AND-EVIDENCE.md` §3.  
**Owner:** Operator with Resend + DNS access  
**Estimated time:** 15–30 minutes plus DNS propagation  
**Why:** the current sender (`onboarding@resend.dev`) only delivers to the
Resend account owner. Public registration and password-reset emails are
rejected with SMTP `550` for every other recipient. Production cannot launch
until a real sending domain is verified.

Do not put API keys or DNS values in this file. Record only the verification
date, domain, tester and message IDs.

## 1. Prerequisites

- A Resend account with access to the team that owns the domain.
- DNS access for the domain (for example `lormentor.com`).
- The production API environment (`.env.production` or secret manager).
- A non-owner test mailbox (Gmail, Outlook, etc.) that is **not** the Resend
  account owner address.
- A maintenance window; the API must be restarted after `SMTP_FROM` changes.

## 2. Add the domain in Resend

1. Sign in at <https://resend.com/domains>.
2. Click **Add Domain**.
3. Enter the sending domain. Prefer the root domain (`lormentor.com`) or a
   dedicated subdomain such as `mail.lormentor.com`.
4. Choose the region closest to the users if Resend asks.
5. Resend displays the DNS records for this domain. **Use the exact values
   Resend shows**; do not copy values from this document or another project.

## 3. Add the DNS records

At the DNS provider (Cloudflare, Namecheap, Route 53, etc.) add every record
Resend lists. A typical setup includes:

| Purpose | Type | Name | Value |
|---|---|---|---|
| Return-path / bounce handling | `MX` | `send.<domain>` (or the subdomain Resend shows) | The MX host Resend shows, usually with priority `10` |
| SPF for the sending subdomain | `TXT` | `send.<domain>` (or the subdomain Resend shows) | The exact SPF value Resend shows |
| DKIM signing | `TXT` | `resend._domainkey.<domain>` | The exact `p=...` public key Resend shows |
| DMARC (recommended) | `TXT` | `_dmarc.<domain>` | Start with `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` |

Rules:

- If the root domain already has an SPF record, do **not** add a second one.
  Merge the Resend include into the existing record. Multiple SPF records
  break delivery.
- Keep the DKIM value exactly as provided, including line wrapping if the DNS
  provider accepts a long TXT value.
- On Cloudflare, DNS-only (grey cloud) is correct for these records. Proxying
  MX/TXT records is not supported.
- DMARC `p=none` is a monitoring start. Do not move to `p=reject` until SPF and
  DKIM pass consistently.

## 4. Verify in Resend

1. Return to <https://resend.com/domains>.
2. Click **Verify** next to the domain.
3. Wait for status **Verified**. DNS usually propagates in minutes; allow up to
   48 hours in slow cases.
4. Open the domain's details and confirm SPF, DKIM and (if configured) DMARC
   are all green.

If verification fails, re-check the record names and values against the Resend
dashboard. A common cause is adding records to the wrong zone or adding a
second SPF record.

## 5. Create/rotate the sending API key

1. In Resend, open **API Keys** and create a key with **Sending access**.
2. Restrict the key to the verified domain if Resend offers that option.
3. Store the key in the password manager or deployment secret store, not in
   Git, chat or this document.
4. Revoke the old key after the new one is verified.

## 6. Update the API environment

In the production environment (`.env.production` on the host or the secret
manager used by the deploy), set:

```dotenv
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<new Resend sending API key>
SMTP_FROM=Lor Mentor <no-reply@lormentor.com>
```

`SMTP_FROM` **must** use the domain you just verified. Do not leave
`onboarding@resend.dev` or any other Resend-owned domain in place for
production.

Restart/redeploy the API so the mail service picks up the new values:

```bash
# local production-like run
cd apps/api
node dist/src/main

# docker compose deployment
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

## 7. Re-test with a non-owner address

### Registration

1. Open the web app's **Register** page.
2. Use a real mailbox you control that is **not** the Resend account owner.
3. Complete registration (department and academic year are required).
4. Confirm the verification email arrives and the verification link works.
5. Confirm the Resend **Emails** log shows `Delivered` (not `Bounced` or
   `Failed`).

### Password reset

1. Open **Forgot password** and submit the same non-owner address.
2. Confirm the reset email arrives.
3. Open the link and set a new password.
4. Confirm login works with the new password and the old password fails.

API-only check for the reset trigger (the registration flow is easier in the
UI because it needs department/year IDs):

```bash
curl -i -X POST "https://api.<domain>/api/v1/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test-non-owner@example.com\"}"
```

Expected: HTTP `200` with the same generic message regardless of whether the
account exists. The actual proof is delivery of the email to the non-owner
mailbox.

The prepared probe wraps the same call and warns when `SMTP_FROM` still points
at `resend.dev`:

```bash
npm run check:f8-email -- --api http://localhost:4000 --email test-non-owner@example.com
```

It prints the API status and the generic response. It intentionally cannot read
a mailbox, so a `200` from this script is only the trigger check; F-8 stays open
until the non-owner inbox and the Resend `Emails` log both show delivery.

### Owner-address sanity check (optional)

If delivery to the owner still works but the non-owner fails, the domain is not
verified or `SMTP_FROM` is not on the verified domain. That is exactly the F-8
failure mode.

## 8. Evidence to record

Update `TEST-RESULTS.md` / the F-8 row with:

- Verification date and domain.
- Resend domain status (`Verified`).
- `SMTP_FROM` used (domain only; no key).
- Non-owner test mailbox provider and delivery result.
- Password-reset delivery and successful reset.
- Resend message IDs or dashboard timestamps.
- Any bounce/550 text.

Do **not** record the API key, DNS challenge values, passwords or full email
headers containing private data.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `550` / "domain is not verified" | Domain not verified, or `SMTP_FROM` uses an unverified domain | Finish Resend verification; set `SMTP_FROM` to the verified domain |
| `535` / authentication failed | Wrong API key, or key was revoked | Create a new sending key; update `SMTP_PASS`; restart API |
| Owner receives mail, non-owner does not | Still using `onboarding@resend.dev` or unverified domain | Verify domain and change `SMTP_FROM` |
| Verification stuck | DNS not propagated, wrong zone, duplicate SPF | Re-check records at the authoritative DNS provider; use `dig`/`nslookup` |
| Mail lands in spam | No DMARC, new domain reputation, content | Confirm SPF+DKIM+DMARC; warm up; ask recipient to mark not-spam |
| Resend says DKIM failed | TXT value truncated or split incorrectly | Re-copy the exact DKIM value; some providers need it split into two quoted strings |

## 10. Acceptance criteria

F-8 is closed only when all are true:

- [ ] Resend domain status is **Verified**.
- [ ] `SMTP_FROM` uses that verified domain.
- [ ] A **non-owner** registration receives the verification email.
- [ ] The verification link works.
- [ ] A **non-owner** password reset receives the email and completes.
- [ ] Resend log shows delivered messages, with evidence recorded in the audit.

Until then, email is only reliable for the Resend account owner and F-8 remains
a production launch blocker.
