"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowRight, Sparkles, GraduationCap, Brain, Layers } from "lucide-react";
import api from "@/lib/api";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

// Feature highlights shown on the left panel
const features = [
  { icon: Brain,       label: "AI Tutor",        sub: "Course-aware, 24/7 available" },
  { icon: GraduationCap, label: "Smart Quizzes", sub: "Exam-ready practice sets" },
  { icon: Layers,      label: "Flashcards",       sub: "Auto-generated from your PDFs" },
];

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError]   = useState("");
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
    <div suppressHydrationWarning className="min-h-screen flex bg-base relative overflow-hidden">

      {/* ── Background mesh gradient ──────────────────────────── */}
      <div
        suppressHydrationWarning
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% -10%, rgba(20,184,166,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 110%, rgba(14,165,233,0.14) 0%, transparent 60%)
          `,
        }}
      />

      {/* ── Left panel — glassy brand panel ──────────────────── */}
      <div
        className="hidden lg:flex lg:w-[440px] xl:w-[480px] flex-shrink-0 flex-col justify-between p-10 xl:p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(10,26,26,0.97) 0%, rgba(13,59,59,0.92) 50%, rgba(20,120,120,0.85) 100%)",
          borderRight: "1px solid rgba(45,212,191,0.15)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Mesh glow inside panel */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 100% 60% at 50% 0%, rgba(45,212,191,0.12) 0%, transparent 70%),
              radial-gradient(ellipse 80% 80% at 100% 100%, rgba(20,184,166,0.10) 0%, transparent 60%)
            `,
          }}
        />

        {/* Dot grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(45,212,191,0.4) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* ── Logo + School name ────────────────────────── */}
          <div className="mb-12">
            {/* Logo mark */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #147878 0%, #1A9494 100%)",
                  boxShadow: "0 0 24px rgba(45,212,191,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <span className="text-white font-bold text-lg tracking-tight">L</span>
              </div>
              <div>
                <p className="text-white font-bold text-base tracking-wide leading-none">
                  LOR MENTOR
                </p>
                <p style={{ color: "#2DD4BF" }} className="text-[11px] font-medium mt-0.5 tracking-wider">
                  LORCAN MEDICAL COLLEGE
                </p>
              </div>
            </div>

            {/* Separator */}
            <div
              className="h-px w-full mt-4"
              style={{ background: "linear-gradient(90deg, rgba(45,212,191,0.4) 0%, transparent 100%)" }}
            />
          </div>

          {/* ── Headline ─────────────────────────────────── */}
          <div className="mb-10">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-white font-display text-3xl xl:text-4xl font-bold leading-[1.15] mb-4"
            >
              Welcome back to your{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #2DD4BF 0%, #14B8A6 60%, #0EA5E9 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                medical workspace
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="text-white/50 text-sm leading-relaxed"
            >
              Ethiopia&apos;s most advanced AI-powered medical learning platform,
              built for Lorcan Medical College students.
            </motion.p>
          </div>

          {/* ── Feature cards ────────────────────────────── */}
          <div className="space-y-3 flex-1">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: "rgba(45,212,191,0.06)",
                  border: "1px solid rgba(45,212,191,0.12)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(45,212,191,0.15)" }}
                >
                  <f.icon className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                </div>
                <div>
                  <p className="text-white text-sm font-medium leading-none mb-0.5">{f.label}</p>
                  <p className="text-white/40 text-xs">{f.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Footer ───────────────────────────────────── */}
          <div className="mt-8 pt-6" style={{ borderTop: "1px solid rgba(45,212,191,0.1)" }}>
            <p className="text-white/50 text-xs font-medium mb-2">Lorcan Medical College</p>
            <div className="space-y-1">
              <a href="https://lorcancm.edu.et" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-[11px] transition-colors">
                🌐 lorcancm.edu.et
              </a>
              <p className="text-white/30 text-[11px]">📞 +251 11 863 4387 / +251 91 196 0059</p>
              <p className="text-white/30 text-[11px]">✉️ lorcancm@gmail.com</p>
              <p className="text-white/20 text-[10px] mt-1.5">CMC Square, behind Tsehay Real Estate,<br />beside ICMC Hospital · Addis Ababa</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — login form ──────────────────────────── */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Top bar with theme toggle */}
        <div className="flex items-center justify-between px-6 py-4">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #147878, #1A9494)" }}
            >
              <span className="text-white font-bold text-xs">L</span>
            </div>
            <span className="text-primary font-bold text-sm">LOR MENTOR</span>
          </div>
          <div className="hidden lg:block" />
          <ThemeToggle variant="pill" />
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-[400px]"
          >
            {/* Heading */}
            <div className="mb-8">
              <h2 className="font-display text-2xl font-bold text-primary mb-1.5">
                Sign in
              </h2>
              <p className="text-secondary text-sm">
                New to Lor Mentor?{" "}
                <Link
                  href="/register"
                  className="font-semibold transition-colors"
                  style={{ color: "#14B8A6" }}
                >
                  Create an account
                </Link>
              </p>
            </div>

            {/* Server error */}
            {serverError && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl px-4 py-3 text-sm mb-6"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#EF4444",
                }}
              >
                {serverError}
              </motion.div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Email field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-secondary tracking-widest uppercase">
                  Email Address
                </label>
                <div className="relative group">
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="you@lorcan.edu.et"
                    className="
                      w-full rounded-xl px-4 py-3 text-sm text-primary
                      placeholder:text-muted/60
                      outline-none transition-all duration-200
                      focus:ring-2
                    "
                    style={{
                      background: "var(--bg-surface)",
                      border: errors.email
                        ? "1px solid rgba(239,68,68,0.5)"
                        : "1px solid var(--border-default)",
                    }}
                    onFocus={(e) => {
                      if (!errors.email) {
                        e.currentTarget.style.border = "1px solid rgba(20,184,166,0.6)";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.12), 0 0 20px rgba(20,184,166,0.08)";
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = errors.email ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border-default)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-secondary tracking-widest uppercase">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium transition-colors hover:opacity-80"
                    style={{ color: "#14B8A6" }}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="
                      w-full rounded-xl px-4 py-3 pr-11 text-sm text-primary
                      placeholder:text-muted/60
                      outline-none transition-all duration-200
                    "
                    style={{
                      background: "var(--bg-surface)",
                      border: errors.password
                        ? "1px solid rgba(239,68,68,0.5)"
                        : "1px solid var(--border-default)",
                    }}
                    onFocus={(e) => {
                      if (!errors.password) {
                        e.currentTarget.style.border = "1px solid rgba(20,184,166,0.6)";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.12), 0 0 20px rgba(20,184,166,0.08)";
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = errors.password ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border-default)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileTap={{ scale: 0.98 }}
                className="
                  group w-full py-3 mt-2 rounded-xl
                  flex items-center justify-center gap-2
                  text-white font-semibold text-sm
                  transition-all duration-200
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
                style={{
                  background: isSubmitting
                    ? "linear-gradient(135deg, #147878, #1A9494)"
                    : "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 100%)",
                  boxShadow: isSubmitting ? "none" : "0 0 20px rgba(20,184,166,0.35), 0 4px 12px rgba(0,0,0,0.2)",
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.boxShadow = "0 0 32px rgba(45,212,191,0.5), 0 4px 16px rgba(0,0,0,0.25)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 20px rgba(20,184,166,0.35), 0 4px 12px rgba(0,0,0,0.2)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in to Lor Mentor
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </motion.button>
            </form>

            {/* Footer hint */}
            <div className="mt-8 flex items-center gap-2 justify-center">
              <Sparkles className="h-3 w-3" style={{ color: "#14B8A6" }} />
              <span className="text-xs text-muted">
                Powered by Cornerstone Technologies Built for Lorcan Medical College
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
