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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const targetUrl = `${API_BASE}/api/v1/${path.join("/")}`;

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
