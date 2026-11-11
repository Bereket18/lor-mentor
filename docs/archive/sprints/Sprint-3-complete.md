# Sprint 3 — Academic Structure

## Lor Mentor · Lorcan Medical College

### Status: ✅ COMPLETE

---

## What We Built in Sprint 3

```
Department → AcademicYear → Semester → Course
     ↓
Full CRUD backend for all four levels
     ↓
Admin UI — drill-down manager, zero developer involvement needed
     ↓
Registration — real department/year picker, phone number field,
               server-side validation that a year actually belongs
               to the selected department (Zero Trust enforcement)
```

This sprint turns the academic hierarchy from a database schema
into something a real school administrator can manage entirely
through the browser — exactly the "self-managing system" requirement
from the project's engineering instructions.

---

## Why We Built It in This Order

```
1. Department  (top of hierarchy, no dependencies)
2. AcademicYear (depends on Department existing)
3. Semester     (depends on AcademicYear existing)
4. Course       (depends on Semester existing)
5. Admin UI     (needs all four backend modules working first)
6. Registration (needs real departments/years to exist — Sprint 0
                  placeholder fields finally become usable)
```

Each level validates its parent exists before creation. This
prevents "orphaned" records — a Semester that points to a deleted
AcademicYear, for example.

---

## Technologies & Patterns Introduced This Sprint

### The "ensureExists" Pattern

Every service in this sprint repeats this private helper:

```ts
private async ensureExists(id: string) {
  const department = await this.prisma.department.findUnique({ where: { id } })
  if (!department) {
    throw new NotFoundException('Department not found')
  }
}
```

**Why repeat this in every service instead of one shared utility?**
Each model has a different Prisma table (`prisma.department`,
`prisma.semester`, etc.) — Prisma's typed client means we cannot
easily write one generic function across different tables without
losing type safety. Repeating a small, simple check is the pragmatic
trade-off here. In a larger system this might become a generic
repository pattern — something to consider as the codebase grows.

### Soft Delete via `isArchived`

We never hard-delete academic records:

```ts
async archive(id: string) {
  await this.ensureExists(id)
  return this.prisma.department.update({
    where: { id },
    data:  { isArchived: true },
  })
}
```

**Why?** A Department has Courses, which have Materials, which
students have viewed and have quiz attempts against. Deleting a
Department would cascade-orphan or cascade-delete a huge amount of
historical student data. Archiving hides it from active lists
(`where: { isArchived: false }`) while preserving every relationship
and historical record intact.

### Public vs Admin Query Methods

Most services have two read methods:

```ts
async findAllPublic() { /* only non-archived */ }
async findAllAdmin()  { /* everything, with extra counts */ }
```

This is a deliberate API design choice — the same underlying data
needs different shapes for different audiences. A guest browsing
courses does not need to see archived departments or student counts.
An admin managing the platform needs exactly that information.
Rather than one endpoint with conditional logic sprinkled through it,
two clearly named methods keep each one simple and readable.

---

## Every File We Created — Line by Line

---

### `/apps/api/prisma/schema.prisma` (modifications)

```prisma
model User {
  ...
  phoneNumber         String?
  departmentId        String?
  academicYearId      String?
  ...
  department    Department?   @relation(fields: [departmentId], references: [id])
  academicYear  AcademicYear? @relation(fields: [academicYearId], references: [id])
}
```

All three new fields are **optional** (`String?`). This matters:
existing users created in Sprint 1-2 testing have `null` for these
fields, and the migration does not break them. Only NEW registrations
going forward will require these via the DTO validation layer —
the database itself stays flexible.

```prisma
model Department {
  ...
  students User[]
}
```

This is the **reverse side** of the relation we added to `User`.
Prisma requires both sides of a relation to be declared. This line
does not create a new database column — it lets us write
`prisma.department.findUnique({ include: { students: true } })`
to fetch all students in a department directly.

---

### `/apps/api/src/modules/departments/departments.service.ts`

#### findAllPublic()

```ts
async findAllPublic() {
  return this.prisma.department.findMany({
    where: { isArchived: false },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, description: true, coverImage: true,
      _count: { select: { academicYears: true } },
    },
  })
}
```

