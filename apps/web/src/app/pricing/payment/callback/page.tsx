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
  ExternalLink,
} from "lucide-react";
import api from "@/lib/api";
import {
  ConfirmationEndStateMessage,
  PaymentUnderReviewMessage,
} from "@/components/payment/confirmation-end-state";

import { toast } from "sonner";

type Phase =
  | "verifying"
  | "approved"
  | "pending"
  | "confirmation"
  | "review"
  | "error";

interface VerifyResult {
  paymentId?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVERSED" | "EXPIRED" | "CANCELLED";
  receiptNumber?: string | null;
  /**
   * Chapa's permanent receipt URL. The receipt shown inside the hosted
   * checkout is replaced by this page when Chapa redirects here, so the link
   * is the only way to get back to the same receipt.
   */
  chapaReceiptUrl?: string | null;
  /**
   * Chapa confirmed the money but the payment is not approved yet. The server
   * says so explicitly so we never show a success or a stale row status here.
   */
  confirmationPending?: boolean;
  /** Chapa positively confirmed money for this reference. */
  moneyVerified?: boolean;
  /**
   * Verified money that cannot be approved in this pass. The page must show
   * the review sentence rather than a success or a "not charged" failure.
   */
  underReview?: boolean;
  /** The message the student must see when the confirmation is pending. */
  message?: string | null;
}

const MAX_ATTEMPTS = 5;

function CallbackContent() {
  const searchParams = useSearchParams();
  const txRef = searchParams.get("tx");

  const [phase, setPhase] = useState<Phase>("verifying");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [chapaReceipt, setChapaReceipt] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [attemptKey, setAttemptKey] = useState(0);

  const verify = useCallback(async () => {
    if (!txRef) {
      setPhase("error");
      return;
    }

    // The webhook usually approves within a second or two, but it can lag.
    // Poll the verify endpoint a few times before giving up: a payment whose
    // confirmation is still pending often completes on Chapa's next redelivery.
    let confirmationPending = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await api.get<VerifyResult>(
          `/payments/chapa/verify/${encodeURIComponent(txRef)}`,
        );
        const data = res.data;
        if (data.chapaReceiptUrl) {
          setChapaReceipt(data.chapaReceiptUrl);
        }
        if (data.status === "APPROVED") {
          setPaymentId(data.paymentId ?? null);
          setReceiptNumber(data.receiptNumber ?? null);
          setChapaReceipt(data.chapaReceiptUrl ?? null);
          setPhase("approved");
          return;
        }
        if (data.underReview) {
          // The gateway confirmed money but the payment cannot be approved
          // automatically (terminal row or a mismatch). Show the fixed review
          // sentence — never a success, never a "not charged" failure — and
          // stop polling: the state is durable and needs a human.
          setPhase("review");
          return;
        }
        if (data.confirmationPending) {
          // Money is with us; the approval just has not landed yet. This must
          // never fall through to the failure screen, whatever the row status.
          confirmationPending = true;
        } else if (data.status === "REJECTED") {
          setPhase("error");
          return;
        }
      } catch {
        // transient — keep trying
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setPhase(confirmationPending ? "confirmation" : "pending");
  }, [txRef]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    verify();
  }, [verify, attemptKey]);

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
      toast.error("Could not load the receipt. You can also find it on your profile.");
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
              {chapaReceipt && (
                <a
                  href={chapaReceipt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-6
                    py-3 text-sm font-medium text-primary transition-colors
                    hover:bg-white/5"
                  style={{ border: "1px solid var(--border-default)" }}
                >
                  <ExternalLink className="h-4 w-4" />
                  View Chapa payment receipt
                </a>
              )}
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
                Download college receipt (PDF)
              </button>
              <p className="text-xs text-muted">
                Chapa&apos;s confirmation screen closes when you return here. The
                Chapa receipt link and your college receipt stay available on
                your profile.
              </p>
              <Link
                href="/dashboard"
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Go to dashboard
              </Link>
            </div>
          </>
        )}

        {phase === "confirmation" && (
          <>
            <Clock className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-semibold text-primary mb-2">
              Still confirming your payment
            </h1>
            <ConfirmationEndStateMessage
              reference={txRef ?? "your payment"}
              className="text-sm text-secondary mb-6"
            />
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setPhase("verifying");
                  setAttemptKey((n) => n + 1);
                }}
                className="inline-flex items-center justify-center gap-2 bg-accent
                  hover:bg-accent-hover text-white rounded-xl px-6 py-3 text-sm
                  font-medium"
              >
                <Clock className="h-4 w-4" />
                Check again
              </button>
              <Link
                href="/profile"
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Go to your profile
              </Link>
            </div>
          </>
        )}

        {phase === "review" && (
          <>
            <Clock className="h-12 w-12 text-accent mx-auto mb-4" />
            <h1 className="font-display text-2xl font-semibold text-primary mb-2">
              Payment received
            </h1>
            <PaymentUnderReviewMessage
              reference={txRef ?? "your payment"}
              className="text-sm text-secondary mb-6"
            />
            <div className="flex flex-col items-center gap-3">
              {chapaReceipt && (
                <a
                  href={chapaReceipt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-6
                    py-3 text-sm font-medium text-primary transition-colors
                    hover:bg-white/5"
                  style={{ border: "1px solid var(--border-default)" }}
                >
                  <ExternalLink className="h-4 w-4" />
                  View Chapa payment receipt
                </a>
              )}
              <Link
                href="/dashboard"
                className="inline-block bg-accent text-white rounded-xl px-6 py-3 text-sm font-medium"
              >
                Go to dashboard
              </Link>
              <Link
                href="/profile"
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Go to your profile
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
              minutes — check your profile or notifications. Please do not start
              another payment until it has been confirmed.
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
              We couldn&apos;t confirm a completed payment for this checkout. If
              your account was debited,{" "}
              <Link
                href="/support"
                className="underline underline-offset-2"
                style={{ color: "var(--teal)" }}
              >
                contact support
              </Link>{" "}
              before trying again — otherwise you can start over.
            </p>
            <div className="flex flex-col items-center gap-3">
              <Link
                href="/pricing"
                className="inline-block bg-accent text-white rounded-xl px-6 py-3 text-sm font-medium"
              >
                Back to pricing
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-secondary hover:text-primary transition-colors"
              >
                Back to dashboard
              </Link>
            </div>
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
