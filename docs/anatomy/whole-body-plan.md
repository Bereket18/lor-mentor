# Whole-body Anatomy Lab plan

**Status: documentation only. This plan does not authorize building, migrating,
seeding, switching a live model, changing the viewer, or applying licence
wording.**

- Date: 2026-10-25
- Branch: `feature/anatomy-atlas`
- Scope: all body systems named in the official BodyParts3D 4.0 tables, delivered
  one system per release
- Heart pilot: [`provenance/phase-1-source-mapping.md`](./provenance/phase-1-source-mapping.md)
  and [`provenance/phase-2-build-and-proposals.md`](./provenance/phase-2-build-and-proposals.md)
- Provenance record: [`provenance/README.md`](./provenance/README.md)
- Official source directory (outside the repository):
  `C:\Users\berek\Desktop\bp3d-source`
- Candidate heart asset (not live): `apps/web/public/models/anatomy/heart.v2.glb`

## 1. Purpose, scope, and authority

### 1.1 What this plan covers

This document sets out a staged, whole-body plan for the Anatomy Lab. It:

- identifies the ten systems named in the official BodyParts3D 4.0 compound-organ
  table;
- reports measured source-file and triangle counts for each system, including
  overlaps;
- states how much teaching text exists in the repository today;
- lists candidate openly licensed text sources with the licence verified from
  each source's own page;
- ranks the build order, with the heart pilot first;
- proposes a one-owner-per-file release model so shared geometry is not
  duplicated;
- defines a release template, release gates, and cross-system risks.

### 1.2 What this plan does not authorize

This plan does **not** authorize:

- building any model other than the already-built `heart.v2.glb` candidate;
- adding a migration, changing the Prisma schema, running a seed, or writing to
  any database;
- switching `manifest.json`, `HEART_SYSTEM.modelUrl`, or the live `heart.v1.glb`;
- changing the viewer, the API, the UI, or any tests;
- applying the proposed licence wording to the credits page, manifest, or GLB;
- copying, adapting, or commissioning medical text;
- installing packages, running `prune`, or touching production;
- committing raw OBJ or ZIP data.

The Phase 2 proposals remain proposals until separately approved.

### 1.3 Definitions used in this plan

- **Official system**: one of the ten system concepts named in the official
  compound-organ membership table. These are listed in §3.2.
- **Release**: one system, or one explicitly labelled module of one system. A
  release never bundles two systems to fill a size target.
- **Shared file**: an element file listed under more than one official system.
  Shared files are real in the source data; they are not errors.
- **Text-only structure**: a structure with teaching text but no independent
  mesh. It must show **“No 3D model”**; no schematic substitute is allowed.
- **Partial module**: a release that intentionally covers only part of an
  official system. It must be named and labelled as partial in the UI and in the
  provenance record.
- **Ownership**: the release that renders a shared file. Ownership prevents the
  same geometry being shipped twice under two system names.

### 1.4 Guardrails

- Never invent anatomical facts. Every future teaching statement must be
  source-backed and reviewed.
- Do not copy text from BodyParts3D documentation or any other source.
- Keep `isReviewed` false until a named faculty reviewer signs the content.
- Do not describe a partial module as a complete system.
- Do not state that CC BY 4.0 is the only applicable BodyParts3D licence.
- Do not claim a build, test, browser check, or device check that was not run.
- Use LF line endings and keep source archives outside the repository.

## 2. Data basis and method

### 2.1 Official sources used

| File | What it provides | Use in this plan |
| --- | --- | --- |
| `partof_parts_list_e.txt` | FMA concept, representation ID, English name | Names and concept lookup |
| `partof_element_parts.txt` | FMA concept, English name, element file ID | **System membership and measured file counts** |
| `partof_inclusion_relation_list.txt` | Parent/child spatial inclusion edges | Explains why the spatial tree is not a system taxonomy |
| `README_e.html` | Dataset description and licence statement | Licence evidence |
| BodyParts3D licence page | Current licence statement | Licence evidence |
| OBJ header comments | Per-file licence and concept metadata | Per-file provenance and licence evidence |

The official download page is
<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>. The archive
sizes, hashes, retrieval dates, and licence snapshot are recorded in
[`provenance/phase-1-source-mapping.md`](./provenance/phase-1-source-mapping.md).
The full PART-OF archive contains 1,258 OBJ files and 3,138,996 triangles; the
IS-A archive contains 2,234 OBJ files.

### 2.2 Why the compound-organ table is the grouping source

The PART-OF inclusion table is a spatial single-parent tree, not a system
taxonomy. For example, the whole heart (`FMA7088`) sits under `body proper` and
the mediastinum in the spatial tree, while many heart parts are also members of
the cardiovascular system (`FMA7161`). Grouping by the spatial tree would
therefore produce regional buckets such as “body proper”, “head”, and “right
upper limb”, not body systems.

The `partof_element_parts.txt` table is the official compound-organ membership
table. A row such as `FMA7161 cardiovascular system FJ2424` states that the
element file is a member of that system. This plan uses those rows directly.

This is a membership source, not a claim that every official system is complete
or internally consistent. One heart-v2 file, `FJ2678` (middle cardiac vein,
770 triangles), is outside the `FMA7161` membership set even though it is part
of the heart model. That is recorded rather than hidden.

### 2.3 Measurement method

For each official system concept:

1. Collect every unique element file ID in `partof_element_parts.txt` for that
   system.
2. Count the triangular `f` records in each OBJ file. BodyParts3D 4.0 uses
   triangular faces; one `f` record is one triangle.
3. Sum the unique files and triangles for the system.
4. Compute pairwise overlaps with the other nine named systems.
5. Compute “exclusive” counts as files that appear in no other named system.
6. Compare the sum of system totals with the union of all ten systems.

No decimation, merging, or LOD is applied to these source measurements. They are
source triangles, not shipped GLB triangles.

### 2.4 System totals are not additive

| Measure | Files | Triangles |
| --- | ---: | ---: |
| Sum of the ten named system totals | 1,274 | 2,747,676 |
| Unique union of the ten systems | **1,033** | **2,475,808** |
| Files in exactly one named system | 792 | — |
| Files in exactly two named systems | 241 | — |
| Files in more than two named systems | 0 | — |
| PART-OF files outside the ten named systems | 225 | 663,188 |
| Full PART-OF archive | 1,258 | 3,138,996 |

The 241 shared files account for the 241-file difference between the sum and
the union. The pairwise overlaps are:

| Pair | Shared files | Shared triangles |
| --- | ---: | ---: |
| Alimentary / cardiovascular | 60 | 191,622 |
| Alimentary / musculoskeletal | 1 | 5,576 |
| Alimentary / endocrine | 4 | 16,962 |
| Respiratory / cardiovascular | 176 | 57,708 |

Do not add system totals to produce a whole-body budget. A shared file must be
owned by one release and cross-linked from the other system.

