# Dependency Security Triage — 2026-10-29

Read-only triage for `integration/anatomy-hardening` at `5197be2`. **No
dependency was installed, upgraded, or removed in this pass.** The commands
below are a proposal for a separate, reviewable upgrade branch.

## Evidence

| Workspace | Command | Total | Critical | High | Moderate |
| --- | --- | ---: | ---: | ---: | ---: |
| `apps/api` | `npm audit --omit=dev --json` | 17 | 1 | 13 | 3 |
| `apps/web` | `npm audit --omit=dev --json` | 18 | 3 | 12 | 3 |

Supporting checks: `npm ls <package> --all`, `npm view <package>@<version>`,
and the upstream changelogs/release notes cited below.

## Must-fix before production

These are direct dependencies or production-reachable transitive packages with
a fixed release available.

| Package | Installed | Path | Severity / advisories | Fix | Why now |
| --- | --- | --- | --- | --- | --- |
| `next` | 16.2.11 | `apps/web` direct | **critical**, 11 advisories (e.g. `GHSA-p293-qw3h-jr36`) | **16.4.3** | RCE/SSRF-class issues in the framework; latest 16.x is 16.4.3. |
| `axios` | 1.18.1 | `apps/web` direct | **high**, 12 advisories (e.g. `GHSA-c29m-xwm3-cm6r`) | **1.21.0** | Prototype pollution/ReDoS; latest 1.x. |
| `zod` | 4.4.3 | `apps/web` direct (plus transitive) | **high**, `GHSA-mrhx-c7xc-m3w5` | **4.6.7** | Memory exhaustion while validating oversized collections. |
| `multer` | 2.2.0 | `apps/api` direct + under `@nestjs/platform-express` | **high**, 6 advisories (e.g. `GHSA-wc9g-mqfw-jrwm`, `GHSA-qfvm-cv95-jqjf`) | **2.5.0** | Upload DoS/file-descriptor leaks. `2.4.0` is still in the vulnerable range. |
| `nodemailer` | 9.0.3 | `apps/api` direct | **high**, 14 advisories | **10.2.1** | SMTP/message-parser DoS and allowlist bypasses; latest 10.x. |
| `body-parser` | 2.3.0 | `apps/api` via Express | **high**, `GHSA-27r3-jxmh-p828` | **2.4.0** | Request-body DoS; Express 5.2.1 accepts `^2.2.1`, so a lockfile refresh or override works. |
| `proxy-addr` | 2.0.7 | `apps/api` via Express | **critical**, `GHSA-jqcg-44mw-7w3h` | **2.0.8** | IP spoofing via IPv4-mapped IPv6 trust subnets; affects rate-limit/audit identity. |
| `sharp` | 0.34.5 | `apps/web` via Next (optional) | **high**, 3 advisories | **0.35.5** | libvips CVEs; Next 16.4.3's optional range is `sharp@^0.35.5`. |
| `postcss` | 8.5.15 root, 8.4.31 under Next | `apps/web` direct + via Next | **high**, 4 advisories | **8.5.32** root; Next 16.4.3 brings **8.5.23** | Arbitrary file read/XSS-class issues; `8.5.23` is already outside the vulnerable range. |
| `@nestjs/platform-express` | 11.1.28 | `apps/api` direct | **high**, via `multer` | **11.2.8** | Latest 11.x; still pins `multer@2.4.0`, so the root override below is required. |
| `prisma` | 7.9.0 | `apps/api` dev direct | **high**, via `@prisma/config`, `@prisma/dev`, `mysql2` | **7.10.1** | Dependency security updates; also fixes nested `$transaction` option mutation. |
| `@prisma/client` | 7.9.0 | `apps/api` direct | not separately flagged, must align | **7.10.1** | Keep client/CLI/adapter on the same release. |
| `@prisma/adapter-pg` | 7.9.0 | `apps/api` direct | not separately flagged, must align | **7.10.1** | Keep the Prisma stack aligned. |
| `@prisma/config` | 7.9.0 | via `prisma` | **high**, via `deepmerge-ts` | **7.10.1** | Moves automatically with `prisma@7.10.1`. |
| `@prisma/dev` | 0.24.14 | via `prisma` | **high**, via `find-my-way`, `valibot` | **0.24.17** | Moves automatically with `prisma@7.10.1`. |

