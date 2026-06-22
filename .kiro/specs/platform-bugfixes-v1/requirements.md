# Requirements Document

## Introduction

This spec covers a batch of six targeted bug fixes and one improvement for the **Lor Mentor** platform (Lorcan Medical College LMS). The issues span the NestJS API backend (`apps/api`) and the Next.js frontend (`apps/web`), and address: broken registration dropdowns, a broken student dashboard, incorrect frontend permission guards, light-mode visibility failures, a teacher course empty-state bug, and an insecure PDF delivery mechanism.

---

## Glossary

- **System**: The Lor Mentor platform as a whole (API + web client).
- **API**: The NestJS backend (`apps/api`), running at the base URL configured in the web app.
- **Web_Client**: The Next.js frontend (`apps/web`).
- **Registration_Page**: The public `/register` route in the Web_Client.
- **Student_Dashboard**: The authenticated `/dashboard` route available to users with the `STUDENT` role.
- **Admin_Users_Page**: The authenticated `/admin/users` route available to `ADMIN` and `SUPER_ADMIN` roles.
- **Teacher_Courses_Page**: The authenticated `/teacher/courses` route available to `TEACHER` role.
- **Me_Endpoint**: `GET /api/v1/me` — returns the currently authenticated user's profile.
- **JWT_Strategy**: The Passport JWT strategy in `apps/api/src/common/strategies/jwt.strategy.ts`.
- **UsersService**: `apps/api/src/modules/users/users.service.ts`.
- **CoursesService**: `apps/api/src/modules/courses/courses.service.ts`.
- **MaterialsController**: `apps/api/src/modules/materials/materials.controller.ts`.
- **Department**: A top-level academic program (e.g., Medicine, Pharmacy).
- **AcademicYear**: A year of study within a Department (e.g., "Year 1", "Year 2").
- **Semester**: A term within an AcademicYear that groups Courses.
- **Teacher**: A user with `role = TEACHER`.
- **Student**: A user with `role = STUDENT`.
- **Admin**: A user with `role = ADMIN`.
- **Super_Admin**: A user with `role = SUPER_ADMIN`.
- **CSS_Token**: A CSS custom property defined in `globals.css` (e.g., `var(--bg-surface)`).
- **Inline_Color**: A hardcoded RGBA color string written directly in a TSX `style` prop.
- **PDF_Viewer**: An `<iframe>`-based in-browser PDF renderer used instead of direct file navigation.

---

## Requirements

---

### Requirement 1: Registration — Department and Academic Year Dropdowns

**User Story:** As a prospective student, I want the Department and Academic Year dropdowns on the registration page to work correctly, so that I can select my program and complete registration.

#### Acceptance Criteria

1. WHEN the Registration_Page mounts, THE Web_Client SHALL call `GET /api/v1/departments` and populate the department dropdown with the returned list.
2. IF the `GET /api/v1/departments` request fails or returns an empty array, THEN THE Registration_Page SHALL display a descriptive inline error message below the department dropdown instead of a silent empty list.
3. WHEN a user selects a department, THE Web_Client SHALL call `GET /api/v1/academic-years?departmentId={id}` and populate the academic year dropdown.
4. IF the `GET /api/v1/academic-years?departmentId={id}` request returns an empty array, THEN THE Registration_Page SHALL display a "No academic years available for this department" message inside the year dropdown in place of options.
5. IF the `GET /api/v1/academic-years?departmentId={id}` request fails with an HTTP error, THEN THE Registration_Page SHALL display a descriptive inline error message below the year dropdown.
6. WHILE the Department dropdown is loading, THE Registration_Page SHALL disable the Academic Year dropdown and display a "Loading…" placeholder.

---

### Requirement 2: Student Dashboard — Department/Year Header and Course Organisation

**User Story:** As a student, I want my dashboard to show my department and academic year in the header, and to organise courses clearly with teacher name and material count, so that I can navigate my studies efficiently.

#### Acceptance Criteria

1. THE Me_Endpoint SHALL return the authenticated user's `department` relation (`id`, `name`) and `academicYear` relation (`id`, `label`) loaded from the database, not just the JWT payload fields.
2. WHEN the Me_Endpoint is called, THE API SHALL include `department: { id, name }` and `academicYear: { id, label }` in the response `user` object.
3. WHEN `UsersService.findById` is called, THE UsersService SHALL include the `department` and `academicYear` relations in the Prisma select/include query.
4. WHEN the Student_Dashboard renders and the user has a department and academic year, THE Web_Client SHALL display the department name and academic year label in the dashboard header.
5. WHEN the Student_Dashboard loads courses via `GET /api/v1/courses/my-year`, THE Web_Client SHALL display each course with its teacher's full name and its material count.
6. WHEN a course card on the Student_Dashboard is expanded, THE Web_Client SHALL display the list of materials for that course, each showing title and type.
7. IF the student has no `departmentId` or `academicYearId` set, THEN THE Student_Dashboard SHALL display an explanatory message in the courses section indicating that no courses are available until a department and year are assigned.

---

### Requirement 3: Admin Users Page — Deactivate/Delete Permission Guards