`_count` is a Prisma feature — instead of fetching every related
AcademicYear record just to count them, Prisma runs an efficient
`COUNT()` query at the database level. We get `department._count.academicYears`
as a number, not an array we'd have to `.length` ourselves.

#### create()

```ts
const existing = await this.prisma.department.findUnique({ where: { name: dto.name } })
if (existing) {
  throw new ConflictException(`A department named "${dto.name}" already exists`)
}
```

The schema has `name String @unique`, which means the database
itself would reject a duplicate. We check first anyway — without
this check, Prisma would throw a raw `PrismaClientKnownRequestError`
with an unfriendly message. Checking first lets us throw a clean
`ConflictException` (HTTP 409) with a message the frontend can
display directly to the admin.

---

### `/apps/api/src/modules/academic-years/academic-years.service.ts`

#### create()

```ts
async create(dto: CreateAcademicYearDto) {
  const department = await this.prisma.department.findUnique({
    where: { id: dto.departmentId },
  })
  if (!department) {
    throw new NotFoundException('Department not found')
  }
  return this.prisma.academicYear.create({ data: { ... } })
}
```

This is **referential validation** — before creating a child record,
we confirm the parent actually exists. Prisma's foreign key constraint
would also catch this at the database level and throw an error, but
catching it in our service first gives a clean 404 instead of a
500-level database error leaking through.

---

### `/apps/api/src/modules/courses/courses.service.ts`

#### findBySemester() — the PUBLIC method

```ts
async findBySemester(semesterId: string) {
  return this.prisma.course.findMany({
    where: { semesterId, isArchived: false, isPublished: true },
    ...
  })
}
```

Notice **two** filters: `isArchived: false` AND `isPublished: true`.
A course can exist in the database (a teacher is drafting it) without
being visible to students. This is how a teacher can prepare content
privately before making it live — `isPublished` is the on/off switch.

#### findByTeacher()

```ts
async findByTeacher(teacherId: string) {
  return this.prisma.course.findMany({
    where: { teacherId, isArchived: false },  // note: NO isPublished filter
    ...
  })
}
```

Teachers see their OWN courses regardless of published status —
they need to see and edit drafts. This is enforced by the controller
route requiring the `TEACHER` role and using `@CurrentUser()` to pass
only that teacher's own ID — a teacher cannot pass someone else's ID
and see their unpublished drafts.

---

### `/apps/api/src/modules/auth/auth.service.ts` (register update)

```ts
const academicYear = await this.prisma.academicYear.findUnique({
  where: { id: dto.academicYearId },
})
if (
  !academicYear ||
  academicYear.isArchived ||
  academicYear.departmentId !== dto.departmentId
) {
  throw new BadRequestException(
    'Selected academic year does not belong to the selected department'
  )
}
```

This is the most important security check added this sprint.
**Why does this matter?** Without it, a malicious request could be
crafted directly (bypassing our frontend dropdown entirely) like:

```json
{
  "departmentId": "medicine_id",
  "academicYearId": "pharmacy_year_3_id"
}
```

A student could register claiming to be in Medicine's Year 1 while
actually being assigned to Pharmacy's Year 3 data — corrupting which
courses they can see. The check `academicYear.departmentId !== dto.departmentId`
catches this mismatch and rejects it with a clear error, regardless
of what the frontend sent. This is the Zero Trust principle in action:
**never trust client-submitted relationships — always re-verify server-side.**

---

### `/apps/web/src/app/(app)/admin/courses/page.tsx`

#### The drill-down state pattern

```ts
const [level, setLevel] = useState<Level>('departments')
const [selectedDept, setSelectedDept] = useState<Department | null>(null)
```

Rather than building four separate pages/routes for each hierarchy
level, this is **one page with a level state machine**. `level` tracks
which list is currently shown; `selectedDept`/`selectedYear`/`selectedSemester`
track the breadcrumb path. This keeps the admin experience fast —
no full page reloads when drilling into a department, just a state
change and a fresh API call.

#### Why this matters for the "admin must self-manage" requirement

```tsx
<input value={newName} placeholder={placeholders[level]} />
<button onClick={handleCreate}>Add</button>
```

One generic input + button pair handles creation at every level —
the `placeholders` object and the `handleCreate` function branch
on `level` to call the right endpoint. The admin never needs a
developer to add a new department, year, semester, or course —
exactly the requirement from the project's Admin Experience Instruction.