### Must-fix upgrade commands

Run on a dedicated branch, not on `integration/anatomy-hardening`:

```bash
git checkout -b chore/dependency-security-upgrade integration/anatomy-hardening

# Web direct dependencies
npm install --workspace=apps/web \
  next@16.4.3 axios@1.21.0 zod@4.6.7 postcss@8.5.32

# API direct dependencies
npm install --workspace=apps/api \
  @nestjs/platform-express@11.2.8 multer@2.5.0 nodemailer@10.2.1
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
npm audit --omit=dev
```

## Can-wait / accepted for now

| Package | Installed | Path | Severity | Why it can wait | Exit condition |
| --- | --- | --- | --- | --- | --- |
| `tar` | 6.2.1 (lockfile only) | optional `canvas@2.11.2 → @mapbox/node-pre-gyp@1.0.11 → tar@6.2.1` | **critical**, 12 advisories | `canvas` and `@mapbox/node-pre-gyp` are **not installed**; `npm ls tar` is empty, so there is no runtime exposure on this host. The parent requires `tar@^6.1.11`, so forcing `tar@7.5.22` is not a valid override. | If `canvas` is ever installed (for example, server-side PDF rendering), treat this as must-fix or remove the optional dependency. |
| `nanoid` | 3.3.12 | via `postcss`/Next | **high**, 2 advisories | Fixed transitively by the Next/postcss upgrade; target `3.3.20` (the override above pins it). | Verify `npm ls nanoid` shows `3.3.20` only. |
| `brace-expansion`, `browserslist`, `fast-uri`, `find-my-way`, `mysql2`, `follow-redirects`, `source-map-js`, `deepmerge-ts` | mixed | transitive | mostly high | Expected to clear or drop below the advisory range when the must-fix set lands; none is a direct runtime entry point in this app. | Re-run `npm audit --omit=dev`; open a follow-up only if any remain reachable. |
| `@mapbox/node-pre-gyp` | 1.0.11 (lockfile only) | optional via `canvas` | high | Not installed; only relevant if `canvas` is enabled. | Same as `tar`. |

## Breaking changes and behavior notes

- **`next@16.4.3`** — 16.4.3 is an LTS-active backport release (bug fixes, no
  new feature set). Node `>=20.9.0`. It pins `postcss@8.5.23` and optional
  `sharp@^0.35.5`. Re-run the full web build, App Router pages, `proxy.ts`,
  image optimization, and font handling.
- **`axios@1.21.0`** — documented breaking change: only plain objects,
  null-prototype maps, and compatible `AxiosHeaders` instances are treated as
  common/method-specific header defaults. Custom class instances used as
  defaults must be converted to plain maps. Also: circular params now reject
  with `ERR_BAD_OPTION_VALUE`; sparse/non-index numeric form fields serialize as
  keyed objects; `proxy: false` with native proxy-env agents using unsupported
  pool/TLS overrides rejects. Audit the API client and interceptors.
- **`zod@4.6.7`** — patch release; no breaking API change documented. The
  advisory fix bounds memory for oversized constrained collections.
- **`multer@2.5.0`** — semver-minor but behavior-visible: a value exactly equal
  to `limits.fieldSize` is now accepted; `%0A`/`%0D`/`%22` in field names are
  decoded; non-integer or negative `limits` throw at construction; `parts`
  exactly at the limit is accepted; files skipped by `fileFilter` do not count
  toward `maxCount`; `LIMIT_UNEXPECTED_FILE` message changed. Re-test receipt
  upload validation and error mapping.
