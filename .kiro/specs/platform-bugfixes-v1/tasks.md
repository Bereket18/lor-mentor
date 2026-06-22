# Implementation Plan: Platform Bugfixes v1

## Overview

Six targeted fixes applied incrementally. Each task is self-contained and builds on the previous ones. TypeScript is used throughout (NestJS backend, Next.js frontend). No new DB migrations are needed.

---

## Tasks

- [ ] 1. Fix the `/me` endpoint — enrich with department and academicYear relations
  - In `apps/api/src/modules/users/users.service.ts`, update `findById` to add `department: { select: { id: true, name: true } }` and `academicYear: { select: { id: true, label: true } }` to the Prisma `select` clause.
  - In `apps/api/src/app.controller.ts`, update the `AuthUser` interface to add `department?: { id: string; name: string } | null` and `academicYear?: { id: string; label: string } | null`.
  - Verify the `JWT_Strategy.validate()` return type remains compatible with the wider `SafeUser` shape (add the two optional fields there too).
  - _Requirements: 2.1, 2.2, 2.3_

  - [x]* 1.1 Write property test for `UsersService.findById` relation inclusion
    - **Property 1: findById always includes department and academicYear**
    - For any user record, the returned object must contain `department` and `academicYear` keys (value may be null but the key must exist).
    - Use `fast-check` to generate random user IDs from a seeded in-memory Prisma mock.
    - Tag: `// Feature: platform-bugfixes-v1, Property 1: findById always includes department and academicYear`
    - **Validates: Requirements 2.3**

- [ ] 2. Fix the student dashboard — display dept/year header and CSS-token course cards
  - In `apps/web/src/app/(app)/dashboard/page.tsx`:
    - Update the `useAuth` user type (or local cast) to include `department?: { id: string; name: string } | null` and `academicYear?: { id: string; label: string } | null` so TypeScript is clean after the API fix from Task 1.
    - The existing `deptLabel` / `yearLabel` reads already look up these fields, so the header will render automatically once the type is correct.
    - Add the no-department-or-year guard: if `!deptLabel && !yearLabel && courses.length === 0 && !loadingCourses`, show a "contact admin" message in the courses section (see design).
    - In the course card `style` prop: replace `background: isExpanded ? "rgba(45,212,191,0.03)" : "transparent"` with `background: isExpanded ? "var(--accent-dim)" : "var(--bg-surface)"`.
    - In the material row `style` prop: replace `background: "rgba(255,255,255,0.02)"` with `background: "var(--bg-surface)"` and `border: "1px solid rgba(45,212,191,0.07)"` with `border: "1px solid var(--border-subtle)"`.
    - In the material row `onMouseEnter`/`onMouseLeave`: replace hardcoded `rgba(45,212,191,0.05)` with `var(--accent-dim)` and `rgba(255,255,255,0.02)` with `var(--bg-surface)`.
  - _Requirements: 2.4, 2.5, 2.6, 2.7, 4.3_

  - [ ]* 2.1 Write property test for course list rendering
    - **Property 2: Course list rendering includes teacher and material count**
    - Use `fast-check` to generate arrays of course objects with arbitrary `teacher.fullName` and `_count.materials` values.
    - Render the course list section and assert every generated teacher name and material count appears in the output.
    - Tag: `// Feature: platform-bugfixes-v1, Property 2: course list rendering includes teacher and material count`
    - **Validates: Requirements 2.5**

- [ ] 3. Fix admin users page — permission-correct deactivate button visibility
  - In `apps/web/src/app/(app)/admin/users/page.tsx`:
    - Find the deactivate/activate `<button>` in the row render (currently rendered unconditionally for all users).
    - Wrap it in the conditional: `{(isSuperAdmin || ["STUDENT", "GUEST"].includes(user.role)) && ( <button ...> )}`.
    - The delete button already has the correct conditional; do not change it.
    - Leave the `handleStatusToggle` function and the API call unchanged.
  - _Requirements: 3.1, 3.2_

  - [ ]* 3.1 Write property test for deactivate button visibility rule
    - **Property 3: Deactivate button visibility respects permission rules**
    - Extract the visibility predicate into a pure function: `canDeactivate(actorRole, targetRole): boolean`.
    - Use `fast-check` to enumerate all combinations of actorRole and targetRole from the Role enum values.
    - Assert the function returns `true` iff actor is `SUPER_ADMIN` OR target is `STUDENT`/`GUEST`.
    - Tag: `// Feature: platform-bugfixes-v1, Property 3: deactivate button visibility respects permission rules`
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 3.2 Write property test for delete button visibility rule
    - **Property 4: Delete button visibility respects permission rules**
    - Extract the visibility predicate into a pure function: `canDelete(actorRole, targetRole): boolean`.
    - Use `fast-check` to enumerate all combinations.
    - Assert the function returns `true` iff target is not `SUPER_ADMIN` AND (actor is `SUPER_ADMIN` OR target is `STUDENT`/`GUEST`).
    - Tag: `// Feature: platform-bugfixes-v1, Property 4: delete button visibility respects permission rules`
    - **Validates: Requirements 3.3**

