# Production Checklist — Go / No-Go

Work top to bottom. Every box has an owner. **A single unchecked box in a
`BLOCKER` row means no-go** — do not launch on partial completion and fix it
later.

Owners: **CR** college representative · **DE** deployment engineer · **CA**
coding agent.

Print this, or copy it into the college's tracker, so the date and initials are
recorded.

---

## 0. Decisions to make before anything technical

- [ ] **BLOCKER** — Named owners exist for all three roles
      ([HANDOVER.md §1](HANDOVER.md)). **CR**
- [ ] **BLOCKER** — Real domain chosen and the college controls its DNS. **CR**
- [ ] Subscription prices and plans approved. **CR**
- [ ] Payment model chosen: bank transfer + manual review, and/or Chapa. **CR**
- [ ] Policy decision on AI features and student data leaving the platform. **CR**
- [ ] Decision whether a staging environment will exist. **CR**

---

## 1. Accounts and credentials

- [ ] **BLOCKER** — Resend (or other SMTP) account created and the sending
      domain shows **Verified**. **CR**
- [ ] **BLOCKER** — SPF, DKIM and DMARC records published; only one SPF record
      exists. **CR/DE**
- [ ] **BLOCKER** — `SMTP_FROM` uses the verified domain, **not** `@resend.dev`. **DE**
- [ ] Gemini API key created under a college-owned account; budget alert set. **CR**
- [ ] Chapa merchant account submitted for KYC (if online payments are in
      scope). **CR**
- [ ] Chapa live keys and webhook secret obtained (only after approval). **CR**
- [ ] All secrets copied into the college password manager. **CR**
- [ ] No credential has ever been committed: `git log -p -- .env .env.production`
      returns nothing. **DE**
- [ ] Any credential found in history has been **rotated**. **DE**

---

## 2. Server

- [ ] **BLOCKER** — VPS meets the minimum spec (2 vCPU / 2 GB minimum, 4 GB
      preferred) with **swap enabled**. **DE**
- [ ] OS identified and documented; it is not assumed. **DE**
- [ ] Docker ≥ 24 and the Compose v2 plugin installed. **DE**
- [ ] nginx ≥ 1.20 and Certbot installed on the host. **DE**
- [ ] SSH: key-based only, root login disabled. **DE**
- [ ] Firewall allows 22, 80, 443 and nothing else. **DE**
- [ ] Non-root `deploy` user owns the application directory. **DE**
- [ ] Clock/NTP synchronised (certificate and token validity depend on it). **DE**
- [ ] PostgreSQL, Redis and the verifier have **no host ports**. **DE**

Prerequisites detail: [docs/deploy/SERVER-PREREQUISITES.md](docs/deploy/SERVER-PREREQUISITES.md).

---

## 3. DNS and TLS

- [ ] **BLOCKER** — Apex, `www` and `api` resolve to the VPS. **DE**
- [ ] **BLOCKER** — HTTPS works on both the web and API hostnames with a valid
      certificate. **DE**
- [ ] HTTP redirects to HTTPS. **DE**
- [ ] Certificate auto-renewal is active (Certbot timer). **DE**
- [ ] nginx config passes `nginx -t`. **DE**
- [ ] Upload limit `client_max_body_size 30m` and proxy timeout ≥ 180 s are in
      the **installed** config. **DE**

Detail: [docs/deploy/NGINX-SETUP.md](docs/deploy/NGINX-SETUP.md).

---

## 4. Application configuration

- [ ] **BLOCKER** — `.env.production` exists, mode `600`, owned by `deploy`. **DE**
- [ ] **BLOCKER** — `npm run check:env -- .env.production --strict` passes. **DE**
- [ ] **BLOCKER** — API boot validation passes (the container started and stayed
      up). **DE**
- [ ] `COOKIE_DOMAIN` is set to the shared parent domain for the split-host
      topology. **DE**
