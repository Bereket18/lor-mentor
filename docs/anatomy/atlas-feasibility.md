# Human Atlas as a same-origin `/atlas` browse-everything sub-app

This is a docs-only feasibility study. No viewer, API, database, seed, or build
configuration was changed. No Human Atlas source code or site copy was copied
into this repository.

- Branch: `integration/anatomy-hardening`
- Study date: 2026-10-27
- Upstream: `github.com/ashemag/human-atlas`
- Upstream commit examined: `1c38bf35c254a891200d3cedecfd57abebe83d8d` (2026-09-06)
- Reference checkout: `C:\Users\berek\Desktop\human-atlas-ref` (outside this repo)
- Verdict: the viewer can be built as a pure static SPA and served at `/atlas`,
  but it is a large, English-only, single-page viewer with no deep links and no
  i18n. A same-origin production launch needs licence, security, and payload
  gates before it is safe to ship.

## 1. Bottom line

| Question | Finding |
| --- | --- |
| Can it run without a server, Cloudflare, or vinext? | Yes. The current `vite.config.ts` uses only the React plugin and Tailwind PostCSS. `npm run build` is configured to produce a static `dist/`. |
| Does it make external runtime requests? | None found in the application source. The only runtime fetches are same-origin manifest and model-chunk requests. External URLs are user-clicked links. |
| How large is the full atlas? | 59,546,744 bytes raw (56.79 MiB) and 32,956,129 bytes gzip (31.43 MiB) for 15 chunks, plus a 1,335,285-byte manifest (221,192 bytes gzip). |
| How many pieces and concepts? | 2,234 parts, 3,432 concepts, 2,288,268 triangles. |
| Can a "lite" first view avoid most of that? | Not without code and data changes. Chunks are system-mixed; skin plus skeleton still needs 9 of 15 chunks (35.00 MiB raw / 19.34 MiB gzip). |
| Can a structure be opened by URL or ID? | No URL deep link exists. Part IDs and FMA concept IDs exist in the manifest, and optional WebMCP tools can inspect by name or ID, but selection is React state only. |
| Is there an i18n mechanism? | No. UI text is hard-coded English and the document language is `en`. |
| Is it fast on mobile? | The repo states 2,288,268 triangles and ~33 MB compressed geometry; it has not been tested on physical devices or real multitouch hardware. The code caps pixel ratio on small screens and uses merged meshes, but it loads every chunk before selection is enabled. |
| Recommended path | Option A (vendor the static sub-app) as a time-boxed, gated pilot; fall back to Option C (keep ours only) if the gates cannot be met; use Option B (port the loader/renderer into R3F) only if browse-everything becomes a core, long-lived feature. |

The main blockers are not build mechanics. They are:

1. **Licence clarity.** Upstream says the anatomy data is CC BY 4.0, but the
   BodyParts3D source headers mention CC BY-SA 2.1 Japan. Our own
   `THIRD_PARTY_NOTICES.md` records that this is still being clarified and
   currently offers our adapted models under the stricter statement.
2. **Same-origin trust.** A vendored bundle at `/atlas` runs on our origin with
   our cookies and API. It must be treated as first-party code, not as an
   untrusted embed.
3. **Payload and product gaps.** A full first load is about 31.6 MiB gzip, all
   chunks load before selection works, and there are no deep links, no i18n, and
   no shared design system.

## 2. Scope, method, and evidence

### 2.1 What was fetched

The reference repository was cloned outside this repo with a shallow, blobless,
sparse checkout:

```powershell
git clone --depth 1 --filter=blob:none --no-checkout --progress `
  https://github.com/ashemag/human-atlas.git `
  C:\Users\berek\Desktop\human-atlas-ref
git -C C:\Users\berek\Desktop\human-atlas-ref sparse-checkout init --no-cone
git -C C:\Users\berek\Desktop\human-atlas-ref sparse-checkout set `
  "/app/" "/components/" "/hooks/" "/lib/" "/scripts/" "/web/" `
  "/.gitignore" "/LICENSE" "/README.md" "/package.json" `
  "/package-lock.json" "/tsconfig.json" "/vercel.json" "/vite.config.ts" `
  "/public/ATTRIBUTION.md" "/public/favicon.svg" "/public/models/atlas.json"
