# Dependency Security Triage — 2026-10-29

Read-only triage for `integration/anatomy-hardening` at `41924ed`. **No
dependency was installed, upgraded, or removed in this pass.** The commands
below are a proposal for a separate, reviewable upgrade branch.

## Evidence

Audit was run per workspace. A single root `npm audit` mixes the two
workspaces and is misleading, so the numbers below come from:

```bash
npm audit --omit=dev --json --workspace=apps/api   # -> %TEMP%/audit-api-ws.json
npm audit --omit=dev --json --workspace=apps/web   # -> %TEMP%/audit-web-ws.json
```

| Workspace | Command | Total | Critical | High | Moderate |
| --- | --- | ---: | ---: | ---: | ---: |
| `apps/api` | `npm audit --omit=dev --json --workspace=apps/api` | 17 | 1 | 13 | 3 |
| `apps/web` | `npm audit --omit=dev --json --workspace=apps/web` | 18 | 3 | 12 | 3 |

Installed versions were read from `package-lock.json`, not from the registry.
Latest/fixed versions were read with `npm view <package> version` (no install).

## Must-fix before production

Direct dependencies or production-reachable transitive packages with a fixed
release available.

| Package | Installed | Direct? | Path | Severity / advisory (example) | Fixed | Applicability |
| --- | --- | --- | --- | --- | --- | --- |
| `next` | 16.2.11 | direct | `apps/web` | **critical** ×3, high, moderate (11 advisories; `GHSA-p293-qw3h-jr36` RCE on Windows hosts, `GHSA-2464-fhr4-w9xw`, `GHSA-673q-mjm6-r5xr`) | **16.4.3** | Yes. Self-hosted App Router deployment. The "Windows hosts" RCE does **not** apply (production is Ubuntu), but the image-optimization/`next/og` and cache-poisoning advisories are reachable; `next/image` is used (`apps/web/src/components/shared/brand-logo.tsx`). |
| `axios` | 1.18.1 | direct | `apps/web` | **high** (12 advisories; `GHSA-c29m-xwm3-cm6r`) | **1.21.0** | Yes. Every browser→API call and the refresh interceptor go through `axios` (`apps/web/src/lib/api.ts`). |
| `zod` | 4.4.3 | direct | `apps/web` | **high** (`GHSA-mrhx-c7xc-m3w5`) | **4.6.7** | Yes. Form/DTO validation runs on attacker-controlled input. |
| `multer` | 2.2.0 | direct | `apps/api` (also under `@nestjs/platform-express`) | **high** (`GHSA-wc9g-mqfw-jrwm`, `GHSA-q7qp-rjg7-q26m`, `GHSA-535w-7cp7-47q4`) | **2.5.0** | Yes. File uploads in `materials.controller.ts` and `payments.controller.ts` (receipt upload). |
| `nodemailer` | 9.0.3 | direct | `apps/api` | **high** (`GHSA-2x7j-588g-ccc2`) plus ~13 moderate DoS/bypass (`GHSA-v53p-9fqp-m79j`, `GHSA-8c8m-p3m8-cjg8`) | **10.3.0** (minimum fixed is `10.1.4`) | Yes. `mail.service.ts` sends verification/reset/payment mail. |
| `body-parser` | 2.3.0 | transitive | `apps/api` via Express 5 | **high** (`GHSA-27r3-jxmh-p828`) | **2.4.0** | Yes. Express parses every JSON/urlencoded request body. |
| `proxy-addr` | 2.0.7 | transitive | `apps/api` via Express 5 | **critical** (`GHSA-jqcg-44mw-7w3h`) | **2.0.8** | Yes in production: rate-limit buckets and audit client IPs trust `X-Forwarded-For` behind nginx. Not exploitable on localhost without a proxy. |
| `sharp` | 0.34.5 (optional) | transitive | `apps/web` via Next | **high** (`GHSA-f88m-g3jw-g9cj`, `GHSA-rgj7-g3m4-5g8c`, `GHSA-wq5f-xc86-pv6w`) | **0.35.5** | Yes. Reached through Next image optimization (`next/image` is used); the app does not import sharp directly. |
| `postcss` | 8.5.15 root + 8.4.31 under Next | direct + transitive | `apps/web`, `apps/web` via Next | **high** (`GHSA-r28c-9q8g-f849`, `GHSA-6g55-p6wh-862q`) plus moderate | **8.5.32** root; Next 16.4.3 brings its own `8.5.23` | Build-time only; not reachable at runtime. Fix anyway because it ships in the toolchain. |
| `nanoid` | 3.3.12 | transitive | via `postcss` | **high** (`GHSA-2v37-7h3g-55p8`, `GHSA-28wg-ghj8-5hjv`) | **3.3.20** | Build-time only through postcss. Cleared by the postcss/Next bump. |
| `@nestjs/platform-express` | 11.1.28 | direct | `apps/api` | **high** (meta; empty `via`) | **11.2.8** | Yes. Its nested `multer`/`body-parser` are the real advisories; fixing the Nest package alone is not enough (see overrides). |
| `prisma` | 7.9.0 | direct (CLI) | `apps/api` | **high** (meta; empty `via`) | **7.10.1** | Build/CLI surface. Meta entry; it inherits `@prisma/config`/`@prisma/dev` advisories. |
| `@prisma/config` | 7.9.0 | transitive | via `prisma` | **high** (meta; via `deepmerge-ts`) | **7.10.1** | Used at config load time; moves with `prisma@7.10.1`. |
| `@prisma/dev` | 0.24.14 | transitive | via `prisma` | **high** (meta; via `find-my-way`, `valibot`) | **0.24.17** | Local dev-server surface; moves with `prisma@7.10.1`. |
| `@prisma/client` | 7.9.0 | direct | `apps/api` | not separately flagged | **7.10.1** | Runtime ORM. Keep the whole Prisma stack on one version. |
| `@prisma/adapter-pg` | 7.9.0 | direct | `apps/api` | not separately flagged | **7.10.1** | Runtime driver adapter. Keep aligned. |

