# LOR MENTOR — LOCAL DEV RUNBOOK (Windows)

How to start the full stack on this machine, and how to re-run the audit checks later.

## 1. Services (start once per boot — normally auto-start)

| Service | Purpose | Port | Check / start (Admin PowerShell) |
|---|---|---|---|
| PostgreSQL 18 (`postgresql-x64-18`) | database | 5432 | `Get-Service postgresql-x64-18` · `Start-Service postgresql-x64-18` |
| Redis (`Redis`) | cache, queues, rate-limit | 6379 | `Get-Service Redis` · `Start-Service Redis` |

Both are Windows services. If `Status: Running`, you're done. To open a DB shell:
`psql -U <user> -d lor_mentor` (credentials live in `apps/api/.env`).

## 2. App processes (one terminal each)

**API — http://localhost:4000/api/v1** (NestJS)
```powershell
cd apps/api
npm run start:dev          # dev, hot-reload (recommended while coding)
# or: npm run build; npm run start:prod   # compiled, no watch (lighter, faster startup)
```
- Config: `apps/api/.env` (DATABASE_URL → `lor_mentor`).
- Health: `http://localhost:4000/api/v1/health` (liveness) and `/health/ready` (DB + Redis).

**Web — http://localhost:3000** (Next.js)
```powershell
cd apps/web
npm run dev
```
- Config: `NEXT_PUBLIC_API_URL` must point at `http://localhost:4000/api/v1` (`.env*` in `apps/web`).

**Prisma Studio — http://localhost:5555** (DB browser/editor)
```powershell
cd apps/api
npx prisma studio
```
- Uses `DATABASE_URL` from `apps/api/.env` (your dev DB `lor_mentor`).

## 3. Database utilities (run from `apps/api`)

| Task | Command |
|---|---|
| Migration status | `npx prisma migrate status` |
| Apply migrations | `npx prisma migrate deploy` |
| Create a migration (dev) | `npx prisma migrate dev --name <name>` |
| Seed (idempotent) | `npm run db:seed` |
| Reset DB (⚠ deletes all data) | `npm run db:reset` |
| Regenerate client | `npx prisma generate` |

## 4. Running things against the audit test DB (not `lor_mentor`)

A disposable database `lor_audit_test` (and shadow `lor_audit_shadow`) exists from the audit.
Environment variables override `.env` at process start, e.g.:

```powershell
cd apps/api
$env:DATABASE_URL='postgresql://<user>:<pass>@localhost:5432/lor_audit_test'
node dist/src/main
```

Alternatively, in Prisma Studio set `$env:DATABASE_URL` the same way before `npx prisma studio`.
Credentials: see `apps/api/.env` (do not commit or paste them anywhere).

## 5. Tests & checks

| What | Where | Command |
|---|---|---|
| API unit tests | `apps/api` | `npx jest --maxWorkers=2` |
| API e2e (placeholder) | `apps/api` | `npm run test:e2e` |
| Web e2e (Playwright) | `apps/web` | `npx playwright install chromium` (once), then `npm run e2e` (on memory-tight hosts: `npx playwright test --workers=1`) |
| Smoke test | repo root (Git Bash) | `bash deploy/smoke-test.sh http://127.0.0.1:4000` |
| Receipt verifier (Python) | `services/receipt-verifier` | `python -m py_compile normalize.py` and the bundled tests |
| Type-check | `apps/api` / `apps/web` | `npx tsc --noEmit` |

## 6. Memory tips for this machine

- Check: `[math]::Round((Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue)` and committed bytes. Total commit limit is ~15.6 GB — stay well below it.
- If builds crash or the machine reboots ("out of memory"): check for a leaked session-0 `explorer.exe` holding GBs (`Get-Process explorer`), kill it from an **admin** terminal (`taskkill /F /PID <pid>`), or reboot.
- Heavy tasks (`next build`, Playwright, Docker builds) should run **one at a time**.

## 7. Detached stack + persistent logs (added 2026-10-18)

Running the app servers as **detached processes** keeps them alive across terminal/session restarts and sends all output to fixed files:

```powershell
$logdir = "$env:TEMP\lor-logs"; New-Item -ItemType Directory -Force $logdir | Out-Null
# run each from C:\Users\berek\Desktop\Lor-mentor\lor-mentor
Start-Process cmd.exe -ArgumentList '/c','node dist/src/main > "%TEMP%\lor-logs\api.log" 2>&1' -WorkingDirectory 'C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api' -WindowStyle Hidden
Start-Process cmd.exe -ArgumentList '/c','npm run start > "%TEMP%\lor-logs\web.log" 2>&1' -WorkingDirectory 'C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\web' -WindowStyle Hidden
Start-Process cmd.exe -ArgumentList '/c','npx prisma studio --port 5555 > "%TEMP%\lor-logs\studio.log" 2>&1' -WorkingDirectory 'C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api' -WindowStyle Hidden
# payment "Enter reference" verification (FastAPI, port 8000) - set the token in THIS shell first
$env:VERIFIER_SHARED_TOKEN = '<same value as RECEIPT_VERIFIER_TOKEN in apps/api/.env>'
Start-Process cmd.exe -ArgumentList '/c','.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 > "%TEMP%\lor-logs\verifier.log" 2>&1' -WorkingDirectory 'C:\Users\berek\Desktop\Lor-mentor\lor-mentor\services\receipt-verifier' -WindowStyle Hidden
```

