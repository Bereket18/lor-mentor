"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import api from "@/lib/api";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await api.post("/auth/forgot-password", data);
      setMessage(res.data.message ?? "If that email exists, a reset link has been sent.");
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not send reset link. Please try again.",
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
            <Mail className="h-5 w-5" style={{ color: "var(--teal)" }} />
          </div>
          <h1 className="font-display text-2xl font-bold text-primary mb-2">
            Reset your password
          </h1>
          <p className="text-sm text-secondary mb-6">
            Enter your account email and we&apos;ll send a secure reset link.
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                EMAIL ADDRESS
              </label>
              <input
                id="forgot-email"
                {...register("email")}
                type="email"
                placeholder="you@lorcan.edu.et"
                className="w-full bg-surface border border-default rounded-xl px-4 py-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              />
              {errors.email && (
                <p className="text-error text-xs mt-1.5">{errors.email.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
