import { type NextRequest, NextResponse } from "next/server";

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
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const API_ORIGIN = new URL(API_BASE).origin;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  // SSRF hardening: reject any segment that could break out of the fixed API
  // path (traversal, backslashes, protocol-relative // authority, embedded
  // credentials). Then resolve against a URL object and assert the origin is
  // still our backend — defence in depth even though API_BASE is a constant.
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
    `${API_ORIGIN}/api/v1/${path.map(encodeURIComponent).join("/")}`,
  );
  target.search = req.nextUrl.search;
  if (target.origin !== API_ORIGIN) {
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
