"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, ArrowRight, Sparkles } from "lucide-react";
import api from "@/lib/api";
import { WordReveal } from "@/components/shared/word-reveal";
import { StoryFrames } from "@/components/shared/story-frames";

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

      if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
        router.push("/admin");
      } else if (user.role === "TEACHER") {
        router.push("/teacher");
      } else {
        router.push("/dashboard");
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setServerError(err?.response?.data?.message ?? "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#060B14] relative overflow-hidden">
      {/* ── Ambient glow orbs — top-left and bottom-right corners ── */}
      {/* Using inline style because Tailwind v3 can't apply opacity   */}
      {/* modifiers to CSS-variable-based colors                       */}
      <div
        style={{
          background:
            "radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)",
        }}
        className="
          absolute top-0 left-0 w-[600px] h-[600px]
          rounded-full blur-3xl
          -translate-x-1/3 -translate-y-1/3
          pointer-events-none
        "
      />
      <div
        style={{
          background:
            "radial-gradient(circle, rgba(20,184,166,0.14) 0%, transparent 70%)",
        }}
        className="
          absolute bottom-0 right-0 w-[500px] h-[500px]
          rounded-full blur-3xl
          translate-x-1/3 translate-y-1/3
          pointer-events-none
        "
      />

      {/* ── Left panel — brand + glass divider ──────────────────── */}
      <div
        style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}
        className="
        hidden lg:flex lg:w-[460px] flex-shrink-0
        relative flex-col justify-between p-12
      "
      >
        <div className="relative z-10">
          {/* Lorcan brand badge */}
          <div
            style={{ backgroundColor: "#0D3B3B", border: "1px solid rgba(20,120,120,0.3)" }}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-10"
          >
            <div
              style={{ backgroundColor: "#14B8A6" }}
              className="w-1.5 h-1.5 rounded-full animate-pulse-glow"
            />
            <span style={{ color: "#14B8A6" }} className="text-[11px] font-medium tracking-wide">
              LORCAN MEDICAL COLLEGE
            </span>
          </div>

          {/* Headline — word by word reveal */}
          {/* Small headline above the story panel */}
          <h1
            className="font-display text-2xl font-semibold
  text-primary leading-[1.15] mb-8"
          >
            <WordReveal text="Welcome back to your medical workspace" />
          </h1>

          {/* Rotating story panel — replaces static feature list */}
          <StoryFrames />
        </div>

        <p className="text-xs text-muted relative z-10">
          Addis Ababa, Ethiopia · Est. 2020
        </p>
      </div>

      {/* ── Right panel — login form ──────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center p-6
        relative z-10"
      >
        <div
          className="w-full max-w-[380px] animate-fade-up"
          style={{ animationFillMode: "both" }}
        >
          <div className="mb-8">
            <h2
              className="font-display text-2xl font-semibold
              text-primary mb-1.5"
            >
              Sign in
            </h2>
            <p className="text-secondary text-sm">
              New to Lor Mentor?{" "}
              <Link
                href="/register"
                className="text-accent hover:text-accent-hover
                  font-medium transition-colors"
              >
                Create an account
              </Link>
            </p>
          </div>

          {serverError && (
            <div
              className="
              bg-error/10 border border-error/20
              text-error rounded-xl px-4 py-3 text-sm mb-6
              animate-scale-in
            "
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label
                className="block text-xs font-medium
                text-secondary mb-2 tracking-wide"
              >
                EMAIL ADDRESS
              </label>
              <input
                {...register("email")}
                type="email"
                placeholder="you@lorcan.edu.et"
                className="
                  w-full bg-surface border border-border
                  rounded-xl px-4 py-3 text-sm text-primary
                  placeholder:text-muted
                  focus:outline-none focus:border-accent
                  focus:ring-2 focus:ring-accent/20
                  transition-all duration-150
                "
              />
              {errors.email && (
                <p className="text-error text-xs mt-1.5">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label
                  className="text-xs font-medium text-secondary
                  tracking-wide"
                >
                  PASSWORD
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-accent hover:text-accent-hover
                    transition-colors"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="
                    w-full bg-surface border border-border
                    rounded-xl px-4 py-3 pr-11 text-sm text-primary
                    placeholder:text-muted
                    focus:outline-none focus:border-accent
                    focus:ring-2 focus:ring-accent/20
                    transition-all duration-150
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="
                    absolute right-3.5 top-1/2 -translate-y-1/2
                    text-muted hover:text-primary transition-colors
                  "
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

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="
                group w-full bg-accent hover:bg-accent-hover
                text-white font-medium rounded-xl py-3 mt-2
                flex items-center justify-center gap-2
                transition-all duration-200
                shadow-glow-sm hover:shadow-glow
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight
                    className="h-4 w-4 transition-transform
                    duration-200 group-hover:translate-x-0.5"
                  />
                </>
              )}
            </button>
          </form>

          {/* AI hint — subtle brand touch, not gimmicky */}
          <div
            className="
            mt-8 flex items-center gap-2 justify-center
            text-xs text-muted
          "
          >
            <Sparkles className="h-3 w-3 text-ai" />
            <span>Powered by Lorcan College</span>
          </div>
        </div>
      </div>
    </div>
  );
}
