import { type NextRequest, NextResponse } from "next/server";
import { resolveApiOrigin } from "../../../../lib/api-base";

/**
 * API proxy route — forwards requests to the NestJS backend
 * with the original cookies intact (JWT access_token cookie included).
 *
 * All requests to /api/proxy/* are forwarded to:
 *   NEXT_PUBLIC_API_URL/api/v1/*
 *
 * Example:
 *   GET /api/proxy/materials/abc123/file
 *   → GET http://localhost:4000/api/v1/materials/abc123/file  (with cookies)
 *
 * IMPORTANT: the browser sends this request to the WEB host, so the auth
 * cookies must be readable here. For api.<domain> + <domain> deployments the
 * API must set COOKIE_DOMAIN to the shared parent domain (for example
 * .example.com); otherwise this route forwards no auth cookie and the API
 * returns 401. See apps/web/src/proxy.ts for the edge-guard equivalent.
 */

const API_ORIGIN = (() => {
  try {
    return resolveApiOrigin();
  } catch (error) {
    // Resolved once at module load. A bad configuration must not crash the
    // route with an opaque 500 — the handler answers 503 with a clear server
    // log instead. The message is not returned to the client (it can name
    // an internal host).
    console.error(
      `[api/proxy] ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
})();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  const apiOrigin = API_ORIGIN;
  if (!apiOrigin) {
    return NextResponse.json(
      { message: "API proxy is not configured on this server" },
      { status: 503 },
    );
  }

  // SSRF hardening: reject any segment that could break out of the fixed API
  // path (traversal, backslashes, protocol-relative // authority, embedded
  // credentials). Then resolve against a URL object and assert the origin is
  // still our backend — defence in depth even though API_ORIGIN is a constant.
  const unsafe = path.some(
    (seg) =>
      seg.includes("..") ||
      seg.includes("\\") ||
      seg.includes("@") ||
      /^https?:/i.test(seg),
  );
  if (unsafe) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  const target = new URL(
    `${apiOrigin}/api/v1/${path.map(encodeURIComponent).join("/")}`,
  );
  target.search = req.nextUrl.search;
  if (target.origin !== apiOrigin) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }
  const targetUrl = target.toString();

  // Forward the original cookies so the JWT access_token is included
  const cookie = req.headers.get("cookie") ?? "";

  const upstream = await fetch(targetUrl, {
    headers: {
      cookie,
      accept: req.headers.get("accept") ?? "*/*",
    },
    cache: "no-store",
  });

  // Stream the response back — works for binary (PDF) and JSON
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