---

### `/apps/web/src/app/register/page.tsx` (rewrite)

#### The cascading dropdown

```ts
useEffect(() => {
  if (!selectedDepartmentId) {
    setYears([])
    return
  }
  setLoadingYears(true)
  setValue('academicYearId', '')  // reset year when department changes
  api.get(`/academic-years?departmentId=${selectedDepartmentId}`)
    .then((res) => setYears(res.data))
    .finally(() => setLoadingYears(false))
}, [selectedDepartmentId, setValue])
```

`watch('departmentId')` (React Hook Form) gives us the live value of
the department dropdown. Whenever it changes, this effect re-fetches
the matching years and **explicitly resets** `academicYearId` to empty —
this prevents a stale year selection from a previously chosen
department silently carrying over and being submitted by mistake.

---

## Security Summary Added This Sprint

| Layer | What It Enforces |
|---|---|
| Frontend dropdown filtering | UX convenience — only shows relevant years |
| Backend departmentId/academicYearId cross-check | Actual security — prevents data mismatch attacks |
| `isArchived` checks everywhere | Prevents registering into deleted departments/years |
| Role guards on all mutation endpoints | Only ADMIN/SUPER_ADMIN can create/edit academic structure |
| Soft delete (`isArchived`) instead of hard delete | Preserves historical student data integrity |

---

## API Endpoints Added This Sprint

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/v1/departments | Public | List active departments |
| GET | /api/v1/departments/admin | Admin | Full list with counts |
| GET | /api/v1/departments/:id | Public | Full hierarchy for one department |
| POST | /api/v1/departments | Admin | Create department |
| PATCH | /api/v1/departments/:id | Admin | Update department |
| PATCH | /api/v1/departments/:id/archive | Admin | Archive department |
| PATCH | /api/v1/departments/:id/restore | Admin | Restore archived department |
| GET | /api/v1/academic-years?departmentId= | Public | Years in a department |
| GET | /api/v1/academic-years/:id | Public | Year with semesters |
| POST | /api/v1/academic-years | Admin | Create year |
| PATCH | /api/v1/academic-years/:id | Admin | Update year |
| PATCH | /api/v1/academic-years/:id/archive | Admin | Archive year |
| GET | /api/v1/semesters?academicYearId= | Public | Semesters in a year |
| GET | /api/v1/semesters/:id | Public | Semester with courses |
| POST | /api/v1/semesters | Admin | Create semester |
| PATCH | /api/v1/semesters/:id | Admin | Update semester |
| PATCH | /api/v1/semesters/:id/archive | Admin | Archive semester |
| GET | /api/v1/courses?semesterId= | Public | Published courses in a semester |
| GET | /api/v1/courses/mine | Teacher | Own courses, any status |
| GET | /api/v1/courses/admin | Admin | All courses, any status |
| GET | /api/v1/courses/:id | Public | Full course detail |
| POST | /api/v1/courses | Admin | Create course |
| PATCH | /api/v1/courses/:id | Admin/Teacher | Update course |
| PATCH | /api/v1/courses/:id/archive | Admin | Archive course |

---

## Frontend Pages Added/Updated This Sprint

| Page | Route | Change |
|---|---|---|
| Admin Academic Manager | /admin/courses | New — drill-down CRUD UI |
| Register | /register | Updated — department/year/phone fields, full redesign |

---

## Git History This Sprint

```
feat(academic): add Department, AcademicYear, Semester, Course modules with full CRUD
feat(admin): add academic structure manager UI with drill-down navigation
feat(auth): add department/year validation and phone number to registration
```

---

## What We Did NOT Build Yet

- Student-facing course browser page (`/courses`) — dashboard links
  to it but the page does not exist yet
- Course detail/preview page for guests
- Teacher's own course management UI
- File upload for course materials (Sprint 4)

---

## Sprint 4 Preview

Next sprint — Content Management:

- PDF, image, and YouTube material uploads
- Secure authenticated file serving (never public URLs)
- The student-facing Course Browser and Course Detail pages
- The PDF viewer + AI panel split-screen experience

*Document generated at end of Sprint 3*
*Next update: End of Sprint 4 — Content Management*