- [ ] 4. Fix light mode — replace hardcoded dark colours in teacher courses page and admin table rows
  - In `apps/web/src/app/(app)/teacher/courses/page.tsx`:
    - In the course list sidebar button unselected state: replace `background: "rgba(255,255,255,0.02)"` with `background: "var(--bg-surface)"`.
    - In the materials list row: change `onMouseEnter` hover from `rgba(45,212,191,0.03)` to `"var(--accent-dim)"` and `onMouseLeave` reset to `""` (let CSS handle the base background via `var(--bg-surface)`).
  - In `apps/web/src/app/(app)/admin/users/page.tsx`:
    - In the user table row `onMouseEnter`: replace `rgba(45,212,191,0.02)` with `"var(--accent-dim)"`.
    - In the user table row `onMouseLeave`: keep as `""`.
  - If any new CSS tokens are needed beyond what `globals.css` already defines under `[data-theme="light"]`, add them there. (Current tokens `--accent-dim`, `--bg-surface`, `--bg-elevated`, `--border-subtle` are already defined for both themes.)
  - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6_

- [ ] 5. Fix teacher courses empty state — show role and API errors
  - In `apps/web/src/app/(app)/teacher/courses/page.tsx`:
    - Import `useAuth` from `@/hooks/use-auth` and destructure `user as currentUser`.
    - Add state: `const [loadError, setLoadError] = useState<string | null>(null);`.
    - In `loadCourses`, wrap the `api.get("/courses/mine")` call in try/catch; on catch, call `setLoadError(\`Error \${e?.response?.status ?? "unknown"}: \${e?.response?.data?.message ?? "Could not load courses."}\`)`.
    - Replace the empty state JSX block with:
      - If `loadError` is set: show a red error banner with the error string.
      - If courses is empty and no error: show the "No courses assigned" message and append `Your role: <span className="font-mono">{currentUser?.role ?? "unknown"}</span>` to the message.
    - Clear `loadError` at the start of each `loadCourses` call.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 6. Checkpoint — verify all tests pass and fixes are working end-to-end
  - Ensure all tests pass, ask the user if questions arise.
  - Manually verify: registration dropdowns show errors; `/me` response includes dept/year; teacher empty state shows role; admin deactivate button is hidden for teacher rows when logged in as Admin.

- [ ] 7. Fix PDF delivery — add security headers in MaterialsController
  - In `apps/api/src/modules/materials/materials.controller.ts`, inside the `getFile` method, add before `res.sendFile(fullPath)`:
    ```typescript
    res.setHeader('Content-Disposition', 'inline; filename="material.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    ```
  - Keep `res.setHeader('Content-Type', mimeType)` in place (already there).
  - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 7.1 Write example tests for PDF security headers
    - Use NestJS `supertest` to call `GET /materials/:id/file` with a mocked `MaterialsService.getFilePathForStudent`.
    - Assert response headers: `content-disposition` contains `inline`, `x-content-type-options` equals `nosniff`, `cache-control` equals `no-store`.
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 8. Build the PdfViewer component and wire it into the materials viewer
  - Create `apps/web/src/components/shared/pdf-viewer.tsx` with the `PdfViewer` component as specified in the design:
    - Props: `{ src: string }`.
    - Outer `div` with `onContextMenu={(e) => e.preventDefault()}` and `select-none` class.
    - Inner `<iframe>` with `src={\`\${src}#toolbar=0&navpanes=0&scrollbar=0\`}`.
  - Find all places in the frontend where a PDF material is opened (e.g., direct `<a href>` links or `window.open` calls in the student dashboard material rows and any existing material viewer page).
  - Replace direct file URL navigation with the `PdfViewer` component rendered inside a modal or a dedicated viewer route.
  - _Requirements: 6.4, 6.5, 6.6_

  - [ ]* 8.1 Write property test for PdfViewer src fragment
    - **Property 6: PDF iframe src always includes toolbar suppression parameters**
    - Use `fast-check` to generate arbitrary URL strings.
    - Render `<PdfViewer src={url} />` and assert the iframe `src` attribute always ends with `#toolbar=0&navpanes=0&scrollbar=0`.
    - Tag: `// Feature: platform-bugfixes-v1, Property 6: PDF iframe src always includes toolbar suppression parameters`
    - **Validates: Requirements 6.5**

  - [ ]* 8.2 Write example test for context menu suppression
    - Render `<PdfViewer src="http://example.com/test.pdf" />`.
    - Simulate a `contextmenu` event on the wrapper div.
    - Assert `event.preventDefault()` was called (spy on the event).
    - _Requirements: 6.6_

- [ ] 9. Final checkpoint — full regression pass
  - Run the full test suite for both `apps/api` and `apps/web`.
  - Ensure all tests pass, ask the user if questions arise.
  - Verify the build compiles without TypeScript errors in both apps.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "3", "4", "7"] },
    { "wave": 2, "tasks": ["2", "5", "8"] },
    { "wave": 3, "tasks": ["6"] },
    { "wave": 4, "tasks": ["9"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster fix-only pass.
- All CSS token replacements in Tasks 2 and 4 use tokens already defined in `globals.css` for both dark and light themes — no new tokens are needed unless a specific visual check reveals a gap.
- The `findByTeacher` method in `CoursesService` already queries `isArchived: false` with no `isPublished` filter, which is correct per Requirement 5.3. The fix in Task 5 is purely in the frontend empty state; the backend method requires no changes.
- Property tests for Tasks 3.1 and 3.2 require extracting the button-visibility logic into standalone pure functions — this is the right refactor regardless of testing, as it makes the component easier to reason about.
- The `PdfViewer` in Task 8 is a best-effort download deterrent. Determined users with developer tools can still obtain the URL. More robust DRM (token-signed, time-limited URLs) is out of scope for this sprint.
