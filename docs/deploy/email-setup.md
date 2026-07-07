# Production Email Setup (SMTP + SPF/DKIM/DMARC)

Your app already sends real email via `nodemailer` (verification + password
reset, with HTML templates and token expiry — see `apps/api/src/modules/mail/`).
Nothing in the code changes. What's left is **operational**: pick a provider,
verify your domain, and set 5 env vars. Do this once.

## 1. Choose a provider

Any transactional SMTP works (the code is provider-agnostic). Recommended:

| Provider | Why | Free tier |
|---|---|---|
| **Resend** (recommended) | Simplest DNS + dashboard, great deliverability | 3,000/mo, 100/day |
| Mailgun | Mature, good analytics | Trial then paid |
| SendGrid | Widely used | 100/day forever |
| AWS SES | Cheapest at scale, more setup | Pay-as-you-go |

Gmail SMTP still works but caps ~500/day and lands in spam more often — fine only
for a tiny pilot. Below uses **Resend** as the worked example; the concepts are
identical for the others (they just give you different DNS record values).

## 2. Create the account + verify your domain

1. Sign up at the provider and add your sending domain, e.g. `lormentor.com`.
2. The provider shows DNS records to add. Log into **Hostinger → Domains → DNS Zone**
   (or wherever your domain's DNS lives) and add them. You'll add three kinds:

   - **SPF** (TXT on root `@`) — authorizes the provider to send as your domain.
     ```
     Type: TXT   Name: @   Value: v=spf1 include:resend.com ~all
     ```
     (If you already have an SPF record, MERGE — you may only have ONE SPF TXT.)

   - **DKIM** (CNAME/TXT the provider gives you) — cryptographically signs mail so
     receivers trust it wasn't forged. Resend gives records like:
     ```
     Type: CNAME  Name: resend._domainkey   Value: <provided>.resend.com
     ```

   - **DMARC** (TXT on `_dmarc`) — tells receivers what to do with mail that fails
     SPF/DKIM, and gives you reports. Start in "none" (monitor), tighten later:
     ```
     Type: TXT   Name: _dmarc   Value: v=DMARC1; p=none; rua=mailto:postmaster@lormentor.com
     ```

3. Back in the provider dashboard, click **Verify**. DNS can take 5 min–24 h.
   Don't send production mail until the domain shows **Verified**.

## 3. Get SMTP credentials

In the provider dashboard create an **API key** (Resend) or SMTP username/password.
For Resend the SMTP settings are:

```
host: smtp.resend.com
port: 587
user: resend
pass: <your API key>
```

## 4. Set the environment variables

In `.env.production` on the VPS (already scaffolded in `.env.production.example`):

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<your API key>          # secret — never commit, never hardcode
SMTP_FROM=Lor Mentor <no-reply@lormentor.com>   # the @domain must be the verified one
```

> The app **fails to boot in production** if any SMTP_* is missing (fail-fast
> validation), so you can't accidentally ship a build that silently can't email.

Restart so the new env is picked up:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
```

## 5. Test delivery

1. Register a brand-new account on the site with an address you control.
2. Confirm the verification email arrives **in the inbox** (check spam once — if it
   lands there, your DKIM/SPF isn't verified yet).
3. Click the link → account verified → you can log in.
4. Trigger **Forgot password** → confirm the reset email arrives and works.
5. Tokens: verification links expire in 24 h, reset links in 1 h (already enforced
   server-side). A used or expired token returns a clean "invalid or expired" error.

## Production best practices
- Use a **subdomain sender** you don't read from, e.g. `no-reply@lormentor.com`.
- Keep DMARC at `p=none` for ~2 weeks, read the reports, then move to
  `p=quarantine` and eventually `p=reject` once you confirm all your mail passes.
- Never put `SMTP_PASS` in code, the repo, or client-side env — server env only.
- Warm up volume gradually; sudden spikes look like spam to receivers.
