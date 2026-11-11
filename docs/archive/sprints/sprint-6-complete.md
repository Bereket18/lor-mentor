# Sprint 6 — AI Pipeline
## Lor Mentor · Lorcan Medical College
### Status: ✅ COMPLETE (backend) — frontend display next

---

## What This Sprint Delivers

```
Teacher uploads a PDF (Sprint 4 feature, unchanged)
     ↓
Upload responds instantly — no waiting on AI
     ↓
A background job silently runs:
   1. Extract text from the PDF
   2. Send it to Gemini with a structured prompt
   3. Gemini returns summary + key topics + flashcards + quiz questions
   4. Save everything atomically to the database
   5. Notify whoever uploaded it
     ↓
Verified end-to-end with a real PDF:
   28,001 characters extracted → AiContent marked COMPLETED →
   10 real quiz questions saved to the database
```

This is the feature that has been sitting as empty database tables
(`AiContent`, `FlashcardSet`, `QuizBank`, `Question`) since Sprint 0.
This sprint is the first time anything actually writes to them.

---

## Why a Background Job, Not a Direct Call

If Gemini were called inside the upload request itself, the teacher's
browser would sit waiting 10-30 seconds before the upload "finishes" —
and a Gemini timeout would fail the whole upload, even though the file
itself saved fine. Decoupling them means the upload responds instantly,
AI processing happens independently, and a failure can retry without
anyone re-uploading anything.

---

## The Debugging Journey — Worth Documenting Honestly

This sprint took several real, non-obvious bugs to get working. Each
one is worth understanding because the same category of issue will
come up again with other npm packages.

### Bug 1 — Wrong `.env` file entirely

We have **two** `.env` files in this monorepo: one at the project
root, one in `apps/api`. `dotenv` (and NestJS's `ConfigModule`) load
`.env` from the **current working directory** of whatever process is
running — which is `apps/api` when you run `npm run start:dev` from
inside that folder. The Gemini key was added to the root `.env` first,
which the real backend never reads. The fix was simply copying the
working key into `apps/api/.env`.

**Lesson:** in a monorepo with multiple `.env` files, always know
exactly which process is reading which file — "it's in `.env`
somewhere" is not specific enough to debug with.

### Bug 2 — `pdf-parse` shipped a complete API rewrite in v2

The installed version (2.4.5) is a from-scratch rewrite of the
package. The old API was a single callable function:
```ts
const pdf = require('pdf-parse')
const result = await pdf(buffer)
```
The new v2 API is class-based:
```ts
import { PDFParse } from 'pdf-parse'
const parser = new PDFParse({ data: buffer })
const result = await parser.getText()
await parser.destroy()
```
Two earlier fix attempts (`import pdfParse from`, then
`import pdfParse = require()`) both failed because they were still
trying to call the module as a function — neither syntax fix mattered,
because the *shape* of what the module exports had changed entirely,
not just how TypeScript interprets the import.

**How this was actually resolved:** rather than guess a third time,
the package was installed in an isolated test environment and its
real `.d.cts` type definitions were read directly, then verified
against an actual minimal PDF before trusting the fix. This is the
right move whenever a fix fails twice — stop guessing, go read the
actual shipped types/source.

**Lesson:** an installed npm package's major version can silently be
much newer than what example code online assumes, especially for a
package an LLM's training data may remember an older API for. When in
doubt, check `node_modules/<package>/package.json` for the actual
installed version before trusting remembered usage patterns.

### Bug 3 — `users.controller.ts` duplicate-method bug, recurring

This bug (duplicate `Post` import, duplicate `createStaff` method,
`findAll()` losing its route decorator) was first found during a full
repository review, given a fix, but the fix never actually got applied
to the real file — it resurfaced and broke the build a second time
mid-sprint, unrelated to the AI work itself.

**Lesson:** when a fix is given in chat, it needs to actually be saved
to the file before moving on — a fix that's only discussed doesn't
fix anything. Worth specifically re-checking this file stays clean
going forward, since it's broken from a bad merge twice now.

---

## Key Files

### `apps/api/src/modules/ai/gemini.service.ts`

One Gemini call generates summary, key topics, flashcards, and quiz
questions together — cheaper than four separate calls and keeps
everything thematically consistent. Defensively strips markdown code
fences from the response (Gemini doesn't always follow "no markdown"
instructions perfectly) and validates the parsed shape before
trusting it, so a malformed response fails loudly here rather than
corrupting data three steps downstream.

### `apps/api/src/modules/ai/pdf-extractor.service.ts`

```ts
const parser = new PDFParse({ data: buffer })
try {
  const result = await parser.getText({ pageJoiner: '' })
  return result.text
} finally {
  await parser.destroy()
}
```
`pageJoiner: ''` strips a footer pdf-parse otherwise appends after
every page (`-- page X of Y --`) — not useful noise to feed an AI
prompt. `destroy()` in a `finally` block releases the underlying PDF.js
document resources regardless of success or failure — matters because
this runs inside a long-lived background worker handling many PDFs
over the worker's lifetime, not a short script that exits immediately.

### `apps/api/src/modules/ai/ai.processor.ts`

The actual background worker, triggered automatically by BullMQ.
Marks `AiContent` as `PROCESSING` immediately, extracts text with a
sanity check (under 100 characters means a scanned-image PDF with no
real text layer), calls Gemini, then saves the summary, flashcard set,
and quiz bank **inside a single `$transaction`** — everything succeeds
together or nothing is saved, preventing a half-complete state like a
summary existing with no matching flashcards. On any failure, marks
the record `FAILED` and re-throws so BullMQ's retry policy can apply.

### `apps/api/src/modules/ai/ai.module.ts`

```ts
BullModule.registerQueue({
  name: 'ai-generation',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
})
```
Automatic retry up to 3 times with increasing delay (5s, 10s, 20s)
absorbs temporary Gemini hiccups without manual intervention.
`removeOnFail: false` keeps failed jobs visible in Redis for
debugging rather than vanishing silently.

### Wiring into `materials.service.ts`

```ts
if (dto.type === MaterialTypeInput.PDF) {
  await this.aiService.enqueueGeneration(material.id, uploadedFile.filename)
}
```
Only PDFs get AI processing — images have no extractable text. This
single line is fire-and-forget from the upload request's perspective:
adding a job to the queue is fast, the real work happens later,
independently, in `AiProcessor`.

---

## Verified End-to-End

| Check | Result |
|---|---|
| Redis reachable | ✅ `PONG` |
| Gemini API call (isolated test) | ✅ `Gemini is working` |
| PDF text extraction (real file, in pipeline) | ✅ 28,001 characters extracted |
| AiContent status | ✅ `COMPLETED` |
| Real summary saved | ✅ Confirmed via direct database query |
| Quiz questions saved | ✅ 10 rows in `Question` table |

---

## API Endpoint Added

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/v1/materials/:id/ai-status | Logged in | Check generation status + retrieve generated content |

---

## What's Not Built Yet

- **Any frontend display** — summary, flashcards, and quiz questions
  exist only in the database and behind a raw API endpoint right now.
  This is the next piece of work, immediately following this commit.
- Status badge on the materials list showing PENDING/PROCESSING/
  COMPLETED/FAILED
- A way for a student to actually study the generated flashcards or
  take the generated quiz

---

*Document generated from the real implementation and debugging session*
*Next update: frontend AI display — summary tab, flashcards, quiz UI*