The 225 files outside the named systems are mostly regional or system-like
branches such as body proper, head, limbs, and vasculature of body. They are not
release units in this plan; see §3.4.

### 2.5 What is measured and what is estimated

| Status | Items |
| --- | --- |
| **Measured** | Official per-system file and triangle counts; pairwise overlaps; exclusive counts; full PART-OF total; heart-v2 bytes, triangles, draw calls, gzip/Brotli sizes, and SHA-256; current and recovered heart teaching-text word/character counts; archive hashes |
| **Estimated** | GLB byte sizes for systems not yet built, using the heart-v2 ratio of 19.53 bytes per triangle; sub-split counts for large systems; mobile performance; text-writing effort |
| **Unknown until built or tested** | Actual GLB size and hash for every future release; draw calls; compression ratios; first-render time; interaction smoothness on a physical device; faculty review time |

The 19.53 bytes-per-triangle figure comes from `heart.v2.glb`:
2,003,180 bytes ÷ 102,568 triangles. It is a planning estimate only. Every
future release must replace the estimate with measured bytes and a recorded
SHA-256 before approval.

## 3. Coverage map

### 3.1 Heart pilot (release 1)

The heart is the pilot release, not one of the ten official systems.

| Measure | Heart v2 candidate |
| --- | ---: |
| Unique source files | 52 (42 PART-OF + 10 IS-A) |
| Triangles | 102,568 |
| Selectable mesh nodes | 17 |
| Text-only structures | 9 |
| Total structures | 26 |
| Raw GLB bytes | 2,003,180 |
| Raw MiB | 1.91 |
| Draw calls | 17 |
| gzip bytes | 1,657,033 |
| Brotli bytes | 1,410,664 |
| SHA-256 | `f3ead239ce9a9cb08a1832d98e633dde19e883d21178d69461f47fdcfc649a61` |
| Official-system overlap | 51 files / 101,798 triangles in `FMA7161`; `FJ2678` (770 triangles) outside |

The 17 mesh nodes are in the GLB. The nine text-only rows are recorded in the
candidate manifest's `textOnly` array and the 26-row API fixture, not as GLB
nodes. Heart v2 is below the current 5 MB and 150,000-triangle limits. It has
not been tested on a physical mobile device. The live release remains v1 until
approval.

### 3.2 Ten official systems

“Exclusive” means the file is not listed under any of the other nine named
systems. Heart overlap is reported separately because the heart is not an
official system.

| Official system (FMA) | Files | Triangles | Exclusive files | Exclusive triangles | Shared with (files / triangles) | Teaching text in repo today |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Alimentary (`FMA7152`) | 147 | 395,980 | 82 | 181,820 | Cardiovascular 60 / 191,622; musculoskeletal 1 / 5,576; endocrine 4 / 16,962 | None |
| Nervous (`FMA7157`) | 60 | 322,990 | 60 | 322,990 | None | None |
| Respiratory (`FMA7158`) | 284 | 196,872 | 108 | 139,164 | Cardiovascular 176 / 57,708 | None |
| Urinary (`FMA7159`) | 6 | 9,944 | 6 | 9,944 | None | None |
| Genital (`FMA7160`) | 1 | 442 | 1 | 442 | None | None |
| Cardiovascular (`FMA7161`) | 627 | 846,918 | 391 | 597,588 | Respiratory 176 / 57,708; alimentary 60 / 191,622; heart v2 51 / 101,798 | None |
| Musculoskeletal (`FMA7482`) | 138 | 710,464 | 137 | 704,888 | Alimentary 1 / 5,576 | None |
| Endocrine (`FMA9668`) | 7 | 24,416 | 3 | 7,454 | Alimentary 4 / 16,962 | None |
| Integumentary (`FMA72979`) | 1 | 203,382 | 1 | 203,382 | None | None |
| Deep fascial (`FMA79063`) | 3 | 36,268 | 3 | 36,268 | None | None |
| **Sum of systems** | **1,274** | **2,747,676** | **792** | — | **241 shared files** | **None** |
| **Unique union** | **1,033** | **2,475,808** | — | — | — | — |

The cardiovascular “exclusive” figure includes the 51 heart-v2 files that are
also in `FMA7161`. After the heart release, 340 cardiovascular files /
495,790 triangles remain exclusive to the cardiovascular system.

### 3.3 Coverage gaps in the official tables

These gaps are properties of the official tables, not of the viewer or the
seed:

- **No named lymphatic or immune system.** The PART-OF parts list has no lymph,
  lymph-node, spleen, or tonsil concepts. The IS-A tree has a spleen and thymus,
  but neither has system membership. A complete lymphatic/immune module cannot
  be built from this dataset alone; the thymus alone is not a system.
- **No named sensory system.** Eye and ear concepts exist in the parts lists, but
  there is no sensory-system concept or membership set. Eyes and other sense
  organs are not a release unit under this plan.
- **Genital system is prostate only; female reproductive anatomy is absent.**
  `FMA7160` has one file, `FJ3139` (`FMA9600`, prostate). The IS-A tree adds
  testis, epididymis, seminal vesicle, and penis concepts, but they have no
  Genital system membership. Neither tree contains uterus, ovary, uterine tube,
  cervix, vagina, or placenta.
- **Endocrine system is partial.** The seven files are pituitary gland, pancreas,
  pancreatic duct, parenchyma of pancreas, pancreatic duct tree, and the left and
  right adrenal glands. There is no thyroid or parathyroid gland in the endocrine
  membership set; a pineal body concept exists elsewhere in the parts list but is
  not a member of this system.
- **Deep fascial system is three files.** The files are the right and left
  iliotibial tracts and the flexor retinaculum of the right wrist. This is not a
  whole-body fascia system.
- **Integumentary system is skin only.** `FMA72979` has one file, `FJ2810`
  (`FMA7163`, skin). There are no nail, sweat-gland, or sebaceous-gland meshes in
  the set. A hair concept exists in BodyParts3D (`FJ2815`), but it has no
  integumentary system membership.

#### 3.3.1 Candidate mesh sources for the gaps

These are candidate sources only. This plan does not select, license, or copy
any model or text from them. Each licence was checked on 2026-10-25 from the
source's own page. A candidate must pass the same provenance, faculty-review,
and licence gates as the heart before it can ship.

