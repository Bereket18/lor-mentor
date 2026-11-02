# Third-Party Licenses and Content Obligations

What Lor Mentor includes from other people, under what terms, and what the
college must do to stay compliant.

Two things are easy to get wrong here: the **3D anatomy models** (an unresolved
licence question, not a formality) and the **absence of a project licence**
(which means the college's own code is "all rights reserved" by default).

---

## 1. The project's own licence

There is **no `LICENSE` file** in this repository.

In the absence of one, copyright law applies by default: the college holds the
copyright and **no one else may copy, modify or redistribute the code** without
permission. That is a defensible default for a private platform, but it is a
decision, not an accident.

Decide before handover:

| Situation | Recommendation |
|---|---|
| The college will keep the code private | Leave as-is; add a short `LICENSE` stating "All rights reserved, © Lorcan Medical College" |
| The college wants to open-source it | Choose a licence deliberately (e.g. MIT or Apache-2.0) and have it reviewed |
| Contractors need to contribute | Add a contributor agreement or clarify ownership in the contract |

`apps/api/package.json` and `apps/web/package.json` both declare
`"license": "UNLICENSED"`, which matches the current state.

---

## 2. Anatomy Lab 3D models — the open obligation

**This is the only licensing item that is not already resolved.**

The heart and urinary models are derived from **BodyParts3D 4.0** (Database
Center for Life Science, Japan). The source's own statements conflict:

- The BodyParts3D licence page and README say **CC BY 4.0**.
- The header of every distributed OBJ file says **CC BY-SA 2.1 Japan**.

The repository resolves this conservatively: it credits the source as both
require and offers the adapted models under the **stricter** terms, CC BY-SA 2.1
Japan. That position is documented in:

- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- [`apps/web/public/models/anatomy/NOTICE-MODELS.md`](apps/web/public/models/anatomy/NOTICE-MODELS.md)
- `/attribution/anatomy` in the running app

### What this means in practice

| Obligation | Status |
|---|---|
| Credit "BodyParts3D, © The Database Center for Life Science" | Done, rendered in-app |
| State the licence | Done, on attribution pages |
| Describe modifications | Done, in NOTICE-MODELS.md |
| Offer the adapted model under the stricter terms | Done |
| **Confirm which licence actually applies with DBCLS** | **Open — must be resolved before the urinary system is published** |

If CC BY-SA 2.1 Japan applies, it is a **share-alike** licence: anyone receiving
the adapted models may reuse and redistribute them under the same terms. That
does not affect the college's own code, teaching text or platform, but it does
mean the model files cannot be relicensed more restrictively.

**Do not shorten, rewrite or remove the licence statements** in the notice files
or the attribution pages. They are required text.

### FMA identifiers

Source files carry Foundational Model of Anatomy concept identifiers. They are
used for traceability only and are not redistributed as a dataset.

---

## 3. Anatomy teaching content

Teaching notes, quizzes, structure descriptions and interface copy in
`apps/api/prisma/anatomy-heart.data.ts` and `anatomy-urinary.data.ts` are
original Lor Mentor content, **not** copied from BodyParts3D.

Status: **pending faculty review**. Content accuracy is a clinical risk, not a
licensing one, but both gate publication. See `docs/PROGRESS.md`.

---

## 4. Runtime dependencies — API

Versions are pinned in `package-lock.json`. Licences read from the installed
packages.

| Package | Licence |
|---|---|
| `@nestjs/*` (common, core, config, jwt, passport, platform-express, throttler, bullmq) | MIT |
| `@prisma/client`, `@prisma/adapter-pg` | Apache-2.0 |
| `@google/generative-ai` | Apache-2.0 |
| `@sentry/node` | MIT |
| `bcrypt` | MIT |
| `bullmq` | MIT |
| `class-transformer`, `class-validator` | MIT |
| `clsx` | MIT |
| `cookie-parser` | MIT |
| `helmet` | MIT |
| `ioredis` | MIT |
| `multer` | MIT |
| `nodemailer` | **MIT-0** (MIT No Attribution — attribution not required) |
| `passport`, `passport-jwt` | MIT |
| `pdf-parse` | Apache-2.0 |
| `pdfkit` | MIT |
| `pg` | MIT |
| `reflect-metadata` | Apache-2.0 |
| `rxjs` | Apache-2.0 |
| `tailwind-merge` | MIT |
| `resend` | MIT — **declared but unused**; mail goes through `nodemailer` |

`resend` can be removed from `apps/api/package.json` in a future dependency
cleanup; leaving it in place has no licensing consequence.

---

## 5. Runtime dependencies — Web

| Package | Licence |
|---|---|
| `next` | MIT |
| `react`, `react-dom` | MIT |
| `three` | MIT |
| `@react-three/fiber`, `@react-three/drei` | MIT |
| `@tanstack/react-query` (+ devtools) | MIT |
| `@hookform/resolvers`, `react-hook-form` | MIT |
| `class-variance-authority` | Apache-2.0 |
| `radix-ui` | MIT |
| `framer-motion` | MIT |
| `lucide-react` | ISC |
| `pdfjs-dist` | Apache-2.0 |
| `react-markdown`, `remark-gfm` | MIT |
| `sonner`, `next-themes` | MIT |
| `zod` | MIT |
| `clsx`, `tailwind-merge` | MIT |
| `tailwindcss`, `postcss`, `autoprefixer` | MIT |
| `geist` | **SIL Open Font License 1.1** |
| `tw-animate-css` | MIT |

The **Geist font** is embedded in the web build under the SIL OFL 1.1. That
licence permits bundling and redistribution, requires the copyright notice and
licence to travel with the font, and forbids selling the font by itself. Keep
the font's licence file intact; do not rename the font.

---

## 6. Receipt verifier — Python

Pinned in `services/receipt-verifier/requirements.txt`.

| Package | Version | Licence |
|---|---|---|
| `ethiobank-receipts` | 0.1.1 | MIT |
| `fastapi` | 0.140.0 | MIT |
| `uvicorn[standard]` | 0.51.0 | BSD-3-Clause |
| `pydantic` | 2.13.4 | MIT |
| `selenium` | 4.46.0 | Apache-2.0 |

Chromium is installed as a **separate program** inside the verifier image, not
linked into the application. Chromium's own licence terms are unaffected by this
project and it is not redistributed by the college.

---

## 7. Development and build tooling

Not shipped in the production images, so no distribution obligation — but they
appear in the repo.

| Package | Licence |
|---|---|
| `typescript`, `typescript-eslint`, `prisma`, `@playwright/test` | Apache-2.0 |
| `jest`, `ts-jest`, `supertest`, `eslint`, `prettier`, `concurrently`, `@next/bundle-analyzer` | MIT |
| `dotenv` | BSD-2-Clause |
| `shadcn` | MIT |

Base container images (`node:24-slim`, `python:3.12-slim-bookworm`, `postgres:16-alpine`,
`redis:7-alpine`) contain their own distribution licences. Distributing a
container image built from them does not change the college's source licence.

---

## 8. Services (not software licences)

Chapa, Resend and Google Gemini are **services** governed by their own terms of
service and privacy policies, not by open-source licences. Those terms are the
college's responsibility to review and accept. Account setup and data-sharing
details are in [INTEGRATIONS.md](INTEGRATIONS.md).

---

## 9. Compliance checklist

Before go-live:

- [ ] Decide the project's own licence and add a `LICENSE` file (or explicitly
      accept "all rights reserved").
- [ ] Keep `THIRD_PARTY_NOTICES.md` and `NOTICE-MODELS.md` intact and shipped.
- [ ] Keep `/attribution/anatomy` reachable and unmodified in substance.
- [ ] Do **not** publish the urinary anatomy system until DBCLS confirms the
      licence and faculty review is complete.
- [ ] Confirm the Geist font licence file is present in the web build.
- [ ] Review the service terms for Chapa, Resend and Gemini.

Before redistributing built artefacts or the 3D models outside the college:

- [ ] Include `THIRD_PARTY_NOTICES.md`, `NOTICE-MODELS.md` and the dependency
      licence texts.
- [ ] Treat the models as CC BY-SA 2.1 Japan until DBCLS says otherwise.

---

## 10. Where the full licence texts live

- npm packages: `node_modules/<package>/LICENSE` (and in each package's tarball).
- Python packages: the wheel's `*.dist-info/licenses/` directory.
- BodyParts3D: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>
- Geist: bundled with the `geist` npm package.

This document is a summary for planning. It is not legal advice; have the
college's legal or procurement office confirm the BodyParts3D question.
