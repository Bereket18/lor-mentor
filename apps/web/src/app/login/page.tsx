"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import api from "@/lib/api";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    setServerError("");

    try {
      const res = await api.post("/auth/login", data);
      const user = res.data.user;

      // Redirect based on role
      if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
        router.push("/admin");
      } else if (user.role === "TEACHER") {
        router.push("/teacher");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setServerError(err?.response?.data?.message ?? "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ───────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[420px] bg-brand-800
        flex-col justify-between p-10 flex-shrink-0"
      >
        <div>
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
            Welcome back
          </h1>
          <p className="text-brand-300 text-sm leading-relaxed">
            Sign in to continue your medical education journey with AI-powered
            learning tools.
          </p>
        </div>
        <p className="text-brand-500 text-xs">
          Lorcan Medical College · Est. 2020
        </p>
      </div>

      {/* ── Right panel ──────────────────────────────── */}
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
          <h2 className="text-2xl font-bold text-primary mb-1">Sign in</h2>
          <p className="text-secondary text-sm mb-8">
            No account yet?{" "}
            <Link
              href="/register"
              className="text-accent hover:underline font-medium"
            >
              Create one free
            </Link>
          </p>

          {serverError && (
            <div
              className="bg-red-50 border border-red-200
              text-red-700 rounded-xl px-4 py-3 text-sm mb-6"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
              <div
                className="flex justify-between
                items-center mb-1.5"
              >
                <label
                  className="block text-sm font-medium
                  text-primary"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-accent hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
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
                  className="absolute right-3 top-1/2
                    -translate-y-1/2 text-muted
                    hover:text-primary transition-colors"
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
                  Signing in...
                </>
              ) : (
                "Sign in to Lor Mentor"
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
