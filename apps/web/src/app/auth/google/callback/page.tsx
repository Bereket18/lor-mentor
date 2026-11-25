"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/hooks/use-auth";
import {
  authErrorMessage,
  completeGoogleSignIn,
} from "@/lib/auth-passwordless";

type Phase = "working" | "error";

/**
 * The page Google redirects to after the consent screen.
 *
 * Security properties this page is responsible for:
 *
 *  - Google sends only `code` and `state`. Neither is trusted here; the API
 *    verifies the ID token, matches the state to a browser-bound single-use
 *    transaction and checks the binding cookie before anything is issued.
 *  - The values are read from the query string, stripped from the address bar
 *    immediately and sent exactly once, in a same-origin JSON POST. They are
 *    never written to storage and never rendered.
 *  - On any failure the page says only that sign-in did not complete; the API's
 *    uniform failure message is shown, and the user is sent back to /login.
 */
export default function GoogleCallbackPage() {
  const router = useRouter();
  const { checkAuth } = useAuth();
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>("working");
  const [error, setError] = useState("");

  useEffect(() => {
    // React Strict Mode runs effects twice in development. The authorization
    // code is single-use, so the second run must never re-POST it.
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") ?? "";
    const state = params.get("state") ?? "";
    const refused = params.get("error") ?? "";

    // Scrub the response from the address bar, history entry and referrer
    // source even when it is malformed: only the POST body needs it.
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (refused || !code || !state) {
      // An async function's microtask: the read above is synchronization with
      // the browser, not derived React state.
      void Promise.resolve().then(() => {
        setError(
          refused
            ? "Google sign-in was cancelled or refused. Start again from the sign-in page."
            : "This sign-in link is incomplete. Start again from the sign-in page.",
        );
        setPhase("error");
      });
      return;
    }

    void (async () => {
      try {
        const completion = await completeGoogleSignIn(code, state);
        if (completion.next === "signed_in") {
          // Session cookies are already set; refresh the shared /me query so the
          // app shell does not paint a logged-out frame after navigation.
          await checkAuth();
        }
        router.replace(completion.redirectTo);
      } catch (err: unknown) {
        setError(
          authErrorMessage(
            err,
            "We couldn't complete Google sign-in. Start again from the sign-in page.",
          ),
        );
        setPhase("error");
      }
    })();
  }, [checkAuth, router]);

  return (
    <AuthShell
      title={
        phase === "error" ? "Google sign-in didn't complete" : "Signing you in"
      }
      subtitle={
        phase === "working" ? "Finishing the secure hand-off from Google." : undefined
      }
    >
      {phase === "working" && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-secondary">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#2DD4BF" }} />
          <span className="text-sm">Checking your Google account…</span>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-4">
          <div
            role="alert"
            className="rounded-2xl px-4 py-3 text-sm"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#EF4444",
            }}
          >
            {error}
          </div>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
            }}
          >
            Back to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </AuthShell>
  );
}