| Gap | Candidate source | What it can fill | Exact licence wording | Licence page |
| --- | --- | --- | --- | --- |
| Female reproductive | HRA 3D Reference Object Library | Uterus, left/right ovary, left/right fallopian tube, vagina, placenta, and left/right mammary gland. **No cervix.** | “All HRA 3D reference objects are released under Attribution 4.0 International (CC BY 4.0).” | <https://humanatlas.io/3d-reference-library> |
| Lymphatic/immune | HRA 3D Reference Object Library | Lymph node, spleen, thymus, and left/right palatine tonsil. **No lymphatic vessel network.** | Same HRA wording as above. | Same as above. |
| Lymphatic/immune | BodyParts3D IS-A tree | Spleen and thymus only; no lymph nodes, tonsils, or vessels. | “The license for this database is specified in the Creative Commons Attribution 4.0 International.” Current licence page; OBJ headers state CC BY-SA 2.1 Japan. | <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html> |
| Sensory | HRA 3D Reference Object Library | Left/right eye. | Same HRA wording as above. | Same as above. |
| Sensory | BodyParts3D IS-A tree | Eye and ear concepts; no cochlea or labyrinth concept. | Same BodyParts3D wording and caveat as above. | Same as above. |
| Sensory (inner ear) | NIH 3D entry `3DPX-011385` | Schematic cochlea, vestibule, and semicircular canals; printable, with no viewer-ready `.glb`. | “Licensing: CC-BY” with a link to CC BY 4.0. | <https://3d.nih.gov/entries/3DPX-011385> |
| Endocrine | BodyParts3D IS-A tree | Thyroid-related concepts and pineal body; no parathyroid. | Same BodyParts3D wording and caveat as above. | Same as above. |
| Endocrine | BodyParts3D PART-OF tree | Thymus; no thyroid gland or parathyroid. | Same BodyParts3D wording and caveat as above. | Same as above. |
| Integumentary | HRA 3D Reference Object Library | Skin. | Same HRA wording as above. | Same as above. |
| Integumentary | BodyParts3D | Skin and a hair concept (`FJ2815`); no nails, sweat glands, or sebaceous glands. | Same BodyParts3D wording and caveat as above. | Same as above. |

Z-Anatomy is **not** a clean candidate for these gaps. Its `License.txt` says,
“All the code and content shared by ‘Z-Anatomy’ is under Creative Commons
Attribution-ShareAlike 4.0 International License,” but the same file lists
included third-party models under CC BY-NC-SA 4.0 and CC BY-NC 4.0. Treat the
aggregate as non-commercial until each included model is cleared.

**Remaining gaps with no verified open mesh source:** female cervix; a full
lymphatic vessel network; a high-fidelity cochlea or labyrinth; parathyroid
glands; nails; sweat and sebaceous glands; and hair follicles beyond the
BodyParts3D hair concept. Keep these gaps visible in the release cards. Do not
fill them by implication or by substituting a neighbouring organ.

### 3.4 Non-system branches

These branches are present in the official tables but are not release units in
this plan:

| Branch (FMA) | Files | Triangles | Why it is not a release unit |
| --- | ---: | ---: | --- |
| Vasculature of body (`FMA228642`) | 605 | 638,726 | System-like, but not named “system”; overlaps cardiovascular |
| Body proper (`FMA231424`) | 590 | 1,201,446 | Regional branch, not a system |
| Head (`FMA7154`) | 143 | 767,302 | Regional branch, not a system |
| Skeletal system (`FMA23881`) | 138 | 710,464 | Subsystem of musculoskeletal; same files, do not double count |
| Integument (`FMA74657`) | 1 | 203,382 | Duplicate of the integumentary system file |

The limb branches (right/left upper limb and right/left lower limb) are also
regional. They are useful as source regions for a future musculoskeletal split,
but they are not separate systems and must not be presented as complete systems.

### 3.5 Teaching text in the repository today

Only the heart has seeded teaching text.

| System | Current repository text | Recovered or additional text | Review status |
| --- | --- | --- | --- |
| Heart | 14 rows; 70 teaching fields (`summary`, `location`, `function`, `bloodSupply`, `clinicalNotes`); 977 words; 6,102 characters | The 26-row recovered heart text has 130 fields, 1,568 words, and 9,907 characters. It is not seeded in the live 14-row seed. | All seeded rows are `isReviewed = false`; no faculty sign-off recorded |
| Alimentary | None | None | — |
| Nervous | None | None | — |
| Respiratory | None | None | — |
| Urinary | None | None | — |
| Genital | None | None | — |
| Cardiovascular | None | None | — |
| Musculoskeletal | None | None | — |
| Endocrine | None | None | — |
| Integumentary | None | None | — |
| Deep fascial | None | None | — |

Word counts use whitespace-separated tokens and are a planning measure, not a
linguistic analysis. No teaching text is copied, rewritten, or created by this
plan.

## 4. Candidate openly licensed text sources

### 4.1 Verified sources

Each licence below was checked on 2026-10-25 from the source's own preface or
licence page. Page-level licences can differ from a bookshelf-level statement;
check the exact page before use. Where a page contradicts itself, that is
recorded rather than resolved by assumption.

| ID | Source and edition | Exact licence | Licence page | Commercial-use note | Cautions |
| --- | --- | --- | --- | --- | --- |
| OS1 | OpenStax, *Anatomy and Physiology* 1e | **Contradictory on the current page:** CC BY 4.0 near the top; CC BY-NC-SA 4.0 in the reuse section and site footer | <https://openstax.org/books/anatomy-and-physiology/pages/preface> | **Do not rely on CC BY 4.0; written confirmation required** | Page is internally inconsistent; treat as unresolved |
| OS2 | OpenStax, *Anatomy and Physiology 2e* | **CC BY-NC-SA 4.0** | <https://openstax.org/books/anatomy-and-physiology-2e/pages/preface> | **Not allowed for commercial use without permission** | Do not use in a commercial release |
| LT1 | LibreTexts, *Human Anatomy* (OERI) | **CC BY 4.0** | <https://med.libretexts.org/Bookshelves/Anatomy_and_Physiology/Human_Anatomy_(OERI)> | Allowed with attribution | Verify page-level licence |
| LT2 | LibreTexts, Anatomy and Physiology bookshelf | **CC BY-NC-SA 4.0** | <https://med.libretexts.org/Bookshelves/Anatomy_and_Physiology> | **Not allowed for commercial use without permission** | Bookshelf-level statement; page-level licences can vary |
| GRAY | Gray's *Anatomy of the Human Body* (1918), Wikisource | **Public domain in the US** for the 1918 work; **Wikisource transcription CC BY-SA 4.0** | <https://en.wikisource.org/wiki/Anatomy_of_the_Human_Body> | Public-domain text is usable in the US; transcription/adaptation needs share-alike review | 1918 text is historically outdated; not suitable for modern clinical content |
| WB | Wikibooks, *Human Anatomy* | **CC BY-SA 4.0** | <https://en.wikibooks.org/wiki/Human_Anatomy> | Allowed with attribution and share-alike compliance | Quality varies; adaptations may need share-alike review |

Among the sources in this table, LT1 is the only one verified as unambiguously
CC BY 4.0 on its own page. The OS1 page is internally contradictory: its
book-specific statement says CC BY 4.0, while its reuse section and site footer
say CC BY-NC-SA 4.0. Treat OS1 as unresolved and do not rely on commercial reuse
without written confirmation from OpenStax. OS2 and LT2 are non-commercial and
must not be mixed into a commercial release without written permission. GRAY is
public domain but old; WB is share-alike and variable in quality.

