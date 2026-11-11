# Hostinger VPS Deployment Playbook — closing AMBER → GREEN

**Created:** 2026-10-19
**Operator decision (2026-10-19):** F-8 (Resend domain) and S-2 (secret rotation)
are **deferred to deployment**. They are not waived and not forgotten — this
playbook is the procedure to complete them, plus the remaining audit gates
(T-45 notes, T-46, T-47, T-48, T-50 full, T-53 real TLS), on the Hostinger VPS.

**Order of operations:** deploy (§1) → rotate/generate secrets (§2) →
Resend domain (§3) → Chapa live (§4) → gates T-46/T-47/T-48 (§5–§7) →
T-45 evidence notes (§8) → final smoke + re-audit (§9).

Related documents (do not duplicate work; use them alongside this playbook):

| Topic | Document |
|---|---|
| Step-by-step VPS setup (SSH, firewall, Docker, Nginx, certbot) | `docs/deployer/10-DEPLOYMENT-GUIDE.md` |
| Resend domain detail (DNS records, troubleshooting) | `docs/audit/RESEND-DOMAIN-VERIFICATION.md`, `docs/deployer/41-EMAIL-SETUP.md` |
| Chapa account/webhook detail | `docs/deployer/40-PAYMENTS.md` |
| Secret rotation procedure + rollback | `docs/deployer/90-SECRET-ROTATION.md` |
| Environment preflight tool | `npm run check:env -- .env.production --strict` |
| Local rehearsal evidence (already PASSed) | `docs/audit/STAGING-GATE-RUNBOOK.md` §13 |

---

## 1. Deploy on the VPS (with the two deployment-specific deltas)

### 1.1 Base deploy

Follow `10-DEPLOYMENT-GUIDE.md` Sections 1-3 top to bottom (Ubuntu 24.04, non-root user,
SSH keys, UFW 22/80/443, fail2ban, Docker + Nginx + certbot, DNS A records,
`/opt/lor-mentor`, `.env.production`, `docker compose up -d --build`, seed).

Do a full `.env.production` preflight **before** first boot:

```bash
cd /opt/lor-mentor
npm run check:env -- .env.production --strict
```

It reports duplicate keys, placeholder values and `localhost` URLs without
printing any secret. Fix everything it reports (strict mode is intended to fail
on the example placeholders).

### 1.2 Delta A — build the **full** verifier image (Chromium)

`services/receipt-verifier/Dockerfile` installs `chromium` + `chromium-driver`
for BOA Selenium extraction. That layer is ~1 GB and was intentionally **not**
shipped from the development laptop (the laptop builds a `slim-local` image
without Chromium). Build it on the VPS:

```bash
cd /opt/lor-mentor
docker compose -f docker-compose.prod.yml --env-file .env.production build verifier
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

VPS sizing for this build: **≥ 2 GB RAM (4 GB recommended) and ≥ 20 GB free
disk.** The Debian packages download from the VPS datacenter network; expect a
few minutes.

Verify Chromium really landed in the image (this is what makes BOA work):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec verifier chromium --version
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec verifier python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

Expected: a Chromium version string and `{"status":"ok","banks":[...]}`.

> If the VPS cannot build the image for memory reasons, build it on a larger
> machine and transfer it with `docker save`/`docker load` — but never ship the
> slim image: BOA receipts need Chromium.

### 1.3 Delta B — real TLS and HSTS (completes T-53 on a real host)

`10-DEPLOYMENT-GUIDE.md` §3.6-3.7 covers Nginx + `certbot --nginx -d <domain> -d
www.<domain> -d api.<domain>`. After certbot runs, add HSTS to both TLS server
blocks in `/etc/nginx/sites-available/lor-mentor`:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run          # auto-renewal works
```

Verify from anywhere (this is the T-53 evidence — note the TLS case now **runs**
instead of skipping):

```bash
curl -sI https://api.<domain>/api/v1/health | grep -i -e strict-transport -e x-content-type -e x-frame
curl -sI http://<domain> | head -3            # expect 301 → https
bash deploy/smoke-test.sh https://api.<domain> https://<domain>
```

