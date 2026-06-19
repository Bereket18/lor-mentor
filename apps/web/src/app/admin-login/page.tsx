"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Shield } from "lucide-react";
import api from "@/lib/api";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function AdminLoginPage() {
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

      // Only allow ADMIN and TEACHER roles through this portal
      if (!["ADMIN", "SUPER_ADMIN", "TEACHER"].includes(user.role)) {
        await api.post("/auth/logout");
        setServerError(
          "This portal is for staff only. Students please use the main login page.",
        );
        setIsSubmitting(false);
        return;
      }

      if (user.role === "TEACHER") {
        router.push("/teacher");
      } else {
        router.push("/admin");
      }
    } catch (err: any) {
      setServerError(err?.response?.data?.message ?? "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96
          rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(20,120,120,0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-fade-up">
        {/* Logo and portal label */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12
            rounded-2xl mb-4"
            style={{
              backgroundColor: "#0D3B3B",
              border: "1px solid rgba(20,120,120,0.3)",
            }}
          >
            <Shield className="h-5 w-5" style={{ color: "#14B8A6" }} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-primary mb-1">
            Staff Portal
          </h1>
          <p className="text-sm text-secondary">Lorcan Medical College</p>
          <p className="text-xs text-muted mt-1">
            For administrators and teachers only
          </p>
        </div>

        {serverError && (
          <div
            className="bg-red-500/10 border border-red-500/20 text-red-400
            rounded-xl px-4 py-3 text-sm mb-6 animate-scale-in"
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
              placeholder="you@lorcan.edu.et"
              className="w-full bg-surface border rounded-xl px-4 py-3 text-sm
                text-primary placeholder:text-muted focus:outline-none
                focus:ring-2 transition-all duration-150"
              style={{ borderColor: "var(--border-default)" }}
            />
            {errors.email && (
              <p className="text-red-400 text-xs mt-1.5">
                {errors.email.message}
              </p>
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
                className="w-full bg-surface border rounded-xl px-4 py-3 pr-11
                  text-sm text-primary placeholder:text-muted focus:outline-none
                  focus:ring-2 transition-all duration-150"
                style={{ borderColor: "var(--border-default)" }}
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
              <p className="text-red-400 text-xs mt-1.5">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full text-white font-medium rounded-xl py-3 mt-2
              flex items-center justify-center gap-2 transition-all duration-200
              disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#147878" }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in to Staff Portal"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-8">
          Are you a student?{" "}
          <a href="/login" className="underline" style={{ color: "#14B8A6" }}>
            Go to student login
          </a>
        </p>
      </div>
    </div>
  );
}