#### 4.1.1 OpenStax page wording checked 2026-10-25

The OpenStax A&P 1e preface contains all of the following statements on the same
page:

- “Anatomy and Physiology is licensed under a Creative Commons Attribution 4.0
  International (CC BY) license …”
- “This book uses the Creative Commons Attribution License, which means that you
  can reuse and modify the material only for noncommercial purposes …”
- “OpenStax-copyrighted images, activities, assessments, and similar components
  of this book are subject to the same licensing – CC-BY-NC-SA.”
- “Except where otherwise noted, textbooks on this site are licensed under a
  Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY NC-SA)
  license.”
- “© Jan 27, 2022 OpenStax. Textbook content produced by OpenStax is licensed
  under a Creative Commons Attribution License.”

The page therefore remains internally inconsistent. Do not treat OS1 as CC BY
4.0 without written confirmation from OpenStax. A&P 2e is consistent: its
preface says it “is licensed under a Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA) license.”

#### 4.1.2 LibreTexts pages carrying a non-CC-BY licence

Checked 2026-10-25 from each book's cover-page metadata and footer. The Anatomy
and Physiology bookshelf itself is CC BY-NC-SA 4.0. The following book pages
carry a non-CC-BY licence:

| Book page | Licence |
| --- | --- |
| Human Anatomy and Physiology Preparatory Course (Liachovitzky) | CC BY-NC-SA (version not stated) |
| Anatomy and Physiology (Boundless) | CC BY-SA 4.0 |
| Acid-base Physiology (Brandis) | CC BY-NC-SA 2.0 |
| Fluid Physiology (Brandis) | CC BY-NC-SA 2.0 |
| A Mixed Course Based Research Approach to Human Physiology (Whitmer) | CC BY-SA 4.0 |
| Atlas of Otolaryngology, Head and Neck Operative Surgery | CC BY-NC 3.0 |
| Human Anatomy Laboratory Manual | CC BY-NC-SA 4.0 |
| Anatomical Illustrations (Most, Tran, Seweryn, and Graham) | CC BY-NC-SA 3.0 |
| General Human Anatomy (Lange et al.) | CC BY-NC-SA 4.0 |

The other six book pages carry CC BY 4.0: A&P 1e (OpenStax), A&P 2e (OpenStax),
Human Anatomy Lab Manual (Wilk-Blaszczak), Human Anatomy (OERI), Atlas of
Comparative Vertebrate Anatomy, and Human Anatomy Lab Manual (Stamm and
Hills-Meyer). Page-level metadata can differ from the bookshelf statement;
re-check the exact page before use. The A&P 2e re-host is a special case: its
LibreTexts page says CC BY 4.0, but its OpenStax source is CC BY-NC-SA 4.0. Do
not rely on a re-host to change the source licence.

### 4.2 Candidate sources by system

This matrix lists candidate sources only. It does not mean the text has been
read, copied, adapted, or approved.

| System | Preferred verified candidate | Other candidates | Unresolved or non-commercial only | Mapping note |
| --- | --- | --- | --- | --- |
| Heart | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Cardiovascular chapters; heart v2 text already exists but is unreviewed |
| Urinary | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Urinary chapters; six source files |
| Genital | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Reproductive chapters; mesh is prostate only |
| Endocrine | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Endocrine chapters; mesh is pituitary/adrenals only |
| Deep fascial | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | No dedicated system chapter; use connective-tissue/fascia sections |
| Respiratory | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Respiratory chapters; pulmonary vessels cross-link to cardiovascular |
| Nervous | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Nervous-system chapters |
| Alimentary | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Digestive chapters; include liver and pancreas |
| Musculoskeletal | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Skeletal and muscular chapters |
| Cardiovascular | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Cardiovascular chapters; heart and vessel modules |
| Integumentary | LT1 | GRAY, WB | OS1 (unresolved), OS2, LT2 | Integumentary chapters; mesh is skin only |

### 4.3 Text-use rules

- Check the exact page-level licence before using any text. A bookshelf-level
  licence is not a substitute for a page-level check.
- Prefer LT1, the only source verified as unambiguously CC BY 4.0. Treat OS1 as
  unresolved until OpenStax confirms the applicable licence in writing. Do not
  use OS2 or LT2 text in a commercial release without written permission.
- CC BY-SA text may impose share-alike obligations on adaptations. Obtain a
  licence review before adapting it.
- Attribute the author, edition, chapter or page, licence, URL, and access date.
  Keep the record in the release's provenance file.
- Use a properly licensed adaptation or a faculty-authored summary. Do not copy
  text, and do not closely paraphrase a source without attribution.
- Do not use Gray's 1918 for clinical guidance. It is useful for historical or
  structural cross-checking only.
- Do not use BodyParts3D documentation as teaching text.
- No new text is authorized by this plan. Every future teaching field must be
  source-backed and reviewed by a named faculty reviewer before `isReviewed`
  becomes true.

## 5. Ranked build order

### 5.1 Ranking principles

The order prioritizes a defensible learner release, not simply the smallest
files. It considers:

1. whether the system can be shipped without misleading the learner;
2. measured source size and whether it fits the 5 MB / 150,000-triangle limits;
3. shared-file complexity;
4. learner value;
5. whether the heart pilot has already proven the pipeline.

Incomplete systems are deliberately later. They are not unimportant; they
cannot be shipped as complete systems without additional mesh sources or an
explicit partial-module label.

### 5.2 Ranked release order

Sizes marked “~” are estimates at 19.53 bytes per triangle and are not measured
GLB sizes. Sub-split counts for large systems are unmeasured; they must be
measured before a sub-release is scheduled.