- **`nodemailer@10.2.1`** — major 10.0.0 requires **Node.js 20+** and ships
  TypeScript ESM + CommonJS builds with bundled types. Remove
  `@types/nodemailer@8`. Error codes were standardized in 8.0.0 (`NoAuth` →
  `ENOAUTH`); 9.0.0 already validates TLS certificates by default for remote
  content. Re-test verification, password reset, payment mail, and any
  attachment/URL fetching.
- **`body-parser@2.4.0`** — adds `zstd` support on Node `^22.15`/`>=23.8`;
  avoids mutating parser options and the request object. No breaking API change
  from 2.3.0. Re-test JSON/urlencoded size limits and malformed bodies.
- **`proxy-addr@2.0.8`** — security-only patch; no API change. Re-test
  `TRUST_PROXY` hop counts, `X-Forwarded-For` handling, rate-limit buckets, and
  audit-log client IPs.
- **`sharp@0.35.5`** — 0.35.0 breaking changes: Node `>=20.9.0`; the `install`
  script is removed (prebuilt binaries by default, source build via `build`);
  `limitInputChannels` defaults to 5; removed `failOnError`, `paletteBitDepth`,
  and deprecated `sharpen` properties; `format.jp2k` renamed to `format.jp2`.
  If the app does not call sharp directly, exposure is through Next image
  optimization; test JPEG/PNG/WebP/AVIF transforms.
- **`postcss@8.5.32`** — patch release with source-map and escaping fixes; no
  breaking change. Next 16.4.3 brings its own fixed `8.5.23`.
- **`@nestjs/platform-express@11.2.8`** — minor; peer-compatible with
  `@nestjs/core@^11`. It still pins `multer@2.4.0`, hence the override.
- **`prisma@7.10.1` / `@prisma/client@7.10.1` / `@prisma/adapter-pg@7.10.1`** —
  patch release. Fixes a nested `$transaction` bug where the options object was
  mutated and later transactions could join the wrong transaction; Migrate now
  refuses a shadow database equal to the main database. Re-test nested
  transactions, `migrate status`, seeds, and anatomy reconcile.

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
   - `cd apps/web && node scripts/validate-anatomy-model.mjs --system heart`
   - `cd apps/web && node scripts/validate-anatomy-model.mjs --system urinary`
3. **Targeted regression checks**
   - **Proxy/IP:** send requests through nginx with `X-Forwarded-For`; confirm
     per-client rate limiting and audit IPs; attempt an IPv4-mapped IPv6 spoof.
   - **Body parser:** malformed JSON, oversized JSON/urlencoded bodies, and
     limit boundaries (400/413, no 500).
   - **Multer:** receipt upload, oversized file, aborted upload, repeated field
     names, and `LIMIT_*` error responses.
   - **Nodemailer:** registration verification, forgot-password, payment
     notification; confirm TLS and sender/domain validation.
   - **Sharp/Next:** `next/image` optimization for JPEG/PNG/WebP/AVIF; confirm
     no removed sharp options are referenced.
   - **Axios:** login/refresh, API client interceptors, proxy environment
     handling, and error shapes.
   - **Prisma:** `npx prisma migrate status`, `npm run db:seed`, anatomy
     `--reconcile --system heart`, and a nested `$transaction` path.
4. **Smoke**
   - Local: `SMOKE_STRICT_CACHE=0 bash deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000`
   - Production/staging behind nginx:
     `bash deploy/smoke-test.sh https://api.<domain> https://<domain>`
5. **Rollout**
   - Deploy the upgrade to staging first; soak 24 hours; then production.
   - Keep the upgrade in its own commit/PR so a rollback does not revert
     unrelated hardening work.

## Residual risks

- The `tar` advisory remains visible in `npm audit` until the optional
  `canvas`/`node-pre-gyp` chain is removed or updated. It is not installed on
  this host; document the acceptance in the release ticket.
- `CORS_ORIGIN=*` is currently accepted by both `validateEnv` and
  `scripts/check-env.mjs`. This is an environment-validation gap, not a
  dependency issue; production must set an exact origin by hand.
- `@nestjs/platform-express@11.2.8` alone does **not** fix `multer`; the root
  override is mandatory. Verify with `npm ls multer` after install.
