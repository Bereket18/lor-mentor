"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, CheckCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get the email from the URL: /verify-email?email=bereket@lorcan.edu.et
  const email = searchParams.get("email") ?? "";

  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify() {
    if (!token.trim()) {
      setError("Please paste your verification token");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.post("/auth/verify-email", { token: token.trim() });
      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Invalid or expired token.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        className="min-h-screen bg-base flex items-center
        justify-center p-6"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-sm"
        >
          <div
            className="w-16 h-16 bg-green-100 rounded-full
            flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-primary mb-2">
            Email verified!
          </h2>
          <p className="text-secondary text-sm">Redirecting you to login...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-base flex items-center
      justify-center p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Icon */}
        <div
          className="w-14 h-14 bg-brand-100 rounded-2xl
          flex items-center justify-center mb-6"
        >
          <Mail className="h-7 w-7 text-accent" />
        </div>

        <h2 className="text-2xl font-bold text-primary mb-2">
          Check your email
        </h2>
        <p className="text-secondary text-sm mb-8 leading-relaxed">
          We sent a verification token to{" "}
          <span className="font-medium text-primary">{email}</span>. Paste it
          below to verify your account.
        </p>

        {/* Steps */}
        <div className="card mb-6 space-y-3">
          {[
            "Open your email inbox",
            "Find the email from Lor Mentor",
            "Copy the verification token",
            "Paste it below and click verify",
          ].map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-full bg-accent
                text-white text-xs font-bold flex items-center
                justify-center flex-shrink-0"
              >
                {i + 1}
              </div>
              <span className="text-sm text-secondary">{step}</span>
            </div>
          ))}
        </div>

        {/* Token input */}
        <div className="mb-4">
          <label
            className="block text-sm font-medium
            text-primary mb-1.5"
          >
            Verification token
          </label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your token here"
            className="w-full bg-surface border border-border
              rounded-xl px-4 py-3 text-sm text-primary
              placeholder:text-muted font-mono
              focus:outline-none focus:ring-2
              focus:ring-accent focus:border-transparent
              transition-all"
          />
          {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
        </div>

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-hover
            text-white font-semibold rounded-xl py-3
            flex items-center justify-center gap-2
            transition-all disabled:opacity-60 mb-4"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify email"
          )}
        </button>

        <p className="text-center text-sm text-secondary">
          Already verified?{" "}
          <Link
            href="/login"
            className="text-accent hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
