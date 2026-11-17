"use client";

import React from "react";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { BrandLogo } from "@/components/shared/brand-logo";

/**
 * Shared frame for the passwordless pages: the same glass card, orb background
 * and theme tokens the password login page uses, so the sign-in surfaces feel
 * like one flow rather than three unrelated screens.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  maxWidth = 440,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      suppressHydrationWarning
      className="min-h-screen flex items-center justify-center relative overflow-hidden py-8 auth-bg"
    >
      <style>{`
        .auth-bg { background: var(--bg-base); }

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

      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle variant="pill" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full mx-4 sm:mx-auto"
        style={{
          maxWidth,
          borderRadius: 28,
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          background: "var(--glass-card-bg)",
          border: "1px solid var(--glass-card-border)",
          boxShadow: "var(--glass-card-shadow)",
        }}
      >
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

          <h1
            className="text-primary text-xl font-bold text-center mb-1"
            style={{ letterSpacing: "-0.02em" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-center text-sm text-secondary mb-7">{subtitle}</p>
          )}

          {children}

          <div
            className="mt-7 pt-6"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <p className="text-center text-[11px] font-medium mb-2 text-muted">
              Lorcan Medical College · CMC Square, Addis Ababa
            </p>
            <p className="text-center text-[11px] text-muted">
              Need help? lorcancm@gmail.com
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Shared glass input styling for the passwordless forms. */
export const GlassInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>(function GlassInput({ hasError, style, onFocus, onBlur, ...props }, ref) {
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
      onFocus={(event) => {
        if (!hasError) {
          event.currentTarget.style.border = "1px solid rgba(45,212,191,0.6)";
          event.currentTarget.style.boxShadow =
            "0 0 0 3px rgba(45,212,191,0.12), 0 0 20px rgba(45,212,191,0.08)";
        }
        onFocus?.(event);
      }}
      onBlur={(event) => {
        event.currentTarget.style.border = hasError
          ? "1px solid rgba(239,68,68,0.5)"
          : "1px solid var(--glass-input-border)";
        event.currentTarget.style.boxShadow = "none";
        onBlur?.(event);
      }}
    />
  );
});

/** Shared primary button styling. */
export function AuthButton({
  children,
  loading,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      disabled={disabled || loading}
      {...(props as React.ComponentProps<typeof motion.button>)}
      className="group relative w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all duration-200 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background:
          "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
        boxShadow:
          "0 0 24px rgba(20,184,166,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
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
      {children}
    </motion.button>
  );
}

/** Inline error banner, matching the password login page. */
export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-2xl px-4 py-3 text-sm mb-5"
      style={{
        background: "rgba(239,68,68,0.1)",
        border: "1px solid rgba(239,68,68,0.25)",
        color: "#EF4444",
      }}
    >
      {message}
    </div>
  );
}