`@nestjs/platform-express`, `prisma`, `@prisma/config`, and `@prisma/dev`
appear as **meta advisories with an empty `via`**: the real risks are the
transitive advisories they aggregate (`multer`, `body-parser`,
`deepmerge-ts`, `find-my-way`, `valibot`, `mysql2`). Do not treat the empty
`via` as "no vulnerability".

### Must-fix upgrade commands

Run on a dedicated branch, not on `integration/anatomy-hardening`:

```bash
git checkout -b chore/dependency-security-upgrade integration/anatomy-hardening

# Web direct dependencies
npm install --workspace=apps/web \
  next@16.4.3 axios@1.21.0 zod@4.6.7 postcss@8.5.32

# API direct dependencies
npm install --workspace=apps/api \
  @nestjs/platform-express@11.2.8 multer@2.5.0 nodemailer@10.3.0
npm install --workspace=apps/api \
  @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1
npm install --workspace=apps/api --save-dev prisma@7.10.1

# Nodemailer 10 bundles its own types; the v8 @types package conflicts.
npm uninstall --workspace=apps/api @types/nodemailer
```

Add root `overrides` so Express/Nest cannot keep the vulnerable transitive
pins (verify after install with `npm ls`):

```json
{
  "overrides": {
    "multer": "2.5.0",
    "body-parser": "2.4.0",
    "proxy-addr": "2.0.8",
    "nanoid": "3.3.20",
    "sharp": "0.35.5"
  }
}
```

Then refresh the lockfile and verify:

```bash
npm install
npm dedupe
npm ls next axios zod postcss sharp multer nodemailer body-parser proxy-addr \
  prisma @prisma/client @prisma/config @prisma/dev @prisma/adapter-pg
npm audit --omit=dev --json --workspace=apps/api
npm audit --omit=dev --json --workspace=apps/web
```

## Can-wait / accepted for now

| Package | Installed | Direct? | Path | Severity | Why it can wait | Exit condition |
| --- | --- | --- | --- | --- | --- | --- |
| `tar` | 6.2.1 (lockfile only, optional) | transitive | `canvas@2.11.2 → @mapbox/node-pre-gyp@1.0.11 → tar@6.2.1` | **critical** (`GHSA-23hp-3jrh-7fpw`) + 11 others (`GHSA-r292-9mhp-454m`) | `canvas` and `@mapbox/node-pre-gyp` are **not installed** (`npm ls tar` is empty), so there is no runtime exposure on this host. The parent requires `tar@^6.1.11`, so forcing `tar@7.5.22` is not a valid override. | If `canvas` is ever installed (e.g. server-side PDF rendering), treat as must-fix. |
| `@mapbox/node-pre-gyp` | 1.0.11 (lockfile only, optional) | transitive | via `canvas` | high | Not installed; only relevant if `canvas` is enabled. | Same as `tar`. |
| `brace-expansion`, `browserslist`, `fast-uri`, `find-my-way`, `mysql2`, `follow-redirects`, `source-map-js`, `deepmerge-ts`, `qs` | mixed | transitive | various | mostly high | Expected to clear or drop below the advisory range when the must-fix set + overrides land; none is a direct runtime entry point. | Re-run both workspace audits; open a follow-up only for anything still reachable. |

## Breaking changes and behavior notes

- **`next@16.4.3`** — backport release; Node `>=20.9.0`. It pins
  `postcss@8.5.23` and optional `sharp@^0.35.5`. Re-run the web build, App
  Router pages, `proxy.ts`, image optimization, and fonts.
