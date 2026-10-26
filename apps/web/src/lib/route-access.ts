// Single source of truth for protected routes + role gates.
// Used by both proxy.ts (edge, instant redirect) and (app)/layout.tsx (client, UX bounce).
// Keep PROTECTED_PREFIXES and the role predicates in ONE place so they cannot drift.

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/courses",
  "/ai-tutor",
  "/anatomy",
  "/flashcards",
  "/quiz",
  "/progress",
  "/forum",
  "/profile",
  "/notifications",
  "/admin",
  "/teacher",
] as const;

export const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

export const STUDENT_ROUTES = [
  "/dashboard",
  "/courses",
  "/ai-tutor",
  "/anatomy",
  "/flashcards",
  "/quiz",
  "/progress",
] as const;

export function homeFor(role?: string): string {
  if (role && (ADMIN_ROLES as readonly string[]).includes(role)) return "/admin";
  if (role === "TEACHER") return "/teacher";
  return "/dashboard";
}

export function isAllowed(pathname: string, role?: string): boolean {
  if (pathname.startsWith("/admin")) return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
  if (pathname.startsWith("/teacher")) return role === "TEACHER";
  if (pathname.startsWith("/forum")) return role === "STUDENT" || role === "TEACHER";
  if (pathname === "/profile" || pathname.startsWith("/notifications")) return true;
  const isStudentRoute = STUDENT_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  if (isStudentRoute) return role === "STUDENT";
  return true;
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
