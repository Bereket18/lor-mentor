# Design Document: Platform Bugfixes v1

## Overview

Six targeted fixes across the Lor Mentor platform:

1. **Registration dropdowns** — surface API errors and empty states properly.
2. **Student dashboard** — enrich the `/me` endpoint with relations; display dept/year header and organised course list.
3. **Admin user permission guards** — align frontend button visibility with backend role rules.
4. **Light-mode visibility** — replace hardcoded dark-only colours with CSS custom property tokens.
5. **Teacher courses empty state** — show role and API error details in the empty state.
6. **PDF download prevention** — restrictive HTTP headers + iframe viewer with toolbar suppression.

All changes are surgical: minimal surface area, no new DB migrations, no new dependencies beyond existing ones.

---

## Architecture

```
apps/
├── api/                          NestJS backend
│   ├── src/
│   │   ├── app.controller.ts     ← Fix 2: /me includes relations
│   │   ├── modules/
│   │   │   ├── users/
│   │   │   │   └── users.service.ts   ← Fix 2: findById includes dept+year
│   │   │   ├── courses/
│   │   │   │   └── courses.service.ts ← Fix 5: findByTeacher already correct
│   │   │   └── materials/
│   │   │       └── materials.controller.ts ← Fix 6: security headers
└── web/                          Next.js frontend
    └── src/app/
        ├── register/page.tsx      ← Fix 1: error states
        ├── (app)/
        │   ├── dashboard/page.tsx  ← Fix 2+4: dept/year header, CSS tokens
        │   ├── admin/users/page.tsx ← Fix 3+4: permission guards, CSS tokens
        │   └── teacher/courses/page.tsx ← Fix 4+5: CSS tokens, error state
        └── globals.css            ← Fix 4: light-mode token additions (if needed)
```

### Data flow for Fix 2 (Me endpoint enrichment)

```
Browser → GET /me → JwtAuthGuard → validate() → UsersService.findById()
                                                        ↓
                                              Prisma User query
                                       (now includes department + academicYear)
                                                        ↓
                                              { user: { ...fields,
                                                department: { id, name },
                                                academicYear: { id, label } } }
```

---

## Components and Interfaces

### Backend changes

#### `UsersService.findById` (apps/api/src/modules/users/users.service.ts)

Change the `select` clause to an `include` so that related models are fetched:

```typescript
async findById(id: string) {
  return this.prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      avatarPath: true,
      isActive: true,
      isEmailVerified: true,
      createdAt: true,
      department: { select: { id: true, name: true } },
      academicYear: { select: { id: true, label: true } },
    },
  });
}
```

The `JWT_Strategy.validate()` returns whatever `findById` returns, so the enriched user object automatically flows through to all `@CurrentUser()` usages.

#### `AppController.getMe` (apps/api/src/app.controller.ts)

Update the `AuthUser` interface to include the optional relation fields that `findById` now returns:

```typescript
interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  department?: { id: string; name: string } | null;
  academicYear?: { id: string; label: string } | null;
}
```

The endpoint body is unchanged — it simply echoes the `user` object, which now carries relations.

#### `MaterialsController.getFile` (apps/api/src/modules/materials/materials.controller.ts)

Add three response headers before `sendFile`:

```typescript
res.setHeader('Content-Disposition', 'inline; filename="material.pdf"');
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('Cache-Control', 'no-store');
```

### Frontend changes

#### Registration_Page (apps/web/src/app/register/page.tsx)

Add two new state variables:
- `deptError: string` — error message for the departments fetch.
- `yearError: string` — error message for the academic years fetch.

Modify the `useEffect` for departments:
```typescript
useEffect(() => {
  api.get("/departments")
    .then((r) => {
      setDepartments(r.data ?? []);
      if (!r.data?.length) setDeptError("No departments are available. Please contact support.");
    })
    .catch(() => setDeptError("Could not load departments. Please check your connection and refresh."))
    .finally(() => setLoadingDepts(false));
}, []);
```

Modify the `useEffect` for academic years:
```typescript
useEffect(() => {
  if (!selectedDeptId) { setYears([]); return; }
  setLoadingYears(true);
  setYearError("");
  setValue("academicYearId", "");
  api.get(`/academic-years?departmentId=${selectedDeptId}`)
    .then((r) => {
      setYears(r.data ?? []);
      if (!r.data?.length) setYearError("No academic years available for this department.");
    })
    .catch(() => setYearError("Could not load academic years. Please try again."))
    .finally(() => setLoadingYears(false));
}, [selectedDeptId, setValue]);
```