- **`axios@1.21.0`** — only plain objects, null-prototype maps, and compatible
  `AxiosHeaders` instances are treated as header defaults; custom class
  instances must be converted. Circular params now reject with
  `ERR_BAD_OPTION_VALUE`; sparse numeric form fields serialize as keyed objects;
  `proxy: false` with native proxy-env agents using unsupported pool/TLS
  overrides rejects. Audit `apps/web/src/lib/api.ts`.
- **`zod@4.6.7`** — patch; no documented breaking API change. Fixes memory
  exhaustion on oversized constrained collections.
- **`multer@2.5.0`** — behavior-visible: a value exactly equal to
  `limits.fieldSize` is accepted; `%0A`/`%0D`/`%22` in field names are decoded;
  non-integer/negative `limits` throw at construction; files skipped by
  `fileFilter` do not count toward `maxCount`; `LIMIT_UNEXPECTED_FILE` message
  changed. Re-test receipt/material upload validation and error mapping.
- **`nodemailer@10.3.0`** — major 10.x requires Node 20+ and ships bundled
  types (remove `@types/nodemailer@8`). Error codes standardized
  (`NoAuth` → `ENOAUTH`); TLS validation for remote content is on by default.
  Re-test verification, reset, and payment mail.
- **`body-parser@2.4.0`** — adds `zstd` on Node `^22.15`/`>=23.8`; does not
  mutate parser options or the request object. No API break from 2.3.0.
- **`proxy-addr@2.0.8`** — security-only patch. Re-test `TRUST_PROXY` hop
  counts, `X-Forwarded-For`, rate-limit buckets, and audit IPs.
- **`sharp@0.35.5`** — Node `>=20.9.0`; `install` script removed (prebuilt by
  default); `limitInputChannels` defaults to 5; `failOnError`,
  `paletteBitDepth`, and deprecated `sharpen` properties removed;
  `format.jp2k` renamed to `format.jp2`. Test JPEG/PNG/WebP/AVIF via
  `next/image`.
- **`postcss@8.5.32`** — patch; source-map and escaping fixes. Next 16.4.3
  brings its own `8.5.23`.
- **`@nestjs/platform-express@11.2.8`** — minor; peer-compatible with
  `@nestjs/core@^11`. Still pins `multer@2.4.0`, so the override is required.
- **`prisma@7.10.1` / `@prisma/client@7.10.1` / `@prisma/adapter-pg@7.10.1`** —
  patch. Fixes nested `$transaction` option mutation (transactions could join
  the wrong transaction); Migrate now refuses a shadow database equal to the
  main database. Re-test nested transactions, `migrate status`, seeds, and
  anatomy reconcile.

## Test plan

1. **Install/build gates**
   - `npm ci` (proves the new lockfile is reproducible)
   - `npm run build:api`
   - `npm run build:web`
   - `npm run lint --workspace=apps/web`
2. **Automated tests**
   - `npm test --workspace=apps/api`
   - `npm run test:e2e --workspace=apps/api` (with the local DB up)
   - `npm run e2e --workspace=apps/web` (Playwright, if browsers are installed)
   - `node apps/web/scripts/validate-anatomy-model.mjs --system heart`
   - `node apps/web/scripts/validate-anatomy-model.mjs --system urinary`
3. **Targeted regression checks**
   - **Proxy/IP:** requests through nginx with `X-Forwarded-For`; per-client
     rate limiting and audit IPs; IPv4-mapped IPv6 spoof attempt.
   - **Body parser:** malformed and oversized JSON/urlencoded bodies, limit
     boundaries (400/413, never 500).
   - **Multer:** receipt/material upload, oversized file, aborted upload,
     repeated field names, `LIMIT_*` error responses.
   - **Nodemailer:** registration verification, forgot-password, payment
     notification; TLS and sender/domain validation.
   - **Sharp/Next:** `next/image` optimization for JPEG/PNG/WebP/AVIF; no
     removed sharp options referenced.
   - **Axios:** login/refresh, interceptors, proxy-env handling, error shapes.
   - **Prisma:** `npx prisma migrate status`, `npm run db:seed`, anatomy
     `--reconcile --system heart`, and a nested `$transaction` path.
4. **Smoke**
   - Local: `SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000`
   - Production/staging behind nginx:
     `bash deploy/smoke-test.sh https://api.<domain> https://<domain>`
5. **Rollout**
   - Staging first, soak 24 hours, then production.
   - Keep the upgrade in its own commit/PR so a rollback does not revert
     unrelated hardening work.

## Residual risks

- The `tar` advisory remains visible in `npm audit` until the optional
  `canvas`/`node-pre-gyp` chain is removed or updated. It is not installed on
  this host; record the acceptance in the release ticket.
- `CORS_ORIGIN=*` is currently accepted by both `validateEnv` and
  `scripts/check-env.mjs`. This is an environment-validation gap, not a
  dependency issue; production must set an exact origin by hand.
- `@nestjs/platform-express@11.2.8` alone does **not** fix `multer`; the root
  override is mandatory. Verify with `npm ls multer` after install.