**User Story:** As an admin, I want the deactivate and delete action buttons in the user management page to be visible only when I actually have permission to perform the action, so that the UI accurately reflects the backend rules.

#### Acceptance Criteria

1. THE Admin_Users_Page SHALL show the deactivate/activate toggle button for a given user only when: the current user is a Super_Admin, OR the target user's role is `STUDENT` or `GUEST`.
2. WHEN the current user is an Admin (not Super_Admin), THE Admin_Users_Page SHALL hide the deactivate/activate button for users with role `TEACHER` or `ADMIN`.
3. THE Admin_Users_Page SHALL show the delete button for a given user only when: the target user's role is not `SUPER_ADMIN`, AND (the current user is a Super_Admin OR the target user's role is `STUDENT` or `GUEST`).
4. WHEN an admin user attempts to deactivate a teacher or admin via the API, THE API SHALL return an error response and THE Admin_Users_Page SHALL display that error to the user.

---

### Requirement 4: Light Mode — Visible Text and Component Backgrounds

**User Story:** As a user who prefers light mode, I want all text, card backgrounds, and row highlights to be clearly visible, so that the platform is fully usable in light mode.

#### Acceptance Criteria

1. THE Web_Client SHALL use CSS_Tokens (`var(--bg-surface)`, `var(--bg-elevated)`, `var(--border-default)`, etc.) instead of Inline_Colors for all component backgrounds, borders, and hover states that differ between dark and light themes.
2. WHEN the application is rendered in `[data-theme="light"]`, THE Teacher_Courses_Page material row backgrounds SHALL be visible and use `var(--bg-surface)` or `var(--bg-elevated)` rather than `rgba(255,255,255,0.02)`.
3. WHEN the application is rendered in `[data-theme="light"]`, THE Student_Dashboard course card backgrounds SHALL be visible; the expanded state SHALL use a CSS_Token rather than `rgba(45,212,191,0.03)`, and the collapsed state SHALL use a CSS_Token rather than `transparent`.
4. WHEN the application is rendered in `[data-theme="light"]`, THE Admin_Users_Page table row hover background SHALL be visible and use a CSS_Token rather than `rgba(45,212,191,0.02)`.
5. WHERE any component uses a hardcoded `rgba(255,255,255,...)` for a background or border that is only suitable for dark mode, THE Web_Client SHALL replace that value with an appropriate CSS_Token that resolves correctly in both themes.
6. THE `globals.css` file SHALL define any additional `[data-theme="light"]` overrides required so that all components using CSS_Tokens render with adequate contrast in light mode.

---

### Requirement 5: Teacher Courses Page — "No Courses" Empty State Diagnosis

**User Story:** As a teacher, I want to see a meaningful message when no courses are assigned to me, and want the empty state to help me understand why, so that I can report the correct issue to an admin.

#### Acceptance Criteria

1. WHEN the Teacher_Courses_Page calls `GET /api/v1/courses/mine` and receives an empty array, THE Web_Client SHALL display the current user's role alongside the empty-state message to help confirm that the teacher role is correctly set.
2. WHEN the Teacher_Courses_Page calls `GET /api/v1/courses/mine` and the API returns a non-2xx HTTP status, THE Web_Client SHALL display the HTTP status code and error message from the API response instead of silently showing the empty state.
3. THE CoursesService `findByTeacher` method SHALL query for courses where `teacherId` matches the given teacher ID and `isArchived` is false, including both published and unpublished courses.
4. WHEN `GET /api/v1/courses/mine` is called with a valid Teacher JWT, THE API SHALL return all non-archived courses whose `teacherId` matches the requesting teacher's user ID, regardless of `isPublished` status.

---

### Requirement 6: PDF Materials — Prevent In-Browser Download

**User Story:** As a content administrator, I want PDF materials served via the platform to be displayed in a restricted viewer that makes casual downloading difficult, so that course content is protected from easy redistribution.

#### Acceptance Criteria

1. WHEN the API serves a PDF file via `GET /api/v1/materials/:id/file`, THE MaterialsController SHALL set the response header `Content-Disposition` to `inline; filename="material.pdf"` using an opaque filename instead of the original file path.
2. WHEN the API serves a PDF file via `GET /api/v1/materials/:id/file`, THE MaterialsController SHALL set the response header `X-Content-Type-Options` to `nosniff`.
3. WHEN the API serves a PDF file via `GET /api/v1/materials/:id/file`, THE MaterialsController SHALL set the response header `Cache-Control` to `no-store`.
4. WHEN a student navigates to a PDF material, THE Web_Client SHALL render the file inside an `<iframe>` (PDF_Viewer) rather than navigating directly to the file URL.
5. WHEN a PDF_Viewer is rendered, THE Web_Client SHALL append `#toolbar=0&navpanes=0&scrollbar=0` to the iframe `src` URL to suppress the browser PDF toolbar.
6. WHEN a user right-clicks on a PDF_Viewer iframe, THE Web_Client SHALL intercept the `contextmenu` event on the iframe wrapper and call `preventDefault()` to suppress the native context menu.