| Rank | Release | Official system | Measured source | Proposed release scope | Size estimate | Why this position |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Heart v2 | Pilot; not an official system | 52 files / 102,568 triangles | 17 mesh + 9 text-only; v2 candidate | **1.91 MiB measured** | Already built and validated; proves the pipeline; licence and seed gates remain |
| 2 | Urinary | `FMA7159` | 6 / 9,944 | Full six-file official set; mapping must confirm the organs | ~0.19 MiB | Smallest full official system set; all files exclusive; no overlap; fits both limits |
| 3 | Respiratory | `FMA7158` | 108 / 139,164 in proposed scope; official 284 / 196,872 | 108 non-shared respiratory files (airways, lungs, diaphragm, and a few lingular vessels); pulmonary vessels owned by cardiovascular | ~2.59 MiB | High learner value; exclusive respiratory set fits; requires an ownership decision for 176 pulmonary-vessel files |
| 4 | Nervous | `FMA7157` | 60 / 322,990 | Split into central and peripheral modules | ~6.02 MiB full; split unknown | All files exclusive and high value, but the full system is over the triangle limit |
| 5 | Alimentary | `FMA7152` | 146 / 390,404 in proposed scope; official 147 / 395,980 | Split into upper, lower, and accessory modules; mandible to musculoskeletal | ~7.27 MiB full; split unknown | High learner value; shared hepatic vessels and pancreas make mapping harder; over the triangle limit |
| 6 | Musculoskeletal | `FMA7482` | 138 / 710,464 | Split by region: skull, spine, girdles, upper limb, lower limb | ~13.23 MiB full; split unknown | Largest single-system source; high value; 137 exclusive files; needs regional staging |
| 7 | Cardiovascular vessels | `FMA7161` | 516 / 553,498 in proposed scope; official 627 / 846,918 | Split into arterial, venous, and pulmonary modules; heart and hepatic files owned elsewhere | ~10.31 MiB full; split unknown | Completes the heart context, but large and dependent on heart v2; shared pulmonary files |
| 8 | Endocrine | `FMA9668` | 3 / 7,454 in proposed scope; official 7 / 24,416 | Pituitary and adrenal glands; pancreas owned by alimentary | ~0.14 MiB | Small and fits, but partial; cannot be called a complete endocrine system |
| 9 | Deep fascial | `FMA79063` | 3 / 36,268 | Selected deep fascia: iliotibial tracts and one wrist retinaculum | ~0.68 MiB | Fits, but only three files; low coverage and low priority |
| 10 | Genital | `FMA7160` | 1 / 442 | Prostate only, or defer until more meshes are licensed | ~0.01 MiB | Cannot be a complete genital-system release; needs a product decision and possibly a new source |
| 11 | Integumentary | `FMA72979` | 1 / 203,382 | Skin only; decimate or LOD to the triangle limit | ~3.79 MiB | Single mesh is over 150,000 triangles; decimation or LOD is required; low priority |

If the goal is pipeline validation rather than a learner release, the small
partial systems (endocrine, deep fascial, genital, integumentary) can be built
as internal prototypes earlier. They are not release-ready as complete systems.

### 5.3 Proposed one-owner-per-file release model

This model assigns every shared file to one release. It prevents duplicate
geometry and makes the release totals additive. It is a product decision, not a
claim that the official membership table is wrong.

| Release | Files | Triangles | Composition | Official system total |
| --- | ---: | ---: | --- | ---: |
| Heart v2 | 52 | 102,568 | 51 cardiovascular files + `FJ2678` outside the set | — |
| Urinary | 6 | 9,944 | All six urinary files | 6 / 9,944 |
| Respiratory | 108 | 139,164 | 108 non-shared respiratory files (airways, lungs, diaphragm, and a few lingular vessels); 176 pulmonary-vessel files owned by cardiovascular | 284 / 196,872 |
| Nervous | 60 | 322,990 | All nervous-system files | 60 / 322,990 |
| Alimentary | 146 | 390,404 | All 147 alimentary files except the mandible; includes 60 hepatic and 4 pancreatic files | 147 / 395,980 |
| Musculoskeletal | 138 | 710,464 | All 138 files, including the mandible | 138 / 710,464 |
| Cardiovascular vessels | 516 | 553,498 | 340 exclusive cardiovascular files + 176 pulmonary-vessel files; excludes 51 heart files and 60 hepatic files | 627 / 846,918 |
| Endocrine | 3 | 7,454 | Pituitary and left/right adrenal glands; pancreas owned by alimentary | 7 / 24,416 |
| Deep fascial | 3 | 36,268 | All three deep-fascial files | 3 / 36,268 |
| Genital | 1 | 442 | Prostate only | 1 / 442 |
| Integumentary | 1 | 203,382 | Skin only | 1 / 203,382 |
| **Total** | **1,034** | **2,476,578** | Every file owned exactly once | — |

The total equals the 1,033-file union of the ten systems plus `FJ2678` (770
triangles) from the heart release. No file is assigned to two releases in this
model. The official system table still records the shared memberships; the
release model only decides where a shared mesh is rendered.

### 5.4 Split-release rules

- A large system may be split into multiple releases, but every release stays
  within one system. Do not combine two systems in one release.
- Split by an official subtree or a defensible regional grouping, not by an
  arbitrary triangle count.
- Measure each sub-split before promising a size. The sub-split counts in this
  plan are estimates only.
- Each sub-release needs its own mapping review, size budget, UI check, licence
  note, and shipping gate.
- Prefer splitting over decimation. If a single mesh cannot be split (for
  example, the skin mesh), decimation or LOD is allowed only with a recorded
  ratio and an anatomy review.
- Shared files are rendered once and cross-linked from the other system. Do not
  duplicate them in two GLBs.

## 6. Staged release plan

### 6.1 Release template

Every release follows the same five stages. No stage may be skipped.

| Stage | Work | Output | Approval needed |
| --- | --- | --- | --- |
| A. Mapping proposal | Identify official system, member files, FMA concepts, archive, hashes, shared files, text-only rows, and release scope | `<system>-mapping.md` and machine-readable source map | Anatomy and product review |
| B. Text and licence proposal | Choose source pages, verify licences, record attribution and licence note, and plan source-backed text for faculty review | Text provenance record and licence note | Faculty and licence review |
| C. Candidate build | Build a versioned candidate; do not switch the live asset | `<system>.v1.glb`, manifest, build log | Build review |
| D. Validation and UI review | Run validator, contract test, browser check, mobile check; verify text-only and partial labels | Validation record and screenshots | QA and product review |
| E. Release approval | Review all gates, record hashes, switch the live manifest/model only after approval | Release record and rollback plan | Product, faculty, licence owner |

The existing heart pipeline is the template for stages A–D: Phase 1 mapping,
Phase 2 build and proposals, validator, contract test, provenance README, and
candidate manifest. Future systems must reuse that pattern rather than invent a
new one.

### 6.2 Release 1 — Heart v2

- **Mapping review.** 26 structures: 17 mesh and 9 text-only. 52 source files
  (42 PART-OF + 10 IS-A). Phase 1 mapping is approved; Phase 2 build and
  proposals are complete. The live release is still v1.
- **Measured size budget.** 2,003,180 bytes, 1.91 MiB, 102,568 triangles, 17
  draw calls. gzip 1,657,033 bytes; Brotli 1,410,664 bytes. Under the 5 MB and
  150,000-triangle limits. Physical-device testing has not been done.
- **UI check.** No viewer or UI changes were made in Phase 2. Before release, the
  nine text-only rows must show **“No 3D model”**. Search, keyboard tree,
  selection, and mobile layout must be checked.
- **Licence note.** The exact Phase 2 §3 wording is proposed, not applied. Both
  licence statements must remain visible; the DBCLS question is pending;
  commercial release is blocked. Do not describe CC BY 4.0 as the only licence.
- **Minimum safe shipping gate.** Phase 2 approvals; validator and contract test
  pass; nullable-`meshName` migration and 26-row seed approved and applied;
  text-only UI verified; physical-device check recorded; v2 switch approved
  separately. Keep v1 for rollback.

### 6.3 Release 2 — Urinary

