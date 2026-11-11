# Troubleshooting

Start here whenever something does not behave. Work top to bottom: the first
section tells you how to see what is wrong, then the tables map each symptom to
its cause and the fix.

Keep this page open next to
[10-DEPLOYMENT-GUIDE.md](10-DEPLOYMENT-GUIDE.md) — the section numbers there are
referenced throughout.

---

## 0. First five commands (always run these first)

```bash
cd /opt/lor-mentor

# 1. Which containers are up, and are they healthy?
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# 2. What is the failing service saying?
docker compose -f docker-compose.prod.yml --env-file .env.production \
  logs <service> --tail=100

# 3. Is the API's own health check happy? (database + redis)
curl -s https://api.<domain>/api/v1/health/ready

# 4. Is the site reachable?
curl -sS -o /dev/null -w "%{http_code}\n" https://<domain>/

# 5. What does nginx think?
sudo nginx -t && sudo tail -n 50 /var/log/nginx/error.log
```

`<service>` is one of `api`, `web`, `verifier`, `postgres`, `redis`.

If a container shows `Restarting` or `Exited`, its log explains why. Most
problems are one of: a missing or wrong `.env.production` value, a container
that never became healthy, or DNS/TLS not being ready yet.

---

## 1. The build or the first start fails

| Symptom | Cause | Fix |
|---|---|---|
| Build is killed, `signal: killed`, or the VPS stops responding | Not enough RAM: the build peaks above 2 GB | Add swap ([20-SERVER-PREREQUISITES.md](20-SERVER-PREREQUISITES.md) §1) and retry, or build on a larger machine |
| `docker compose` complains that a variable is not set, or the file has `${VAR}` in it | You used the wrong `--env-file`, or `.env.production` is missing | Always pass `--env-file .env.production`; confirm `ls -l .env.production` shows mode `600` |
| API exits immediately at boot | A required variable is missing, empty, a placeholder, or points at localhost | `npm run check:env -- .env.production --strict` names the variable; fix it and `up -d api` |
| API exits with a message about Chapa | Only one of `CHAPA_SECRET_KEY` / `CHAPA_WEBHOOK_SECRET` is set | Set both, or clear both. A half-configured gateway is rejected on purpose |
| API exits with a message about `resend.dev` | `SMTP_FROM` is still the Resend test address | Verify the domain and use `no-reply@<college-domain>` ([41-EMAIL-SETUP.md](41-EMAIL-SETUP.md)) |
| `bind: address already in use` on 3000 or 4000 | Something else on the host (often an old `npm run dev`) owns the port | `sudo ss -tlnp \| grep -E ':(3000\|4000)'`, stop the process |
| `permission denied` reading the env file, or Compose sees an empty variable | File owned by another user, or CRLF line endings | `sudo chown deploy:deploy .env.production && chmod 600 .env.production`; reformat to LF: `sed -i 's/\r$//' .env.production` |
| `verifier` is unhealthy | The verifier image was built without its browser dependencies, or `RECEIPT_VERIFIER_TOKEN` differs between the two services | Rebuild `verifier`; Compose passes the token to both sides, so re-run `up -d api verifier` |
| Postgres restarts with `database files are incompatible` | An existing `pgdata` volume from an older major version | Restore the matching dump, or start from an empty volume **after** taking a backup ([30-DATABASE-AND-BACKUPS.md](30-DATABASE-AND-BACKUPS.md)) |

---

## 2. The site is not reachable, or shows a gateway error

| Symptom | Cause | Fix |
|---|---|---|
| **502 Bad Gateway** | `api` or `web` is down or not yet healthy | `ps` and `logs api`; wait for the health window after `up -d` |
| **504 Gateway Timeout** | A receipt verification exceeded the proxy timeout, or a CDN in front is shorter than nginx | Check `logs api`; raise the nginx `proxy_read_timeout` ([42-NGINX-AND-TLS.md](42-NGINX-AND-TLS.md) §5) or the CDN timeout |
| **413 Request Entity Too Large** | The upload is bigger than `client_max_body_size` | Raise it in the nginx site ([42-NGINX-AND-TLS.md](42-NGINX-AND-TLS.md) §4) |
| Works with `curl` on the VPS, not from outside | Hostinger panel firewall or host firewall blocks the port | `sudo ss -tlnp \| grep -E ':(80\|443)'`; open 80/443 in hPanel and UFW |
| `nginx: [emerg] unknown directive` | The config was pasted outside its `http {}` context, or a typo | `sudo nginx -t`, then the offline check in [42-NGINX-AND-TLS.md](42-NGINX-AND-TLS.md) §2 |
| Certbot fails with a challenge error | DNS not propagated, or port 80 blocked | `dig +short <domain> api.<domain>`; open 80; retry `sudo certbot --nginx -d …` |
| Certificate expired or renewal failing | Certbot timer stopped, or port 80 stayed closed | `sudo certbot renew --dry-run`, then `systemctl status certbot.timer` |
| Mixed-content warnings in the browser | An absolute `http://` URL in the app or nginx config | Use `https://` for `WEB_PUBLIC_URL`, `API_PUBLIC_URL` and `NEXT_PUBLIC_API_URL`; rebuild `web` after changing `NEXT_PUBLIC_API_URL` |