Render `deptError` below the department select, and `yearError` below the year select — styled the same as other field errors.

When `years` is empty but a department is selected and loading is complete, render a disabled option: `"No years available"`.

#### Student_Dashboard (apps/web/src/app/(app)/dashboard/page.tsx)

The `useAuth()` hook now returns a user enriched with `department` and `academicYear`, because `GET /me` is enriched. The existing cast:
```typescript
const deptLabel = (user as unknown as Record<string, ...>)?.department?.name ?? null;
```
…already reads `department.name` from the user object, so once the API fix is in place this works without frontend changes. Optionally, update the TypeScript type for the `useAuth` user to include the new fields.

Replace the hardcoded Inline_Colors in the course card and material rows with CSS tokens (see Fix 4 below).

Add a no-department-or-year guard message for students without dept/year:
```tsx
{!loadingCourses && !deptLabel && !yearLabel && courses.length === 0 && (
  <p className="text-xs text-muted text-center py-4">
    Your account has no department or academic year assigned yet.
    Please contact an administrator.
  </p>
)}
```

#### Admin_Users_Page (apps/web/src/app/(app)/admin/users/page.tsx)

Fix the deactivate/activate button visibility. Replace the current unconditional render with:

```tsx
// Show deactivate button only if actor is Super_Admin OR target is STUDENT/GUEST
{(isSuperAdmin || ["STUDENT", "GUEST"].includes(user.role)) && (
  <button onClick={() => handleStatusToggle(user.id, user.isActive)} ...>
    {user.isActive ? "Active" : "Inactive"}
  </button>
)}
```

The delete button logic is already correct (`user.role !== "SUPER_ADMIN" && (isSuperAdmin || ["STUDENT","GUEST"].includes(user.role))`); no change needed there.

#### Teacher_Courses_Page (apps/web/src/app/(app)/teacher/courses/page.tsx)

Add error state:
```typescript
const [loadError, setLoadError] = useState<string | null>(null);
```

In `loadCourses`, catch the error and store it:
```typescript
try {
  const r = await api.get("/courses/mine");
  ...
} catch (e: any) {
  setLoadError(
    `Error ${e?.response?.status ?? "unknown"}: ${e?.response?.data?.message ?? "Could not load courses."}`
  );
} finally { setLoading(false); }
```

Replace the empty state rendering:
```tsx
courses.length === 0 && !loadError ? (
  <div ...>
    <BookOpen ... />
    <p className="text-secondary text-sm">No courses assigned to you yet.</p>
    <p className="text-muted text-xs mt-1">
      Your role: <span className="font-mono">{currentUser?.role ?? "unknown"}</span>
      {" — ask an admin to assign a course to your account."}
    </p>
  </div>
) : loadError ? (
  <div style={{ border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.07)" }} ...>
    <p className="text-sm" style={{ color: "#EF4444" }}>{loadError}</p>
  </div>
) : null
```

For this, the page must access `currentUser` — import `useAuth` and destructure `user`.

#### PDF Viewer component (new: apps/web/src/components/shared/pdf-viewer.tsx)

```tsx
"use client";
interface Props { src: string }

export function PdfViewer({ src }: Props) {
  return (
    <div
      className="w-full h-full select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <iframe
        src={`${src}#toolbar=0&navpanes=0&scrollbar=0`}
        className="w-full h-full border-0"
        title="PDF Viewer"
      />
    </div>
  );
}
```

Wherever a PDF material is currently opened (e.g., via `window.open` or a direct `<a href>` link in the student dashboard or viewer), replace it with this component rendered in a modal or full-screen container.

---

## Data Models

No schema migrations are required. The existing Prisma schema already defines the `department` and `academicYear` relations on `User`. The only change is including those relations in the Prisma select query inside `UsersService.findById`.

The updated `SafeUser` type returned by `JWT_Strategy.validate()` will now carry:
```typescript
{
  id, email, fullName, role, avatarPath,
  isActive, isEmailVerified, createdAt,
  department: { id: string; name: string } | null,
  academicYear: { id: string; label: string } | null,
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: findById always includes department and academicYear

*For any* user ID that exists in the database, `UsersService.findById` SHALL return an object that contains both a `department` field and an `academicYear` field (each may be `null` if not set, but the keys must be present in the returned object).

**Validates: Requirements 2.3**

---

### Property 2: Course list rendering includes teacher and material count

*For any* non-empty array of course objects (each carrying `teacher.fullName` and `_count.materials`), the rendered Student_Dashboard course list SHALL include the teacher's full name and the material count for every item in that array.

**Validates: Requirements 2.5**

---

### Property 3: Deactivate button visibility respects permission rules

*For any* combination of actor role (`ADMIN` or `SUPER_ADMIN`) and target user role (`SUPER_ADMIN`, `ADMIN`, `TEACHER`, `STUDENT`, `GUEST`), the Admin_Users_Page SHALL show the deactivate/activate button if and only if: the actor is `SUPER_ADMIN`, OR the target's role is `STUDENT` or `GUEST`.

**Validates: Requirements 3.1, 3.2**

---

### Property 4: Delete button visibility respects permission rules

*For any* combination of actor role and target user role, the Admin_Users_Page SHALL show the delete button if and only if: the target's role is not `SUPER_ADMIN`, AND (the actor is `SUPER_ADMIN`, OR the target's role is `STUDENT` or `GUEST`).