Also re-do the uploads half of T-53 on the VPS:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api sh -c 'echo t53 > /app/apps/api/uploads/t53.txt'
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --force-recreate api
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api cat /app/apps/api/uploads/t53.txt     # still there → volume persists
```

Record: certbot output, HSTS header line, smoke-test PASS count, uploads check.

---

## 2. S-2 — secrets at deployment (why + exact steps)

**What S-2 means, plainly:** the values in your local `apps/api/.env` and root
`.env` have been sitting on a development machine, in logs and screenshots, for
weeks. Production must **never reuse them**. S-2 is simply: *generate brand-new
values at deploy time, put them only in `.env.production` on the VPS, and
revoke the old provider keys afterwards.* There is nothing to "fix in code" —
it is a checklist you complete once, during deployment. (The full procedure and
rollback live in `90-SECRET-ROTATION.md`.)

### 2.1 Generate the app-side secrets on the VPS

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET   (must be DIFFERENT)
openssl rand -hex 24   # RECEIPT_VERIFIER_TOKEN
openssl rand -base64 32  # POSTGRES_PASSWORD
```

Set them in `.env.production` (never in Git, never in chat):

| Key | Where the new value goes |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `.env.production` (generated above) |
| `POSTGRES_PASSWORD` | `.env.production` **and** inside `DATABASE_URL` (keep them identical) |
| `RECEIPT_VERIFIER_TOKEN` | `.env.production` (compose passes it to both api and verifier) |
| `GEMINI_API_KEY` | create a **new** key in Google AI Studio, put it in `.env.production`, delete the old key |
| `SMTP_PASS` | create a **new** Resend sending key (§3), put it in `.env.production`, revoke the old key |
| `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` | live keys from the Chapa dashboard (§4) |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | a real college address + a new strong password used only for seeding |

### 2.2 Apply and verify

```bash
npm run check:env -- .env.production --strict
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --force-recreate api verifier
curl -s https://api.<domain>/api/v1/health/ready     # expect 200
```

Log in as the super admin with the **new** password. Evidence to record: date,
list of rotated items (names only — **no values**), ready 200, successful login.

---

## 3. F-8 — verify the Resend sending domain during deployment

Full detail and troubleshooting: `docs/audit/RESEND-DOMAIN-VERIFICATION.md`.
Short version, run during deployment:

1. <https://resend.com/domains> → **Add Domain** (prefer `mail.<domain>` or the
   root domain). Use the **exact** DNS values Resend shows.
2. In the DNS zone (Hostinger or Cloudflare) add the records:
   - **MX** on the sending subdomain (Return-Path / bounces)
   - **TXT** SPF on the sending subdomain — merge into an existing SPF, never add a second
   - **TXT** DKIM at `resend._domainkey.<domain>`
   - **TXT** DMARC at `_dmarc.<domain>`: `v=DMARC1; p=none; rua=mailto:dmarc@<domain>`
   - Cloudflare: keep these records **DNS-only** (grey cloud).
3. Click **Verify** in Resend → wait for **Verified** (minutes; up to 48 h worst
   case).
4. Create a **new** sending API key; restrict it to the verified domain.
5. `.env.production`:

   ```dotenv
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=587
   SMTP_USER=resend
   SMTP_PASS=<new Resend sending key>
   SMTP_FROM=Lor Mentor <no-reply@<domain>>
   ```

6. Reload and re-test:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production \
     up -d --force-recreate api
   npm run check:f8-email -- --api https://api.<domain> --email <non-owner@example.com>
   ```

   The probe warns while `SMTP_FROM` still uses `resend.dev`; it only checks the
   trigger. **Real proof:** register with a non-owner mailbox (verification email
   arrives, link works), then password-reset the same mailbox. Confirm both show
   `Delivered` in Resend → Emails.

**F-8 closes when:** domain = Verified, `SMTP_FROM` uses it, non-owner register
+ reset both deliver, Resend log shows delivered. Record date/domain/message IDs
(no keys).

---

## 4. Chapa at deployment — and how Chapa verification actually works

Account/setup detail: `docs/deployer/40-PAYMENTS.md`. Keys are
**all-or-nothing** in env validation: set both `CHAPA_SECRET_KEY` and
`CHAPA_WEBHOOK_SECRET`, or leave both blank.

### 4.1 Account, keys, webhook ("domain verification" on Chapa)

1. Business account at <https://dashboard.chapa.co> → complete **KYC/business
   verification** (trade license, TIN, authorized person's ID, **settlement bank
   account** — the settlement account is set **in Chapa only**, never in the app).
   Approval is manual and can take days. Test keys work immediately.
2. **Settings → API Keys** → test key (`CHASECK_TEST-...`) for rehearsal; live key
   (`CHASECK-...`) after approval.
3. **Settings → Webhooks** → Webhook URL:
   `https://api.<domain>/api/v1/payments/chapa/webhook` → copy the **Secret Hash**.
   The webhook must be public HTTPS, which is why DNS + TLS (§1.3) come first.
