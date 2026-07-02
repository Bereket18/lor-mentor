"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Upload,
  ArrowLeft,
  CheckCircle2,
  Zap,
  Building2,
  Hash,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Plan {
  id: string;
  name: string;
  priceETB: string | number;
  durationMonths: number;
}

type Method = "chapa" | "manual";
type BankMode = "verify" | "upload";

// How each bank accepts its receipt lookup (mirrors the receipt-verifier API):
//  - "cbe": FT/transaction number + last 8 account digits
//  - "ref": a bare receipt id OR the full receipt URL (Telebirr)
//  - "url": the full receipt URL only
type BankInput = "cbe" | "ref" | "url";

const BANKS: { value: string; label: string; input: BankInput }[] = [
  { value: "cbe", label: "Commercial Bank of Ethiopia (CBE)", input: "cbe" },
  { value: "tele", label: "Telebirr", input: "ref" },
  { value: "dashen", label: "Dashen Bank", input: "url" },
  { value: "awash", label: "Awash Bank", input: "url" },
  { value: "boa", label: "Bank of Abyssinia (BOA)", input: "url" },
  { value: "zemen", label: "Zemen Bank", input: "url" },
];

function SubscribeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const { user, loading: authLoading } = useAuth();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [method, setMethod] = useState<Method>("chapa");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successKind, setSuccessKind] = useState<"review" | "approved">(
    "review",
  );
  const [file, setFile] = useState<File | null>(null);

  // Bank-transfer sub-mode: verify a reference (instant) or upload an image.
  const [bankMode, setBankMode] = useState<BankMode>("verify");
  const [bank, setBank] = useState<string>("cbe");
  const [reference, setReference] = useState("");
  const [account, setAccount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  const bankInput: BankInput =
    BANKS.find((b) => b.value === bank)?.input ?? "url";

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

  const priceLabel = plan
    ? `${Number(plan.priceETB).toLocaleString()} ETB`
    : "";

  async function handlePayOnline() {
    if (!planId) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post("/payments/chapa/initialize", { planId });
      // Hand off to Chapa's hosted checkout page.
      window.location.href = res.data.checkoutUrl;
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not start the online payment. Please try again.";
      setError(message);
      setSubmitting(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
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

      setSuccessKind("review");
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

  // Verify a transaction reference against the bank. On success the backend
  // either auto-approves (instant access) or files it for manual review.
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!planId) return;

    const ref = reference.trim();
    const url = receiptUrl.trim();
    if (bankInput === "url" ? !url : !ref) return;

    setSubmitting(true);
    setError("");

    try {
      const payload: {
        planId: string;
        bank: string;
        reference?: string;
        url?: string;
        account?: string;
      } = { planId, bank };

      if (bankInput === "url") {
        payload.url = url;
      } else {
        // CBE + Telebirr accept a bare reference; Telebirr also accepts a URL,
        // which we pass through as the reference (the API handles both).
        payload.reference = ref;
        if (bankInput === "cbe") payload.account = account.trim();
      }

      const res = await api.post("/payments/verify", payload);
      setSuccessKind(res.data?.autoApproved ? "approved" : "review");
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "We couldn't verify that reference. Please try again.";
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
    const approved = successKind === "approved";
    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h1 className="font-display text-2xl font-semibold text-primary mb-2">
            {approved ? "Payment verified" : "Receipt submitted"}
          </h1>
          <p className="text-sm text-secondary mb-6">
            {approved ? (
              <>
                Your <strong>{plan.name}</strong> subscription is now active.
                Your receipt has been generated.
              </>
            ) : (
              <>
                Your payment for <strong>{plan.name}</strong> is pending admin
                review. You&apos;ll get access once approved.
              </>
            )}
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
          Complete your payment
        </h1>
        <p className="text-sm text-secondary mb-8">
          {plan.name} — {priceLabel} · {plan.durationMonths} month
          {plan.durationMonths !== 1 ? "s" : ""}
        </p>

        {error && (
          <div className="bg-error/10 border border-error/20 text-error rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Method selector */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <button
            type="button"
            onClick={() => setMethod("chapa")}
            className={`glass-panel glass-panel-hover text-left p-4 rounded-2xl border transition-all
              ${
                method === "chapa"
                  ? "border-accent ring-1 ring-accent/40"
                  : "border-default"
              }`}
          >
            <Zap className="h-5 w-5 text-accent mb-2" />
            <p className="text-sm font-medium text-primary">Pay online</p>
            <p className="text-xs text-muted mt-0.5">
              Telebirr, CBE, bank or card — instant access
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMethod("manual")}
            className={`glass-panel glass-panel-hover text-left p-4 rounded-2xl border transition-all
              ${
                method === "manual"
                  ? "border-accent ring-1 ring-accent/40"
                  : "border-default"
              }`}
          >
            <Building2 className="h-5 w-5 text-secondary mb-2" />
            <p className="text-sm font-medium text-primary">Bank transfer</p>
            <p className="text-xs text-muted mt-0.5">
              Upload a receipt — approved within ~24h
            </p>
          </button>
        </div>

        {method === "chapa" ? (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              You&apos;ll be redirected to Chapa&apos;s secure checkout to pay{" "}
              <strong className="text-primary">{priceLabel}</strong>. Once
              payment is confirmed, your subscription activates automatically and
              your receipt is generated instantly.
            </p>
            <button
              type="button"
              onClick={handlePayOnline}
              disabled={submitting}
              className="w-full bg-accent hover:bg-accent-hover text-white
                font-medium rounded-xl py-3 flex items-center justify-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting to Chapa...
                </>
              ) : (
                `Pay ${priceLabel} now`
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Sub-mode: verify a reference (instant) vs upload an image. */}
            <div className="flex gap-1 p-1 bg-surface rounded-xl border border-default">
              <button
                type="button"
                onClick={() => {
                  setBankMode("verify");
                  setError("");
                }}
                className={`flex-1 text-xs font-medium rounded-lg py-2 transition-colors ${
                  bankMode === "verify"
                    ? "bg-accent text-white"
                    : "text-secondary hover:text-primary"
                }`}
              >
                Enter reference · instant
              </button>
              <button
                type="button"
                onClick={() => {
                  setBankMode("upload");
                  setError("");
                }}
                className={`flex-1 text-xs font-medium rounded-lg py-2 transition-colors ${
                  bankMode === "upload"
                    ? "bg-accent text-white"
                    : "text-secondary hover:text-primary"
                }`}
              >
                Upload image
              </button>
            </div>

            {bankMode === "verify" ? (
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                    BANK / PROVIDER
                  </label>
                  <select
                    aria-label="Bank or provider"
                    value={bank}
                    onChange={(e) => {
                      setBank(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-surface border border-default rounded-xl px-4 py-3
                      text-sm text-primary focus:border-accent focus:outline-none"
                  >
                    {BANKS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                {bankInput === "url" ? (
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                      RECEIPT URL
                    </label>
                    <input
                      type="url"
                      value={receiptUrl}
                      onChange={(e) => setReceiptUrl(e.target.value)}
                      placeholder="https://…"
                      className="w-full bg-surface border border-default rounded-xl px-4 py-3
                        text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                    <p className="text-xs text-muted mt-2">
                      Open the receipt link from your bank&apos;s SMS or app and
                      paste the full URL.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                        {bank === "tele"
                          ? "RECEIPT ID OR URL"
                          : "TRANSACTION / FT NUMBER"}
                      </label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={
                          bank === "tele" ? "e.g. CHQ0FJ403O" : "e.g. FT25211G11JQ"
                        }
                        className="w-full bg-surface border border-default rounded-xl px-4 py-3
                          text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                      />
                    </div>
                    {bankInput === "cbe" && (
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                          ACCOUNT (LAST 8 DIGITS)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={account}
                          onChange={(e) => setAccount(e.target.value)}
                          placeholder="e.g. 21827223"
                          className="w-full bg-surface border border-default rounded-xl px-4 py-3
                            text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                        />
                        <p className="text-xs text-muted mt-2">
                          CBE needs the last 8 digits of the paying account to
                          look up the receipt.
                        </p>
                      </div>
                    )}
                  </>
                )}

                <p className="text-xs text-muted flex items-start gap-1.5">
                  <Hash className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Transfer {priceLabel} to the college account first, then enter
                  your reference — verified transfers activate instantly.
                </p>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (bankInput === "url"
                      ? !receiptUrl.trim()
                      : !reference.trim())
                  }
                  className="w-full bg-accent hover:bg-accent-hover text-white
                    font-medium rounded-xl py-3 flex items-center justify-center gap-2
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    "Verify payment"
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleUpload} className="space-y-6">
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
                Transfer {priceLabel} to the college account, then upload your
                bank receipt screenshot.
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
            )}
          </div>
        )}
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
