import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/route-access";

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
 * (the axios interceptor silently refreshes). Route list is centralized in
 * lib/route-access.ts so proxy + layout cannot drift.
 *
 * IMPORTANT: this guard reads cookies on the WEB host. When the API is served
 * from api.<domain> and the web app from <domain>, the API must set
 * COOKIE_DOMAIN to the shared parent domain (for example .example.com);
 * otherwise the browser never sends the auth cookies to this host and every
 * protected page redirects to /login. /api/proxy has the same requirement.
 */

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtectedPath(pathname)) return NextResponse.next();

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
    "/anatomy/:path*",
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
