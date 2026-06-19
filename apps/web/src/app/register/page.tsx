"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { WordReveal } from "@/components/shared/word-reveal";
import { StoryFrames } from "@/components/shared/story-frames";

// ── Validation schema ───────────────────────────────────────────
const schema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    phoneNumber: z
      .string()
      .min(9, "Please enter a valid phone number")
      .max(15, "Phone number is too long"),
    departmentId: z.string().min(1, "Please select your department"),
    academicYearId: z.string().min(1, "Please select your academic year"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

interface Department {
  id: string;
  name: string;
}
interface AcademicYear {
  id: string;
  label: string;
}

export default function RegisterPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingYears, setLoadingYears] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const selectedDepartmentId = watch("departmentId");

  // Load departments once on mount — public endpoint, no auth needed
  useEffect(() => {
    api
      .get("/departments")
      .then((res) => setDepartments(res.data))
      .finally(() => setLoadingDepts(false));
  }, []);

  // When department changes, load its years and reset the year field
  // This is what enforces "cannot access other department" at the UI level —
  // the REAL enforcement happens server-side in AuthService.register()
  useEffect(() => {
    if (!selectedDepartmentId) {
      setYears([]);
      return;
    }
    setLoadingYears(true);
    setValue("academicYearId", "");
    api
      .get(`/academic-years?departmentId=${selectedDepartmentId}`)
      .then((res) => setYears(res.data))
      .finally(() => setLoadingYears(false));
  }, [selectedDepartmentId, setValue]);

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    setServerError("");

    try {
      await api.post("/auth/register", {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        phoneNumber: data.phoneNumber,
        departmentId: data.departmentId,
        academicYearId: data.academicYearId,
      });

      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setServerError(
        err?.response?.data?.message ??
          "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div suppressHydrationWarning className="min-h-screen flex bg-base relative overflow-hidden">
      {/* Ambient glow — matches login page */}
      <div
        suppressHydrationWarning
        className="absolute top-0 left-0 w-[600px] h-[600px]
        bg-accent/[0.07] rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2
        pointer-events-none"
      />
      <div
        suppressHydrationWarning
        className="absolute bottom-0 right-0 w-[500px] h-[500px]
        bg-teal/[0.06] rounded-full blur-3xl translate-x-1/3 translate-y-1/3
        pointer-events-none"
      />

      {/* ── Left panel ───────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[460px] flex-shrink-0
        relative flex-col justify-between p-12 border-r border-glass"
      >
        <div className="relative z-10">
          <div
            className="inline-flex items-center gap-2
            bg-lorcan-dark/60 border border-lorcan/20
            rounded-full px-3 py-1.5 mb-10"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-lorcan animate-pulse-glow" />
            <span className="text-[11px] font-medium text-lorcan tracking-wide">
              LORCAN MEDICAL COLLEGE
            </span>
          </div>

          <h1
            className="font-display text-2xl font-semibold
            text-primary leading-[1.15] mb-8"
          >
            <WordReveal text="Join Ethiopia's most advanced medical learning platform" />
          </h1>

          <StoryFrames />
        </div>

        <p className="text-xs text-muted relative z-10">
          Addis Ababa, Ethiopia · Est. 2020
        </p>
      </div>

      {/* ── Right panel — form ───────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-[420px] animate-fade-up">
          <div className="mb-7">
            <h2 className="font-display text-2xl font-semibold text-primary mb-1.5">
              Create your account
            </h2>
            <p className="text-secondary text-sm">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-accent hover:text-accent-hover
                font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>

          {serverError && (
            <div
              className="bg-error/10 border border-error/20 text-error
              rounded-xl px-4 py-3 text-sm mb-6 animate-scale-in"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full name */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                FULL NAME
              </label>
              <input
                {...register("fullName")}
                type="text"
                placeholder="Bereket Adamsseged"
                className="w-full bg-surface border border-default rounded-xl
                  px-4 py-3 text-sm text-primary placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all duration-150"
              />
              {errors.fullName && (
                <p className="text-error text-xs mt-1.5">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                EMAIL ADDRESS
              </label>
              <input
                {...register("email")}
                type="email"
                placeholder="you@lorcan.edu.et"
                className="w-full bg-surface border border-default rounded-xl
                  px-4 py-3 text-sm text-primary placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all duration-150"
              />
              {errors.email && (
                <p className="text-error text-xs mt-1.5">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Phone number — for payment contact */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                PHONE NUMBER
              </label>
              <input
                {...register("phoneNumber")}
                type="tel"
                placeholder="0911234567"
                className="w-full bg-surface border border-default rounded-xl
                  px-4 py-3 text-sm text-primary placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all duration-150"
              />
              {errors.phoneNumber && (
                <p className="text-error text-xs mt-1.5">
                  {errors.phoneNumber.message}
                </p>
              )}
              <p className="text-[11px] text-muted mt-1.5">
                Used to contact you about payment confirmation
              </p>
            </div>

            {/* Department */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                DEPARTMENT
              </label>
              <select
                {...register("departmentId")}
                disabled={loadingDepts}
                className="w-full bg-surface border border-default rounded-xl
                  px-4 py-3 text-sm text-primary
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all duration-150
                  disabled:opacity-60"
              >
                <option value="">
                  {loadingDepts
                    ? "Loading departments..."
                    : "Select your department"}
                </option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              {errors.departmentId && (
                <p className="text-error text-xs mt-1.5">
                  {errors.departmentId.message}
                </p>
              )}
            </div>

            {/* Academic Year — locked to selected department */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                ACADEMIC YEAR
              </label>
              <select
                {...register("academicYearId")}
                disabled={!selectedDepartmentId || loadingYears}
                className="w-full bg-surface border border-default rounded-xl
                  px-4 py-3 text-sm text-primary
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all duration-150
                  disabled:opacity-60"
              >
                <option value="">
                  {!selectedDepartmentId
                    ? "Select a department first"
                    : loadingYears
                      ? "Loading years..."
                      : "Select your academic year"}
                </option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
              {errors.academicYearId && (
                <p className="text-error text-xs mt-1.5">
                  {errors.academicYearId.message}
                </p>
              )}
              {selectedDepartmentId && !loadingYears && years.length === 0 && (
                <p className="text-[11px] text-warning mt-1.5">
                  No academic years set up for this department yet — contact
                  admin.
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                PASSWORD
              </label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-surface border border-default rounded-xl
                    px-4 py-3 pr-11 text-sm text-primary placeholder:text-muted
                    focus:outline-none focus:border-accent focus:ring-2
                    focus:ring-accent/20 transition-all duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2
                    text-muted hover:text-primary transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-error text-xs mt-1.5">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                CONFIRM PASSWORD
              </label>
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your password"
                  className="w-full bg-surface border border-default rounded-xl
                    px-4 py-3 pr-11 text-sm text-primary placeholder:text-muted
                    focus:outline-none focus:border-accent focus:ring-2
                    focus:ring-accent/20 transition-all duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2
                    text-muted hover:text-primary transition-colors"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-error text-xs mt-1.5">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="group w-full bg-accent hover:bg-accent-hover text-white
                font-medium rounded-xl py-3 mt-2 flex items-center justify-center gap-2
                transition-all duration-200 shadow-glow-sm hover:shadow-glow
                disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight
                    className="h-4 w-4 transition-transform
                    duration-200 group-hover:translate-x-0.5"
                  />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
