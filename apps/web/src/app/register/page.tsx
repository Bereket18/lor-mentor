"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
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

interface Department   { id: string; name: string }
interface AcademicYear { id: string; label: string }

/* ── Glass input ──────────────────────────────────────────────── */
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
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(45,212,191,0.12), 0 0 20px rgba(45,212,191,0.08)";
            e.currentTarget.style.background = "var(--glass-input-bg)";
          }
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.border = hasError
            ? "1px solid rgba(239,68,68,0.5)"
            : "1px solid var(--glass-input-border)";
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.background = "var(--glass-input-bg)";
          props.onBlur?.(e);
        }}
      />
    );
  },
);

/* ── Glass select ─────────────────────────────────────────────── */
interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

const GlassSelect = React.forwardRef<HTMLSelectElement, GlassSelectProps>(
  function GlassSelect({ hasError, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        {...props}
        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          background: "var(--glass-input-bg)",
          border: hasError
            ? "1px solid rgba(239,68,68,0.5)"
            : "1px solid var(--glass-input-border)",
          color: "var(--text-primary)",
        }}
        onFocus={(e) => {
          if (!hasError) {
            e.currentTarget.style.border = "1px solid rgba(45,212,191,0.6)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(45,212,191,0.12), 0 0 20px rgba(45,212,191,0.08)";
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.border = hasError
            ? "1px solid rgba(239,68,68,0.5)"
            : "1px solid var(--glass-input-border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {children}
      </select>
    );
  },
);

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5 text-secondary">
      {children}
    </label>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [serverError,  setServerError]  = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments,  setDepartments]  = useState<Department[]>([]);
  const [years,        setYears]        = useState<AcademicYear[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingYears, setLoadingYears] = useState(false);

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
        fullName:       data.fullName,
        email:          data.email,
        password:       data.password,
        phoneNumber:    data.phoneNumber,
        departmentId:   data.departmentId,
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
    <div
      suppressHydrationWarning
      className="min-h-screen flex items-center justify-center relative overflow-hidden py-8 auth-bg"
    >
      {/* ── Animated orb background ─────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            width: 600, height: 600, top: "-15%", left: "-10%",
            background: "radial-gradient(circle, rgba(20,184,166,0.22) 0%, rgba(20,184,166,0.06) 50%, transparent 70%)",
            animation: "orbDrift1 18s ease-in-out infinite",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 500, height: 500, bottom: "-10%", right: "-5%",
            background: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, rgba(14,165,233,0.05) 50%, transparent 70%)",
            animation: "orbDrift2 22s ease-in-out infinite",
            filter: "blur(50px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 400, height: 400, top: "50%", left: "55%",
            background: "radial-gradient(circle, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.04) 50%, transparent 70%)",
            animation: "orbDrift3 26s ease-in-out infinite",
            filter: "blur(45px)",
          }}
        />
      </div>

      {/* ── ThemeToggle ───────────────────────────────────────── */}
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
          maxWidth: 480,
          borderRadius: 28,
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          background: "var(--glass-card-bg)",
          border: "1px solid var(--glass-card-border)",
          boxShadow: "var(--glass-card-shadow)",
        }}
      >
        {/* Top chromatic highlight */}
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
          <div className="flex flex-col items-center mb-7">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{
                background: "linear-gradient(135deg, #147878 0%, #1A9494 60%, #2DD4BF 100%)",
                boxShadow: "0 0 28px rgba(45,212,191,0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              <span className="text-white font-bold text-xl tracking-tight">L</span>
            </div>
            <p className="font-bold text-base tracking-widest uppercase leading-none text-primary">
              LOR MENTOR
            </p>
            <p className="text-[11px] font-medium mt-1 tracking-wider" style={{ color: "#2DD4BF", opacity: 0.8 }}>
              LORCAN MEDICAL COLLEGE
            </p>
          </div>

          {/* ── Heading ──────────────────────────────────────── */}
          <h1 className="text-primary text-xl font-bold text-center mb-1" style={{ letterSpacing: "-0.02em" }}>
            Create your account
          </h1>
          <p className="text-center text-sm mb-7 text-secondary">
            Join Ethiopia&apos;s most advanced medical learning platform
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
                color: "#EF4444",
                backdropFilter: "blur(8px)",
              }}
            >
              {serverError}
            </motion.div>
          )}

          {/* ── Form ─────────────────────────────────────────── */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Full name */}
            <div>
              <FieldLabel>Full Name</FieldLabel>
              <GlassInput
                {...register("fullName")}
                type="text"
                placeholder="Bereket Adamsseged"
                hasError={!!errors.fullName}
              />
              {errors.fullName && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.fullName.message}</p>}
            </div>

            {/* Email */}
            <div>
              <FieldLabel>Email Address</FieldLabel>
              <GlassInput
                {...register("email")}
                type="email"
                placeholder="you@lorcan.edu.et"
                hasError={!!errors.email}
              />
              {errors.email && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.email.message}</p>}
            </div>

            {/* Phone */}
            <div>
              <FieldLabel>Phone Number</FieldLabel>
              <GlassInput
                {...register("phoneNumber")}
                type="tel"
                placeholder="0911234567"
                hasError={!!errors.phoneNumber}
              />
              {errors.phoneNumber && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.phoneNumber.message}</p>}
              <p className="text-[11px] mt-1 text-muted">Used for payment confirmation</p>
            </div>

            {/* Department + Year — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Department</FieldLabel>
                <GlassSelect
                  {...register("departmentId")}
                  disabled={loadingDepts}
                  hasError={!!errors.departmentId}
                  className="glass-select"
                >
                  <option value="">{loadingDepts ? "Loading…" : "Select"}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </GlassSelect>
                {errors.departmentId && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.departmentId.message}</p>}
              </div>
              <div>
                <FieldLabel>Year</FieldLabel>
                <GlassSelect
                  {...register("academicYearId")}
                  disabled={!selectedDeptId || loadingYears}
                  hasError={!!errors.academicYearId}
                  className="glass-select"
                >
                  <option value="">{!selectedDeptId ? "Dept first" : loadingYears ? "Loading…" : "Select"}</option>
                  {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                </GlassSelect>
                {errors.academicYearId && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.academicYearId.message}</p>}
              </div>
            </div>

            {/* Password */}
            <div>
              <FieldLabel>Password</FieldLabel>
              <div className="relative">
                <GlassInput
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  hasError={!!errors.password}
                  style={{ paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors text-muted hover:text-primary"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors.password.message}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <FieldLabel>Confirm Password</FieldLabel>
              <div className="relative">
                <GlassInput
                  {...register("confirmPassword")}
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your password"
                  hasError={!!errors.confirmPassword}
                  style={{ paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors text-muted hover:text-primary"
                >
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
              className="group relative w-full py-3 mt-1 rounded-2xl flex items-center justify-center gap-2 text-white font-semibold text-sm transition-all duration-200 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
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
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-1/3"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
                  animation: "glassSheen 3s ease-in-out infinite",
                }}
              />
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Creating account…</>
              ) : (
                <>Create account<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </motion.button>
          </form>

          <p className="text-center text-sm mt-5 text-secondary">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold transition-colors hover:opacity-80" style={{ color: "#2DD4BF" }}>
              Sign in
            </Link>
          </p>

          {/* ── Address footer ────────────────────────────────── */}
          <div className="mt-7 pt-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <p className="text-center text-[11px] font-medium mb-2 text-muted">
              Lorcan Medical College · CMC Square, Addis Ababa
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="text-[11px] text-muted">📞 +251 11 863 4387</span>
              <span className="text-[11px] text-muted">✉️ lorcancm@gmail.com</span>
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
