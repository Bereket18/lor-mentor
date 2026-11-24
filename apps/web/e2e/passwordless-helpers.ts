import { readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Shared helpers for the passwordless sign-in UI specs.
 *
 * The specs need one thing the browser cannot see: the six-digit code and the
 * link token that the API put in the mail. The local stack delivers mail to the
 * QA sink on disk, so these helpers read it there — and only there. They never
 * return a code or token to a test's output; the caller keeps them in a local
 * variable and asserts on the outcome instead.
 *
 * Run against the local stack (web on :3000, API on :4000, SMTP sink writing to
 * the mail directory) with:
 *
 *   $env:E2E_RUN_PASSWORDLESS = "1"
 *   $env:E2E_PASSWORDLESS_EXISTING_EMAIL = "someone@example.test"   # active, non-admin
 *   npx playwright test e2e/passwordless.spec.ts --workers=1
 */

export const PASSWORDLESS_ENABLED = process.env.E2E_RUN_PASSWORDLESS === "1";

/** An active, non-administrator account that already exists on the API's DB. */
export const EXISTING_EMAIL = process.env.E2E_PASSWORDLESS_EXISTING_EMAIL ?? "";

/** Directory the local SMTP sink writes `.eml` files into. */
export const MAIL_DIR =
  process.env.E2E_PASSWORDLESS_MAIL_DIR ??
  path.join(os.tmpdir(), "opencode", "qa", "passwordless-mail");

/** Quoted-printable decoding: join soft breaks, then expand `=XX`. */
function decodeQuotedPrintable(value: string): string {
  const joined = value.replace(/=\r?\n/g, "");
  return joined.replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

export interface AuthMail {
  code: string;
  challengeId: string;
  token: string;
}

/**
 * Poll the sink for the message that carries `challengeId` and pull the code
 * and link handle out of it.
 *
 * Matching on the challenge handle — not just the address or the file time — is
 * deliberate: the sink keeps every message it has ever received, so an earlier
 * sign-in for the same address must never be mistaken for this one.
 */
export async function readAuthMail(
  to: string,
  challengeId: string,
  timeoutMs = 15_000,
): Promise<AuthMail> {
  const deadline = Date.now() + timeoutMs;
  const needle = to.toLowerCase();
  while (Date.now() < deadline) {
    let files: string[] = [];
    try {
      files = readdirSync(MAIL_DIR)
        .filter((name) => name.endsWith(".eml"))
        .map((name) => ({ name, mtime: statSync(path.join(MAIL_DIR, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .map((entry) => entry.name);
    } catch {
      // The sink may not have created the directory yet; keep waiting.
    }
    for (const name of files) {
      const text = decodeQuotedPrintable(
        readFileSync(path.join(MAIL_DIR, name), "utf8"),
      );
      if (!text.toLowerCase().includes(needle)) continue;
      const link = text.match(
        /#challenge=([^&\s"']+)&(?:amp;)?token=([^"\s<']+)/,
      );
      if (!link) continue;
      const foundId = decodeURIComponent(link[1]);
      if (foundId !== challengeId) continue;
      const code = text.match(/six-digit code is:\s*(\d{6})/)?.[1];
      if (!code) continue;
      return {
        code,
        challengeId: foundId,
        token: decodeURIComponent(link[2]),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("No sign-in mail arrived for the test challenge.");
}

/** A unique, obviously synthetic address that cannot belong to a real person. */
export function newcomerEmail(): string {
  return `pwless-newcomer-${Date.now().toString(36)}@example.test`;
}
