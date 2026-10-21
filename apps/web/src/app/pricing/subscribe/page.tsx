"use client";

import { Suspense, useState, useEffect, useRef } from "react";
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
  Copy,
  Check,
  Camera,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Plan {
  id: string;
  name: string;
  priceETB: string | number;
  durationMonths: number;
}

interface BankAccount {
  bankCode?: string | null;
  label: string;
  accountName?: string | null;
  accountNumber: string;
  source?: "database";
}

type Method = "chapa" | "manual";
type BankMode = "verify" | "upload";

// How each bank accepts its receipt lookup (mirrors the receipt-verifier API):
//  - "cbe": FT/transaction number + last 8 account digits
//  - "ref": a bare receipt id OR the full receipt URL (Telebirr)
//  - "url": the full receipt URL only
type BankInput = "cbe" | "ref" | "url";

interface BankOption {
  code: string;
  label: string;
  input: BankInput;
  auto: boolean;
}

// Used until /payments/banks responds (and if the API is momentarily
// unavailable) so the picker is never empty. The server is authoritative.
const DEFAULT_BANKS: BankOption[] = [
  {
    code: "cbe",
    label: "Commercial Bank of Ethiopia (CBE)",
    input: "cbe",
    auto: true,
  },
  { code: "tele", label: "Telebirr", input: "ref", auto: true },
  { code: "dashen", label: "Dashen Bank", input: "url", auto: true },
  { code: "awash", label: "Awash Bank", input: "url", auto: true },
  {
    code: "boa",
    label: "Bank of Abyssinia (BOA)",
    input: "ref",
    auto: true,
  },
  { code: "zemen", label: "Zemen Bank", input: "url", auto: true },
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
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState("");

  // Camera capture is only a way to produce the same image the upload form
  // accepts. OCR/verification still happens server-side; the browser never
  // decides whether a receipt is valid.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Admin-managed list of banks the college accepts (GET /payments/banks).
  const { data: bankOptions } = useQuery({
    queryKey: ["payment-banks"],
    queryFn: async () => {
      const res = await api.get("/payments/banks");
      return (Array.isArray(res.data) ? res.data : []) as BankOption[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const banks = bankOptions ?? DEFAULT_BANKS;
  const noBanksAvailable =
    bankOptions !== undefined && bankOptions.length === 0;
  // If an admin removed the selected bank while the page was open, fall back
  // to the first still-accepted one without a state-syncing effect.
  const activeBank =
    bankOptions &&
    bankOptions.length > 0 &&
    !bankOptions.some((b) => b.code === bank)
      ? bankOptions[0].code
      : bank;
  const selectedBank = banks.find((b) => b.code === activeBank);
  const bankInput: BankInput = selectedBank?.input ?? "url";

  // CBE has two receipt generations: students can enter an FT number (with
  // the last 8 account digits below) or paste a full receipt link — legacy
  // apps.cbe.com.et links or new mbreciept short links. A link carries all
  // the data the backend needs, so the account-digits field is hidden then.
  const cbeLinkPasted =
    bankInput === "cbe" && /^https?:\/\//i.test(reference.trim());

  // College receiving accounts come from the API's public config endpoint
  // (previously missing entirely — audit finding F-12).
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await api.get("/payments/bank-accounts");
      return (Array.isArray(res.data) ? res.data : []) as BankAccount[];
    },
    staleTime: Infinity,
  });

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
    setResultMessage("");

    try {
      const formData = new FormData();
      formData.append("planId", planId);
      formData.append("receipt", file);

      const res = await api.post("/payments/submit", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // The backend scans the screenshot for a receipt QR and verifies it with
      // the bank when it can: auto-approved (instant access) or manual review.
      setResultMessage(
        typeof res.data?.message === "string" ? res.data.message : "",
      );
      setSuccessKind(res.data?.autoApproved ? "approved" : "review");
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
    setResultMessage("");

    try {
      const payload: {
        planId: string;
        bank: string;
        reference?: string;
        url?: string;
        account?: string;
      } = { planId, bank: activeBank };

      if (bankInput === "url") {
        payload.url = url;
      } else if (/^https?:\/\//i.test(ref)) {
        // Any receipt link pasted into the reference field goes through as a
        // URL (CBE legacy/short links, manual-review banks, etc.).
        payload.url = ref;
      } else {
        // CBE + Telebirr accept a bare reference.
        payload.reference = ref;
        if (bankInput === "cbe") payload.account = account.trim();
      }

      const res = await api.post("/payments/verify", payload);
      setResultMessage(
        typeof res.data?.message === "string" ? res.data.message : "",
      );
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

  async function copyAccount(accountNumber: string) {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopiedAccount(accountNumber);
      window.setTimeout(
        () => setCopiedAccount((cur) => (cur === accountNumber ? null : cur)),
        2000,
      );
    } catch {
      // Clipboard unavailable (e.g. insecure context) — the number stays
      // visible for manual selection.
    }
  }

  // Attach the camera stream once the preview element exists.
  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [cameraOpen]);

  // Always release the camera when the page unmounts.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Chapa's hosted checkout is a normal navigation, so pressing Back can
  // restore this page from the browser's back-forward cache with `submitting`
  // still true. Reset the button so it never stays stuck on "Opening secure
  // checkout…" after an abandoned payment.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitting(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function openCamera() {
    setCameraError("");
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Camera access is not available in this browser. Please choose an image file instead.",
      );
      return;
    }

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      setCameraError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera permission was denied. Allow camera access or choose an image file instead."
          : "Could not start the camera. Please choose an image file instead.",
      );
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("The camera is still starting. Please wait a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not capture the photo. Please choose an image file.");
      return;
    }
    context.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      setCameraError("Could not capture the photo. Please choose an image file.");
      return;
    }

    setFile(
      new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }),
    );
    setCameraError("");
    closeCamera();
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
            ) : resultMessage ? (
              <>{resultMessage}</>
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
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-secondary
              hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to pricing
          </Link>
        </div>

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
            onClick={() => {
              closeCamera();
              setMethod("chapa");
            }}
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
            onClick={() => {
              closeCamera();
              setMethod("manual");
            }}
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
              Enter a reference or upload a receipt
            </p>
          </button>
        </div>

        {method === "chapa" ? (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Chapa&apos;s secure checkout opens only after you click Pay. There
              you can pay <strong className="text-primary">{priceLabel}</strong>.
              Nothing is sent to the college until Chapa confirms the payment.
              Once confirmed, your subscription activates automatically and your
              receipt is generated instantly.
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
                  Opening secure checkout…
                </>
              ) : (
                `Pay ${priceLabel} now`
              )}
            </button>
          </div>
        ) : noBanksAvailable ? (
          <div className="bg-surface border border-default rounded-2xl p-4 text-sm text-secondary">
            No payment banks are currently available. Please contact the
            college.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Sub-mode: verify a reference (instant) vs upload an image. */}
            <div className="flex gap-1 p-1 bg-surface rounded-xl border border-default">
              <button
                type="button"
                onClick={() => {
                  closeCamera();
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
                  closeCamera();
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

            {/* College receiving accounts — students need these to actually
                make the transfer (audit finding F-12). The reference flow is
                where the transfer happens, so this panel stays there and is
                not repeated in the upload view. */}
            {bankMode === "verify" && bankAccounts.length > 0 && (
              <div className="bg-surface border border-default rounded-2xl p-4 space-y-3">
                <p className="text-xs font-medium text-secondary tracking-wide">
                  TRANSFER TO — COLLEGE RECEIVING ACCOUNTS
                </p>
                <ul className="space-y-2">
                  {bankAccounts.map((acct) => (
                    <li
                      key={acct.accountNumber}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-muted">
                          {acct.accountName
                            ? `${acct.label} — ${acct.accountName}`
                            : acct.label}
                        </p>
                        <p className="font-mono text-sm text-primary tracking-wide">
                          {acct.accountNumber}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyAccount(acct.accountNumber)}
                        className="shrink-0 inline-flex items-center gap-1.5 text-xs
                          font-medium text-secondary hover:text-primary border
                          border-default rounded-lg px-3 py-1.5 transition-colors"
                      >
                        {copiedAccount === acct.accountNumber ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-green-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">
                  Transfer {priceLabel} to one of these accounts, then verify
                  your reference below.
                </p>
              </div>
            )}

            {bankMode === "verify" ? (
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                    BANK / PROVIDER
                  </label>
                  <select
                    aria-label="Bank or provider"
                    value={activeBank}
                    onChange={(e) => {
                      setBank(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-surface border border-default rounded-xl px-4 py-3
                      text-sm text-primary focus:border-accent focus:outline-none"
                  >
                    {banks.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.label}
                        {b.auto ? "" : " — manual review"}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBank && !selectedBank.auto && (
                  <p className="text-xs text-secondary bg-surface border border-default rounded-xl px-3 py-2">
                    {selectedBank.label} receipts are verified manually by our
                    team — access is granted after review.
                  </p>
                )}

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
                        {selectedBank && !selectedBank.auto
                          ? "RECEIPT NUMBER OR LINK"
                          : activeBank === "tele"
                            ? "RECEIPT ID OR URL"
                            : activeBank === "cbe"
                              ? "FT NUMBER OR RECEIPT LINK"
                              : activeBank === "boa"
                                ? "BOA TRANSACTION REFERENCE"
                                : "TRANSACTION / FT NUMBER"}
                      </label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={
                          selectedBank && !selectedBank.auto
                            ? "e.g. receipt number or paste receipt link"
                            : activeBank === "tele"
                              ? "e.g. CHQ0FJ403O"
                              : activeBank === "cbe"
                                ? "e.g. FT25211G11JQ or paste receipt link"
                                : activeBank === "boa"
                                  ? "e.g. BOA transaction reference"
                                  : "e.g. FT25211G11JQ"
                        }
                        className="w-full bg-surface border border-default rounded-xl px-4 py-3
                          text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                      />
                      {cbeLinkPasted && (
                        <p className="text-xs text-muted mt-2">
                          Receipt link detected — no account digits needed.
                        </p>
                      )}
                    </div>
                    {bankInput === "cbe" && !cbeLinkPasted && (
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-2 tracking-wide">
                          ACCOUNT (LAST 8 DIGITS)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={account}
                          onChange={(e) => setAccount(e.target.value)}
                          placeholder="Last 8 digits"
                          className="w-full bg-surface border border-default rounded-xl px-4 py-3
                            text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                        />
                        <p className="text-xs text-muted mt-2">
                          Use the last 8 digits of the college&apos;s CBE
                          account. Other account numbers are rejected.
                        </p>
                      </div>
                    )}
                  </>
                )}

                <p className="text-xs text-muted flex items-start gap-1.5">
                  <Hash className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {selectedBank && !selectedBank.auto
                    ? `Transfer ${priceLabel} to the college account first, then enter your receipt details — our team will review them.`
                    : `Transfer ${priceLabel} to the college account first, then enter your reference — verified transfers activate instantly.`}
                </p>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (bankInput === "url"
                      ? !receiptUrl.trim()
                      : !reference.trim() ||
                        (bankInput === "cbe" &&
                          !cbeLinkPasted &&
                          !account.trim()))
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
                  <button
                    type="button"
                    onClick={() => void openCamera()}
                    className="flex items-center justify-center gap-2 w-full mb-2
                      bg-surface border border-default rounded-xl py-2.5 text-sm
                      text-secondary hover:text-primary hover:border-accent/50
                      transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    Take a photo with camera
                  </button>
                  {cameraError && (
                    <p className="text-xs text-error mb-2">{cameraError}</p>
                  )}
                  <label
                    className="flex flex-col items-center justify-center w-full h-40
                  bg-surface border-2 border-dashed border-default rounded-2xl
                  cursor-pointer hover:border-accent/50 transition-colors"
                  >
                    <Upload className="h-6 w-6 text-muted mb-2" />
                    <span className="text-sm text-secondary text-center px-4">
                      {file
                        ? file.name
                        : "Choose an image file, or use the camera above"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <p className="text-xs text-muted mt-2">
                    Transfer {priceLabel} to the college account, then upload a
                    bank receipt screenshot. We read the receipt&apos;s QR code
                    and verify it with the bank automatically when possible;
                    otherwise an admin reviews it. Camera access needs HTTPS (or
                    localhost) and your permission.
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
                    "Submit receipt"
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface border border-default rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-primary">
                Take a photo of the receipt
              </p>
              <p className="text-xs text-muted mt-0.5">
                Fill the frame with the receipt, including its QR code.
              </p>
            </div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[3/4] rounded-xl bg-black object-cover"
            />
            {cameraError && (
              <p className="text-xs text-error">{cameraError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void capturePhoto()}
                className="flex-1 bg-accent hover:bg-accent-hover text-white
                  font-medium rounded-xl py-2.5 text-sm"
              >
                Capture photo
              </button>
              <button
                type="button"
                onClick={closeCamera}
                className="flex-1 border border-default text-secondary
                  hover:text-primary rounded-xl py-2.5 text-sm"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-muted">
              The photo is uploaded to the server for OCR and bank
              verification. Nothing is approved on your device.
            </p>
          </div>
        </div>
      )}
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