4. `.env.production`:

   ```dotenv
   CHAPA_BASE_URL=https://api.chapa.co/v1
   CHAPA_SECRET_KEY=CHASECK-...            # test first, live after approval
   CHAPA_WEBHOOK_SECRET=<secret hash from dashboard>
   ```

   Reload: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api`

### 4.2 How a Chapa payment is verified at runtime (already implemented)

Nothing in the code changes for production; this is the trust model:

1. Student clicks **Pay** → `POST /api/v1/payments/chapa/initialize` creates a
   PENDING payment row (`tx_ref = lm-<paymentId>`) and returns Chapa's hosted
   `checkout_url`. No payment row is visible to admins before this point.
2. The student pays on Chapa's page (card / Telebirr / bank).
3. **Webhook (source of truth):** Chapa POSTs to
   `/api/v1/payments/chapa/webhook`. The API keeps the **raw body** and verifies
   the HMAC-SHA256 signature (`chapa-signature` / `x-chapa-signature`) with
   `CHAPA_WEBHOOK_SECRET` **before parsing** the payload. An unsigned or forged
   "payment succeeded" call is rejected — this is the anti-fraud gate.
4. **Server-side re-verify:** after the signature passes, the API calls Chapa's
   **verify endpoint** (`GET /v1/transaction/verify/<tx_ref>`) and trusts only
   Chapa's answer for status/amount/reference. The browser redirect is never
   trusted on its own.
5. **Amount policy (defence in depth):** the settled amount is compared with the
   server-side plan price. Exact → approve; under-pay → reject with a clear
   reason; over-pay → PENDING **manual review** with a note (never silent
   approval). Non-ETB currency is rejected.
6. **Idempotent finalize:** approved payments activate the subscription, write
   the receipt number and generate the PDF exactly once — duplicate webhooks and
   the browser return hit the same guard and cannot double-activate.
7. The browser return page (`/pricing/payment/callback`) and
   `GET /api/v1/payments/chapa/verify/:txRef` are **UX only**; they re-ask the
   server, which re-checks with Chapa.

### 4.3 Chapa deployment tests + evidence

1. **Test keys first:** full checkout with Chapa's test cards/numbers; confirm
   PENDING → webhook received → subscription ACTIVE → PDF receipt generated.
2. **Spoofed webhook:** `curl -X POST https://api.<domain>/api/v1/payments/chapa/webhook`
   with a fake body and no signature → expect 4xx and **no** approval.
3. **Verify endpoint:** after checkout, `GET .../chapa/verify/<txRef>` reflects
   Chapa's real status.
4. **Switch to live keys**, do ONE small real payment, confirm it settles in the
   Chapa balance and the subscription activates; then refund/reconcile.
5. Record: date, mode (test/live), tx_ref, webhook accepted, spoof rejected,
   settlement confirmed. Never record keys.

---

## 5. T-46 — load test

Run **on the VPS** against the public API (or `http://127.0.0.1:4000`).

**Throttler note:** the API enforces a global **120 requests/minute per IP**
(hardcoded). A single-source load generator must stay under that or it will
measure 429s instead of the app. Baseline profile below uses 4 VUs (≤ ~90
req/min). For a heavier test, run generators from several source IPs or plan a
staging-only throttler override — record which you did.

Install k6 (Ubuntu):

```bash
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install -y k6
```

Minimal read-path script (`t46.js`; adjust paths to your seeded data):

```js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: { reads: { executor: 'constant-vus', vus: 4, duration: '3m' } },
  thresholds: { http_req_duration: ['p(95)<500'], http_req_failed: ['rate<0.01'] },
};

const BASE = __ENV.API_BASE;
const EMAIL = __ENV.T46_EMAIL;
const PASSWORD = __ENV.T46_PASSWORD;

export default function () {
  if (!globalThis.__loggedIn) {           // one login per VU; cookie jar persists
    const r = http.post(`${BASE}/api/v1/auth/login`,
      JSON.stringify({ email: EMAIL, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } });
    check(r, { 'login 200': (x) => x.status === 200 });
    globalThis.__loggedIn = true;
  }
  for (const p of ['/api/v1/health', '/api/v1/courses', '/api/v1/materials']) {
    check(http.get(`${BASE}${p}`), { [`${p} ok`]: (x) => x.status < 400 });
  }
}
```

Run (use a seeded student/teacher account created only for this test):

```bash
API_BASE=https://api.<domain> T46_EMAIL=<t46@example.com> T46_PASSWORD=<password> k6 run t46.js
```

**PASS:** p95 < 500 ms, error rate < 1 %, no 5xx spikes, no N+1 blow-up in API
logs (`docker compose logs api | grep -c SELECT` spot-check), throttling behaves
(429s appear only if you deliberately exceed the budget). Record the k6 summary
block as evidence.

---

## 6. T-47 — kill the API mid-AI-job

