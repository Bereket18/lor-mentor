"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  AuthButton,
  AuthError,
  AuthShell,
} from "@/components/auth/auth-shell";
import {
  authErrorMessage,
  confirmEmailLink,
  getAuthMethods,
  isMethodUnavailable,
  type PasswordlessCompletion,
} from "@/lib/auth-passwordless";

type Phase = "reading" | "ready" | "unavailable" | "incomplete";

/**
 * The page an emailed sign-in link opens.
 *
 * Security properties this page is responsible for:
 *
 *  - The link secret arrives in the URL fragment. Fragments are never sent to
 *    the server, so this text is captured into memory and immediately removed
 *    from the address bar. It is not put in storage, a query string or a log.
 *  - Nothing is submitted on load or hydration. A mail scanner that fetches the
 *    URL only ever sees this inert page; signing in requires a deliberate click
 *    on "Continue here".
 *  - The choice to sign in on this device is explicit in the request body
 *    (`destination: "current-browser"`). Merely opening the message does not
 *    move a session anywhere.
 */
export default function EmailConfirmPage() {
  const router = useRouter();
  const { checkAuth } = useAuth();
  const captured = useRef(false);

  const [phase, setPhase] = useState<Phase>("reading");
  const [proof, setProof] = useState<{ challengeId: string; token: string } | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // React Strict Mode runs effects twice in development. The first run
    // removes the fragment, so without this guard the second run would see an
    // empty hash and wrongly report an incomplete link.
    if (captured.current) return;
    captured.current = true;

    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(rawHash);
    const challengeId = params.get("challenge") ?? "";
    const token = params.get("token") ?? "";

    // Scrub the secret even when it is malformed: a partially copied link must
    // not sit in the address bar, history entry or referrer source.
    if (rawHash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }

    if (!challengeId || !token) {
      // Reading the URL fragment is synchronization with a browser-owned
      // external system, not derived React state, so this one synchronous
      // update is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("incomplete");
      return;
    }
    setProof({ challengeId, token });

    getAuthMethods()
      .then((methods) => {
        setPhase(methods.emailLinkEnabled ? "ready" : "unavailable");
      })
      .catch((err: unknown) => {
        // A 503 means the method is off. A transport error still lets the user
        // try: the POST surfaces the real state without revealing anything else.
        setPhase(isMethodUnavailable(err) ? "unavailable" : "ready");
      });
  }, []);

  async function handleCompletion(completion: PasswordlessCompletion) {
    if (completion.next === "signed_in") {
      // The session cookies are already set. Refresh the shared /me query so
      // the app shell does not render a logged-out frame after navigation.
      await checkAuth();
      router.replace(completion.redirectTo);
      return;
    }
    router.replace(completion.redirectTo);
  }

  async function onContinue() {
    if (!proof || confirming) return;
    setConfirming(true);
    setError("");
    try {
      const completion = await confirmEmailLink(proof.challengeId, proof.token);
      await handleCompletion(completion);
    } catch (err: unknown) {
      setError(
        authErrorMessage(
          err,
          "We couldn't complete sign-in. Request a new email and try again.",
        ),
      );
      setConfirming(false);
    }
  }

  return (
    <AuthShell
      title={
        phase === "unavailable"
          ? "Email sign-in is unavailable"
          : phase === "incomplete"
            ? "This link is incomplete"
            : "Confirm sign-in"
      }
      subtitle={
        phase === "ready"
          ? "Only continue if you requested this email."
          : undefined
      }
    >
      {phase === "reading" && (
        <div className="flex items-center justify-center py-10 text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="sr-only">Reading the confirmation link</span>
        </div>
      )}

      {phase === "unavailable" && (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            Email sign-in is not enabled right now. Use your password to sign in,
            or contact the college if you need help with your account.
          </p>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
            }}
          >
            Go to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {phase === "incomplete" && (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            The address did not include a complete sign-in handle. Email clients
            sometimes shorten links — open the message again and use the full
            link, or enter the six-digit code on the device where you started.
          </p>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
            }}
          >
            Go to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {phase === "ready" && (
        <div className="space-y-5">
          <div
            className="rounded-2xl px-4 py-3 text-sm flex items-start gap-3"
            style={{
              background: "rgba(20,184,166,0.08)",
              border: "1px solid rgba(20,184,166,0.22)",
              color: "var(--text-secondary)",
            }}
          >
            <MailCheck
              className="h-5 w-5 shrink-0 mt-0.5"
              style={{ color: "#2DD4BF" }}
            />
            <span>
              This email contains a sign-in link and a six-digit code. You can use
              either one, once.
            </span>
          </div>

          <AuthError message={error} />

          <div className="space-y-3">
            <AuthButton loading={confirming} onClick={onContinue} type="button">
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Continue here
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </AuthButton>
            <p className="text-[11px] text-center text-muted">
              Sign in on this device. Only continue if you requested this email.
            </p>
          </div>

          <div
            className="rounded-2xl px-4 py-4 text-sm space-y-2"
            style={{
              background: "var(--glass-input-bg)",
              border: "1px solid var(--glass-input-border)",
            }}
          >
            <p className="font-semibold text-primary">
              Signing in on another device?
            </p>
            <p className="text-secondary">
              Enter the six-digit code from the email on the device where you
              started. You can leave this page open or close it — opening the
              link does not sign you in.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: "#2DD4BF" }}
            >
              Go to code entry
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
