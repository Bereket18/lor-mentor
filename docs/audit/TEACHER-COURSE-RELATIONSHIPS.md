# LOR MENTOR — TEACHER ↔ COURSE RELATIONSHIPS

**Date:** 2026-10-18 · **Area:** admin teacher lifecycle (Issue A) · **Companions:**
`FINAL-DEFECT-INVESTIGATION.md` §2, `REGRESSION-TEST-RESULTS.md` §4.

---

## 1. Data model (as built)

```
User (role TEACHER)
  ▲
  │ teacherId (nullable)
Course ──► Semester ──► AcademicYear ──► Department
```

- `Course.teacherId` — single, **nullable** FK to `users`. One course has at most
  one teacher; one teacher may own any number of courses (across departments —
  the relation is to the user, not to the department).
- Teachers carry an optional `departmentId`, but course visibility is based on
  ownership (`Course.teacherId = user.id`), never on department equality.
- Deleting a teacher detaches their courses (`course.updateMany` inside the
  `deleteUser` transaction in `users.service.ts` → `teacherId = null`); courses
  are never silently deleted.

## 2. Contract

### 2.1 Creation with assignment — `POST /users/create-staff` (ADMIN/SUPER_ADMIN)
```
{
  fullName, email, role: "TEACHER",
  departmentId?, academicYearId?, phoneNumber?,
  courseIds?: string[]        // ≤ 100, unique, trimmed
}
```
Validation rules (all enforced **before** any write):
1. `courseIds` allowed for TEACHER accounts only.
2. Every id must exist and be non-archived (`isArchived: false`).
3. Every course must currently have **no** teacher.
4. Assignment happens in the **same transaction** as the account create:
   `updateMany({ id in courseIds, teacherId: null, isArchived: false })`; if the
   affected count ≠ requested count (a concurrent admin claimed one), the
   transaction rolls back → **no partial account, no partial assignment**.

Response includes `temporaryPassword` (one-time view for the admin) and the
created user (including `departmentId`).

### 2.2 Reassignment / unassignment — `PATCH /courses/:id`
- `{ teacherId: <id> }` — assigns (validated: course/teacher exist, teacher role).
- `{ teacherId: null }` — unassigns (returns the course to the unassigned pool).

### 2.3 Visibility — `GET /courses/mine` (TEACHER)
Returns exactly the courses where `teacherId = current user`. There is no
teacher-visible cross-department listing; `GET /courses/admin` is 403 for
teachers (verified live).

## 3. Admin UI flow (web)

- **Create panel** (`/(app)/admin/users`): selecting role TEACHER reveals the course
  picker — loads the full admin catalog on demand, department filter + title
  search, taken courses rendered disabled with the current teacher's name, free
  courses multi-selectable. On success the banner reports how many courses were
  assigned.
- **Course page**: existing reassign/unassign control; its error messaging remains
  the documented path for moving a course between teachers.
- Selection state resets when role or department changes (no stale ids submitted).

## 4. Verification evidence

### 4.1 Unit (`apps/api/src/modules/users/users.service.spec.ts` — 10/10)
New spec this sprint: happy path with assignment, teacher-only rule, unknown
course, archived course, already-taken course, transaction rollback on concurrent
assignment, no `courseIds` behavior, DTO cap, etc.

### 4.2 Live end-to-end (dev DB, disposable fixtures, cleaned up)
Harness: `%TEMP%\lor-logs\sprint-e2e.cjs` — creates 2 draft courses in **two
different departments** (Medicine / Dental Medicine), then a teacher via the API.

| # | Check | Result |
|---|---|---|
| 1 | `create-staff` returns 201 with a temporary password | PASS |
| 2 | Both courses persisted with the new `teacherId` (DB read) | PASS |
| 3 | Teacher logs in with the temporary password (HTTP 200) | PASS |
| 4 | `GET /courses/mine` lists **both** courses — no second manual step | PASS |
| 5 | Re-using an assigned course for a 2nd teacher → 400 “already has a teacher assigned” | PASS |
| 6 | Rejected request left **no** partial account (DB read) | PASS |
| 7 | `PATCH { teacherId: null }` → 200; DB cleared; dashboard then lists only course A | PASS |
| 8 | Teacher → `GET /courses/admin` forbidden (403) | PASS |
| 9 | All disposable fixtures removed (course/user leftovers = 0) | PASS |

Both E2E runs (19-check and extended 20-check) were fully green; see
`REGRESSION-TEST-RESULTS.md` §4 for raw output.

### 4.3 Previously observed failure mode (for the record)
Before the fix, an admin-created teacher had **no** assignment path from the
creation screen; the dashboard stayed empty until the admin separately opened the
course page and assigned each course — with no feedback that this was required.
That is exactly the symptom the sprint brief reported, and it is what the live
E2E above now disproves.

## 5. Operating notes & limitations

- **Single teacher per course.** The schema does not model co-teaching. If two
  lecturers must share a course, today only one can own it. A many-to-many join
  (`CourseTeacher`) would be a schema + guards + UI change — out of scope for the
  smallest-safe-fix mandate; recorded as a product limitation.
- **Taken courses cannot be grabbed at creation.** The 400 message explicitly
  directs the admin to the course page to reassign (“Reassign it from the course
  page instead”).
- **Unassignment keeps the teacher account** (courses are detached only).
- **Race safety:** concurrent creation attempts on the same course cannot both
  succeed (transaction + `teacherId: null` filter + count check).
- No bulk-assignment screen exists; assignment is per teacher (creation) or per
  course (reassign).