---

## 3. Login, sessions and permissions

| Symptom | Cause | Fix |
|---|---|---|
| **Login succeeds, then every protected page bounces back to `/login`** | Split-host deploy with `COOKIE_DOMAIN` blank or wrong | Set `COOKIE_DOMAIN=.college-domain` (parent of both hosts), restart `api`, clear cookies ([42-NGINX-AND-TLS.md](42-NGINX-AND-TLS.md) §7) |
| Everyone is logged out after a deploy | `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` changed | Expected. Rotate secrets in a planned window ([90-SECRET-ROTATION.md](90-SECRET-ROTATION.md)) |
| `403` when submitting a form, but reads work | The browser `Origin` is not in `CORS_ORIGIN` | Add the exact origin (scheme + host + port, no trailing slash), restart `api` |
| Verification code rejected as expired | The code is valid for **15 minutes** | Use "resend verification" |
| Password-reset link rejected | The link is valid for **1 hour**, and is single-use | Request a new one |
| A staff member cannot see a page they should | Role, department scope, or account status | Check their role in the users module; the RBAC rules are in [70-SECURITY.md](70-SECURITY.md) |
| Refresh attempts fail while Redis is down | `REDIS_FAIL_MODE=closed` (the safe default) rejects refresh when the token denylist is unavailable | Bring Redis back: `docker compose … up -d redis`. Change the fail mode only as a deliberate debug step |

---

## 4. Email does not arrive

| Symptom | Cause | Fix |
|---|---|---|
| API refuses to boot with an SMTP error | `SMTP_FROM` uses `@resend.dev`, or the domain is not verified | Verify the domain, use an address on it ([41-EMAIL-SETUP.md](41-EMAIL-SETUP.md) §2) |
| `SMTP 550` / "recipient address rejected" | Sending from an unverified domain; Resend only delivers `resend.dev` to the account owner | Same fix: verify the domain |
| `535 authentication failed` | `SMTP_USER` is not `resend`, or `SMTP_PASS` is an old/revoked key | Set `SMTP_USER=resend` and the current API key |
| Emails send but land in spam | Missing or wrong SPF/DKIM/DMARC | Fix the DNS records; check the Resend dashboard for "Delivered" |
| Verification email never arrives but the API logs success | The address is wrong, or the mailbox is filtering | Check the provider's delivery log; try a different recipient |
| Support notifications go to the wrong place | `SUPPORT_EMAIL` is unset or still the old address | Set it to the college mailbox ([91-CREDENTIAL-REPLACEMENT.md](91-CREDENTIAL-REPLACEMENT.md) §4.14) |

---

## 5. Payments

| Symptom | Cause | Fix |
|---|---|---|
| Payment stays `PENDING` forever after a Chapa checkout | The webhook did not reach the API, or signature verification rejected it | Chapa dashboard → Webhooks shows delivery attempts; the URL must be `https://api.<domain>/api/v1/payments/chapa/webhook` and the Secret Hash must match `CHAPA_WEBHOOK_SECRET` |
| Chapa webhook returns `401`/signature failure | Wrong webhook secret, or a proxy rewriting the raw body | Use the exact Secret Hash; nginx must not alter the request body |
| Payment approved twice, or a duplicate receipt | Should be impossible — approval is idempotent | Check `PaymentEvent` for the row; if there are two different references, it is two payments, not a bug |
| A payment is flagged as an admin-queue exception | Amount/currency/`tx_ref` mismatch on the server-side verify | Inspect the `PaymentEvent` (`CHAPA_VERIFY_MISMATCH`); resolve in the admin queue. Never edit the ledger by hand |
| Telebirr receipt never auto-verifies | The receipt source refuses requests from a non-Ethiopian IP | Expected. Approve it through the admin review queue ([40-PAYMENTS.md](40-PAYMENTS.md)) |
| BOA receipt needs manual review every time | BOA receipts do not expose a receiver account | Expected behaviour; approve manually |
| Bank reference is rejected as invalid | Wrong reference format, or the receipt is not yet visible at the bank | Ask the student for the transaction reference from their receipt |
| Students see the wrong account number | Accounts come from **Admin → Banks**, not the env file | Update `/admin/banks`; `COMPANY_BANK_ACCOUNTS` is only a legacy matching fallback |

