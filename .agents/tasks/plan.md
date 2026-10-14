# Implementation Plan: Fix Teacher Dashboard "No Courses Assigned" Bug

## Problem Summary
Teachers see "No courses assigned yet" on their dashboard even when courses ARE assigned to them in the database. The root cause is that the frontend silently swallows ALL errors (including 401 Unauthorized, 403 Forbidden, and network errors) in the teacher page's `useEffect` hook, masking the real issue.

## Technical Context
- **Auth flow**: JWT in HTTP-only cookie `access_token` → `JwtStrategy` extracts + verifies → attaches full user to `request.user`
- **API endpoint**: `GET /courses/mine` protected by `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TEACHER')`
- **Service method**: `findByTeacher(teacherId)` queries `prisma.course.findMany({ where: { teacherId, isArchived: false } })`
- **Frontend**: `apps/web/src/app/(app)/teacher/page.tsx` calls `api.get("/courses/mine")` in useEffect
- **Current error handling**: `.catch(() => setCourses([]))` — silently treats all errors as "no courses"

## Implementation Steps

- [ ] 1. **Add proper error handling and logging to the teacher dashboard page**
      
      Replace the silent error swallowing in `apps/web/src/app/(app)/teacher/page.tsx` with proper error logging and user-facing error messages. This will reveal what's actually failing (401, 403, network error, etc.) instead of masking it as "no courses".
      
      **What to change:**
      - Add an `error` state variable to track API errors
      - In the `.catch()` block: log the full error to console AND set the error state
      - Update the UI to distinguish between "no courses" (empty array, no error) and "failed to load" (error state set)
      - Show a helpful error message with the HTTP status when an error occurs
      
      **Files:** 
      - `apps/web/src/app/(app)/teacher/page.tsx`
      
      **Verify:** 
      Open the browser console, log in as a teacher, and navigate to `/teacher`. If there's an authentication or authorization issue, the console will now show the actual error (e.g., "Request failed with status code 403") and the UI will show "Failed to load courses" instead of "No courses assigned yet."

- [ ] 2. **Add `semester` include to `findByTeacher` query for complete course data**
      
      The teacher dashboard currently shows `_count.materials` but the `findByTeacher` service method does NOT include the `semester` relation. While this won't cause empty results, it means the frontend can't show which semester each course belongs to (cosmetic issue). Add the semester include to match the pattern used in `findByStudent` and other course queries.
      
      **What to change:**
      - In `apps/api/src/modules/courses/courses.service.ts`, update the `findByTeacher` method's `include` clause
      - Add `semester: { select: { id: true, name: true, academicYear: { select: { id: true, label: true } } } }`
      - This matches the pattern in `findByStudent` (line 75-81 of courses.service.ts)
      
      **Files:** 
      - `apps/api/src/modules/courses/courses.service.ts`
      
      **Verify:** 
      Run `npm run start:dev --workspace=apps/api` from the workspace root. The API should compile without errors. Test the `/courses/mine` endpoint manually via curl or Postman — the response should now include `semester` data for each course.

- [ ] 3. **Verify route ordering in courses controller (diagnostic check)**
      
      Confirm that `@Get('mine')` is declared BEFORE `@Get(':id')` in the controller. NestJS registers routes in declaration order, so if `:id` comes first, it would match `/courses/mine` and treat "mine" as an ID, causing 404 or unexpected behavior.
      
      **What to check:**
      - Open `apps/api/src/modules/courses/courses.controller.ts`
      - Visually confirm `@Get('mine')` (line 38) appears BEFORE `@Get(':id')` (line 62)
      - Current order is correct: `mine` is at line 38, `:id` is at line 62
      
      **Files:** 
      - `apps/api/src/modules/courses/courses.controller.ts` (no changes needed if order is correct)
      
      **Verify:** 
      No code changes needed. Observation during exploration confirms the order is correct. Document this in the commit message as "verified route ordering is correct."

- [ ] 4. **Add manual verification steps for teacher role in database**
      
      If the frontend still shows "No courses assigned" after steps 1-3, the issue may be data-level: the teacher user's `role` field in the database might not be `'TEACHER'` (Prisma enum value), or the `Course.teacherId` might not match the logged-in user's ID.
      
      **Manual verification (not code changes):**
      - Start Prisma Studio: `npm run start --workspace=apps/api` then open another terminal and run `npx prisma studio` from `apps/api` directory
      - Open the `User` table, find the teacher account by email
      - Confirm `role` field is exactly `'TEACHER'` (not `'STUDENT'` or other)
      - Copy the user's `id` value
      - Open the `Course` table, search for courses where `teacherId` matches that user ID
      - Confirm `isArchived` is `false` for those courses
      
      **Files:** 
      - None (manual database inspection via Prisma Studio)
      
      **Verify:** 
      If role is wrong, update it in Prisma Studio or via SQL: `UPDATE "User" SET role = 'TEACHER' WHERE email = '<teacher-email>';`. If no courses are assigned, the admin needs to assign courses via the admin panel or directly in the database.

## Root Cause Analysis

The bug is **not** in the backend query or auth logic — both are correct. The issue is that the frontend's error handling in `apps/web/src/app/(app)/teacher/page.tsx` treats ANY error (network failure, 401, 403, 500) the same as "no courses found", showing the misleading empty state message.

Possible scenarios that trigger this:
1. **403 Forbidden**: User's role in DB is not `'TEACHER'` → `RolesGuard` rejects the request
2. **401 Unauthorized**: Access token expired and refresh failed → redirect should happen but error is caught first
3. **Network error**: API server is down or unreachable
4. **Database query returns empty array**: This is the ONLY case where "No courses assigned yet" is correct

Step 1 fixes the masking issue by exposing the real error. Steps 2-4 are defensive improvements and diagnostic aids.

## Testing Strategy

After implementing steps 1-2:

1. **Happy path**: Log in as a teacher with assigned courses → dashboard shows courses
2. **Error path**: Temporarily stop the API server → dashboard shows "Failed to load courses" with a clear error message, NOT "No courses assigned yet"
3. **Empty path**: Log in as a teacher with NO courses → dashboard shows "No courses assigned yet" (correct)
4. **Auth error path**: Log in as a user with role=STUDENT, manually navigate to `/teacher` → should see 403 error in console and "Failed to load" message

## Build & Test Commands

- **Start development servers**: `npm run dev` (from workspace root — runs both API and web)
- **Start API only**: `npm run dev:api` (from workspace root)
- **Start web only**: `npm run dev:web` (from workspace root)
- **Build API**: `npm run build:api` (from workspace root)
- **Build web**: `npm run build:web` (from workspace root)
- **Prisma Studio**: `cd apps/api && npx prisma studio`

## Success Criteria

- [ ] Teacher dashboard displays an error message (not "No courses assigned yet") when the API request fails
- [ ] Console logs show the actual HTTP error (status code + message) when requests fail
- [ ] `findByTeacher` response includes `semester` data for each course
- [ ] All existing functionality continues to work (no regressions)