- [ ] `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `CORS_ORIGIN` and `NEXT_PUBLIC_API_URL`
      all use the production hostnames — no localhost anywhere. **DE**
- [ ] `POSTGRES_PASSWORD` matches the password inside `DATABASE_URL`. **DE**
- [ ] JWT secrets are ≥ 32 chars, distinct from each other, and generated with
      `openssl`. **DE**
- [ ] `NODE_ENV=production`. **DE**
- [ ] `REDIS_FAIL_MODE=closed`. **DE**

Reference: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).

---

## 5. Build and start

> **This is the first real image build.** It was never executed in the
> development environment (no Docker daemon available there), so treat this as an
> untested step and budget time for it.

- [ ] **BLOCKER** — `docker compose -f docker-compose.prod.yml --env-file .env.production build` completes. **DE**
- [ ] **BLOCKER** — All five services reach `(healthy)`. **DE**
- [ ] API logs show migrations applied with no error. **DE**
- [ ] `ps` shows `postgres`, `redis`, `verifier`, `api`, `web` running. **DE**
- [ ] Restart policies are in effect: reboot the VPS (or `docker restart` the
      daemon) and confirm the stack comes back. **DE**
- [ ] Images are digest-pinned; no `latest` tags. **DE**

---

## 6. Data

- [ ] **BLOCKER** — Seed completed (`npm run db:seed`). **DE**
- [ ] **BLOCKER** — Anatomy seeded **heart only**
      (`--reconcile --system heart`). **DE**
- [ ] Super admin can log in; password changed from the seeded value. **CR**
- [ ] Receiving bank accounts configured in `/admin/banks`. **CR**
- [ ] **BLOCKER** — Nightly backup scheduled and has produced a non-empty,
      `gzip -t`-valid dump. **DE**
- [ ] Backups sync off the VPS successfully. **DE**
- [ ] **BLOCKER** — Restore drill passed: restored into a scratch database and
      row counts for `User`, `Payment`, `Material` are non-zero. **DE**
- [ ] Uploads volume backup scheduled. **DE**

Detail: [DATABASE_AND_BACKUPS.md](DATABASE_AND_BACKUPS.md).

---

## 7. Functional verification

Automated:

- [ ] **BLOCKER** — `bash deploy/smoke-test.sh https://api.<domain> https://<domain>`
      reports zero failures. **DE**

Manual — the parts a script cannot check:

- [ ] Register a new account; the verification email arrives in the **inbox**. **CR**
- [ ] Verification link works; login succeeds. **CR**
- [ ] Auth cookie is `Secure` and `HttpOnly`; protected pages load. **DE**
- [ ] Forgot password → reset email arrives → reset works. **CR**
- [ ] AI tutor, flashcards and quiz generate output. **CR**
- [ ] Bank transfer with a valid reference verifies automatically (or falls into
      admin review with a clear reason). **CR**
- [ ] Receipt upload → admin review → approval generates a PDF. **CR**
- [ ] Anatomy Lab: heart loads for a student; urinary is **not** visible. **CR**
- [ ] `ADMIN` is redirected away from the Anatomy Lab. **CR**
- [ ] Admin can approve a payment and the subscription becomes active. **CR**
- [ ] `docker compose restart` → uploads and data survive. **DE**
- [ ] Chapa test-mode checkout completes end to end, **if enabled**. **DE**
- [ ] Chapa webhook rejects an unsigned request. **DE**

---

## 8. Security

- [ ] **BLOCKER** — No secret in the repository, browser bundle, or Git history. **DE**
- [ ] Only `web` and `api` publish ports, and only on `127.0.0.1`. **DE**
- [ ] `security_opt: no-new-privileges` present on every service. **DE**
- [ ] API, web and verifier run as non-root. **DE**
- [ ] Rate limiting responds as configured (login 5/min, global 120/min). **DE**
- [ ] Security headers present (`nosniff`, `X-Frame-Options`, no `X-Powered-By`). **DE**
- [ ] `npm audit` reviewed; no unmitigated critical/high in runtime dependencies. **CA**
- [ ] Security contact address published and reachable. **CR**
- [ ] Incident procedure understood by whoever is on call. **DE/CR**