git -C C:\Users\berek\Desktop\human-atlas-ref checkout HEAD
```

The final checkout downloaded **401.21 KiB** in 2 packs (99 objects). Its working
tree is 2,034,643 bytes (1.94 MiB), dominated by `public/models/atlas.json`
(1,335,285 bytes). The `.git` directory is 451,244 bytes. In the final checkout,
no `public/models/*.bin` or `*.bin.gz` file was checked out; `git ls-tree` shows
the 15 pairs in the repository, but the working tree contains only `atlas.json`.

One earlier attempt was discarded. It downloaded a **63.57 MiB** pack and failed
to check out (missing blobs). The directory was removed and re-cloned; the
401.21 KiB figure above is the final, correct checkout. This is recorded here so
the download cost is not understated.

### 2.2 What was read

- `LICENSE`, `README.md`, `public/ATTRIBUTION.md`
- `package.json`, `package-lock.json`
- `vite.config.ts`, `vercel.json`, `tsconfig.json`, `web/index.html`, `web/main.tsx`
- `app/page.tsx`, `app/scene.tsx`, `app/anatomy.ts`, `app/model-download.ts`,
  `app/explosion-layout.ts`, `app/agent-tools.ts`, `app/pointer-tap.ts`
- `scripts/convert-anatomy.py`, `scripts/optimize-anatomy.mjs`,
  `scripts/compress-models.mjs`, `scripts/validate-atlas.mjs`,
  `scripts/validate-interactions.mjs`

The `public/models/atlas.json` manifest was parsed only for aggregate counts,
sizes, and per-system allocation. No model chunk was read or decoded. No upstream
build, install, test, or browser run was performed.

### 2.3 How sizes were computed

- Raw chunk sizes are the manifest's `bytes` values, summed across all 15 chunks.
- Gzip chunk sizes are the manifest's `gzipBytes` values, summed across all 15
  chunks. These are actual gzip file sizes produced at level 9 upstream.
- Per-part raw size is `vertexCount * 12 + vertexCount * 6 + indexCount * 4`
  (Float32 positions, Int16 normals, Uint32 indices).
- Per-system raw bytes are exact sums of those part sizes. They total
  59,544,558 bytes; the remaining 2,186 bytes are 4-byte alignment padding inside
  the chunk files.
- Per-system gzip bytes are **estimates**: each chunk's actual gzip size is
  allocated to systems in proportion to their raw bytes in that chunk. This
  ignores system-specific compressibility.
- Lite-view "payload-only" gzip figures are also **estimates** using the same
  proportional allocation. Lite-view "chunk-level" figures are exact, because
  they sum the actual chunk files that the current loader would need.
- `atlas.json` gzip size (221,192 bytes) was measured locally with Node's
  `zlib.gzipSync` at default settings; it is not a manifest field.

## 3. Upstream snapshot

| Item | Value |
| --- | --- |
| Application | React + Three.js anatomy explorer, single page |
| Runtime UI | React 19.2.6, React DOM 19.2.6 |
| 3D runtime | three 0.159.0 (lockfile; declared `^0.159.0`) |
| Build | Vite 8.0.13, `@vitejs/plugin-react` 6.0.2, TypeScript 5.9.3 |
| Node requirement | `>=22.13.0` (`engines` and README) |
| Package manager | npm, lockfile v3, 706 package entries |
| Build output | `vite build` to `dist/`; static host or Vercel |
| Data | BodyParts3D 4.0, adult male reference |
| Parts / concepts | 2,234 parts / 3,432 concepts |
| Triangles | 2,288,268 optimized from 6,681,030 source triangles (65.75% reduction) |
| Chunks | 15 binary chunks, 2,300,452 to 4,526,484 bytes each |
| Code licence | MIT, copyright (c) 2026 ashemag |
| Data licence | CC BY 4.0 per upstream attribution, with a legacy CC BY-SA 2.1 Japan note in source headers |

The manifest's `optimized` block records meshoptimizer quadric simplification
with a 0.002 maximum relative error and all 2,234 meshes preserved. Meshoptimizer
is build-time only; the runtime format is raw typed arrays plus gzip.

## 4. Licence and attribution obligations

### 4.1 What MIT requires us to keep

The upstream application code is MIT-licensed. MIT requires the copyright notice
and the permission notice to be included in all copies or substantial portions of
the software. In practice, for either integration option:

- Keep the upstream `LICENSE` text and copyright line with the vendored code or
  ported files.
- Add an entry to our `THIRD_PARTY_NOTICES.md` naming the upstream project, the
  MIT licence, and the copyright holder.
- Surface a credits/attribution link in the `/atlas` UI or in our existing
  `/attribution/anatomy` page.
- Do not rely on comments surviving in a minified bundle; ship a separate notice
  file and link it.
- MIT does not require source disclosure, but it does require notice retention.
  It also provides the software "as is", without warranty.

### 4.2 Obligations table

| Component | Licence / rights holder | What we must do if we redistribute | Notes and risk |
| --- | --- | --- | --- |
| Upstream viewer code (React/Three UI, loader, scripts) | MIT; copyright (c) 2026 ashemag | Include the copyright and permission notice in copies or substantial portions; add a third-party notice and credits link; keep the licence text | MIT allows commercial use, modification, and redistribution. A minified build can drop the notice, so a separate `NOTICE`/`THIRD_PARTY_NOTICES.md` is required. |
| Anatomy geometry, English names, relationships (BodyParts3D 4.0) | CC BY 4.0, Database Center for Life Science (DBCLS), per upstream | Credit BodyParts3D/DBCLS; link the licence; indicate changes (axes/units, translation, simplification, normal quantization, chunk packing, curated system groupings and colours); do not imply endorsement | CC BY 4.0 allows commercial use and adaptation and has no ShareAlike. Attribution must be kept. |
| Legacy BodyParts3D source-header statement | CC BY-SA 2.1 Japan (as stated in source OBJ headers) | If that licence applies, ShareAlike may attach to adaptations; legal review is required | Upstream says the current CC BY 4.0 page supersedes the legacy text. Our `THIRD_PARTY_NOTICES.md` says the question is still being clarified with DBCLS and currently offers our adapted models under the stricter statement. This is a release blocker until resolved. |
| Historical female reference assets | CC BY 4.0; Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP | Credit the authors, DOI, and licence; indicate changes | Not included in the current release. Relevant only if an older revision or female assets are used. |
| UI copy, descriptions, translations | No separate licence found in the sparse checkout; the repository is MIT-licensed | If reused, keep the MIT notice; but do not reuse the "Human Atlas" branding or site copy; write original text | MIT may cover repository text, but copyright and trademark rights in names/logos are not clearly granted. Replacing copy also solves the English-only problem. |
| Favicon, logo, images | No separate asset licence found; favicon is part of the MIT repository | Keep the MIT notice if reused; trademark use is not granted | The current release has no external image textures; materials are solid colours plus a procedural room environment. Use our own icon/branding. |
| Third-party npm dependencies | MIT, ISC, Apache-2.0, and others as declared in the lockfile | Retain the notices and licence texts for dependencies that are shipped; include Apache-2.0 notices where applicable | 706 package entries and 4 install scripts (`esbuild`, `fsevents`, `sharp`, `workerd`). A naive install pulls Cloudflare/workerd and image tooling that the static build does not need. |
| BodyParts3D publication | Mitsuhashi et al. (2009), Nucleic Acids Research | Cite the source in the attribution page (good practice and consistent with CC BY attribution) | The upstream attribution file already provides the citation and DOI; our credits should link it. |

### 4.3 Text, translations, images, and site copy

No separate terms were found for UI copy, descriptions, translations, or images.
The sparse checkout contained only the root `LICENSE` and
`public/ATTRIBUTION.md`; no other `LICENSE`, `NOTICE`, or `COPYING` files were
present. Dependency licences are declared in `package-lock.json`. The
repository's MIT licence is the only application-level licence, and the anatomy
data has its own CC BY 4.0 attribution file. There are no translation files or
locale assets in the checkout, and no image assets beyond the favicon. The
viewer's materials are procedural/solid-colour; it does not ship photographic
textures.

For our integration, the safe approach is:

- Write our own UI copy and teaching text.
- Do not reuse the "Human Atlas" name, logo, or page copy without permission.
- Keep the required BodyParts3D attribution and adaptation statement.
- Add the upstream MIT notice and dependency notices.
- Treat the licence question in section 4.2 as unresolved until DBCLS or legal
  confirms it.

## 5. Dependencies, versions, and build

### 5.1 Direct dependencies

Runtime dependencies (21):

| Package | Version |
| --- | --- |
| `@base-ui/react` | 1.7.0 |
| `@shadcn/react` | 0.3.0 |
| `@types/three` | `^0.159.0` (lock 0.159.0) |
| `class-variance-authority` | 0.7.1 |
| `clsx` | 2.1.1 |
| `cmdk` | 1.1.1 |
| `date-fns` | 4.1.0 |
| `embla-carousel-react` | 8.5.2 |
| `input-otp` | 1.4.2 |
| `lucide-react` | 1.31.0 |
| `react` | 19.2.6 |
| `react-day-picker` | 9.8.1 |
| `react-dom` | 19.2.6 |
| `react-resizable-panels` | 4.5.8 |
| `react-server-dom-webpack` | 19.2.6 |
| `recharts` | 3.8.0 |
| `shadcn` | 4.18.0 |
| `tailwind-merge` | 3.6.0 |
| `three` | `^0.159.0` (lock 0.159.0) |
| `tw-animate-css` | 1.4.0 |
| `vinext` | 1.0.0-beta.5 |

Dev dependencies (17):

| Package | Version |
| --- | --- |
| `@cloudflare/vite-plugin` | 1.37.1 |
| `@cloudflare/workers-types` | 4.20260515.1 |
| `@openai/sites-vite-plugin` | 0.2.0 |
| `@tailwindcss/postcss` | 4.2.1 |
| `@types/node` | 22.19.19 |
| `@types/react` | 19.2.14 |
| `@types/react-dom` | 19.2.3 |
| `@vitejs/plugin-react` | 6.0.2 |
| `@vitejs/plugin-rsc` | 0.5.26 |
| `meshoptimizer` | `^1.2.0` (lock 1.2.0) |
| `oxfmt` | 0.61.0 |
| `oxlint` | 1.76.0 |
| `oxlint-tsgolint` | 7.0.2001 |
| `tailwindcss` | 4.2.1 |
| `typescript` | 5.9.3 |
| `vite` | 8.0.13 |
| `wrangler` | 4.92.0 |

Our web app currently uses React 19.2.4, three 0.186.1, `@react-three/fiber`
9.8.2, `@react-three/drei` 10.7.9, and Next 16.2.11. The upstream viewer pins an
older three (0.159.0) and a slightly newer React patch (19.2.6). A straight
dependency merge would create duplicate React/three trees or force upgrades;
Option A should build in isolation, and Option B should port to our versions.

### 5.2 Node and build requirements

- Upstream requires Node `>=22.13.0`.
- Our root `package.json` requires Node `>=20.0.0`; the web Dockerfile uses
  Node 24. A vendored upstream build job must pin Node 22.13 or newer.
- Vite 8.0.13 is the build tool. The lockfile has 706 package entries; four
  packages declare install scripts. The static viewer does not need Cloudflare
  Workers, RSC, `vinext`, or `wrangler`.
- Upstream scripts: `dev` (Vite on port 3016), `build` and `build:vercel` (both
  `vite build`), `check` (`tsc --noEmit`). Validation is via
  `scripts/validate-atlas.mjs` and `scripts/validate-interactions.mjs`, which
  need the model chunks.

### 5.3 Can it be a pure static SPA?

**Yes.** The evidence:

- `vite.config.ts` uses `root: ./web`, `publicDir: ./public`,
  `outDir: ./dist`, `@vitejs/plugin-react`, and Tailwind PostCSS. It does not
  register `vinext`, `@cloudflare/vite-plugin`, `@vitejs/plugin-rsc`, or the
  OpenAI Sites plugin.
- `web/main.tsx` mounts the page directly with `createRoot`; there is no RSC,
  hydration, server action, API route, or edge function.
- `vercel.json` declares a Vite project with `npm ci`, `npm run build`, and
  `dist` output; it can be served by any static host.
- `vinext`, `@cloudflare/vite-plugin`, `@vitejs/plugin-rsc`,
  `react-server-dom-webpack`, `@openai/sites-vite-plugin`, and `wrangler` are
  declared but not used by the current build. `tsconfig.json` references
  `vinext/types` and Cloudflare worker types, but those are type-only.
- `@types/three` is declared as a runtime dependency, which is unusual but does
  not affect the build.

### 5.4 What would have to change for `/atlas`

Serving a built `dist/` at `/atlas` is not just a `base` change. The app has
hard-coded absolute paths:

- `app/page.tsx` fetches `/models/atlas.json`.
- The manifest stores chunk URLs as `/models/body-N.bin` and `.bin.gz`.
- `web/index.html` references `/favicon.svg` (and `/main.tsx` in dev).
- Vite's default `base` is `/`, so the built JS/CSS also assume the origin root.

A production `/atlas` deployment would need one of:

1. **Path rewrite in the built app** (recommended for a clean sub-path):
   set Vite `base: '/atlas/'`, change the manifest fetch to
   `/atlas/models/atlas.json`, rewrite the manifest's chunk URLs to
   `/atlas/models/...`, and change the favicon path. This requires a small
   upstream patch or a post-build rewrite of `atlas.json`.
2. **Reverse-proxy aliases**: serve `/atlas/` for the app and alias
   `/models/*` to the atlas model directory. This avoids patching the manifest
   but pollutes the origin-root namespace and can collide with our own
   `/models/` assets.
3. **A separate origin** for the viewer, which also gives a stronger security
   boundary. The requested same-origin `/atlas` rules this out unless the owner
   relaxes it.

Other deployment requirements:

- A static rewrite from `/atlas` (and any future `/atlas/*` deep links) to
  `index.html`. There is no client router today, but the fallback is needed for
  future links.
- Correct MIME types for `.bin` and `.bin.gz`. The JS handles both a
  `Content-Encoding: gzip` response and an opaque gzip file; do not
  double-compress the `.gz` files.
- Cache headers. The built JS/CSS are content-hashed, but the model filenames
  (`body-0.bin`, etc.) are stable. Use a versioned directory or a content hash
  for model assets so updates are not served stale.
- A Content Security Policy and related headers (see section 11.1).
- If the viewer is placed under `apps/web/public/atlas/`, the Next Dockerfile
  already copies `apps/web/public`, so no Docker change is needed. A Next rewrite
  is still needed to serve `/atlas` as `index.html`; Next will serve the file at
  `/atlas/index.html` directly, and public files can be shadowed by an app route
  at the same path.

## 6. External requests and telemetry

### 6.1 Runtime requests found

| Request | Where | When | Destination | Automatic? |
| --- | --- | --- | --- | --- |
| `GET /models/atlas.json` | `app/page.tsx` | Page mount | Same origin | Yes |
| `GET /models/body-N.bin.gz` (N = 0..14), or `.bin` fallback | `app/scene.tsx` | Page mount; 3 concurrent loads; all 15 chunks | Same origin | Yes |
| Built JS/CSS module graph | Vite output | Page load | Same origin | Yes |
| `GET /favicon.svg` | `web/index.html` | Page load | Same origin | Browser-initiated |
| External source/licence links | `app/page.tsx` anchors | User click only | `lifesciencedb.jp`, `dbarchive.biosciencedbc.jp`, `academic.oup.com` | No |
| Demo link in `README.md` | Documentation | Never at runtime | External demo host | No |

External URLs found in source or documentation (none are fetched
automatically):

- Runtime UI anchors: `https://lifesciencedb.jp/bp3d/`,
  `https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html`,
  `https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html`, and
  `https://academic.oup.com/nar/article/37/suppl_1/D782/1000752`.
- README: `https://human-atlas-seven.vercel.app` (demo) and
  `http://localhost:3016` (local development instruction).
- Attribution document: `https://creativecommons.org/licenses/by/4.0/`,
  `https://doi.org/10.1093/nar/gkn613`,
  `https://doi.org/10.48539/HBM352.BTSQ.586`,
  `https://lod.humanatlas.io/ref-organ/united-female/v1.5`, and
  `https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb`
  (historical female assets; not part of the current release and not
  downloaded).
- `https://openapi.vercel.sh/vercel.json` in `vercel.json` is a schema
  identifier for tooling, not a runtime request.
- npm registry URLs in `package-lock.json` are install/build-time only and are
  not runtime requests.
- The owner-stated live URL `https://human-atlas.co` was not fetched and is not
  referenced in the checked-out source; the README links a Vercel demo.

### 6.2 What was checked

- `fetch(` appears only at the manifest fetch and the chunk loader.
- No `XMLHttpRequest`, `WebSocket`, `EventSource`, or `navigator.sendBeacon`.
- No `<script src="https://...">`, no analytics/tag manager, no tracking pixel,
  no Sentry/PostHog/Plausible/Segment/Datadog code, no external fonts, and no
  CDN URLs in the application source.
- CSS `@import` statements resolve Tailwind and `tw-animate-css` at build time;
  they are bundled, not network requests.
- The only font families are local/system stacks; there is no `@font-face` and
  no Google Fonts request.
- The optional WebMCP integration uses `document.modelContext.registerTool`
  locally. It does not make a network request.
- `vercel.json` contains a `$schema` URL, which is editor/tooling metadata, not
  a runtime request.
- `package-lock.json` contains npm registry URLs, which are install/build-time
  only.

**Conclusion:** no external runtime requests were found in the application
source. This is a source inspection, not a browser network capture. A CSP with
`connect-src 'self'` should enforce the requirement, and a browser network test
should be part of the pilot.

### 6.3 Telemetry and privacy

No telemetry, analytics, crash reporting, or user tracking was found. The only
third-party navigations are user-clicked source/licence links. If we add
analytics or error reporting around `/atlas`, that becomes our processing and
needs a privacy review and disclosure. The viewer page and its imports do not
set cookies or use local storage; a generic sidebar component elsewhere in the
repository sets a sidebar cookie, but it is not imported by the viewer.

## 7. Data format and rendering

### 7.1 Manifest fields

Top-level `atlas.json` fields:

| Field | Meaning |
| --- | --- |
| `version` | Dataset version string (`BodyParts3D 4.0`) |
| `sex` | Reference sex (`male`) |
| `source` | Source dataset name |
| `scope` | Human-readable scope statement |
| `parts` | Array of 2,234 mesh parts |
| `concepts` | Array of 3,432 named concepts |
| `chunks` | Array of 15 binary chunk descriptors |
| `triangles` | Optimized triangle count (2,288,268) |
| `sourceTriangles` | Pre-simplification count (6,681,030) |
| `optimized` | Simplifier method, maximum relative error (0.002), preserved mesh count |

Part fields:

| Field | Meaning |
| --- | --- |
| `id` | Source element ID (for example, a BodyParts3D element ID) |
| `name` | English anatomical name |
| `conceptId` | FMA concept ID |
| `system` | One of 15 display systems |
| `chunk` | Chunk index |
| `positions`, `normals`, `indices` | Byte offsets into the chunk buffer |
| `vertexCount`, `indexCount` | Element counts |
| `bounds` | Min/max XYZ bounds for picking and layout |

Chunk fields: `url`, `bytes`, optional `gzip`, optional `gzipBytes`.
Concept fields: `id`, `name`, `elements` (part IDs). A concept may contain
multiple parts.

### 7.2 Binary chunk layout

Each chunk is a concatenation of per-part segments with 4-byte alignment:

- Positions: `Float32` × 3 per vertex (12 bytes/vertex).
- Normals: signed `Int16` × 3 per vertex (6 bytes/vertex), normalized in the
  GPU attribute.
- Indices: `Uint32` × 1 per index (4 bytes/index).

The manifest gives byte offsets, so the loader creates typed-array views directly
into the fetched `ArrayBuffer`; there is no per-part file or JSON geometry. The
part payload totals 59,544,558 bytes; chunk files total 59,546,744 bytes, with
2,186 bytes of alignment padding.

### 7.3 Loading and decoding

1. On mount, the page fetches `/models/atlas.json`.
2. The scene loads all 15 chunks with three concurrent load loops (not Web
   Workers).
3. For each chunk, it prefers the `.bin.gz` URL when `DecompressionStream` is
   available and a gzip URL exists; otherwise it fetches the uncompressed `.bin`.
4. It reads the response as an `ArrayBuffer`. If the payload starts with the gzip
   magic bytes (`1f 8b`), it decompresses with `DecompressionStream('gzip')`.
   This handles both a host that serves the `.gz` as an opaque file and a host
   that sets `Content-Encoding: gzip` and lets `fetch` decode it.
5. It verifies the decoded byte length equals the manifest's `bytes`; a mismatch
   aborts with an error.
6. For each part in the chunk, it creates a `BufferGeometry` with typed-array
   views, sets the manifest bounds, adds a `partIndex` attribute, and creates a
   separate picker mesh (not added to the scene).
7. It groups the per-part geometries by system and merges them with
   `mergeGeometries`, adding one mesh per system per chunk.
8. Progress is reported by chunk count. Selection is disabled until all chunks
   are loaded; orbit controls can work while loading.

There is no runtime meshoptimizer decoder. Meshoptimizer is used only when
rebuilding the data; the runtime uses raw typed arrays plus gzip.

### 7.4 Selection

- A click/tap raycasts against the per-part picker meshes. A bounding-box test
  rejects most parts before the triangle raycast.
- The body-surface system is skipped when any solid system is visible, so the
  user does not hit the transparent skin first.
- A small `PointerTap` helper distinguishes a tap from orbit, pinch, pan, or a
  canceled touch sequence. Touch uses a larger movement threshold than mouse.
- In exploded mode, if no mesh raycast hits, the viewer falls back to projected
  bounding-box targets with a larger touch radius.
- The selected part ID is passed to the page, which maps it to its concept and
  opens the detail panel. Search selects a concept and sets all of its `elements`
  as selected.
- Isolate mode frames the union of the selected parts' bounds and offsets the
  camera so the detail panel does not cover the structure.

### 7.5 Explosion layout

- The viewer shelf-packs the visible parts' model-space X/Y bounding-box extents
  into rows, with each part receiving a cell centre.
- Per-part translation and visibility are written into a `Float32` RGBA data
  texture: XYZ offset plus a visibility flag. A second `Uint8` texture holds the
  selection flag.
- A vertex-shader injection adds the per-part offset to each vertex and passes
  visibility/selection to the fragment shader; invisible parts are discarded and
  selected parts are tinted.
- At low explosion amounts, parts separate radially by system; above the
  midpoint they interpolate to the packed grid. Markers appear at high explosion
  amounts, the stage is hidden, and the camera fits the packed layout.
- Picking positions are updated alongside the texture data so the raycast pickers
  follow the visual offsets.

### 7.6 Draw calls and memory

- There are **69 unique (chunk, system) groups**, so the anatomy renders as 69
  merged meshes rather than 2,234 separate meshes. Adding the ground, platform,
  two rings, and the marker points object gives roughly 74 draw calls per
  rendered frame.
- Per-part visibility and selection are shader/texture state, not separate draw
  calls. The 2,234 picker meshes are not added to the scene and are only used for
  CPU raycasting.
- Merged meshes have `frustumCulled = false`; all 69 are submitted when a frame
  is rendered. Rendering is dirty-driven: idle frames are skipped, but orbit
  damping and auto-rotate keep rendering while active.
- Memory estimate (not measured): the 15 chunk buffers total about 56.79 MiB,
  and the merged geometries copy roughly another 56.79 MiB, for about 113.6 MiB
  of CPU geometry. The GPU holds the merged geometry (about 56.8 MiB) plus tiny
  state textures (about 80 KiB). Picker meshes share the chunk buffers, so they
  do not add a second full copy. Expect roughly 120–150 MiB of process memory
  before browser/JS overhead; this is a risk on low-memory phones.
- There is no LOD, instancing, worker-based decoding, or offscreen rendering.
  Decoding is streamed on the main thread via `DecompressionStream`.

## 8. Deep links and i18n

### 8.1 Deep links

There is **no URL deep link**:

- The app is a single React component with local state.
- No router, `location.search`, `URLSearchParams`, `history.pushState`, or hash
  parsing is used.
- Selection is stored only in React state (`selected` part IDs, `isolate`,
  `explode`, `view`).
- Part IDs and FMA concept IDs are stable identifiers in the manifest, so a
  deep-link layer is feasible, but it does not exist today.
- The optional WebMCP tools can search by name/ID and inspect a concept, but
  that is a browser-agent API, not a shareable URL.

To add deep links later: parse a concept ID or slug on mount, select its
`elements`, optionally isolate it, open the detail panel, and update the URL on
selection. A static host must rewrite `/atlas/*` to `index.html`. Validate IDs
against the manifest and show a not-found state for unknown values.

### 8.2 Internationalization

There is **no i18n mechanism**:

- UI strings are hard-coded English in `app/page.tsx` and `app/anatomy.ts`.
- `web/index.html` sets `lang="en"`.
- No i18n library, locale files, message catalogue, or translated assets are
  present. The only locale-aware calls are number/string formatting helpers
  (`toLocaleString`, `localeCompare`); the viewer does not use the locale props
  that some generic UI primitives expose.
- Anatomical names come from the English BodyParts3D metadata; there are no
  translated names or descriptions.
- There is no RTL handling or locale routing.

Adding i18n would mean extracting UI strings, adding a locale layer, translating
anatomy names and descriptions, and getting medical review of the translations.
That is a product/content project, not a build tweak. It also reinforces the
recommendation to write our own UI copy rather than reuse upstream text.

## 9. Performance and mobile limits

### 9.1 What the repo states

- 2,288,268 triangles and approximately 33 MB of compressed geometry.
- Browser interaction checks covered 390×844, 320×568, and 844×390 layouts.
- Physical-device performance and real multitouch hardware have **not** been
  tested.

### 9.2 What the code does

- `WebGLRenderer` with `antialias`, `powerPreference: 'high-performance'`, ACES
  tone mapping, and a procedural room environment.
- Pixel ratio capped at 1.5 when width is under 768 px or height is under 600 px;
  otherwise capped at 2.
- Three concurrent chunk loads; all 15 chunks are loaded regardless of which
  systems are visible.
- Selection is disabled until all chunks are ready.
- 69 merged anatomy meshes; `frustumCulled = false`; dirty-driven rendering.
- On tap, iterates 2,234 picker meshes with a bounding-box prefilter; in exploded
  mode, projects eight corners of every visible part each dirty frame to build
  screen-space hit targets.
- Mobile camera fitting reserves 350 px of height for controls/panels.
- No LOD, instancing, worker decode, service worker, or chunk retry. The only
  progressive behavior is adding each chunk as it arrives.
- If `DecompressionStream` is unavailable, the loader falls back to uncompressed
  `.bin` files: 56.79 MiB of chunks instead of 31.43 MiB gzip.

### 9.3 Practical implications

- A first visit is a **~31.6 MiB gzip** download before selection is fully
  available. On a slow or metered connection this is a significant commitment;
  the page can orbit while loading, but tapping a structure does nothing until
  all chunks are ready.
- The default view shows 14 of 15 systems (body surface is off), but the loader
  still downloads the body-surface data because it is mixed into chunks 10 and
  11.
- Low-end phones may struggle with 2.29M triangles, 69 draw calls, and the
  estimated 120–150 MiB memory footprint. The repo's own caveat about physical
  devices should be taken seriously.
- The 1.5 pixel-ratio cap helps, but there is no quality selector or reduced
  motion handling in the viewer.
- Accessibility is partial: the canvas has an `aria-label`, search has a keyboard
  shortcut, and panels use dialog semantics, but individual 3D parts are not
  keyboard-navigable and there is no screen-reader list of all 2,234 structures.

## 10. Payload analysis

### 10.1 Totals

| Item | Raw bytes | Raw MiB | Gzip bytes | Gzip MiB |
| --- | ---: | ---: | ---: | ---: |
| 15 model chunks | 59,546,744 | 56.79 | 32,956,129 | 31.43 |
| `atlas.json` manifest | 1,335,285 | 1.27 | 221,192 | 0.21 |
| **First load total** | **60,882,029** | **58.06** | **33,177,321** | **31.64** |

Notes:

- Chunk raw and gzip values are exact manifest sums.
- The manifest gzip value is a local measurement, not a manifest field. If the
  host does not compress JSON, the manifest adds 1.27 MiB instead of 0.21 MiB.
- The README's "approximately 33 MB" is decimal megabytes; 32,956,129 bytes is
  32.96 MB decimal, or 31.43 MiB.
- HTTP headers, TLS, and CDN overhead are not included.
- The 15 chunks are all loaded on mount; there is no lazy or per-system loading.

### 10.2 Per-system counts and geometry

| System | Parts | Vertices | Triangles | Chunks used |
| --- | ---: | ---: | ---: | --- |
| Skeletal | 296 | 229,239 | 338,056 | 0, 1, 4, 8, 9, 10, 11, 12, 13 |
| Muscular | 402 | 677,942 | 656,120 | 0, 1, 2, 3, 4, 5, 8, 9, 10, 11 |
| Arterial | 639 | 210,758 | 333,798 | 5, 7, 8, 9, 11, 13, 14 |
| Venous | 404 | 177,681 | 303,350 | 7, 8, 9, 11, 13, 14 |
| Nervous | 139 | 123,087 | 201,226 | 0, 5, 6, 7 |
| Digestive | 97 | 96,287 | 88,382 | 7, 9, 10, 11, 13 |
| Respiratory | 119 | 51,548 | 82,078 | 8, 9, 10, 12, 13 |
| Sensory | 45 | 81,874 | 109,348 | 0, 3, 6, 10, 12, 13 |
| Integumentary | 5 | 49,849 | 60,362 | 10, 11 |
| Connective | 40 | 42,730 | 45,524 | 0, 1, 3, 5, 9, 10 |
| Cardiac | 23 | 30,210 | 50,988 | 5, 6, 8 |
| Reproductive | 12 | 4,439 | 6,386 | 11 |
| Urinary | 6 | 2,896 | 5,100 | 11 |
| Endocrine | 4 | 2,409 | 4,756 | 6, 11 |
| Lymphatic | 3 | 1,570 | 2,794 | 9, 11 |
| **Total** | **2,234** | **1,782,519** | **2,288,268** | **15** |

The vertex total is the sum of per-part vertex counts; it is not a unique-vertex
count across the merged meshes.

### 10.3 Per-system bytes

| System | Raw bytes | Raw MiB | Gzip estimate bytes | Gzip estimate MiB |
| --- | ---: | ---: | ---: | ---: |
| Skeletal | 8,182,974 | 7.80 | 4,544,869 | 4.33 |
| Muscular | 20,076,396 | 19.15 | 10,509,424 | 10.02 |
| Arterial | 7,799,220 | 7.44 | 4,468,509 | 4.26 |
| Venous | 6,838,458 | 6.52 | 3,990,968 | 3.81 |
| Nervous | 4,630,278 | 4.42 | 2,699,608 | 2.57 |
| Digestive | 2,793,750 | 2.66 | 1,552,996 | 1.48 |
| Respiratory | 1,912,800 | 1.82 | 1,075,138 | 1.03 |
| Sensory | 2,785,908 | 2.66 | 1,563,774 | 1.49 |
| Integumentary | 1,621,626 | 1.55 | 907,993 | 0.87 |
| Connective | 1,315,428 | 1.25 | 714,757 | 0.68 |
| Cardiac | 1,155,636 | 1.10 | 679,603 | 0.65 |
| Reproductive | 156,534 | 0.15 | 89,938 | 0.09 |
| Urinary | 113,328 | 0.11 | 65,114 | 0.06 |
| Endocrine | 100,434 | 0.10 | 58,251 | 0.06 |
| Lymphatic | 61,788 | 0.06 | 35,186 | 0.03 |
| **Total** | **59,544,558** | **56.79** | **32,956,128** | **31.43** |

Raw bytes are exact. Gzip bytes are **estimates** allocated proportionally
within each chunk; they sum to one byte less than the actual total because of
rounding. The 2,186 bytes of chunk padding are not allocated to a system.

### 10.4 Chunk composition

The chunks are system-mixed, which is why a lite view cannot avoid most of them
without repacking:

| Chunk | Parts | Raw MiB | Gzip MiB | Systems represented |
| ---: | ---: | ---: | ---: | --- |
| 0 | 123 | 3.83 | 2.15 | skeletal, sensory, nervous, connective, muscular |
| 1 | 135 | 4.32 | 2.19 | muscular, connective, skeletal |
| 2 | 7 | 4.23 | 2.21 | muscular |
| 3 | 94 | 3.85 | 1.98 | muscular, connective, sensory |
| 4 | 77 | 3.83 | 1.98 | muscular, skeletal |
| 5 | 226 | 3.84 | 2.08 | muscular, connective, arterial, cardiac, nervous |
| 6 | 99 | 3.85 | 2.27 | nervous, cardiac, sensory, endocrine |
| 7 | 163 | 3.82 | 2.28 | nervous, arterial, venous, digestive |
| 8 | 230 | 3.84 | 2.27 | venous, arterial, cardiac, muscular, skeletal, respiratory |
| 9 | 293 | 3.83 | 2.15 | respiratory, muscular, connective, skeletal, lymphatic, arterial, digestive, venous |
| 10 | 64 | 3.86 | 2.15 | connective, muscular, respiratory, digestive, skeletal, integumentary, sensory |
| 11 | 295 | 3.85 | 2.21 | integumentary, digestive, venous, arterial, endocrine, muscular, reproductive, urinary, lymphatic, skeletal |
| 12 | 128 | 3.81 | 2.16 | skeletal, respiratory, sensory |
| 13 | 168 | 3.82 | 2.06 | skeletal, respiratory, sensory, digestive, arterial, venous |
| 14 | 132 | 2.19 | 1.28 | venous, arterial |

Chunk 11 alone contains 10 systems and 295 parts. Skin plus skeleton still needs
chunks 0, 1, 4, 8, 9, 10, 11, 12, and 13.

### 10.5 Lite-view estimates

All rows assume the current data layout. "Chunk-level" is what the current loader
would download for those systems, including all other systems mixed into the same
chunks. "Payload-only" is the exact raw bytes of the desired parts plus an
**estimated** gzip share; it would require repacking chunks by system or adding a
per-system chunk index and lazy loader.

| View | Parts | Chunks needed | Chunk raw MiB | Chunk gzip MiB | Payload raw MiB | Payload gzip est. MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Skin + skeleton | 301 | 9 | 35.00 | 19.34 | 9.35 | 5.20 |
| Skin + skeleton + core four (cardiac, respiratory, digestive, urinary) | 546 | 12 | 46.51 | 25.96 | 15.05 | 8.42 |
| Skin + skeleton + six organ systems (cardiac, respiratory, digestive, urinary, endocrine, reproductive) | 562 | 12 | 46.51 | 25.96 | 15.29 | 8.56 |
| Default visible (all systems except body surface) | 2,229 | 15 | 56.79 | 31.43 | 55.24 | 30.56 |
| All systems | 2,234 | 15 | 56.79 | 31.43 | 56.79 | 31.43 |

Key point: a "lite" initial view is **not** a configuration flag. The loader
always fetches all 15 chunks, and the chunks are mixed. Even skin + skeleton
needs 9 chunks and 19.34 MiB gzip at the chunk level. A true lite mode needs
either repacked system-specific chunks or a new chunk index plus lazy loading.

## 11. Integration options

Effort scale: **S** = up to about one week for one engineer; **M** = about two to
four weeks with design/QA; **L** = six or more weeks with multiple engineers.
Effort excludes legal, content, translation, and security review.

| Option | What it delivers | Effort | Main upside | Main downside |
| --- | --- | --- | --- | --- |
| A. Vendor the static sub-app at `/atlas` | Full 2,234-part viewer quickly | M | Fastest path; no renderer rewrite; static hosting | Same-origin trust, 31.6 MiB load, no deep links/i18n, duplicate design, licence gate |
| B. Port loader/renderer into our R3F lab | Integrated first-party viewer | L | Shared design/auth/i18n/deep links; no duplicate UI | Large rendering effort; maintenance; still needs data/licence/performance work |
| C. Keep ours only | No new viewer; optional outbound link | S | Zero new attack surface, payload, or licence burden | Does not deliver browse-everything |

### 11.1 Option A: vendor the viewer as a static sub-app at `/atlas`

**Approach:** build the upstream viewer at a pinned commit in an isolated job,
patch its asset paths for `/atlas`, and copy the static output under
`apps/web/public/atlas/` (or serve it from object storage at the same origin
path). Keep it as a separate build artifact; do not merge its dependencies into
`apps/web`.

**Steps:**

1. Pin upstream commit `1c38bf35c254a891200d3cedecfd57abebe83d8d` and record its
   SHA-256 in our provenance notes.
2. Build in an isolated CI job with Node 22.13 or newer, `npm ci`, and
   `npm run build`. Do not run this install in the `apps/web` workspace; its
   React/three versions differ from ours.
3. Patch the build for `/atlas`:
   - Set Vite `base: '/atlas/'`.
   - Change the manifest fetch and manifest chunk URLs to `/atlas/models/...`.
   - Change the favicon path.
   - Optionally use relative paths if the app is served only from one directory.
4. Copy `dist/` and the upstream MIT `LICENSE` (the required notice) into
   `apps/web/public/atlas/`. Write our own BodyParts3D attribution and
   adaptation statement plus a generated `THIRD_PARTY_NOTICES`; do not copy
   upstream site copy. Keep both notices reachable from the UI.
5. Add a Next rewrite so `/atlas` serves `public/atlas/index.html`, and verify
   that `/atlas/models/*` is served with the correct MIME type. Next public files
   are served from the origin root; an app route at `/atlas` would shadow the
   static index, so prefer the rewrite or put the static app under a
   non-conflicting path such as `/atlas/viewer/` and use `/atlas` as a thin
   wrapper.
6. Add headers for `/atlas/:path*`:
   - `Content-Security-Policy` with `default-src 'self'`, `script-src 'self'`,
     `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`,
     `connect-src 'self'`, `font-src 'self'`, `object-src 'none'`,
     `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`
     (use `frame-ancestors 'self'` only if a same-origin iframe wrapper is
     chosen).
   - `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
     `Permissions-Policy` disabling camera/microphone/geolocation.
   - Cache-Control: immutable for hashed JS/CSS; versioned or hashed paths for
     models; do not cache `index.html` aggressively.
7. Decide entitlement. Static files under `public/` are public. If `/atlas` is a
   subscriber benefit, a Next middleware check on the HTML does not protect the
   model files; use an authenticated proxy/API or accept public assets.
8. Add an in-app link and attribution. Extend
   `apps/web/src/app/attribution/anatomy/page.tsx` or add an `/atlas/credits`
   page. Add the upstream MIT notice to `THIRD_PARTY_NOTICES.md`.
9. Add a Playwright smoke test: `/atlas` loads, the manifest and all chunks are
   same-origin, no external requests, a known part can be selected, mobile
   viewport layout works, and CSP violations fail the test.
10. Run a time-boxed pilot behind a feature flag or preview host. Measure
    time-to-first-render, time-to-selection, memory, and mobile behavior before
    exposing it to users.

**Files to change:**

- `apps/web/public/atlas/**` (new: built assets, models, upstream MIT
  `LICENSE`, our attribution text, notices)
- `apps/web/next.config.ts` (rewrite and headers)
- `apps/web/src/middleware.ts` (optional entitlement gate; file does not exist
  today)
- `apps/web/src/app/attribution/anatomy/page.tsx` (attribution link/content)
- `apps/web/src/components/layout/sidebar.tsx` and/or the Anatomy Lab page
  (navigation link)
- `THIRD_PARTY_NOTICES.md` (upstream MIT notice and data adaptation entry)
- `apps/web/e2e/atlas.spec.ts` (new smoke test)
- `docs/anatomy/atlas-feasibility.md` (this study)

**Packages to install:** none in `apps/web` if we vendor a prebuilt `dist/`.
Build-time only, in an isolated workspace or CI job: the upstream dependency set
in section 5.1 (including React 19.2.6, three 0.159.0, Vite 8.0.13, and
TypeScript 5.9.3). Do not add these to the web app's dependency tree.

**Effort:** M for a prebuilt vendor plus path fixes, headers, attribution, and
smoke tests. L if we build from source in our CI and maintain patches.

**Risks:**

- Same-origin code has our origin's privileges: it can call `/api/v1/*` with the
  user's cookies, even though the auth cookies are HttpOnly. A compromised or
  malicious bundle could perform authenticated actions.
- A 31.6 MiB gzip first load is heavy for a "fast" track, especially on mobile.
  All chunks load before selection is enabled.
- No deep links, no i18n, English-only UI, and a different design system.
- Static assets cannot be entitlement-gated without a proxy; if the atlas is
  subscriber-only, this option does not protect it.
- The BodyParts3D licence ambiguity must be resolved before redistributing the
  adapted binaries.
- Upstream maintenance and security updates become our responsibility once
  vendored.
- A naive build likely includes many unused UI dependencies, increasing bundle
  and supply-chain size.
- The viewer is not fully accessible (no keyboard navigation of 3D parts, no
  screen-reader structure list).

**Security notes:**

- Treat the bundle as first-party code. Build from the pinned commit in an
  isolated, reproducible job; keep the lockfile; generate an SBOM; review the
  built bundle for unexpected network calls; hash the artifact.
- Do not auto-update. Require a reviewed version bump.
- The 706-package dependency graph and four install scripts are supply-chain
  surface. `npm ci` in a trusted builder, `npm audit`, and a licence scan are
  minimum controls.
- Enforce CSP `connect-src 'self'` and `script-src 'self'`; do not add
  `unsafe-eval`. React inline styles likely require `style-src 'unsafe-inline'`;
  test whether the app needs it.
- Serve from a separate origin if the owner will allow it. A same-origin iframe
  is not a security boundary; a sandboxed cross-origin iframe is stronger but
  changes the same-origin requirement.
- Keep auth cookies HttpOnly/Secure/SameSite as they are; do not expose tokens to
  JavaScript. Add CSRF protection for state-changing API routes independent of
  this viewer.
- No telemetry was found. If we add analytics, disclose it and keep
  `connect-src` allow-listed.

### 11.2 Option B: port the loader and renderer into our R3F lab

**Approach:** keep our Next.js shell, design system, auth, routing, and i18n, and
implement the atlas data format and rendering inside our existing React Three
Fiber app. This can reuse the MIT-licensed loader ideas with attribution, or be
a clean-room implementation from the format description. The latter avoids
copying code but still needs the same data and rendering work.

**Steps:**

1. Freeze the data contract: manifest fields, chunk layout, offsets, counts, and
   expected byte lengths. Write a parser that validates every offset/count,
   checks indices against `vertexCount`, rejects non-finite positions, and
   verifies the chunk byte length.
2. Add the model assets under `apps/web/public/models/atlas/` (manifest plus 15
   chunks and gzip variants) or host them in object storage. Decide whether to
   commit ~31.4 MiB gzip / ~56.8 MiB raw to Git; for most teams, object storage
   with a content hash is preferable.
3. Implement `atlas-format.ts` (types and parsing) and `use-atlas-chunks.ts`
   (progressive fetch, three concurrent loads, abort, retry, cache, gzip
   detection, `DecompressionStream` fallback).
4. Implement the R3F scene:
   - `Canvas` with `frameloop="demand"` and invalidate-on-change.
   - One merged mesh per system/chunk, with per-part `partIndex` attributes.
   - Per-part state in a `DataTexture` (offset + visibility) and a selection
     texture, with a custom material or shader injection.
   - Picking with per-part geometries or a BVH; bounding-box prefilter; skin
     exclusion; tap-vs-drag handling.
   - Explosion shelf-packing, camera fitting, isolate framing, markers, and
     stage visibility.
5. Build the UI in our design system: system toggles, presets, search, detail
   panel, isolate, explode slider, reset, mobile bottom dock, and loading/error
   states. Do not port the upstream component library; use our Radix/shadcn
   primitives.
6. Add deep links and i18n from the start if the owner requires them:
   `/atlas?concept=FMA...` or `/atlas/[conceptId]`, with manifest validation and
   a not-found state; locale dictionaries and translated anatomy text.
7. Add attribution: extend `/attribution/anatomy`, add the upstream MIT notice
   if any code is ported, and keep the BodyParts3D credit/adaptation statement.
8. Add tests: parser unit tests, manifest contract tests, interaction tests,
   visual/perf budgets, mobile viewport e2e, no-external-request checks, and a
   WebGL fallback test.
9. Set performance budgets and measure on target devices before calling it done.

**Files to change (new unless noted):**

- `apps/web/src/app/(app)/atlas/page.tsx`
- `apps/web/src/app/(app)/atlas/[conceptId]/page.tsx` (optional deep link)
- `apps/web/src/components/anatomy/atlas/atlas-viewer.tsx`
- `apps/web/src/components/anatomy/atlas/atlas-scene.tsx`
- `apps/web/src/components/anatomy/atlas/atlas-controls.tsx`
- `apps/web/src/components/anatomy/atlas/atlas-detail-panel.tsx`
- `apps/web/src/lib/anatomy/atlas-format.ts`
- `apps/web/src/lib/anatomy/atlas-layout.ts`
- `apps/web/src/lib/anatomy/atlas-picking.ts`
- `apps/web/src/hooks/use-atlas-chunks.ts`
- `apps/web/src/types/anatomy.ts` (extend)
- `apps/web/public/models/atlas/**` (new assets)
- `apps/web/next.config.ts` (cache/headers if needed)
- `apps/web/src/app/attribution/anatomy/page.tsx` (extend)
- `apps/web/scripts/validate-atlas.mjs` (new)
- `THIRD_PARTY_NOTICES.md` (extend)
- `apps/web/e2e/atlas.spec.ts` (new)

**Packages to install:** none required beyond our existing `three` 0.186.1,
`@react-three/fiber` 9.8.2, `@react-three/drei` 10.7.9, and React 19.2.4. No
runtime meshoptimizer is needed; meshoptimizer is build-time only if we rebuild
the data. If picking performance requires it, evaluate `three-mesh-bvh` as a new
pinned dependency. Do not add the upstream Base UI/shadcn stack; use our
existing UI primitives.

**Effort:** L. This is a new rendering subsystem with picking, layout, state
textures, loading, mobile behavior, tests, and accessibility work.

**Risks:**

- Large implementation and maintenance burden; the upstream viewer is already a
  mature implementation.
- three 0.159 → 0.186 migration issues: shader injection, `mergeGeometries`,
  color management, and material behavior can change.
- Picking correctness and performance with 2,234 parts; exploded-mode target
  projection is expensive.
- Memory and mobile performance remain risks even with our shell.
- Data licence and payload questions remain; porting does not solve them.
- Deep links and i18n add product/content work, especially medical translation
  review.
- Accessibility of 3D content still needs a deliberate design (keyboard
  navigation, structure list, reduced motion).

**Security notes:**

- First-party code review is easier, and no new runtime packages are needed if
  we use existing three/R3F. That lowers supply-chain risk compared with A.
- Validate all binary input (offsets, counts, index bounds, byte lengths) before
  creating typed arrays; cap allocation sizes; handle malformed/truncated chunks
  with a clear error and no partial GPU state.
- Keep the app's existing CSP and auth model. Deep-link IDs must be validated
  against the manifest; React escapes names, so avoid `dangerouslySetInnerHTML`.
- Model assets are still public static files; entitlement gating has the same
  limitation as A unless served through an authenticated proxy.
- No telemetry unless explicitly added and reviewed.

### 11.3 Option C: keep ours only

**Approach:** do not embed or port Human Atlas. Continue the system-by-system
Anatomy Lab and, if useful, add a clearly labelled outbound link to the live
atlas or the upstream repository.

**Steps:**

1. Add an external link from the Anatomy Lab page or sidebar with
   `target="_blank"` and `rel="noopener noreferrer"`.
2. Add a short notice that the link leaves Lor Mentor and opens a third-party
   site with its own privacy practices.
3. Keep our attribution page and `THIRD_PARTY_NOTICES.md` unchanged except for the
   optional link.
4. Revisit the decision if browse-everything becomes a validated requirement or
   if the licence/security questions are resolved.

**Files to change:**

- `apps/web/src/app/(app)/anatomy/page.tsx` (link)
- `apps/web/src/components/layout/sidebar.tsx` (optional nav link)
- `apps/web/src/app/attribution/anatomy/page.tsx` (optional credit/link)
- No new assets or packages.

**Packages to install:** none.

**Effort:** S.

**Risks:**

- Does not deliver the browse-everything track.
- Users leave our origin and may not return; the external site may change or go
  away.
- No integration with our auth, design, search, or teaching content.
- The external site's privacy/telemetry practices are outside our control; the
  link is user-initiated, so our exposure is limited.

**Security notes:**

- Use `rel="noopener noreferrer"` to prevent tab-nabbing and referrer leakage.
- Do not embed the third-party site in an iframe; that would create a
  same-origin or cross-origin framing surface and complicate CSP.
- No new runtime dependencies, no new model data, and no new same-origin code.

## 12. Recommendation

**Recommended: Option A as a time-boxed, gated pilot. Do not launch it
same-origin until the gates below pass. If the gates cannot be met, choose
Option C now and revisit later. Choose Option B only if browse-everything becomes
a core, long-lived feature and the pilot proves demand.**

Why A first:

- It is the only option that delivers the full 2,234-part browse-everything
  experience with moderate engineering effort.
- The viewer is MIT-licensed, builds as a static SPA, and has no external runtime
  requests or telemetry in the source.
- The data format and rendering approach are understandable; a later port to
  R3F is feasible if the feature becomes core.

Why not commit to A unconditionally:

- The same-origin trust boundary is real. A vendored bundle runs with our
  origin's cookies and API access.
- The first load is about 31.6 MiB gzip, all chunks load before selection, and
  mobile performance is untested on physical devices.
- There are no deep links, no i18n, and no shared design system.
- The BodyParts3D licence ambiguity is unresolved in our own notices.

### 12.1 Gates for the A pilot

1. **Licence gate.** DBCLS or legal confirms whether CC BY 4.0 or the legacy
   CC BY-SA 2.1 Japan applies, and approves redistribution of the adapted
   binaries and the attribution text. If CC BY-SA 2.1 Japan applies, decide
   whether ShareAlike is acceptable for the model assets.
2. **Security gate.** Build from the pinned commit in an isolated, reproducible
   job; generate an SBOM; review the bundle; enforce CSP; document the same-origin
   threat model; ideally serve from a separate origin. If same-origin is
   mandatory, confirm that the atlas is not a subscriber-only asset and that the
   API's CSRF/authorization model tolerates a first-party bundle with full origin
   access.
3. **Performance gate.** Set a budget for initial gzip bytes, time-to-first-
   render, time-to-selection, and memory. Test on representative low-end and
   mid-range phones, not only desktop Chrome. If 31.6 MiB gzip and the current
   all-chunks-before-selection behavior exceed the budget, require a lite/lazy
   mode before launch.
4. **Product gate.** Confirm that English-only UI, no deep links, and the
   upstream visual design are acceptable for the pilot, or budget the work to fix
   them. Confirm the success metric and kill criteria.

### 12.2 If the pilot succeeds

- If browse-everything is a keeper, move to **Option B** for the long term:
  integrate the data format and renderer into our R3F lab, add deep links/i18n,
  and keep the data attribution. Do not maintain a permanently vendored
  third-party UI.
- If the pilot shows low usage or the performance/licence/security cost is too
  high, stop at **Option C** and keep the outbound link.

## 13. Questions for the owner

### Product and scope

1. Is browse-everything a launch requirement or an experiment? What user problem
   does it solve, and what metric decides success?
2. Is same-origin `/atlas` non-negotiable, or would a separate origin/subdomain
   be acceptable for a stronger security boundary?
3. Are shareable deep links required at launch? Which identifier should be
   canonical: part ID, FMA concept ID, or a human-readable slug?
4. Is English-only acceptable for the pilot? If not, which languages, and who
   will translate and medically review anatomy names and descriptions?
5. Must `/atlas` be subscription-gated? If yes, how should static model assets be
   protected, given that `public/` files are publicly fetchable?
6. Should the viewer feel like part of Lor Mentor (shared nav, design system,
   auth) or stand alone as a linked micro-site?
7. May we use the "Human Atlas" name/logo, or should the integration be
   rebranded? (Assume rebrand unless permission is documented.)
8. What accessibility bar applies: keyboard navigation of 3D parts, screen-reader
   structure lists, reduced motion, contrast, captions?

### Legal and content

9. Can legal/DBCLS confirm the BodyParts3D licence (CC BY 4.0 vs legacy CC BY-SA
   2.1 Japan) and approve redistribution of the adapted binaries? Our existing
   `THIRD_PARTY_NOTICES.md` says this is still being clarified.
10. Where should attribution live: in-viewer footer, `/attribution/anatomy`,
    `THIRD_PARTY_NOTICES.md`, or all three? Who approves the exact wording?
11. Do we need our own medically reviewed descriptions, or is system-level
    context enough? (This study assumes we write our own text and do not copy
    upstream copy.)
12. Are there branding/trademark constraints on the name, favicon, or visual
    identity?

### Performance and operations

13. What are the acceptable first-load size, time-to-first-render,
    time-to-selection, and memory budgets? Is ~31.6 MiB gzip acceptable on
    cellular?
14. Which devices, browsers, and minimum RAM/GPU must be supported? Is WebGL
    context loss acceptable, and what should the fallback be?
15. Who owns the vendored code, dependency updates, security patches, and
    licence notices? What is the update cadence and review process?
16. Do we need analytics, error reporting, or telemetry around `/atlas`? If yes,
    what privacy disclosure and consent are required?
17. What is the rollout plan: feature flag, preview host, pilot cohort, success
    metrics, and kill criteria?

## 14. What was not run

- No `npm install`, `npm ci`, `npm run build`, `npm run dev`, `npm run check`,
  or upstream validation script was run. The validation scripts need the model
  chunks, which were deliberately not downloaded.
- No browser run, network capture, Lighthouse/profile, memory measurement, or
  physical-device test was performed. Memory figures in this document are
  estimates.
- No dependency audit, SBOM generation, licence scan, bundle review, or security
  review was performed.
- No legal review was performed. The licence discussion is a summary of the
  upstream files and our existing notices, not legal advice.
- No model `.bin` or `.bin.gz` file was checked out or decoded; the discarded
  first clone's pack was removed. No model file was committed.
- No `.env` file was read.
- No app, API, database, seed, or build configuration was changed.
- No merge, rebase, reset, or push was performed.
- No Human Atlas code or site copy was copied into this repository.

## Appendix A: Key measurements and commands

Branch and baseline:

```powershell
git branch --show-current
git status --short
git log -1 --oneline
```

Result: `integration/anatomy-hardening`; baseline tip `8f799f4`; only the
pre-existing untracked `docs/audit/*` files were present.

Clone size and contents:

```powershell
git -C C:\Users\berek\Desktop\human-atlas-ref count-objects -vH
Get-ChildItem C:\Users\berek\Desktop\human-atlas-ref\public\models
```

Result: 99 objects, 2 packs, 401.21 KiB pack; only `atlas.json` in the checked-out
`public/models` directory.

Manifest aggregates:

```powershell
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('C:/Users/berek/Desktop/human-atlas-ref/public/models/atlas.json','utf8'));console.log(a.parts.length,a.concepts.length,a.chunks.length,a.triangles)"
```

Result: 2,234 parts, 3,432 concepts, 15 chunks, 2,288,268 triangles.

The per-system and lite-view tables were computed from the manifest with Node
using the formulas in section 2.3. No chunk file was read.