Full payment lifecycle, including the two rails and their test steps:
[40-PAYMENTS.md](40-PAYMENTS.md).

---

## 6. Database and backups

| Symptom | Cause | Fix |
|---|---|---|
| API exits with `P3018` | A migration failed | Read the log; fix forward with a new migration, or restore the pre-deploy dump |
| `checksum mismatch` on redeploy | Migration files were re-saved, or the repo was obtained as a zip / line endings changed | Re-clone with `git clone`; never normalise CRLF in `apps/api/prisma/migrations` |
| `password authentication failed` | `POSTGRES_PASSWORD` and `DATABASE_URL` disagree, or the password was changed in the env file but not in the database | Make them match and run the `ALTER USER` from [91-CREDENTIAL-REPLACEMENT.md](91-CREDENTIAL-REPLACEMENT.md) §4.9 |
| Restore "succeeded" but the app is empty | The dump was restored into the wrong database | Check the `-d` argument; drill first |
| Uploads return 404 after a restore | The `uploads` volume was not restored | Restore it separately ([30-DATABASE-AND-BACKUPS.md](30-DATABASE-AND-BACKUPS.md) §5.3) |
| Backup log is empty | cron is not running, or the script is not executable | `chmod +x deploy/backup/pg-backup.sh`; `crontab -l`; `cat /var/log/lor-backup.log` |
| `_prisma_migrations` has a row with no `finished_at` | An interrupted migration | Read Prisma's error and fix the cause; do not delete the row |
| Disk is filling up | Old dumps, images or logs | `docker system prune` (never `-a --volumes`), check retention, check log rotation ([30-DATABASE-AND-BACKUPS.md](30-DATABASE-AND-BACKUPS.md) §4) |

---

## 7. Seed and first-login problems

| Symptom | Cause | Fix |
|---|---|---|
| No administrator exists after the seed | `SUPER_ADMIN_*` was not set when the seed ran | Set the values and re-run `npm run db:seed` — it creates the admin only if one is missing |
| The seed "did nothing" on a second run | By design: it never overwrites an existing super admin | Change the password in the app instead |
| Anatomy content is missing | The anatomy seed was not run, or was limited to one system | `npm run db:seed:anatomy -- --reconcile --system heart` (add other systems only after faculty review) |
| Anatomy models 404 after a deploy | The model files or registry hash changed | Restore the previous versioned `.vN.glb`; never overwrite it ([10-DEPLOYMENT-GUIDE.md](10-DEPLOYMENT-GUIDE.md) rollback) |

---

## 8. Performance and stability

| Symptom | Cause | Fix |
|---|---|---|
| Build or first page load is very slow | 4 GB VPS with no swap, or the images are being rebuilt | Add swap; subsequent deploys reuse layers |
| Docker fills the disk with logs | A container is logging in a loop | Find it with `docker compose … logs --tail=50`; rotation is 10 MB × 3 per service |
| Frequent 502s under load | The API is CPU-bound during AI calls | Raise the plan, or accept that AI calls are the heavy path; `docker stats` shows which container is capped |
| Redis restarts lose sessions | Redis holds cache and the denylist, not durable data | Expected: users re-authenticate; nothing else is lost |
| Everything is slow after a reboot | Docker started containers before DNS/network was ready | `docker compose … up -d` once; all services use `restart: unless-stopped` |

---

## 9. Asking for help

If the answer is not on this page, collect these before asking:

```bash
cd /opt/lor-mentor
docker compose -f docker-compose.prod.yml --env-file .env.production ps > /tmp/ps.txt
docker compose -f docker-compose.prod.yml --env-file .env.production \
  logs --tail=100 > /tmp/logs.txt
sudo tail -n 100 /var/log/nginx/error.log > /tmp/nginx.txt
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T api npx prisma migrate status > /tmp/migrations.txt
```

Include the **exact command** you ran and its **exact output**. Redact
passwords and keys — never paste `.env.production`, a connection string, or a
provider API key into a ticket or chat.

Bundle the four files above into one archive and send that instead:

```bash
tar czf /tmp/diagnostics.tgz /tmp/ps.txt /tmp/logs.txt /tmp/nginx.txt /tmp/migrations.txt
```
