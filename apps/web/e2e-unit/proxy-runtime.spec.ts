import { expect, test } from "@playwright/test";

/**
 * Runtime half of the NEXT_PUBLIC_API_URL fail-fast.
 *
 * `next.config.ts` fails the BUILD on a bad value, but a container can still be
 * started with a different runtime value (compose passes the variable twice:
 * build arg and runtime env). The route resolves the origin once at module load
 * and must answer a clean 503 rather than crashing with an opaque 500 or
 * proxying to an attacker-controlled host.
 *
 * The module caches its resolved origin at import time, so the variable is set
 * before the dynamic import and this case lives in its own file.
 */

test("the proxy answers 503 when the API origin is invalid at runtime", async () => {
  process.env.NEXT_PUBLIC_API_URL = "not-an-absolute-url";

  // Installed before the import: the origin is resolved at module load, so the
  // server-side log fires during the dynamic import below.
  const logged: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };

  try {
    const { GET } = await import("../src/app/api/proxy/[...path]/route");

    const response = await GET(
      new Request("http://localhost:3000/api/proxy/courses") as never,
      { params: Promise.resolve({ path: ["courses"] }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: "API proxy is not configured on this server",
    });

    // The reason is logged server-side, never returned to the client (it can
    // name an internal host).
    expect(logged.join("\n")).toMatch(/absolute URL/);
  } finally {
    console.error = originalError;
    delete process.env.NEXT_PUBLIC_API_URL;
  }
});
