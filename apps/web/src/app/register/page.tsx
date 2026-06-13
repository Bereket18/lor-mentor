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

// ── Validation Schema ──────────────────────────────────────
// Zod checks the form data before we send it to the server
const schema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// The TypeScript type is inferred from the Zod schema
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // React Hook Form handles all form state and validation
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Runs when the form is submitted and all validation passes
  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    setServerError("");

    try {
      await api.post("/auth/register", {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
      });

      // Redirect to verify email page with the email
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
    } catch (err: any) {
      // Show the error message from the server
      setServerError(
        err?.response?.data?.message ??
          "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — brand ───────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[420px] bg-brand-800
        flex-col justify-between p-10 flex-shrink-0"
      >
        <div>
          {/* Logo */}
          <div
            className="bg-brand-700 rounded-lg px-3 py-2
            inline-block mb-10"
          >
            <span className="text-white font-bold text-sm">LOR MENTOR</span>
          </div>

          <h1
            className="text-white text-3xl font-bold
            leading-tight mb-4"
          >
            Join Lorcan
            <br />
            Medical College
          </h1>
          <p className="text-brand-300 text-sm leading-relaxed mb-8">
            Access AI-powered flashcards, quizzes, 3D anatomy, and a personal AI
            tutor — built for Lorcan students.
          </p>

          {/* Benefits list */}
          {[
            "AI summaries for every PDF",
            "Flashcards and quiz bank",
            "Interactive 3D anatomy viewer",
            "Course-aware AI tutor",
            "Study streaks and progress tracking",
          ].map((benefit) => (
            <div key={benefit} className="flex items-center gap-3 mb-3">
              <div
                className="w-1.5 h-1.5 rounded-full
                bg-brand-400 flex-shrink-0"
              />
              <span className="text-brand-200 text-sm">{benefit}</span>
            </div>
          ))}
        </div>

        <p className="text-brand-500 text-xs">
          Lorcan Medical College · Est. 2020
        </p>
      </div>

      {/* ── Right panel — form ───────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center
        bg-base p-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <h2 className="text-2xl font-bold text-primary mb-1">
            Create your account
          </h2>
          <p className="text-secondary text-sm mb-8">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-accent hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>

          {/* Server error */}
          {serverError && (
            <div
              className="bg-red-50 border border-red-200
              text-red-700 rounded-xl px-4 py-3 text-sm mb-6"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Full name */}
            <div>
              <label
                className="block text-sm font-medium
                text-primary mb-1.5"
              >
                Full name
              </label>
              <input
                {...register("fullName")}
                type="text"
                placeholder="Bereket Adamsseged"
                className="w-full bg-surface border border-border
                  rounded-xl px-4 py-3 text-sm text-primary
                  placeholder:text-muted
                  focus:outline-none focus:ring-2
                  focus:ring-accent focus:border-transparent
                  transition-all"
              />
              {errors.fullName && (
                <p className="text-red-500 text-xs mt-1.5">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label
                className="block text-sm font-medium
                text-primary mb-1.5"
              >
                Email address
              </label>
              <input
                {...register("email")}
                type="email"
                placeholder="bereket@lorcan.edu.et"
                className="w-full bg-surface border border-border
                  rounded-xl px-4 py-3 text-sm text-primary
                  placeholder:text-muted
                  focus:outline-none focus:ring-2
                  focus:ring-accent focus:border-transparent
                  transition-all"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1.5">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-sm font-medium
                text-primary mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-surface border border-border
                    rounded-xl px-4 py-3 pr-11 text-sm text-primary
                    placeholder:text-muted
                    focus:outline-none focus:ring-2
                    focus:ring-accent focus:border-transparent
                    transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2
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
                <p className="text-red-500 text-xs mt-1.5">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label
                className="block text-sm font-medium
                text-primary mb-1.5"
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your password"
                  className="w-full bg-surface border border-border
                    rounded-xl px-4 py-3 pr-11 text-sm text-primary
                    placeholder:text-muted
                    focus:outline-none focus:ring-2
                    focus:ring-accent focus:border-transparent
                    transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2
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
                <p className="text-red-500 text-xs mt-1.5">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-accent hover:bg-accent-hover
                text-white font-semibold rounded-xl py-3
                flex items-center justify-center gap-2
                transition-all disabled:opacity-60
                disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
