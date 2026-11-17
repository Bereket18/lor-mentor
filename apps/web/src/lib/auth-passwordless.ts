import axios from "axios";
import api from "@/lib/api";

/**
 * Browser client for the passwordless sign-in endpoints.
 *
 * Two rules shape this module:
 *
 *  1. Nothing here returns a credential. The API answers with a next-step
 *     object and sets HttpOnly cookies; the page never sees a session or link
 *     token.
 *  2. Every POST carries the synchronizer token from `GET /auth/csrf` in the
 *     `x-auth-csrf` header. The cookie itself is HttpOnly, so the value has to
 *     be handed to the page in the bootstrap response.
 */

export interface AuthMethods {
  googleEnabled: boolean;
  emailLinkEnabled: boolean;
}

export interface ChallengeStart {
  message: string;
  challengeId: string;
  retryAfterSeconds: number;
}

export interface PasswordlessUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export type PasswordlessCompletion =
  | { next: "signed_in"; redirectTo: string; user: PasswordlessUser }
  | { next: "complete_profile"; redirectTo: string };

export interface ProfileCompletionStatus {
  email: string;
  existingAccount: boolean;
  expiresAt: string;
}

const CSRF_HEADER = "x-auth-csrf";

// In memory only. The token is a CSRF synchronizer value, not a credential,
// but it has no reason to outlive the tab. Reloading the page fetches a fresh
// one; a stale copy is retried once on a CSRF-specific 403.
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await api.get<{ csrfToken: string }>("/auth/csrf");
  csrfToken = res.data.csrfToken;
  return csrfToken;
}

export function clearCsrfToken(): void {
  csrfToken = null;
  csrfRequest = null;
}

async function getCsrfToken(force = false): Promise<string> {
  if (force) {
    csrfToken = null;
    csrfRequest = null;
  }
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = fetchCsrfToken().finally(() => {
      csrfRequest = null;
    });
  }
  return csrfRequest;
}

/** True when the failure is the guard's CSRF rejection (worth one retry). */
function isCsrfFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.response?.status !== 403) return false;
  const body = error.response.data as { message?: unknown } | undefined;
  return (
    typeof body?.message === "string" &&
    body.message.toLowerCase().includes("csrf")
  );
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = await getCsrfToken();
  try {
    const res = await api.post<T>(path, body, {
      headers: { [CSRF_HEADER]: token },
    });
    return res.data;
  } catch (error) {
    if (!isCsrfFailure(error)) throw error;
    // The bootstrap cookie can expire while a tab stays open. Fetch one more
    // token and retry exactly once; a second failure is shown to the user.
    const fresh = await getCsrfToken(true);
    const retry = await api.post<T>(path, body, {
      headers: { [CSRF_HEADER]: fresh },
    });
    return retry.data;
  }
}

export async function getAuthMethods(): Promise<AuthMethods> {
  const res = await api.get<AuthMethods>("/auth/methods");
  return res.data;
}

export async function startEmailSignIn(
  email: string,
  returnTo?: string,
): Promise<ChallengeStart> {
  return post<ChallengeStart>("/auth/email/start", { email, returnTo });
}

export async function resendEmailSignIn(
  challengeId: string,
): Promise<ChallengeStart> {
  return post<ChallengeStart>("/auth/email/resend", { challengeId });
}

export async function submitEmailCode(
  challengeId: string,
  code: string,
): Promise<PasswordlessCompletion> {
  return post<PasswordlessCompletion>("/auth/email/code", {
    challengeId,
    code,
  });
}

/**
 * Redeem the link proof on the device that opened the email.
 *
 * `destination` is a fixed string rather than a URL: it is the explicit "sign
 * in here" consent the design requires, and the server rejects anything else.
 */
export async function confirmEmailLink(
  challengeId: string,
  token: string,
): Promise<PasswordlessCompletion> {
  return post<PasswordlessCompletion>("/auth/email/confirm", {
    challengeId,
    token,
    destination: "current-browser",
  });
}

export async function getProfileCompletion(): Promise<ProfileCompletionStatus> {
  const res = await api.get<ProfileCompletionStatus>(
    "/auth/profile-completion",
  );
  return res.data;
}

export async function completeProfile(input: {
  fullName: string;
  phoneNumber: string;
  departmentId: string;
  academicYearId: string;
}): Promise<PasswordlessCompletion> {
  return post<PasswordlessCompletion>("/auth/profile-completion", input);
}

/** Readable message from an API error, without ever exposing a raw payload. */
export function authErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!axios.isAxiosError(error)) return fallback;
  const body = error.response?.data as { message?: unknown } | undefined;
  if (Array.isArray(body?.message)) {
    const first = body.message.find((value) => typeof value === "string");
    return typeof first === "string" ? first : fallback;
  }
  if (typeof body?.message === "string" && body.message.trim()) {
    return body.message;
  }
  return fallback;
}

/** True when the API reports the method is switched off (503). */
export function isMethodUnavailable(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 503;
}
