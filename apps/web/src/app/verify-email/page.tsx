"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { BrandLogo } from "@/components/shared/brand-logo";
import {
  MAX_VERIFICATION_ATTEMPTS,
  VERIFICATION_CODE_LENGTH,
  isCompleteVerificationCode,
  resendCooldownRemaining,
  sanitizeVerificationCode,
} from "@/lib/verification-code";

const GENERIC_FAILURE =
  "That verification code is incorrect or has expired. Request a new code.";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Arrives pre-filled from registration (/verify-email?email=...) but is
  // editable, because someone who opens this page directly has to be able to
  // say which account they are verifying.
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Failed attempts against the code currently in hand. Every one of them was
  // recorded by the API, so this reaching the limit means the code is burned
  // server-side and the correct digits will no longer work either.
  const [attempts, setAttempts] = useState(0);
  const codeIsBurned = attempts >= MAX_VERIFICATION_ATTEMPTS;

  const [sentAt, setSentAt] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  const cooldown = resendCooldownRemaining(sentAt, now);

  // Tick only while a cooldown is actually running, and stop once it expires.
  useEffect(() => {
    if (sentAt === undefined) return;

    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (resendCooldownRemaining(sentAt, current) === 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [sentAt]);

  const verifyCode = useCallback(
    async (value: string) => {
      const address = email.trim();

      if (!address || !address.includes("@")) {
        setError("Enter the email address you registered with");
        return;
      }
      if (!isCompleteVerificationCode(value)) {
        setError(
          `Enter the ${VERIFICATION_CODE_LENGTH}-digit code from your email`,
        );
        return;
      }

      setLoading(true);
      setError("");

      try {
        await api.post("/auth/verify-email", { email: address, code: value });
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2000);
      } catch (err: unknown) {
        const message = (
          err as { response?: { data?: { message?: string } } }
        )?.response?.data?.message;
        setError(message ?? GENERIC_FAILURE);
        setAttempts((previous) => previous + 1);
      } finally {
        setLoading(false);
      }
    },
    [email, router],
  );

  function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verifyCode(code);
  }

  async function handleResend() {
    const address = email.trim();
    if (!address || !address.includes("@")) {
      setResendError("Enter the email address used for registration");
      setResendMessage("");
      return;
    }

    setResending(true);
    setResendError("");
    setResendMessage("");
    try {
      const response = await api.post("/auth/resend-verification", {
        email: address,
      });
      setResendMessage(response.data.message);
      setSentAt(Date.now());
      // A new code arrives with a fresh attempt budget, so the old count — and
      // the "this code is used up" state it produced — no longer apply.
      setAttempts(0);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setResendError(
        message ?? "Could not send a new code. Please try again.",
      );
    } finally {
      setResending(false);
    }
  }

  if (success) {
    return (
      <div
        className="min-h-screen bg-base flex items-center
        justify-center p-6"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-sm"
        >
          <div
            className="w-16 h-16 bg-green-100 rounded-full
            flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-primary mb-2">
            Email verified!
          </h2>
          <p className="text-secondary text-sm">Redirecting you to login...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-base flex items-center
      justify-center p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center gap-2.5 mb-8">
          <BrandLogo variant="mark" size={36} alt="" />
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">
            LOR MENTOR
          </span>
        </div>

        {/* Icon */}
        <div
          className="w-14 h-14 bg-brand-100 rounded-2xl
          flex items-center justify-center mb-6"
        >
          <Mail className="h-7 w-7 text-accent" />
        </div>

        <h2 className="text-2xl font-bold text-primary mb-2">
          Check your email
        </h2>
        <p className="text-secondary text-sm mb-6 leading-relaxed">
          We sent a {VERIFICATION_CODE_LENGTH}-digit verification code to{" "}
          {email.trim() ? (
            <span className="font-medium text-primary">{email.trim()}</span>
          ) : (
            "your email address"
          )}
          . Enter it below to verify your account.
        </p>

        {/* Steps */}
        <div className="card mb-6 space-y-3">
          {[
            "Open your email inbox",
            "Find the email from Lor Mentor",
            `Enter the ${VERIFICATION_CODE_LENGTH}-digit code below`,
            "Sign in after verification succeeds",
          ].map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-full bg-accent
                text-white text-xs font-bold flex items-center
                justify-center flex-shrink-0"
              >
                {i + 1}
              </div>
              <span className="text-sm text-secondary">{step}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleVerify}>
          {/* Email */}
          <div className="mb-4">
            <label
              htmlFor="verification-email"
              className="block text-sm font-medium
              text-primary mb-1.5"
            >
              Email address
            </label>
            <input
              id="verification-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full bg-surface border border-border
                rounded-xl px-4 py-3 text-sm text-primary
                placeholder:text-muted
                focus:outline-none focus:ring-2
                focus:ring-accent focus:border-transparent
                transition-all"
            />
          </div>

          {/* Code */}
          <div className="mb-4">
            <label
              htmlFor="verification-code"
              className="block text-sm font-medium
              text-primary mb-1.5"
            >
              Verification code
            </label>
            <input
              id="verification-code"
              type="text"
              value={code}
              onChange={(event) =>
                setCode(sanitizeVerificationCode(event.target.value))
              }
              placeholder={"0".repeat(VERIFICATION_CODE_LENGTH)}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby="verification-code-hint"
              aria-invalid={error ? true : undefined}
              // Deliberately no `maxLength`: the browser would truncate a raw
              // paste to the limit, so " 428193" would become " 42819" and lose
              // its last digit. Cleaning the value in onChange truncates what
              // is left after the non-digits are removed, which cannot lose a
              // digit that way.
              className="w-full bg-surface border border-border
                rounded-xl px-4 py-3 text-lg text-primary
                placeholder:text-muted font-mono tracking-[0.4em]
                focus:outline-none focus:ring-2
                focus:ring-accent focus:border-transparent
                transition-all"
            />
            <p
              id="verification-code-hint"
              className="text-xs text-muted mt-1.5"
            >
              {VERIFICATION_CODE_LENGTH} digits, from the email we just sent.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-red-500 text-xs mb-3">
              {error}
            </p>
          )}

          {codeIsBurned && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-border
              bg-surface p-3"
            >
              <p className="text-sm text-primary font-medium mb-1">
                This code can no longer be used
              </p>
              <p className="text-xs text-secondary">
                Too many incorrect attempts. Send a new code and we will email
                you a fresh {VERIFICATION_CODE_LENGTH}-digit one.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || codeIsBurned}
            className="w-full bg-accent hover:bg-accent-hover
              text-white font-semibold rounded-xl py-3
              flex items-center justify-center gap-2
              transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify email"
            )}
          </button>
        </form>

        <div className="border-t border-border pt-4 mt-5 mb-5">
          <p className="text-sm font-medium text-primary mb-2">
            Didn&apos;t get the code?
          </p>
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resending || cooldown > 0}
            className="w-full border border-border bg-surface
              hover:bg-surface-hover text-primary font-medium rounded-lg
              px-4 py-2.5 text-sm flex items-center justify-center gap-2
              transition-colors disabled:opacity-60
              disabled:cursor-not-allowed"
          >
            {resending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {resending
              ? "Sending..."
              : cooldown > 0
                ? `Send a new code in ${cooldown}s`
                : "Send a new code"}
          </button>
          {resendMessage && (
            <p role="status" className="text-green-600 text-xs mt-2">
              {resendMessage}
            </p>
          )}
          {resendError && (
            <p role="alert" className="text-red-500 text-xs mt-2">
              {resendError}
            </p>
          )}
        </div>

        <p className="text-center text-sm text-secondary">
          Already verified?{" "}
          <Link
            href="/login"
            className="text-accent hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