**Validates: Requirements 3.3**

---

### Property 5: findByTeacher returns all non-archived courses regardless of publish status

*For any* teacher ID and any set of courses in the database where `teacherId` matches and `isArchived = false`, `CoursesService.findByTeacher` SHALL return all of those courses regardless of their `isPublished` value.

**Validates: Requirements 5.3**

---

### Property 6: PDF iframe src always includes toolbar suppression parameters

*For any* PDF file URL passed to `PdfViewer`, the rendered `<iframe>` `src` attribute SHALL contain the fragment `#toolbar=0&navpanes=0&scrollbar=0`.

**Validates: Requirements 6.5**

---

## Error Handling

| Scenario | Component | Behaviour |
|---|---|---|
| `GET /departments` fails | Registration_Page | Show inline error below dept dropdown; disable year select |
| `GET /academic-years` returns `[]` | Registration_Page | Show "No academic years available" option in year select |
| `GET /academic-years` fails | Registration_Page | Show inline error below year select |
| `GET /courses/mine` returns 403 | Teacher_Courses_Page | Show error message with HTTP status + API message |
| `GET /courses/mine` returns `[]` | Teacher_Courses_Page | Show empty state with user's current role |
| `GET /me` user has no dept/year | Student_Dashboard | Show "contact admin" message in courses section |
| Admin tries to deactivate Teacher via API | Admin_Users_Page | `alert()` the API error message from the 400 response |
| PDF file not found on disk | MaterialsController | Propagate existing `NotFoundException` from `getFilePathForStudent` |

---

## Testing Strategy

This feature set is a mix of API data enrichment, frontend UI logic, permission guards, and HTTP header changes. Most correctness properties centre on pure logic (button visibility rules, filter predicates, render output) that are cheap to run many times.

**Unit tests / example tests** (cover specific scenarios):
- Registration_Page: mock API responses, verify dropdown population, error text rendering.
- Student_Dashboard: render with user object carrying dept/year, verify header text.
- Admin_Users_Page: render with specific role combinations, verify button presence/absence.
- Teacher_Courses_Page: mock empty + error API responses, verify empty state text includes role.
- MaterialsController: call the file endpoint, assert response headers.
- PdfViewer: render with a URL, assert iframe src contains toolbar params.

**Property-based tests** (verify universal rules with generated inputs):
- `UsersService.findById` — for any user ID, returned object has `department` and `academicYear` keys.
- Student_Dashboard course list rendering — for any generated array of courses, teacher name and count appear per item.
- Admin permission guard logic (pure function extracted from JSX) — for all 10 (actorRole × targetRole) combinations, button visibility matches the expected truth table.
- `CoursesService.findByTeacher` filter — for any generated set of courses, only those matching teacherId and not archived are returned.
- `PdfViewer` — for any URL, iframe src includes toolbar suppression fragment.

**Property-based testing library**: [fast-check](https://fast-check.dev/) for TypeScript (both frontend logic and backend service tests). Minimum 100 iterations per property.

**Test tag format**: `// Feature: platform-bugfixes-v1, Property N: <property_text>`

**Integration tests** (not property-based):
- Call `GET /me` with a real JWT and assert response contains `department` + `academicYear` keys.
- Call `GET /courses/mine` with a Teacher JWT and assert non-archived courses are returned.
- Call `GET /materials/:id/file` and assert all three security headers are present.