- **Mapping review.** Six files / 9,944 triangles: left and right kidney, left
  and right ureter, urinary bladder, and urethra. All six are exclusive. Confirm
  the six selectable structures and check for any text-only rows before build.
- **Size budget (measured source; estimated GLB).** 9,944 source triangles;
  estimated ~0.19 MiB. Fits both limits. Actual bytes and hash must be measured
  after build.
- **UI check.** Release covers the full six-file official set; mapping must
  confirm the organs and check for text-only rows. If anything is missing, use a
  partial label. Verify search, keyboard tree, selection, reset, and mobile
  layout.
- **Licence note.** Standard BodyParts3D credit and dual-licence caveat from
  Phase 2 §3, plus attribution for the chosen text source. Prefer LT1; treat OS1
  as unresolved until OpenStax confirms its licence in writing.
- **Minimum safe shipping gate.** Common gate §7.1 plus mapping approval, build
  validation, contract test, faculty-reviewed text, mobile check, and a recorded
  licence note.

### 6.4 Release 3 — Respiratory

- **Mapping review.** Official system: 284 files / 196,872 triangles. Proposed
  release: 108 non-shared respiratory files / 139,164 triangles. Those files
  include the airways, lungs, diaphragm, and a few lingular vessels. The 176
  pulmonary-vessel files / 57,708 triangles are owned by the cardiovascular
  release. If the full system is required in one release, split it into two
  releases of the same system.
- **Size budget (measured source; estimated GLB).** 139,164 source triangles;
  estimated ~2.59 MiB. Fits the triangle limit; the full 196,872-triangle system
  does not.
- **UI check.** If pulmonary vessels are owned by cardiovascular, label the
  release “Respiratory module” and cross-link the vessel module. State that the
  module includes the diaphragm and excludes the pulmonary vessels. Do not imply
  the respiratory system is complete. Check text-only rows, search, keyboard,
  and mobile.
- **Licence note.** Standard BodyParts3D note plus respiratory text-source
  attribution. Record the cross-link in the manifest or provenance README.
- **Minimum safe shipping gate.** Ownership decision for the 176 shared files;
  mapping approval; build validation; contract test; faculty-reviewed text;
  mobile check; licence note.

### 6.5 Release 4 — Nervous

- **Mapping review.** 60 files / 322,990 triangles; all exclusive. Split into
  central and peripheral modules, or another defensible official-subtree split.
  Sub-split counts are unmeasured estimates.
- **Size budget (measured source; estimated GLB).** Full system ~6.02 MiB, over
  the triangle limit. Each sub-release must be measured and kept at or below
  150,000 triangles and 5 MB.
- **UI check.** Region navigation must remain clear across sub-releases. Check
  text-only rows, search, keyboard, selection, reset, and mobile layout.
- **Licence note.** Standard BodyParts3D note plus nervous-system text-source
  attribution. Prefer LT1; treat OS1 as unresolved until OpenStax confirms its
  licence in writing.
- **Minimum safe shipping gate.** Approved split; each sub-release passes the
  common gate; contract test covers the split; faculty-reviewed text; mobile
  check; licence note.

### 6.6 Release 5 — Alimentary

- **Mapping review.** Official system: 147 files / 395,980 triangles. Proposed
  ownership: 146 files / 390,404 triangles, with the mandible owned by
  musculoskeletal. The release includes 60 hepatic/biliary files / 191,622
  triangles and four pancreatic files / 16,962 triangles. Split into upper,
  lower, and accessory modules; sub-split counts are unmeasured estimates.
- **Size budget (measured source; estimated GLB).** Full proposed scope
  ~7.27 MiB, over the triangle limit. Each sub-release must be measured and kept
  within both limits.
- **UI check.** Label the mandible cross-link to musculoskeletal. If the release
  is split, label each module and show which parts are not in that module. Check
  text-only rows, search, keyboard, and mobile.
- **Licence note.** Standard BodyParts3D note plus alimentary text-source
  attribution. Record the hepatic and pancreatic ownership decisions.
- **Minimum safe shipping gate.** Approved split and ownership; each sub-release
  passes the common gate; contract test covers the modules; faculty-reviewed
  text; mobile check; licence note.

### 6.7 Release 6 — Musculoskeletal

- **Mapping review.** 138 files / 710,464 triangles; includes the mandible and
  137 exclusive files. Split by region: skull, spine, girdles, upper limb, and
  lower limb. Sub-split counts are unmeasured estimates.
- **Size budget (measured source; estimated GLB).** Full system ~13.23 MiB,
  over the triangle limit. Each regional sub-release must be measured and kept
  within both limits.
- **UI check.** Region navigation, layer toggles, text-only rows, search,
  keyboard, selection, reset, and mobile layout. Do not present one region as
  the whole musculoskeletal system.
- **Licence note.** Standard BodyParts3D note plus musculoskeletal text-source
  attribution. Record the mandible ownership.
- **Minimum safe shipping gate.** Approved regional split; each sub-release
  passes the common gate; contract test covers the regions; faculty-reviewed
  text; mobile check; licence note.

### 6.8 Release 7 — Cardiovascular vessels

- **Mapping review.** Official system: 627 files / 846,918 triangles. Heart v2
  owns 51 files / 101,798 triangles. Alimentary owns 60 hepatic/biliary files /
  191,622 triangles. Proposed vessel release: 516 files / 553,498 triangles
  (340 exclusive cardiovascular files + 176 pulmonary-vessel files). Split into
  arterial, venous, and pulmonary modules; sub-split counts are unmeasured
  estimates.
- **Size budget (measured source; estimated GLB).** Proposed scope ~10.31 MiB,
  over the triangle limit. Each sub-release must be measured and kept within
  both limits.
- **UI check.** Cross-link the heart and liver modules; do not duplicate their
  meshes. Check text-only rows, search, keyboard, and mobile.
- **Licence note.** Standard BodyParts3D note plus cardiovascular text-source
  attribution. Record the heart and hepatic ownership decisions.
- **Minimum safe shipping gate.** Heart v2 approved; ownership decisions
  approved; each sub-release passes the common gate; contract test covers the
  modules; faculty-reviewed text; mobile check; licence note.

### 6.9 Release 8 — Endocrine

- **Mapping review.** Official system: 7 files / 24,416 triangles. Proposed
  release: three files / 7,454 triangles for the pituitary and left/right
  adrenal glands. The four pancreatic files / 16,962 triangles are owned by
  alimentary. The endocrine set has no thyroid, parathyroid, or pineal gland.
  This is a partial module.
- **Size budget (measured source; estimated GLB).** 7,454 source triangles;
  estimated ~0.14 MiB. Fits both limits.
- **UI check.** Label “Selected endocrine organs” or equivalent; do not call it a
  complete endocrine system. Cross-link the pancreas to alimentary. Check
  text-only rows, search, keyboard, and mobile.
- **Licence note.** Standard BodyParts3D note plus endocrine text-source
  attribution. State the partial coverage in the credits/provenance record.
