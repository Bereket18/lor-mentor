"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import api from "@/lib/api";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(token ? "" : "Reset token is missing.");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    if (!token) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await api.post("/auth/reset-password", {
        token,
        password: data.password,
      });
      setMessage(res.data.message ?? "Password reset successful. You can now log in.");
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not reset password. Please request a new link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="glass-panel p-7">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: "var(--teal-dim)" }}
          >
            <KeyRound className="h-5 w-5" style={{ color: "var(--teal)" }} />
          </div>
          <h1 className="font-display text-2xl font-bold text-primary mb-2">
            Choose a new password
          </h1>
          <p className="text-sm text-secondary mb-6">
            Use at least 8 characters. After this, sign in with your new password.
          </p>

          {message && (
            <div className="rounded-xl px-4 py-3 text-sm mb-5 bg-green-500/10 text-green-400 border border-green-500/20">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm mb-5 bg-error/10 text-error border border-error/20">
              {error}
            </div>
          )}

          {message ? (
            <Link
              href="/login"
              className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-xl py-3 flex items-center justify-center transition-all"
            >
              Go to login
            </Link>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                  NEW PASSWORD
                </label>
                <input
                  {...register("password")}
                  type="password"
                  placeholder="Minimum 8 characters"
                  className="w-full bg-surface border border-default rounded-xl px-4 py-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                />
                {errors.password && (
                  <p className="text-error text-xs mt-1.5">
                    {errors.password.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                  CONFIRM PASSWORD
                </label>
                <input
                  {...register("confirmPassword")}
                  type="password"
                  placeholder="Repeat your password"
                  className="w-full bg-surface border border-default rounded-xl px-4 py-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                />
                {errors.confirmPassword && (
                  <p className="text-error text-xs mt-1.5">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={submitting || !token}
                className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? "Resetting..." : "Reset password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-base flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
