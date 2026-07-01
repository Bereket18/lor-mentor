import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge auth guard (Next.js 16 "proxy" convention — formerly middleware).
 *
 * Gives an INSTANT redirect to /login when a logged-out visitor hits a
 * protected URL — before any React renders — instead of the old behaviour
 * where the app shell flashed, a client `/me` ran, and only then bounced.
 *
 * This only checks for the PRESENCE of an auth cookie (it cannot and need not
 * verify the JWT here). The API still enforces real authentication, and the
 * app layout still enforces fine-grained role access. We accept either cookie:
 * an expired access_token with a valid refresh_token is still a logged-in user
 * (the axios interceptor silently refreshes).
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/courses",
  "/ai-tutor",
  "/flashcards",
  "/quiz",
  "/progress",
  "/forum",
  "/profile",
  "/notifications",
  "/admin",
  "/teacher",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession =
    req.cookies.has("access_token") || req.cookies.has("refresh_token");
  if (hasSession) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/courses/:path*",
    "/ai-tutor/:path*",
    "/flashcards/:path*",
    "/quiz/:path*",
    "/progress/:path*",
    "/forum/:path*",
    "/profile/:path*",
    "/notifications/:path*",
    "/admin/:path*",
    "/teacher/:path*",
  ],
};