- **Minimum safe shipping gate.** Partial-module policy approved; mapping
  approved; build validation; contract test; faculty-reviewed text; mobile
  check; licence note.

### 6.10 Release 9 — Deep fascial

- **Mapping review.** Three files / 36,268 triangles: right and left iliotibial
  tracts and the flexor retinaculum of the right wrist. This is a partial module,
  not a whole-body fascia system.
- **Size budget (measured source; estimated GLB).** 36,268 source triangles;
  estimated ~0.68 MiB. Fits both limits.
- **UI check.** Label the release as selected deep fascia and cross-link the
  musculoskeletal release. Do not imply complete fascial coverage. Check
  text-only rows, search, keyboard, and mobile.
- **Licence note.** Standard BodyParts3D note plus text-source attribution.
  State the three-file coverage.
- **Minimum safe shipping gate.** Partial-module policy approved; mapping
  approved; build validation; contract test; faculty-reviewed text; mobile
  check; licence note.

### 6.11 Release 10 — Genital

- **Mapping review.** One file / 442 triangles: the prostate (`FJ3139`,
  `FMA9600`). There is no uterus, ovary, testis, or other reproductive organ in
  the official system set. The release cannot be a complete genital system.
- **Size budget (measured source; estimated GLB).** 442 source triangles;
  estimated ~0.01 MiB. Fits both limits.
- **UI check.** If shipped, label it “Prostate” or “Selected genital anatomy”,
  not “Genital system.” Show the coverage gap explicitly. Do not imply missing
  organs are a rendering failure. Check text-only rows, search, keyboard, and
  mobile.
- **Licence note.** Standard BodyParts3D note plus text-source attribution. If a
  new mesh source is added for other reproductive organs, record its licence and
  provenance separately.
- **Minimum safe shipping gate.** Product decision to defer or ship a
  prostate-only module; partial-module policy approved; mapping approved; build
  validation; contract test; faculty-reviewed text; mobile check; licence note.

### 6.12 Release 11 — Integumentary

- **Mapping review.** One file / 203,382 triangles: skin (`FJ2810`,
  `FMA7163`). There are no hair, nail, or skin-gland meshes. The single mesh is
  over the 150,000-triangle limit.
- **Size budget (measured source; estimated GLB).** 203,382 source triangles;
  estimated ~3.79 MiB. The raw size is under 5 MB, but the triangle count is over
  the limit. Decimate or use an LOD; record the ratio and validate the result.
- **UI check.** Label it “Skin” or “Selected integumentary anatomy,” not a
  complete integumentary system. Do not imply hair, nails, or glands are
  present. Check text-only rows, search, keyboard, and mobile.
- **Licence note.** Standard BodyParts3D note plus text-source attribution.
  Record the decimation or LOD as an adaptation.
- **Minimum safe shipping gate.** Partial-module policy approved; decimation/LOD
  approved and validated; build validation; contract test; faculty-reviewed
  text; mobile check; licence note.

## 7. Minimum safe shipping criteria

### 7.1 Common gate

A release ships only when all of these are true:

| ID | Criterion | Evidence |
| --- | --- | --- |
| M1 | **Mapping review** | Official system, member files, FMA concepts, archive labels, hashes, shared-file ownership, text-only rows, and release scope are recorded and reviewed |
| G1 | **Geometry** | Unique node names; no empty or non-finite geometry; valid normals and indices; no missing meshes; raw GLB ≤ 5 MB; ≤ 150,000 triangles; draw calls recorded |
| C1 | **Contract** | Manifest, GLB nodes, seed rows, and text-only rows agree; the live release stays unchanged until the switch is approved |
| T1 | **Teaching text** | Every field is source-backed and licence-recorded; a named faculty reviewer has signed; `isReviewed` is false until then; no invented facts |
| L1 | **Licence** | Exact BodyParts3D credit; dataset version; adaptations; both licence statements; DBCLS question pending; text-source attribution; commercial status recorded |
| U1 | **UI** | Text-only rows show **“No 3D model”**; partial modules show a coverage label; search, keyboard, selection, reset, loading, and error states work on desktop and mobile |
| Q1 | **QA** | Validator, contract test, project checks for the changed area, browser check, and physical-device/Slow-3G check are run and recorded |
| R1 | **Rollback** | Previous asset and manifest are retained; the switch is reversible; no prune is used; database changes have a backup |
| A1 | **Approval** | Product, anatomy faculty, and licence owner have recorded approval; no production write happens without it |

A release that fails any gate does not ship. Passing the validator alone is not
enough.

### 7.2 Partial-module gate

If a release covers only part of an official system:

- Name it by the organ or module, not by the complete system, unless the UI
  clearly says “partial.”
- Show a coverage note that lists what is present and what is missing.
- Do not use a “complete system” badge, count, or description.
- Cross-link modules owned by another release.
- Defer the release if the missing organs are core to the learner's task and no
  licensed mesh source exists.

### 7.3 Text-only gate

- A text-only structure must show **“No 3D model”**.
- No schematic, placeholder, or borrowed mesh may be substituted.
- Teaching text, search, keyboard navigation, and related links must still work.
- Selecting a text-only row must not jump the camera to an empty origin or show a
  blank canvas without an explanation.

### 7.4 Large-system split gate

- Split by an official subtree or a defensible regional grouping.
- Keep each sub-release within one system.
- Measure each sub-split; do not rely on the full-system estimate.
- Keep each sub-release within 5 MB and 150,000 triangles.
- Give each sub-release its own mapping, text, licence, UI, and QA record.
- Prefer splitting over decimation. If decimation is unavoidable, record the
  ratio and validate the anatomy.

### 7.5 What is not sufficient

- A passing validator without a mapping review.
- A visually plausible model without per-file provenance.
- Text from a non-commercial source in a commercial product.
- A partial module presented as a complete system.
- A mobile layout that was not tested on a physical device.
- `isReviewed = true` without a named faculty sign-off.
- “The licence page says CC BY 4.0” without the OBJ-header and DBCLS caveat.

## 8. Cross-system risks

