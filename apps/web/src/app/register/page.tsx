"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowRight, Shield, Award, Users } from "lucide-react";
import api from "@/lib/api";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const schema = z
  .object({
    fullName:        z.string().min(2, "Full name must be at least 2 characters"),
    email:           z.string().email("Please enter a valid email address"),
    phoneNumber:     z.string().min(9, "Please enter a valid phone number").max(15),
    departmentId:    z.string().min(1, "Please select your department"),
    academicYearId:  z.string().min(1, "Please select your academic year"),
    password:        z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

interface Department  { id: string; name: string }
interface AcademicYear { id: string; label: string }

const highlights = [
  { icon: Shield, label: "Secure & Private",  sub: "Your data stays on campus servers" },
  { icon: Award,  label: "AI-Powered",         sub: "Personalised for Lorcan curriculum" },
  { icon: Users,  label: "Student Community",  sub: "Connect with 1 000+ fellow students" },
];

// Reusable styled input with teal focus glow
function GlowInput({
  hasError,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  return (
    <input
      {...props}
      className="
        w-full rounded-xl px-4 py-3 text-sm text-primary
        placeholder:text-muted/60 outline-none transition-all duration-200
      "
      style={{
        background: "var(--bg-surface)",
        border: hasError ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border-default)",
      }}
      onFocus={(e) => {
        if (!hasError) {
          e.currentTarget.style.border = "1px solid rgba(20,184,166,0.6)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.12), 0 0 20px rgba(20,184,166,0.08)";
        }
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.border = hasError ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border-default)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

function GlowSelect({
  hasError,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }) {
  return (
    <select
      {...props}
      className="
        w-full rounded-xl px-4 py-3 text-sm text-primary
        outline-none transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
      "
      style={{
        background: "var(--bg-surface)",
        border: hasError ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border-default)",
      }}
      onFocus={(e) => {
        if (!hasError) {
          e.currentTarget.style.border = "1px solid rgba(20,184,166,0.6)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.12), 0 0 20px rgba(20,184,166,0.08)";
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.border = hasError ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border-default)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </select>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword,  setShowPassword]  = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [serverError,   setServerError]   = useState("");
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [departments,   setDepartments]   = useState<Department[]>([]);
  const [years,         setYears]         = useState<AcademicYear[]>([]);
  const [loadingDepts,  setLoadingDepts]  = useState(true);
  const [loadingYears,  setLoadingYears]  = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const selectedDeptId = watch("departmentId");

  useEffect(() => {
    api.get("/departments").then((r) => setDepartments(r.data)).finally(() => setLoadingDepts(false));
  }, []);

  useEffect(() => {
    if (!selectedDeptId) { setYears([]); return; }
    setLoadingYears(true);
    setValue("academicYearId", "");
    api.get(`/academic-years?departmentId=${selectedDeptId}`)
      .then((r) => setYears(r.data))
      .finally(() => setLoadingYears(false));
  }, [selectedDeptId, setValue]);

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    setServerError("");
    try {
      await api.post("/auth/register", {
        fullName:      data.fullName,
        email:         data.email,
        password:      data.password,
        phoneNumber:   data.phoneNumber,
        departmentId:  data.departmentId,
        academicYearId: data.academicYearId,
      });
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setServerError(err?.response?.data?.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div suppressHydrationWarning className="min-h-screen flex bg-base relative overflow-hidden">

      {/* ── Background mesh ───────────────────────────────────── */}
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

      {/* ── Left panel ───────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[460px] flex-shrink-0 flex-col justify-between p-10 xl:p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(10,26,26,0.97) 0%, rgba(13,59,59,0.92) 50%, rgba(20,120,120,0.85) 100%)",
          borderRight: "1px solid rgba(45,212,191,0.15)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Inner glows */}
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
        {/* Dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(45,212,191,0.4) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* Logo + name */}
          <div className="mb-12">
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
            <div
              className="h-px w-full mt-4"
              style={{ background: "linear-gradient(90deg, rgba(45,212,191,0.4) 0%, transparent 100%)" }}
            />
          </div>

          {/* Headline */}
          <div className="mb-10">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-white font-display text-3xl xl:text-[2.1rem] font-bold leading-[1.2] mb-4"
            >
              Join Ethiopia&apos;s most{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #2DD4BF 0%, #14B8A6 60%, #0EA5E9 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                advanced medical
              </span>{" "}
              learning platform
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-white/50 text-sm leading-relaxed"
            >
              AI flashcards, quizzes, an AI tutor, and 3D anatomy — built
              exclusively for Lorcan students.
            </motion.p>
          </div>

          {/* Highlights */}
          <div className="space-y-3 flex-1">
            {highlights.map((h, i) => (
              <motion.div
                key={h.label}
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
                  <h.icon className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                </div>
                <div>
                  <p className="text-white text-sm font-medium leading-none mb-0.5">{h.label}</p>
                  <p className="text-white/40 text-xs">{h.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Footer */}
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

      {/* ── Right panel ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10 overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0">
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

        {/* Form */}
        <div className="flex-1 flex items-start justify-center px-6 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-7">
              <h2 className="font-display text-2xl font-bold text-primary mb-1.5">
                Create your account
              </h2>
              <p className="text-secondary text-sm">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold transition-colors hover:opacity-80"
                  style={{ color: "#14B8A6" }}
                >
                  Sign in
                </Link>
              </p>
            </div>

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

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* Full name */}
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Full Name</label>
                <GlowInput {...register("fullName")} type="text" placeholder="Bereket Adamsseged" hasError={!!errors.fullName} />
                {errors.fullName && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.fullName.message}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Email Address</label>
                <GlowInput {...register("email")} type="email" placeholder="you@lorcan.edu.et" hasError={!!errors.email} />
                {errors.email && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.email.message}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Phone Number</label>
                <GlowInput {...register("phoneNumber")} type="tel" placeholder="0911234567" hasError={!!errors.phoneNumber} />
                {errors.phoneNumber && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.phoneNumber.message}</p>}
                <p className="text-[11px] text-muted mt-1">Used for payment confirmation</p>
              </div>

              {/* Department + Year — side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Department</label>
                  <GlowSelect {...register("departmentId")} disabled={loadingDepts} hasError={!!errors.departmentId}>
                    <option value="">{loadingDepts ? "Loading…" : "Select"}</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </GlowSelect>
                  {errors.departmentId && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.departmentId.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Year</label>
                  <GlowSelect {...register("academicYearId")} disabled={!selectedDeptId || loadingYears} hasError={!!errors.academicYearId}>
                    <option value="">{!selectedDeptId ? "Dept first" : loadingYears ? "Loading…" : "Select"}</option>
                    {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                  </GlowSelect>
                  {errors.academicYearId && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.academicYearId.message}</p>}
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Password</label>
                <div className="relative">
                  <GlowInput
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    hasError={!!errors.password}
                    className="pr-11"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.password.message}</p>}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Confirm Password</label>
                <div className="relative">
                  <GlowInput
                    {...register("confirmPassword")}
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repeat your password"
                    hasError={!!errors.confirmPassword}
                    className="pr-11"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.confirmPassword.message}</p>}
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileTap={{ scale: 0.98 }}
                className="
                  group w-full py-3 mt-1 rounded-xl
                  flex items-center justify-center gap-2
                  text-white font-semibold text-sm
                  transition-all duration-200
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
                style={{
                  background: "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 100%)",
                  boxShadow: "0 0 20px rgba(20,184,166,0.35), 0 4px 12px rgba(0,0,0,0.2)",
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
                  <><Loader2 className="h-4 w-4 animate-spin" />Creating account…</>
                ) : (
                  <>Create account<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                )}
              </motion.button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
