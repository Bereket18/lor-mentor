"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
} from "lucide-react";
import api from "@/lib/api";

type Phase = "verifying" | "approved" | "pending" | "error";

interface VerifyResult {
  paymentId?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  receiptNumber?: string | null;
}

const MAX_ATTEMPTS = 5;

function CallbackContent() {
  const searchParams = useSearchParams();
  const txRef = searchParams.get("tx");

  const [phase, setPhase] = useState<Phase>("verifying");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const verify = useCallback(async () => {
    if (!txRef) {
      setPhase("error");
      return;
    }

    // The webhook usually approves within a second or two, but it can lag.
    // Poll the verify endpoint a few times before giving up to "pending".
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await api.get<VerifyResult>(
          `/payments/chapa/verify/${txRef}`,
        );
        const data = res.data;
        if (data.status === "APPROVED") {
          setPaymentId(data.paymentId ?? null);
          setReceiptNumber(data.receiptNumber ?? null);
          setPhase("approved");
          return;
        }
        if (data.status === "REJECTED") {
          setPhase("error");
          return;
        }
      } catch {
        // transient — keep trying
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setPhase("pending");
  }, [txRef]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    verify();
  }, [verify]);

  async function downloadReceipt() {
    if (!paymentId) return;
    setDownloading(true);
    try {
      const res = await api.get(`/payments/${paymentId}/document`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch {
      alert("Could not load the receipt. You can also find it on your profile.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {phase === "verifying" && (
          <>
            <Loader2 className="h-12 w-12 text-accent mx-auto mb-4 animate-spin" />
            <h1 className="font-display text-2xl font-semibold text-primary mb-2">
              Confirming your payment
            </h1>
            <p className="text-sm text-secondary">
              Hang tight — this only takes a moment.
            </p>
          </>
        )}

        {phase === "approved" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-semibold text-primary mb-2">
              Payment successful
            </h1>
            <p className="text-sm text-secondary mb-2">
              Your subscription is now active. Welcome aboard!
            </p>
            {receiptNumber && (
              <p className="text-xs text-muted mb-6">
                Receipt No. {receiptNumber}
              </p>
            )}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={downloadReceipt}
                disabled={downloading || !paymentId}
                className="inline-flex items-center justify-center gap-2 bg-accent
                  hover:bg-accent-hover text-white rounded-xl px-6 py-3 text-sm
                  font-medium disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download receipt (PDF)
              </button>
              <Link
                href="/dashboard"
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Go to dashboard
              </Link>
            </div>
          </>
        )}

        {phase === "pending" && (
          <>
            <Clock className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-semibold text-primary mb-2">
              Payment is processing
            </h1>
            <p className="text-sm text-secondary mb-6">
              We haven&apos;t received final confirmation yet. If you completed
              the payment, your access will activate automatically within a few
              minutes — check your profile or notifications.
            </p>
            <Link
              href="/dashboard"
              className="inline-block bg-accent text-white rounded-xl px-6 py-3 text-sm font-medium"
            >
              Go to dashboard
            </Link>
          </>
        )}

        {phase === "error" && (
          <>
            <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-semibold text-primary mb-2">
              Payment not completed
            </h1>
            <p className="text-sm text-secondary mb-6">
              Your payment could not be confirmed. You weren&apos;t charged, or
              the transaction was cancelled. Please try again.
            </p>
            <Link
              href="/pricing"
              className="inline-block bg-accent text-white rounded-xl px-6 py-3 text-sm font-medium"
            >
              Back to pricing
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-base flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