Detail: [SECURITY.md](SECURITY.md).

---

## 9. Operations

- [ ] Uptime monitor on `https://api.<domain>/api/v1/health/ready`. **DE**
- [ ] Uptime monitor on the web origin. **DE**
- [ ] Alerts reach a person, not just a dashboard. **DE**
- [ ] Error monitoring configured (Sentry) or the absence accepted. **DE**
- [ ] Log rotation verified (`docker compose logs` does not grow unbounded). **DE**
- [ ] Deployment engineer has the runbooks and has read them. **DE**
- [ ] College rep knows how to reconcile payments monthly. **CR**

---

## 10. Legal and licensing

- [ ] **BLOCKER (for publishing the urinary system only)** — DBCLS has confirmed
      the BodyParts3D licence. **CR**
- [ ] **BLOCKER (for marking content reviewed)** — Faculty review complete. **CR**
- [ ] `THIRD_PARTY_NOTICES.md` and `NOTICE-MODELS.md` shipped and unmodified. **DE**
- [ ] `/attribution/anatomy` reachable. **DE**
- [ ] Project `LICENSE` decision recorded. **CR**
- [ ] Chapa, Resend and Gemini terms reviewed and accepted. **CR**
- [ ] Student privacy notice covers third-party data sharing. **CR**

Detail: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

---

## 11. Release gate record

Recorded 2026-11-11 against `origin/main` `5b08f7c`. This is the code-side gate
that must be green before the go/no-go below can be signed; the items above
still have to be executed on the real server.

**CI of record: GitHub Actions** (`.github/workflows/ci.yml`). GitLab CI does not
run for this project — every pipeline is rejected by the runner quota
(`ci_quota_exceeded`, 0 jobs started), so a red GitLab badge is not evidence of
a code failure.

| Gate condition | Result |
|---|---|
| CI of record green | GitHub Actions runs on the five branches below: all green |
| `ci/github-actions-gate` | merged in `39f73a2` |
| `fix/chapa-receipt-ux` | merged in `95510ed` |
| `feat/live-qr-scanner` | merged in `0d88a30` |
| `feat/support-tickets` | merged in `5b08f7c` |
| `feat/payments-hardening-p0` (`029e4a8`) | merged in `cb2cb17` |
| `feat/email-verification-code` (`f8c90b6`) | merged |
| `docs/deploy/payments.md` on `main` | present |
| `feat/payments-gateway-money` | **exception:** the branch never existed; MR !10 (`feat/payments-hardening-p0`) covers its scope |
| `feat/anatomy-teaching-text-batch-1` | **exception:** MR !8 merged on 2026-11-03; the branch was reused afterwards for two commits (`cc76dee`) that stay unmerged by owner decision (they add the teaching-text sync script) |

Both exceptions are owner-approved and do not block the handover.

Delivered in this release: the live QR scanner pre-fills the payment reference
only — `POST /payments/verify` remains the sole approver; support tickets are
database-backed threads answered from the admin inbox (`/admin/support`).

---

## 12. Sign-off

| Gate | Result | Name | Date |
|---|---|---|---|
| Accounts and credentials | ☐ pass ☐ fail | | |
| Server and TLS | ☐ pass ☐ fail | | |
| Build and boot | ☐ pass ☐ fail | | |
| Data and restore drill | ☐ pass ☐ fail | | |
| Functional verification | ☐ pass ☐ fail | | |
| Security | ☐ pass ☐ fail | | |
| Operations | ☐ pass ☐ fail | | |
| Legal and licensing | ☐ pass ☐ fail | | |

**Launch verdict:** ☐ GO ☐ NO-GO

Deferred items (each needs an owner and a date):

| Item | Owner | Date |
|---|---|---|
| | | |
| | | |
| | | |

Signed: ______________________________  Date: ____________
