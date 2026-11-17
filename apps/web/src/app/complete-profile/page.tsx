"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import api from "@/lib/api";
import type { AcademicYear, Department } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  AuthButton,
  AuthError,
  AuthShell,
  GlassInput,
} from "@/components/auth/auth-shell";
import {
  authErrorMessage,
  completeProfile,
  getProfileCompletion,
  isMethodUnavailable,
  type PasswordlessCompletion,
  type ProfileCompletionStatus,
} from "@/lib/auth-passwordless";

const schema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be less than 100 characters"),
  phoneNumber: z
    .string()
    .min(9, "Please enter a valid phone number")
    .max(15, "Phone number is too long"),
  departmentId: z.string().min(1, "Please select your department"),
  academicYearId: z.string().min(1, "Please select your academic year"),
});

type FormData = z.infer<typeof schema>;

type Phase = "loading" | "ready" | "expired" | "unavailable";

/**
 * The restricted profile step for a first-time passwordless account.
 *
 * The page can only read and submit the fields a student is allowed to choose.
 * Email comes from the HttpOnly enrollment grant and is displayed read-only;
 * role and institution are decided by the server. An expired or already-used
 * grant is a dead end by design — there is no client-side way to re-open it.
 */
export default function CompleteProfilePage() {
  const router = useRouter();
  const { checkAuth } = useAuth();
  const mounted = useHydrated();

  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<ProfileCompletionStatus | null>(null);
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingYears, setLoadingYears] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      phoneNumber: "",
      departmentId: "",
      academicYearId: "",
    },
  });

  const selectedDeptId = useWatch({ control, name: "departmentId" });

  useEffect(() => {
    let active = true;

    getProfileCompletion()
      .then((status) => {
        if (!active) return;
        setInfo(status);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setPhase(isMethodUnavailable(err) ? "unavailable" : "expired");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    api
      .get<Department[]>("/departments")
      .then((res) => setDepartments(res.data))
      .catch(() => setDepartments([]))
      .finally(() => setLoadingDepts(false));
  }, [phase]);

  useEffect(() => {
    if (!selectedDeptId) return;
    api
      .get<AcademicYear[]>(`/academic-years?departmentId=${selectedDeptId}`)
      .then((res) => setYears(res.data))
      .catch(() => setYears([]))
      .finally(() => setLoadingYears(false));
  }, [selectedDeptId]);

  async function onSubmit(data: FormData) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setServerError("");
    try {
      const completion: PasswordlessCompletion = await completeProfile(data);
      if (completion.next === "signed_in") {
        await checkAuth();
      }
      router.replace(completion.redirectTo);
    } catch (err: unknown) {
      setServerError(
        authErrorMessage(err, "Something went wrong. Please try again."),
      );
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title={
        phase === "expired"
          ? "This step has expired"
          : phase === "unavailable"
            ? "Sign-in is unavailable"
            : "Finish your account"
      }
      subtitle={
        phase === "ready"
          ? "A few details and you're in. This is a one-time step."
          : undefined
      }
    >
      {phase === "loading" && (
        <div className="flex items-center justify-center py-10 text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="sr-only">Checking your sign-in session</span>
        </div>
      )}

      {phase === "expired" && (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            This profile link is no longer valid. It may have expired, or it was
            already used. Start again with a new email — nothing has been created
            yet.
          </p>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 70%, #2DD4BF 100%)",
            }}
          >
            Start again
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {phase === "unavailable" && (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            Email sign-in is not enabled right now. Contact the college if you
            need help completing your account.
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
        <>
          <div
            className="rounded-2xl px-4 py-3 text-sm flex items-start gap-3 mb-5"
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
            <span className="min-w-0">
              Verified email:{" "}
              <strong className="text-primary break-all">
                {info?.email}
              </strong>
              <br />
              <span className="text-[11px] text-muted">
                This address cannot be changed here.
              </span>
            </span>
          </div>

          <AuthError message={serverError} />

          <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-4">
            <div>
              <label
                htmlFor="complete-name"
                className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5 text-secondary"
              >
                Full name
              </label>
              <GlassInput
                id="complete-name"
                {...register("fullName")}
                autoComplete="name"
                placeholder="Your full name"
                disabled={isSubmitting}
                hasError={!!errors.fullName}
              />
              {errors.fullName && (
                <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                  {errors.fullName.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="complete-phone"
                className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5 text-secondary"
              >
                Phone number
              </label>
              <GlassInput
                id="complete-phone"
                {...register("phoneNumber")}
                type="tel"
                autoComplete="tel"
                placeholder="0911234567"
                disabled={isSubmitting}
                hasError={!!errors.phoneNumber}
              />
              {errors.phoneNumber && (
                <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                  {errors.phoneNumber.message}
                </p>
              )}
              <p className="text-[11px] mt-1 text-muted">
                Used for payment confirmation
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="complete-department"
                  className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5 text-secondary"
                >
                  Department
                </label>
                <select
                  id="complete-department"
                  {...register("departmentId", {
                    onChange: (event) => {
                      const hasDepartment = Boolean(event.target.value);
                      setYears([]);
                      setLoadingYears(hasDepartment);
                      setValue("academicYearId", "");
                    },
                  })}
                  disabled={isSubmitting || loadingDepts}
                  className="glass-select w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--glass-input-bg)",
                    border: errors.departmentId
                      ? "1px solid rgba(239,68,68,0.5)"
                      : "1px solid var(--glass-input-border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">
                    {loadingDepts ? "Loading…" : "Select"}
                  </option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
                {errors.departmentId && (
                  <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                    {errors.departmentId.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="complete-year"
                  className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5 text-secondary"
                >
                  Year
                </label>
                <select
                  id="complete-year"
                  {...register("academicYearId")}
                  disabled={isSubmitting || !selectedDeptId || loadingYears}
                  className="glass-select w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--glass-input-bg)",
                    border: errors.academicYearId
                      ? "1px solid rgba(239,68,68,0.5)"
                      : "1px solid var(--glass-input-border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">
                    {!selectedDeptId
                      ? "Dept first"
                      : loadingYears
                        ? "Loading…"
                        : "Select"}
                  </option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </select>
                {errors.academicYearId && (
                  <p className="text-xs mt-1" style={{ color: "#EF4444" }}>
                    {errors.academicYearId.message}
                  </p>
                )}
              </div>
            </div>

            <AuthButton
              type="submit"
              loading={isSubmitting}
              disabled={!mounted}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating your account…
                </>
              ) : (
                <>
                  Finish and continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </AuthButton>
          </form>
        </>
      )}
    </AuthShell>
  );
}
