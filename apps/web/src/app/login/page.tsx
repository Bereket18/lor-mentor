"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const schema = z.object({
  email:    z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError,  setServerError]  = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    setServerError("");
    try {
      const res  = await api.post("/auth/login", data);
      const user = res.data.user;
      if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") router.push("/admin");
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
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "#060B14" }}
    >
      {/* ── Animated orb background ─────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Orb 1 — teal */}
        <div
          className="absolute rounded-full"
          style={{
            width: 600,
            height: 600,
            top: "-15%",
            left: "-10%",
            background: "radial-gradient(circle, rgba(20,184,166,0.22) 0%, rgba(20,184,166,0.06) 50%, transparent 70%)",
            animation: "orbDrift1 18s ease-in-out infinite",
            filter: "blur(40px)",
          }}
        />
        {/* Orb 2 — blue */}
        <div
          className="absolute rounded-full"
          style={{
            width: 500,
            height: 500,
            bottom: "-10%",
            right: "-5%",
            background: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, rgba(14,165,233,0.05) 50%, transparent 70%)",
            animation: "orbDrift2 22s ease-in-out infinite",
            filter: "blur(50px)",
          }}
        />
        {/* Orb 3 — emerald */}
        <div
          className="absolute rounded-full"
          style={{
            width: 400,
            height: 400,
            top: "40%",
            left: "55%",
            background: "radial-gradient(circle, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.04) 50%, transparent 70%)",
            animation: "orbDrift3 26s ease-in-out infinite",
            filter: "blur(45px)",
          }}
        />
      </div>

      {/* ── Orb keyframes injected inline ─── */}
      <style>{`
        @keyframes orbDrift1 {
          0%,100% { transform: translate(0px, 0px) scale(1); }
          33%      { transform: translate(60px, 80px) scale(1.08); }
          66%      { transform: translate(-40px, 50px) scale(0.95); }
        }
        @keyframes orbDrift2 {
          0%,100% { transform: translate(0px, 0px) scale(1); }
          40%      { transform: translate(-80px, -60px) scale(1.1); }
          70%      { transform: translate(50px, -30px) scale(0.93); }
        }
        @keyframes orbDrift3 {
          0%,100% { transform: translate(0px, 0px) scale(1); }
          50%      { transform: translate(-60px, 70px) scale(1.12); }
        }
        @keyframes glassSheen {
          0%   { left: -100%; }
          100% { left: 200%;  }
        }
      `}</style>

      {/* ── ThemeToggle — absolute top-right ──────────────────── */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle variant="pill" />
      </div>

      {/* ── Glass card ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full mx-4 sm:mx-auto"
        style={{
          maxWidth: 420,
          borderRadius: 28,
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.16)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 32px rgba(0,0,0,0.45), 0 32px 64px rgba(0,0,0,0.3)",
        }}
      >
        {/* Inner top highlight arc */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 right-0"
          style={{
            height: 1,
            borderRadius: "28px 28px 0 0",
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 40%, rgba(45,212,191,0.4) 60%, transparent 100%)",
          }}
        />

        <div className="px-8 pt-9 pb-8">
          {/* ── Logo ─────────────────────────────────────────── */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{
                background: "linear-gradient(135deg, #147878 0%, #1A9494 60%, #2DD4BF 100%)",
                boxShadow: "0 0 28px rgba(45,212,191,0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              <span className="text-white font-bold text-xl tracking-tight">L</span>
            </div>
            <p className="text-white font-bold text-base tracking-widest uppercase leading-none">
              LOR MENTOR
            </p>
            <p className="text-[11px] font-medium mt-1 tracking-wider" style={{ color: "#2DD4BF", opacity: 0.75 }}>
              LORCAN MEDICAL COLLEGE
            </p>
          </div>

          {/* ── Heading ──────────────────────────────────────── */}
          <h1 className="text-white text-xl font-bold text-center mb-1" style={{ letterSpacing: "-0.02em" }}>
            Sign in to your account
          </h1>
          <p className="text-center text-sm mb-7" style={{ color: "rgba(255,255,255,0.45)" }}>
            Welcome back — let&apos;s continue learning
          </p>

          {/* ── Server error ─────────────────────────────────── */}
          {serverError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl px-4 py-3 text-sm mb-5"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#FCA5A5",
                backdropFilter: "blur(8px)",
              }}
            >
              {serverError}
            </motion.div>
          )}

          {/* ── Form ─────────────────────────────────────────── */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>
                Email Address
              </label>
              <GlassInput
                {...register("email")}
                type="email"
                placeholder="you@lorcan.edu.et"
                hasError={!!errors.email}
              />
              {errors.email && (
                <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>
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
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  hasError={!!errors.password}
                  style={{ paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)"; }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileTap={{ scale: 0.98 }}
              className="group relative w-full py-3 mt-2 rounded-2xl flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all duration-200 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
                boxShadow: isSubmitting ? "none" : "0 0 24px rgba(20,184,166,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.boxShadow = "0 0 40px rgba(45,212,191,0.55), 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 24px rgba(20,184,166,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {/* Sheen overlay */}
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-1/3"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
                  animation: "glassSheen 3s ease-in-out infinite",
                }}
              />
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>
              ) : (
                <>Sign in to Lor Mentor<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" /></>
              )}
            </motion.button>
          </form>

          {/* ── Sign up link ──────────────────────────────────── */}
          <p className="text-center text-sm mt-5" style={{ color: "rgba(255,255,255,0.4)" }}>
            New to Lor Mentor?{" "}
            <Link href="/register" className="font-semibold transition-colors hover:opacity-80" style={{ color: "#2DD4BF" }}>
              Create an account
            </Link>
          </p>

          {/* ── Divider ───────────────────────────────────────── */}
          <div className="mt-7 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-center text-[11px] font-medium mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
              Lorcan Medical College · CMC Square, Addis Ababa
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>📞 +251 11 863 4387</span>
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>✉️ lorcancm@gmail.com</span>
              <a
                href="https://lorcancm.edu.et"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] transition-colors hover:opacity-70"
                style={{ color: "rgba(45,212,191,0.5)" }}
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

/* ── Glass input component ─────────────────────────────────────── */
import React from "react";

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  function GlassInput({ hasError, style, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-all duration-200"
        style={{
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          background: "rgba(255,255,255,0.06)",
          border: hasError
            ? "1px solid rgba(239,68,68,0.45)"
            : "1px solid rgba(255,255,255,0.12)",
          ...style,
        }}
        onFocus={(e) => {
          if (!hasError) {
            e.currentTarget.style.border = "1px solid rgba(45,212,191,0.6)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(45,212,191,0.12), 0 0 20px rgba(45,212,191,0.08)";
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          }
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.border = hasError
            ? "1px solid rgba(239,68,68,0.45)"
            : "1px solid rgba(255,255,255,0.12)";
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          props.onBlur?.(e);
        }}
      />
    );
  },
);