- Watch the API log: `Get-Content "$env:TEMP\lor-logs\api.log" -Tail 30` (add `-replace "\x1b\[[0-9;]*m",''` to strip colors).
- Verify the verifier: `Invoke-RestMethod http://127.0.0.1:8000/health` -> `{"status":"ok","banks":[...]}`. Without it, CBE/Telebirr "Enter reference" submissions fall back to manual review (`UNREACHABLE`).
- After an API code change: `cd apps/api; npm run build`, then stop the process listening on `:4000` and start it again with the command above.
- Web modules: `npm run start` serves the last `next build`; rebuild with `npm run build` after web changes.

## 8. Email / payment / AI testing notes (added 2026-10-18)

- **Email (Resend sandbox):** with `SMTP_FROM` on `onboarding@...resend.dev` and no verified domain, delivery is only allowed to the Resend account owner address and `delivered@resend.dev`; all other recipients get SMTP `550`. To register/reset for a real inbox: use the owner address, or verify a domain at resend.com/domains and update `SMTP_FROM`.
- **Chapa checkout:** initialize validates the payer email — the domain must exist with valid MX records (fake domains like `@lorcan.edu` are rejected with `validation.email`). Test with deliverable addresses (e.g. gmail). Keep `API_PUBLIC_URL=http://localhost:4000` for local tests (otherwise the stored callback URL may point at a dead host); for real Chapa webhooks locally, start a tunnel (e.g. `cloudflared tunnel --url http://localhost:4000`) and set `API_PUBLIC_URL` to the tunnel URL. Quick-tunnel URLs change on every cloudflared restart - re-point `API_PUBLIC_URL` and restart the API each time (or use a named tunnel for a stable hostname). The browser-return flow (`/pricing/payment/callback`) verifies server-side and needs no tunnel.
- **Bank transfer ("Enter reference - instant") flow:** requires the receipt-verifier service running (`services/receipt-verifier`, port 8000 - see section 7). For CBE the form needs the **last 8 digits of a configured CBE receiving account** (admin-managed on `/admin/banks`; legacy `COMPANY_BANK_ACCOUNTS` in `apps/api/.env` is still a fallback. In dev this is currently the operator's own account, ends `...23923036`, standing in until the college's real account is available - set it on `/admin/banks` or swap the env config) - any other number is rejected by design (anti-scraper guard: "The CBE account must match the college receiving account"). A fabricated FT reference comes back as `EXTRACT_FAILED` and lands as a PENDING payment for admin review (by design); only a real transfer to a college account can auto-approve (receiver + amount are checked server-side). While a PENDING payment exists, that user's further attempts are blocked until an admin approves/rejects it. The subscribe page itself now displays the college receiving accounts with copy buttons (public `GET /payments/bank-accounts`, sourced from admin-managed accounts plus the `COMPANY_BANK_ACCOUNTS` fallback; label admin accounts per bank and legacy env entries via optional `COMPANY_BANK_ACCOUNT_LABELS`, currently `CBE`) - students no longer need the numbers from anywhere else. CBE receipts may print collapsed account masks (e.g. `1****3036`) and the CBE-Birr "VAT Invoice" layout mis-reports `Reference No.` - both are handled since Rev 5 (see `TEST-RESULTS.md` section 5.8). Since the same session, the CBE field also accepts a **full receipt link** instead of FT + digits: legacy `apps.cbe.com.et:100/?id=FT...<digits>` links (the digits are extracted from the link and still checked against the college receiving accounts) and CBE's new-style `mbreciept.cbe.com.et/<token>` short links (no digits needed - verified through CBE's public receipt JSON API; the token is signed, so only a pasted link works). Account 2 (`85802844`) is a **Bank of Abyssinia** account (now labeled `Abyssinia`, `COMPANY_BANK_ACCOUNT_LABELS="CBE,Abyssinia"`) - it is NOT a CBE account, so CBE FT lookups must use the CBE account (Abyssinia transfers use the `boa` receipt slip). Restart the API after any `COMPANY_BANK_ACCOUNTS` / `COMPANY_BANK_ACCOUNT_LABELS` change.
- **Gemini model:** the model name lives in `apps/api/src/modules/ai/gemini.service.ts` (currently `gemini-3.8-flash`, both call sites). If AI calls start failing with 404 after changing keys, check the models available for that key in Google AI Studio and update both call sites, then rebuild the API.
- **AI retries:** the processor is idempotent as of Rev 10. Regenerating a FAILED material reuses any existing flashcard set/quiz bank (by `aiContentId`) and preserves student reviews/answers, so the old `Unique constraint failed ... aiContentId` failure cannot recur. Rebuild/restart the API after changing the processor; the retry itself is Admin -> Courses -> Regenerate (or `POST /api/v1/materials/:id/ai-regenerate`).
- **AI study notes (Rev 11):** summaries are Markdown study notes scaled to the source length (`notesLengthTarget` in `apps/api/src/modules/ai/gemini.service.ts`): short handouts get 200-350 words, a ~30-60k-character chapter gets 1,000-1,500 words / 32-48 bullets, and the largest target is 1,700-2,200 words. The extractor now reads up to 100,000 characters per PDF (the old cap was 40k). The study page renders the notes through the existing Markdown component, so `##` headings and `-` bullets display properly. Only new or regenerated material gets the new format; old completed summaries keep their existing text.

### 8.1 Starting cloudflared yourself (Chapa webhook testing)

The tunnel is **optional** - without it, browser-return verification still completes payments locally. Run it only when you want Chapa's server-to-server webhook to reach your machine.

```powershell
# 0) stop any tunnel already running
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force

# 1) start a quick tunnel to the local API (leave this window open)
cloudflared tunnel --url http://localhost:4000
#    -> copy the https://<random-words>.trycloudflare.com URL from the banner

# 2) point the API at it: edit apps/api/.env
#    API_PUBLIC_URL="https://<random-words>.trycloudflare.com"

# 3) restart the API so it picks up the new URL (from the repo root)
Get-NetTCPConnection -LocalPort 4000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
cd apps/api; node dist/src/main     # or: npm run start:prod

# 4) verify from the public side
curl "https://<random-words>.trycloudflare.com/api/v1/health"
```

- The URL is **new on every start** - repeat steps 1-4 each time. (Payments still succeed without this; only webhooks are lost.)
- To browse the app, always use `http://localhost:3000` - the tunnel reaches the API only.
- For a **stable URL**, use a named tunnel (needs a Cloudflare account + domain): `cloudflared tunnel login`, `cloudflared tunnel create lor-mentor`, `cloudflared tunnel route dns lor-mentor api.<your-domain>`, then run it with an ingress config pointing `api.<your-domain>` at `http://localhost:4000` and set `API_PUBLIC_URL="https://api.<your-domain>"` once.
- Update cloudflared itself (installed via npm): `npm install -g cloudflared`.

### 8.2 Testing the app from a phone (same Wi-Fi)

The web app calls the API through the same-origin Next rewrite (`/api/v1/*`
-> `http://localhost:4000`), so a phone only needs port 3000 - no CORS change
and no second tunnel.

```powershell
# 1) find the PC's current Wi-Fi IPv4 address (DHCP: it can change)
ipconfig | Select-String 'IPv4'

# 2) only if the phone cannot connect: allow inbound port 3000
New-NetFirewallRule -DisplayName 'Lor Mentor web (LAN)' -Direction Inbound `
  -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Public
```

- Phone and PC must be on the same Wi-Fi (guest networks often block
  device-to-device traffic). Open `http://<pc-ipv4>:3000` - admin sign-in is
  `/admin-login`, student/teacher sign-in is `/login`.
- Local builds must **not** set `NEXT_PUBLIC_API_URL` (it is commented in
  `apps/web/.env.local`): the browser then calls `/api/v1` and the Next server
  proxies to the API. An absolute `http://localhost:4000` makes the phone call
  its own localhost.
- The same build works on `localhost` and the LAN IP; if the PC's IP changes,
  only the URL changes - no rebuild needed.
- Admin lists are responsive as of Rev 9: payments and users stack into
  two-column cards below `md`, and audit stacks the actor/date under the
  action. No sideways scroll at 390 px. The mobile bottom nav keeps the five
  primary destinations per role (admins: Overview / Users / Payments /
  Courses / Plans; teachers: Home / Courses / Forum / Analytics / Profile).
  For everything else (Payment banks, Moderation, Audit Logs, Notifications,
  etc.) tap the **burger at the top-left** - it opens the full desktop sidebar
  as a drawer. The drawer closes on navigation, backdrop tap, Escape or the X.
  Tap the avatar in the topbar for Profile / Log out.
- The DHCP lease on this PC has been seen to change every few minutes
  (.5 -> .6 -> .2 -> .8 across one session). A phone page loaded from an old
  address dies when it moves; set a DHCP reservation for the PC, or use the
  web tunnel below for longer sessions.
- Off-Wi-Fi: `cloudflared tunnel --url http://localhost:3000` and open the
  printed https URL - same-origin API calls work through it. Quick tunnels are
  public while running; stop it after testing. (The tunnel in 8.1 points at
  the API only and cannot serve the UI.)