1. Create a PDF→AI generation job (admin uploads a PDF material; job runs in the
   API's BullMQ worker; the queue lives in Redis, so it survives an API restart).
2. Kill the API while the job is running:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production kill api
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
   ```

3. Watch recovery:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production logs api --tail=100
   ```

4. Check the material/queue state (admin UI or psql): the job must be **retried**
   or marked **FAILED with a reason**; no half-written flashcard/quiz set may
   remain attached to the material.

**PASS:** job retried/failed cleanly, no partial AI content, no stuck "processing"
row, API healthy again. Record the log excerpt + final job state.

---

## 7. T-48 — provider outage matrix

Run each case on staging, **one at a time**, restoring `.env.production` and
recreating the API after each (containers do not use the host `/etc/hosts`, so
simulate outages with a bad value in the env, not by blocking DNS on the host):

| Provider | Simulate | Expected | No-regression check |
|---|---|---|---|
| Gemini | `GEMINI_API_KEY=bad-value`, recreate api | AI request returns a graceful error (5xx mapped message), API stays up | after restore, AI works again |
| SMTP/Resend | `SMTP_HOST=127.0.0.1` (or stop egress), recreate api | Register fails gracefully **and rolls back the user row**; forgot-password still generic 200 | restore, register delivers |
| Chapa | `CHAPA_BASE_URL=http://127.0.0.1:9/v1`, recreate api | initialize returns a clear 503/502; **no admin-visible request** (unconfirmed CHAPA rows are hidden) | restore, checkout initializes |
| Verifier | `docker compose stop verifier` | receipt upload does not auto-approve; it routes to **manual review** instead of failing open | `start verifier`, normal flow resumes |
| Redis | `docker compose stop redis` | ready 503; refresh 401 (fail-closed) — see T-30 §11 | `start redis`, ready 200 |

**PASS:** no crash loop, no stuck UI/request, no data corruption; Sentry events
appear if `SENTRY_DSN` is configured. Record each row's before/after evidence.

---

## 8. T-45 — exact evidence notes (operator template)

The operator already confirmed these four items informally (2026-10-19); to
close T-45, capture the exact notes and screenshots on the deployed site and add
them to `REGRESSION-TEST-RESULTS.md` §13 (new sub-section) as a table:

| # | Check | Page | Steps | Expected | Evidence to attach |
|---|---|---|---|---|---|
| 1 | AI tutor works | `/ai-tutor` | sign in as student → ask a question | streamed real answer, no 500, no console errors | screenshot + timestamp |
| 2 | PDF → AI generation | `/admin/courses` | admin → open course → upload a PDF material → wait | generation completes; material row + AI content exist; no orphan on failure | screenshot of success state + generated item |
| 3 | PDF viewer | `/courses` | student → open a PDF material | in-app viewer renders pages; no native download prompt / no blank frame | screenshot of rendered page |
| 4 | Destructive dialog Cancel | `/admin/banks` | open a bank's "remove" → click Cancel | no native `confirm()`; data unchanged after cancel | screenshot before/after + note |

Record for each row: date/time (Africa/Addis), account role, exact URL, observed
result, "no native alert/confirm appeared", screenshot filenames, and the
deployed commit hash (`git rev-parse --short HEAD` on the VPS).

---

## 9. Final evidence + flip to GREEN

Run after §1–§8 on the deployed host:

```bash
cd /opt/lor-mentor
npm run check:env -- .env.production --strict
bash deploy/smoke-test.sh https://api.<domain> https://<domain>
curl -s https://api.<domain>/api/v1/health/ready
docker compose -f docker-compose.prod.yml ps
```

Then update the audit docs (`REGRESSION-TEST-RESULTS.md`, `TEST-RESULTS.md`,
`FINAL-PRODUCTION-READINESS-REPORT.md`) with the actual outputs and re-audit.
GREEN requires:

- [ ] S-2 complete (all values rotated at deploy, old provider keys revoked)
- [ ] F-8 complete (Resend domain Verified; non-owner register + reset delivered)
- [ ] T-50 complete (full verifier image built on the VPS, Chromium present)
- [ ] T-53 complete (real TLS + HSTS + smoke with the TLS case running + uploads persistence)
- [ ] T-46 / T-47 / T-48 executed with recorded evidence
- [ ] T-45 notes + screenshots recorded
- [ ] Chapa live verified with one real settlement (§4.3)
- [ ] Final regression re-run (API 177/177, payments 99/99, verifier 20/20, web lint/build, smoke)
- [ ] Audit docs updated → re-audit → verdict changed to **GREEN**

Until every box is ticked, the verdict stays **AMBER**.
