"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowRight, Mail } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { BrandLogo } from "@/components/shared/brand-logo";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  authErrorMessage,
  getAuthMethods,
  resendEmailSignIn,
  startEmailSignIn,
  submitEmailCode,
  type PasswordlessCompletion,
} from "@/lib/auth-passwordless";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

/* -- Glass input — works in both dark and light mode ----------- */
interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  function GlassInput({ hasError, style, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
        style={{
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          background: "var(--glass-input-bg)",
          border: hasError
            ? "1px solid rgba(239,68,68,0.5)"
            : "1px solid var(--glass-input-border)",
          color: "var(--text-primary)",
          ...style,
        }}
        onFocus={(e) => {
          if (!hasError) {
            e.currentTarget.style.border = "1px solid rgba(45,212,191,0.6)";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px rgba(45,212,191,0.12), 0 0 20px rgba(45,212,191,0.08)";
          }
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.border = hasError
            ? "1px solid rgba(239,68,68,0.5)"
            : "1px solid var(--glass-input-border)";
          e.currentTarget.style.boxShadow = "none";
          props.onBlur?.(e);
        }}
      />
    );
  },
);

/* -- Page ------------------------------------------------------- */
export default function LoginPage() {
  const router = useRouter();
  const { login, checkAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Keep submit disabled until React has hydrated. Otherwise a tap on a slow
  // phone falls back to the browser's native form submit and puts the
  // credentials in the URL as a GET query string.
  const mounted = useHydrated();

  // ── Passwordless state ──
  // The flag is read from the API, not baked into the bundle: a disabled method
  // must not render an entry point that the server will refuse.
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [mode, setMode] = useState<"password" | "email">("password");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getAuthMethods()
      .then((methods) => {
        if (active) setEmailEnabled(methods.emailLinkEnabled);
      })
      .catch(() => {
        // The password form must keep working if the flag endpoint is down.
        if (active) setEmailEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Resend cooldown: the server enforces the same 60 seconds; this only stops
  // pointless clicks and network noise.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  function switchMode(next: "password" | "email") {
    if (isSubmitting || emailBusy) return;
    setMode(next);
    setServerError("");
    setNotice("");
  }

  async function finishPasswordless(completion: PasswordlessCompletion) {
    if (completion.next === "signed_in") {
      // Session cookies are already set; refresh the shared /me query so the
      // app shell does not paint a logged-out frame after navigation.
      await checkAuth();
    }
    router.push(completion.redirectTo);
  }

  async function onEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emailBusy) return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setServerError("Please enter a valid email address");
      return;
    }
    setEmailBusy(true);
    setServerError("");
    setNotice("");
    try {
      const returnTo =
        new URLSearchParams(window.location.search).get("redirect") ?? undefined;
      const result = await startEmailSignIn(trimmed, returnTo);
      setEmail(trimmed);
      setChallengeId(result.challengeId);
      setCooldown(result.retryAfterSeconds);
      setCode("");
      setNotice(result.message);
    } catch (err: unknown) {
      setServerError(authErrorMessage(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function onCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeId || emailBusy) return;
    if (!/^\d{6}$/.test(code)) {
      setServerError("Enter the six-digit code from the email");
      return;
    }
    setEmailBusy(true);
    setServerError("");
    try {
      const completion = await submitEmailCode(challengeId, code);
      await finishPasswordless(completion);
    } catch (err: unknown) {
      setServerError(
        authErrorMessage(
          err,
          "We couldn't complete sign-in. Request a new email and try again.",
        ),
      );
      setEmailBusy(false);
    }
  }

  async function onResend() {
    if (!challengeId || emailBusy || cooldown > 0) return;
    setEmailBusy(true);
    setServerError("");
    try {
      const result = await resendEmailSignIn(challengeId);
      setChallengeId(result.challengeId);
      setCooldown(result.retryAfterSeconds);
      setCode("");
      setNotice(result.message);
    } catch (err: unknown) {
      setServerError(authErrorMessage(err));
    } finally {
      setEmailBusy(false);
    }
  }

  function useDifferentEmail() {
    setChallengeId(null);
    setCode("");
    setCooldown(0);
    setNotice("");
    setServerError("");
  }

  async function onSubmit(data: FormData) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setServerError("");
    try {
      const res = await login(data.email, data.password);
      const user = res.user;
      if (user.role === "ADMIN" || user.role === "SUPER_ADMIN")
        router.push("/admin");
      else if (user.role === "TEACHER") router.push("/teacher");
      else router.push("/dashboard");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setServerError(err?.response?.data?.message ?? "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      suppressHydrationWarning
      className="min-h-screen flex items-center justify-center relative overflow-hidden auth-bg"
    >
      {/* -- CSS for auth pages: orb animations + glass tokens -- */}
      <style>{`
        .auth-bg { background: var(--bg-base); }

        /* Glass tokens that adapt to light/dark */
        :root {
          --glass-card-bg:      rgba(255,255,255,0.07);
          --glass-card-border:  rgba(255,255,255,0.16);
          --glass-input-bg:     rgba(255,255,255,0.06);
          --glass-input-border: rgba(255,255,255,0.14);
          --glass-card-shadow:  inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 32px rgba(0,0,0,0.45), 0 32px 64px rgba(0,0,0,0.3);
        }
        [data-theme="light"] {
          --glass-card-bg:      rgba(255,255,255,0.72);
          --glass-card-border:  rgba(0,0,0,0.08);
          --glass-input-bg:     rgba(255,255,255,0.8);
          --glass-input-border: rgba(0,0,0,0.1);
          --glass-card-shadow:  inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 32px rgba(0,0,0,0.12), 0 32px 64px rgba(0,0,0,0.08);
        }

        /* Orb animations */
        @keyframes orbDrift1 {
          0%,100% { transform: translate(0px,0px) scale(1); }
          33%      { transform: translate(60px,80px) scale(1.08); }
          66%      { transform: translate(-40px,50px) scale(0.95); }
        }
        @keyframes orbDrift2 {
          0%,100% { transform: translate(0px,0px) scale(1); }
          40%      { transform: translate(-80px,-60px) scale(1.1); }
          70%      { transform: translate(50px,-30px) scale(0.93); }
        }
        @keyframes orbDrift3 {
          0%,100% { transform: translate(0px,0px) scale(1); }
          50%      { transform: translate(-60px,70px) scale(1.12); }
        }
        @keyframes glassSheen {
          0%   { left: -100%; }
          100% { left: 200%; }
        }
      `}</style>

      {/* -- Animated orb background --------------------------- */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute rounded-full"
          style={{
            width: 600,
            height: 600,
            top: "-15%",
            left: "-10%",
            background:
              "radial-gradient(circle, rgba(20,184,166,0.2) 0%, rgba(20,184,166,0.05) 50%, transparent 70%)",
            animation: "orbDrift1 18s ease-in-out infinite",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 500,
            height: 500,
            bottom: "-10%",
            right: "-5%",
            background:
              "radial-gradient(circle, rgba(14,165,233,0.16) 0%, rgba(14,165,233,0.04) 50%, transparent 70%)",
            animation: "orbDrift2 22s ease-in-out infinite",
            filter: "blur(50px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 400,
            height: 400,
            top: "40%",
            left: "55%",
            background:
              "radial-gradient(circle, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.03) 50%, transparent 70%)",
            animation: "orbDrift3 26s ease-in-out infinite",
            filter: "blur(45px)",
          }}
        />
      </div>

      {/* -- ThemeToggle ----------------------------------------- */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle variant="pill" />
      </div>

      {/* -- Glass card ------------------------------------------ */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full mx-4 sm:mx-auto"
        style={{
          maxWidth: 420,
          borderRadius: 28,
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          background: "var(--glass-card-bg)",
          border: "1px solid var(--glass-card-border)",
          boxShadow: "var(--glass-card-shadow)",
        }}
      >
        {/* Chromatic top highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 right-0"
          style={{
            height: 1,
            borderRadius: "28px 28px 0 0",
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 40%, rgba(45,212,191,0.4) 60%, transparent 100%)",
          }}
        />

        <div className="px-8 pt-9 pb-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <BrandLogo
              variant="full"
              size={144}
              priority
              className="mb-2 rounded-2xl ring-1 ring-white/10"
            />
            <p className="font-bold text-sm tracking-[0.22em] uppercase leading-none text-primary">
              LOR MENTOR
            </p>
          </div>

          {/* Heading */}
          <h1
            className="text-primary text-xl font-bold text-center mb-1"
            style={{ letterSpacing: "-0.02em" }}
          >
            {challengeId
              ? "Check your email"
              : mode === "email"
                ? "Continue with email"
                : "Sign in to your account"}
          </h1>
          <p className="text-center text-sm text-secondary mb-5">
            {challengeId ? (
              <>
                We sent a sign-in link and a six-digit code to{" "}
                <strong className="text-primary break-all">{email}</strong>
              </>
            ) : mode === "email" ? (
              "We'll email you a link and a six-digit code."
            ) : (
              "Welcome back let's continue learning"
            )}
          </p>

          {/* Method switch — only when the API says email sign-in is enabled */}
          {emailEnabled && !challengeId && (
            <div
              role="group"
              aria-label="Sign-in method"
              className="grid grid-cols-2 gap-1 p-1 rounded-2xl mb-5"
              style={{
                background: "var(--glass-input-bg)",
                border: "1px solid var(--glass-input-border)",
              }}
            >
              <button
                type="button"
                aria-pressed={mode === "password"}
                onClick={() => switchMode("password")}
                disabled={isSubmitting || emailBusy}
                className="py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60"
                style={{
                  background:
                    mode === "password" ? "rgba(45,212,191,0.16)" : "transparent",
                  color: mode === "password" ? "#2DD4BF" : "var(--text-secondary)",
                }}
              >
                Password
              </button>
              <button
                type="button"
                aria-pressed={mode === "email"}
                onClick={() => switchMode("email")}
                disabled={isSubmitting || emailBusy}
                className="py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60"
                style={{
                  background:
                    mode === "email" ? "rgba(45,212,191,0.16)" : "transparent",
                  color: mode === "email" ? "#2DD4BF" : "var(--text-secondary)",
                }}
              >
                Email link or code
              </button>
            </div>
          )}

          {/* Server error */}
          {serverError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl px-4 py-3 text-sm mb-5"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#EF4444",
              }}
            >
              {serverError}
            </motion.div>
          )}

          {/* Password form — the default, unchanged path */}
          {mode === "password" && (
          <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="block text-[11px] font-semibold tracking-widest uppercase text-secondary"
              >
                Email Address
              </label>
              <GlassInput
                id="login-email"
                {...register("email")}
                type="email"
                placeholder="you@lorcan.edu.et"
                hasError={!!errors.email}
                disabled={isSubmitting}
              />
              {errors.email && (
                <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="block text-[11px] font-semibold tracking-widest uppercase text-secondary"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium transition-colors hover:opacity-80"
                  style={{ color: "#2DD4BF" }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <GlassInput
                  id="login-password"
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  hasError={!!errors.password}
                  disabled={isSubmitting}
                  style={{ paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={!mounted || isSubmitting}
              whileTap={{ scale: 0.98 }}
              className="group relative w-full py-3 mt-2 rounded-2xl flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all duration-200 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background:
                  "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
                boxShadow: isSubmitting
                  ? "none"
                  : "0 0 24px rgba(20,184,166,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.boxShadow =
                    "0 0 40px rgba(45,212,191,0.55), 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 0 24px rgba(20,184,166,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-1/3"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
                  animation: "glassSheen 3s ease-in-out infinite",
                }}
              />
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in to Lor Mentor
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </motion.button>
          </form>
          )}

          {/* Email sign-in: address step */}
          {mode === "email" && !challengeId && (
            <form onSubmit={onEmailSubmit} method="post" className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email-link"
                  className="block text-[11px] font-semibold tracking-widest uppercase text-secondary"
                >
                  Email Address
                </label>
                <GlassInput
                  id="login-email-link"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@lorcan.edu.et"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={emailBusy}
                />
              </div>

              <motion.button
                type="submit"
                disabled={!mounted || emailBusy}
                whileTap={{ scale: 0.98 }}
                className="group relative w-full py-3 mt-2 rounded-2xl flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all duration-200 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background:
                    "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
                  boxShadow:
                    "0 0 24px rgba(20,184,166,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                {emailBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Email me a sign-in link
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </motion.button>

              <button
                type="button"
                onClick={() => switchMode("password")}
                disabled={emailBusy}
                className="w-full text-center text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-60"
                style={{ color: "#2DD4BF" }}
              >
                Use my password instead
              </button>
            </form>
          )}

          {/* Email sign-in: waiting for the code */}
          {mode === "email" && challengeId && (
            <div className="space-y-4">
              {notice && (
                <div
                  role="status"
                  className="rounded-2xl px-4 py-3 text-xs"
                  style={{
                    background: "rgba(20,184,166,0.08)",
                    border: "1px solid rgba(20,184,166,0.22)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {notice}
                </div>
              )}

              <form onSubmit={onCodeSubmit} method="post" className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-code"
                    className="block text-[11px] font-semibold tracking-widest uppercase text-secondary"
                  >
                    Six-digit code
                  </label>
                  <GlassInput
                    id="login-code"
                    type="text"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    disabled={emailBusy}
                    style={{
                      letterSpacing: "0.4em",
                      textAlign: "center",
                      fontSize: 20,
                      fontFamily:
                        "'Courier New', Courier, monospace",
                    }}
                  />
                  <p className="text-[11px] text-muted">
                    Enter the code on the device where you started. If you opened
                    the link on another device, use &ldquo;Continue here&rdquo;
                    there instead.
                  </p>
                </div>

                <motion.button
                  type="submit"
                  disabled={!mounted || emailBusy || code.length !== 6}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background:
                      "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
                    boxShadow:
                      "0 0 24px rgba(20,184,166,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                >
                  {emailBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </motion.button>
              </form>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={onResend}
                  disabled={emailBusy || cooldown > 0}
                  className="text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ color: "#2DD4BF" }}
                >
                  {cooldown > 0
                    ? `Send a new email in ${cooldown}s`
                    : "Send a new email"}
                </button>
                <button
                  type="button"
                  onClick={useDifferentEmail}
                  disabled={emailBusy}
                  className="text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 text-secondary"
                >
                  Use a different email
                </button>
              </div>
            </div>
          )}

          {!challengeId && (
            <p className="text-center text-sm mt-5 text-secondary">
              New to Lor Mentor?{" "}
              <Link
                href="/register"
                className="font-semibold transition-colors hover:opacity-80"
                style={{ color: "#2DD4BF" }}
              >
                Create an account
              </Link>
            </p>
          )}

          {/* Address footer */}
          <div
            className="mt-7 pt-6"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <p className="text-center text-[11px] font-medium mb-2 text-muted">
              Lorcan Medical College · CMC Square, Addis Ababa
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="text-[11px] text-muted">
                📞 +251 11 863 4387
              </span>
              <span className="text-[11px] text-muted">
                ✉️ lorcancm@gmail.com
              </span>
              <a
                href="https://lorcancm.edu.et"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] transition-colors hover:opacity-70"
                style={{ color: "#2DD4BF" }}
              >
                🌐 lorcancm.edu.et
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
