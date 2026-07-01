"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, ArrowRight, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setServerError("");

    try {
      const res = await login(data.email, data.password);
      const user = res.user;

      if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        await logout(null);
        setServerError("This portal is for administrators only.");
        return;
      }

      router.push("/admin");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Something went wrong.";
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="w-full max-w-[400px] animate-fade-up">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="h-5 w-5 text-accent" />
          <span className="text-xs font-medium text-accent tracking-wide uppercase">
            Admin Portal
          </span>
        </div>

        <h1 className="font-display text-2xl font-semibold text-primary mb-1.5">
          Administrator sign in
        </h1>
        <p className="text-secondary text-sm mb-8">
          Lor Mentor · Lorcan Medical College
        </p>

        {serverError && (
          <div
            className="bg-error/10 border border-error/20 text-error
            rounded-xl px-4 py-3 text-sm mb-6"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
              EMAIL ADDRESS
            </label>
            <input
              {...register("email")}
              type="email"
              placeholder="admin@lorcan.edu.et"
              disabled={isSubmitting}
              className="w-full bg-surface border border-default rounded-xl
                px-4 py-3 text-sm text-primary placeholder:text-muted
                focus:outline-none focus:border-accent focus:ring-2
                focus:ring-accent/20 transition-all"
            />
            {errors.email && (
              <p className="text-error text-xs mt-1.5">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
              PASSWORD
            </label>
            <div className="relative">
              <input
                {...register("password")}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                disabled={isSubmitting}
                className="w-full bg-surface border border-default rounded-xl
                  px-4 py-3 pr-11 text-sm text-primary placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isSubmitting}
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="group w-full bg-accent hover:bg-accent-hover text-white
              font-medium rounded-xl py-3 flex items-center justify-center gap-2
              transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign in to admin
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-muted text-center mt-8">
          Student or teacher?{" "}
          <Link href="/login" className="text-accent hover:text-accent-hover">
            Use the regular login
          </Link>
        </p>
      </div>
    </div>
  );
}