| Risk | Applies to | Mitigation | Decision needed |
| --- | --- | --- | --- |
| **Licence wording** | Every release | Keep the exact credit, both licence statements, the DBCLS-pending note, and the commercial block; use Phase 2 §3 wording | DBCLS clarification; licence-owner sign-off |
| **Non-commercial text** | Every release that uses OS2/LT2 | Prefer LT1; treat OS1 as unresolved; do not mix NC text into a commercial release without permission | Commercial status; OS1 written confirmation; permission if needed |
| **Mobile size and performance** | Every release | Hard caps 5 MB / 150,000 triangles; gzip/Brotli; measure bytes, draw calls, first render, and interaction on a mid-range Android and Slow 3G | Device-test plan; performance budget |
| **Expert review** | Every release | Named faculty reviewer; source-backed text; `isReviewed` false until sign-off; keep the review record | Reviewer assignment; review capacity |
| **Mislabelled groups** | Every release, especially partial modules | Use official system names; label partial modules; cross-link shared organs; no “complete” claim without coverage | Partial-module policy; UI wording |
| **Shared files and duplicate geometry** | Cardiovascular, respiratory, alimentary, musculoskeletal, endocrine | One-owner-per-file model; cross-links; manifest records ownership | Approve the proposed ownership model |
| **Source gaps** | Lymphatic/immune, sensory, genital, endocrine, deep fascia, integumentary | Do not fake missing organs; defer or obtain a separately licensed mesh source | Whether to source additional meshes |
| **Text quality and age** | Gray's 1918, Wikibooks, older OpenStax edition | Prefer current text with a verified licence; use Gray's only for historical/structural checks; faculty review | Source selection; review standard |
| **Decimation and anatomical fidelity** | Integumentary, any split that cannot fit | Prefer splitting; record decimation ratio; validate landmarks; do not silently simplify | Decimation/LOD approval |
| **Reproducibility** | Every release | Record archive hashes, per-file hashes, source map, build command, and output hash; keep source archives outside the repo | Source-map storage; rebuild policy |
| **Schema and seed changes** | Every release with text-only rows or new structures | Reuse the Phase 2 nullable-`meshName` proposal and safe update path; no production writes without approval | Migration/seed approval per release |
| **UI and accessibility** | Every release | Text-only treatment; partial labels; keyboard/search; mobile; loading/error states; no UI changes without a separate approval | UI scope per release |

## 9. Open decisions and approval requested

This plan is documentation only. Please decide:

1. **Approve this plan as documentation only.** It does not authorize any build,
   migration, seed, UI change, or licence change.
2. **Commercial status.** Is the product commercial? This determines whether
   OS2/LT2 (non-commercial) text can be considered at all, and whether OS1 needs
   written clarification before use.
3. **Partial-module policy.** Is a labelled prostate-only, skin-only, or
   selected-endocrine release acceptable, or must those systems wait for
   additional licensed meshes?
4. **Shared-file ownership.** Approve or correct the one-owner-per-file model in
   §5.3, especially:
   - pulmonary vessels to cardiovascular;
   - hepatic/biliary files and pancreas to alimentary;
   - mandible to musculoskeletal;
   - heart v2 retaining its 52 files.
5. **Release order.** Approve or reorder the ranking in §5.2.
6. **Text-source strategy.** Prefer LT1, the only source verified as
   unambiguously CC BY 4.0; resolve OS1 in writing before relying on it; decide
   whether GRAY/WB are acceptable secondary sources; confirm the page-level
   licence review process.
7. **Faculty reviewer.** Name the reviewer and the record format for
   `isReviewed`.
8. **DBCLS clarification.** Keep the commercial block until written
   clarification is recorded.
9. **Additional mesh sources.** Decide whether to seek separately licensed
   meshes for the lymphatic/immune, sensory, reproductive, thyroid/parathyroid,
   and skin-appendage gaps.
10. **Phase 2 approvals.** The heart v2 build, licence wording, nullable
    `meshName` migration, 26-row seed, and live switch remain separate Phase 2
    decisions. Nothing in this plan changes their status.

The next safe step after approval is a mapping-only proposal for Release 2
(urinary). No model build should start before that mapping is reviewed.

## 10. Sources and verification

### 10.1 Official BodyParts3D sources

- Download page:
  <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>
- Dataset home:
  <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>
- Licence page:
  <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>
- PART-OF archive:
  <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip>
- IS-A archive:
  <https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip>

Archive sizes, SHA-256 values, retrieval dates, and the licence snapshot are in
[`provenance/phase-1-source-mapping.md`](./provenance/phase-1-source-mapping.md).
The exact credit line is:

```text
BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
```

The official line has no trailing period. Keep the copyright sign U+00A9. Do not
state that CC BY 4.0 is the only applicable licence; the OBJ headers state
CC BY-SA 2.1 Japan and the DBCLS question is pending.

### 10.2 Text-source pages verified

- OpenStax A&P 1e:
  <https://openstax.org/books/anatomy-and-physiology/pages/preface>
- OpenStax A&P 2e:
  <https://openstax.org/books/anatomy-and-physiology-2e/pages/preface>
- LibreTexts Human Anatomy (OERI):
  <https://med.libretexts.org/Bookshelves/Anatomy_and_Physiology/Human_Anatomy_(OERI)>
- LibreTexts Anatomy and Physiology bookshelf:
  <https://med.libretexts.org/Bookshelves/Anatomy_and_Physiology>
- Gray's Anatomy of the Human Body (1918), Wikisource:
  <https://en.wikisource.org/wiki/Anatomy_of_the_Human_Body>
- Wikibooks Human Anatomy:
  <https://en.wikibooks.org/wiki/Human_Anatomy>

Licence statements were checked on 2026-10-25 from each source's own page. The
OS1 page remains unresolved because it contains both “Anatomy and Physiology is
licensed under a Creative Commons Attribution 4.0 International (CC BY)
license” and “Except where otherwise noted, textbooks on this site are licensed
under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY NC-SA)
license.” It is not treated as verified CC BY 4.0. The LibreTexts non-CC-BY
pages are listed in §4.1.2. No text was copied or adapted for this plan.

### 10.3 Measurement reproducibility

The per-system counts can be reproduced from the extracted PART-OF archive and
the official tables:

1. Read `partof_element_parts.txt`.
2. For each official system concept, collect unique element file IDs.
3. Count triangular `f` records in each corresponding OBJ file.
4. Deduplicate files and sum triangles.
5. Compute pairwise overlaps and exclusive counts.

The measurement uses the source OBJ files, not the built GLBs. No decimation or
LOD is applied. The heart-v2 figures are measured from the built candidate and
its manifest.

### 10.4 Mesh-source pages verified

- HRA 3D Reference Object Library:
  <https://humanatlas.io/3d-reference-library> — “All HRA 3D reference objects
  are released under Attribution 4.0 International (CC BY 4.0).” Checked
  2026-10-25.
- NIH 3D entry `3DPX-011385`:
  <https://3d.nih.gov/entries/3DPX-011385> — “Licensing: CC-BY”, linked to
  <https://creativecommons.org/licenses/by/4.0/>. Checked 2026-10-25. The entry
  is a printable schematic and has no viewer-ready `.glb`.
- Z-Anatomy `License.txt`:
  <https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/master/License.txt>
  — “All the code and content shared by ‘Z-Anatomy’ is under Creative Commons
  Attribution-ShareAlike 4.0 International License.” Checked 2026-10-25. The
  same file lists included third-party models under CC BY-NC-SA 4.0 and CC BY-NC
  4.0, so the aggregate is not a clean commercial candidate.
- BodyParts3D licence page and OBJ headers: see §10.1.

No model or text was copied from these sources for this plan.

**End of plan. No build, migration, seed, UI change, or licence change is
authorized by this document.**
