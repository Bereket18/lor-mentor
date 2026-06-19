"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Upload, ArrowLeft, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Plan {
  id: string;
  name: string;
  priceETB: string | number;
  durationMonths: number;
}

function SubscribeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const { user, loading: authLoading } = useAuth();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push(`/login?redirect=/pricing/subscribe?planId=${planId ?? ""}`);
      return;
    }

    if (!planId) {
      router.push("/pricing");
      return;
    }

    api
      .get(`/plans/${planId}`)
      .then((res) => setPlan(res.data))
      .catch(() => router.push("/pricing"))
      .finally(() => setLoading(false));
  }, [planId, router, user, authLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !planId) return;

    setSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("planId", planId);
      formData.append("receipt", file);

      await api.post("/payments/submit", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setSuccess(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to submit payment";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!plan) return null;

  if (success) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h1 className="font-display text-2xl font-semibold text-primary mb-2">
            Receipt submitted
          </h1>
          <p className="text-sm text-secondary mb-6">
            Your payment for <strong>{plan.name}</strong> is pending admin
            review. You&apos;ll get access once approved.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-accent text-white rounded-xl px-6 py-3 text-sm font-medium"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base">
      <div className="max-w-lg mx-auto px-6 py-16">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-sm text-secondary
            hover:text-primary mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to pricing
        </Link>

        <h1 className="font-display text-2xl font-semibold text-primary mb-1">
          Submit payment receipt
        </h1>
        <p className="text-sm text-secondary mb-8">
          {plan.name} — {Number(plan.priceETB).toLocaleString()} ETB ·{" "}
          {plan.durationMonths} months
        </p>

        {error && (
          <div className="bg-error/10 border border-error/20 text-error rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
              UPLOAD RECEIPT (IMAGE)
            </label>
            <label
              className="flex flex-col items-center justify-center w-full h-40
                bg-surface border-2 border-dashed border-default rounded-2xl
                cursor-pointer hover:border-accent/50 transition-colors"
            >
              <Upload className="h-6 w-6 text-muted mb-2" />
              <span className="text-sm text-secondary">
                {file ? file.name : "Click to select an image file"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-muted mt-2">
              Transfer {Number(plan.priceETB).toLocaleString()} ETB to the
              college account, then upload your bank receipt screenshot.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !file}
            className="w-full bg-accent hover:bg-accent-hover text-white
              font-medium rounded-xl py-3 flex items-center justify-center gap-2
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit for review"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-base flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      }
    >
      <SubscribeContent />
    </Suspense>
  );
}
