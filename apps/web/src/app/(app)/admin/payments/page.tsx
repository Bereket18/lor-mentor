"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileText,
  Zap,
  Building2,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Search,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { toast } from "sonner";

type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVERSED";
// "ALL" is a client-side convenience value: it simply omits the status query
// parameter, so the server returns every payment in the queue.
type PaymentFilter = PaymentStatus | "ALL";

// Normalized receipt data attached to auto-verified bank transfers (mirrors the
// receipt-verifier contract). `reviewNote` is set when it needs manual review.
interface Verification {
  bank?: string;
  reference?: string | null;
  amount?: number | null;
  receiverAccount?: string | null;
  receiverName?: string | null;
  payerName?: string | null;
  status?: string | null;
  statusKnown?: boolean;
  statusOk?: boolean | null;
  reviewNote?: string;
  verifierCode?: string;
  decision?: string;
  submittedReference?: string;
  submittedUrl?: string;
  submittedAccountMatched?: boolean;
}

interface Payment {
  id: string;
  status: PaymentStatus;
  method: "MANUAL" | "CHAPA";
  receiptNumber?: string | null;
  createdAt: string;
  receiptPath?: string | null;
  bankName?: string | null;
  bankReference?: string | null;
  verification?: Verification | null;
  reversalReason?: string | null;
  user: {
    fullName: string;
    email: string;
    phoneNumber?: string | null;
  };
  plan: {
    name: string;
    priceETB: string | number;
  };
}

const statusColors: Record<PaymentStatus, string> = {
  PENDING: "text-yellow-400 bg-yellow-500/10",
  APPROVED: "text-green-400 bg-green-500/10",
  REJECTED: "text-red-400 bg-red-500/10",
  REVERSED: "text-orange-400 bg-orange-500/10",
};

// Status buckets for the counts and the per-status empty states. The page
// opens on the full queue (all statuses, newest first) and filters on demand.
// Reversed lives in its own status (not mixed into Rejected) so the rejection
// reason stays unambiguous.
const TABS: { key: PaymentStatus; label: string; empty: string }[] = [
  { key: "PENDING", label: "Pending", empty: "No pending payments to review." },
  { key: "APPROVED", label: "Approved", empty: "No approved payments yet." },
  { key: "REJECTED", label: "Rejected", empty: "No rejected payments." },
  { key: "REVERSED", label: "Reversed", empty: "No reversed payments." },
];

const EMPTY_COUNTS: Record<PaymentStatus, number> = {
  PENDING: 0,
  APPROVED: 0,
  REJECTED: 0,
  REVERSED: 0,
};

// Renders the data extracted from a bank receipt so an admin can eyeball it.
// A green header means every auto-approval check passed; amber means it was
// routed here for review (reviewNote explains why).
function hasReviewEvidence(payment: Payment) {
  const v = payment.verification;
  return Boolean(
    payment.receiptPath ||
    payment.bankReference ||
    v?.submittedReference ||
    v?.submittedUrl ||
    v?.reference ||
    v?.amount != null ||
    v?.receiverAccount,
  );
}

function VerificationStrip({
  payment,
  v,
}: {
  payment: Payment;
  v: Verification;
}) {
  const flagged = Boolean(v.reviewNote);
  const reference =
    v.reference ?? payment.bankReference ?? v.submittedReference ?? "—";
  const hasExtractedEvidence = Boolean(
    v.amount != null ||
    v.payerName ||
    v.receiverName ||
    v.receiverAccount ||
    v.statusKnown !== undefined,
  );
  const fields: [string, string][] = [
    ["Reference", reference],
    ["Amount", v.amount != null ? `${v.amount.toLocaleString()} ETB` : "—"],
    ["Payer", v.payerName ?? "—"],
    ["Receiver", v.receiverName ?? "—"],
    ["Receiver acct", v.receiverAccount ?? "—"],
    [
      "Bank status",
      v.statusKnown === true
        ? (v.status ?? "—")
        : v.statusKnown === false
          ? "not reported by bank"
          : "—",
    ],
  ];

  return (
    <div className="px-5 pb-4">
      <div className="glass-panel rounded-xl px-4 py-3">
        <div
          className={`flex items-center gap-1.5 text-xs font-medium mb-2 ${
            flagged ? "text-yellow-400" : "text-green-400"
          }`}
        >
          {flagged ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {flagged ? "Needs review" : "Auto-verified from bank receipt"}
          {v.bank && <span className="text-muted uppercase">· {v.bank}</span>}
        </div>

        {flagged && (
          <p className="text-xs text-yellow-400/90 mb-2">{v.reviewNote}</p>
        )}

        {!hasExtractedEvidence && (
          <p className="text-xs text-secondary mb-2">
            No bank fields were extracted. Review the submitted reference or
            receipt link before deciding.
          </p>
        )}

        {v.submittedAccountMatched && (
          <p className="text-xs text-green-400/90 mb-2">
            CBE lookup used a configured college receiving account.
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] uppercase text-muted">{label}</p>
              <p className="text-xs text-secondary truncate" title={value}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {v.submittedUrl && (
          <a
            href={v.submittedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-xs font-medium
              text-accent hover:text-accent-hover transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open submitted bank receipt
          </a>
        )}
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState<PaymentFilter>("ALL");
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [counts, setCounts] =
    useState<Record<PaymentStatus, number>>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);
  // Guards against a slow response from a previous tab overwriting the list
  // after the admin has already switched tabs.
  const requestSeq = useRef(0);

  const loadPayments = useCallback(async (status: PaymentFilter, term: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const res = await api.get("/payments/admin", {
        params: {
          ...(status !== "ALL" ? { status } : {}),
          ...(term.trim() ? { search: term.trim() } : {}),
        },
      });
      if (seq !== requestSeq.current) return;
      setPayments(res.data.payments ?? []);
      setCounts({ ...EMPTY_COUNTS, ...(res.data.counts ?? {}) });
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not load payments",
      );
      setPayments([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPayments(activeTab, search);
  }, [activeTab, search, loadPayments]);

  async function handleApprove(id: string) {
    setActionId(id);
    try {
      await api.patch(`/payments/${id}/approve`);
      await loadPayments(activeTab, search);
      toast.success("Payment approved");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not approve payment",
      );
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(id: string) {
    setActionId(id);
    try {
      await api.patch(`/payments/${id}/reject`, {
        reason: "Receipt could not be verified",
      });
      await loadPayments(activeTab, search);
      toast.success("Payment rejected");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not reject payment",
      );
    } finally {
      setActionId(null);
    }
  }

  function openReverseDialog(payment: Payment) {
    setReverseTarget(payment);
    setReverseReason("");
  }

  function closeReverseDialog() {
    if (reversing) return;
    setReverseTarget(null);
    setReverseReason("");
  }

  async function handleReverse() {
    if (!reverseTarget || !reverseReason.trim()) return;
    setReversing(true);
    try {
      const res = await api.patch(`/payments/${reverseTarget.id}/reverse`, {
        reason: reverseReason.trim(),
      });
      toast.success(res.data?.message ?? "Payment reversed");
      setReverseTarget(null);
      setReverseReason("");
      await loadPayments(activeTab, search);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not reverse payment",
      );
    } finally {
      setReversing(false);
    }
  }

  // MANUAL payments have an uploaded bank-receipt image.
  async function openReceiptImage(id: string) {
    try {
      const res = await api.get(`/payments/${id}/receipt`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch {
      toast.error("Could not load receipt image");
    }
  }

  // Any APPROVED payment has an auto-generated PDF receipt.
  async function openReceiptPdf(id: string) {
    try {
      const res = await api.get(`/payments/${id}/document`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch {
      toast.error("Could not load the PDF receipt");
    }
  }

  const totalCount = TABS.reduce((n, tab) => n + counts[tab.key], 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Payment Review
      </h1>

      {/* -- Filter toolbar: mirrors the admin-users toolbar (Option A) —
             same controls, sizing and surface. All statuses are listed
             newest-first by default; the counts come from the server with
             the same base scope and search term as the listed rows. ----- */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            aria-label="Search payments"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-primary placeholder:text-muted outline-none transition-all"
            style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.1)" }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.4)"; }}
            onBlur={(e) => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.1)"; }}
          />
        </div>

        {/* Status filter (counts per status come from the same scoped query) */}
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as PaymentFilter)}
          aria-label="Filter by status"
          className="px-3.5 py-2.5 rounded-xl text-sm text-primary outline-none transition-all"
          style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.1)" }}
        >
          <option value="ALL">All payments ({totalCount})</option>
          {TABS.map((tab) => (
            <option key={tab.key} value={tab.key}>
              {tab.label} ({counts[tab.key]})
            </option>
          ))}
        </select>

        {(search || activeTab !== "ALL") && (
          <button
            onClick={() => { setSearch(""); setActiveTab("ALL"); }}
            className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-primary transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted text-center py-12">
          {search.trim()
            ? "No payments match the search."
            : activeTab === "ALL"
              ? "No payments yet."
              : (TABS.find((t) => t.key === activeTab)?.empty ?? "No payments.")}
        </p>
      ) : (
        <div className="bg-surface border border-default rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-default">
            <span className="col-span-3 text-xs font-medium text-muted uppercase">
              Student
            </span>
            <span className="col-span-2 text-xs font-medium text-muted uppercase">
              Phone
            </span>
            <span className="col-span-2 text-xs font-medium text-muted uppercase">
              Plan
            </span>
            <span className="col-span-2 text-xs font-medium text-muted uppercase">
              Status
            </span>
            <span className="col-span-3 text-xs font-medium text-muted uppercase">
              Actions
            </span>
          </div>

          {payments.map((payment, i) => {
            const reviewEvidence = hasReviewEvidence(payment);
            return (
              <div
                key={payment.id}
                className={
                  i < payments.length - 1 ? "border-b border-subtle" : ""
                }
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 items-start md:grid-cols-12 md:gap-4 md:px-5 md:items-center">
                  <div className="col-span-2 min-w-0 md:col-span-3">
                    <p className="text-sm font-medium text-primary truncate">
                      {payment.user.fullName}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {payment.user.email}
                    </p>
                  </div>

                  <p className="col-span-2 text-sm text-secondary md:col-span-2">
                    <span className="md:hidden text-xs text-muted">Phone: </span>
                    {payment.user.phoneNumber ?? "—"}
                  </p>

                  <div className="col-span-1 min-w-0 md:col-span-2">
                    <p className="text-sm text-primary break-words">{payment.plan.name}</p>
                    <p className="text-xs text-muted">
                      {Number(payment.plan.priceETB).toLocaleString()} ETB
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 mt-1 text-[10px] font-medium
                    px-1.5 py-0.5 rounded ${
                      payment.method === "CHAPA"
                        ? "text-accent bg-accent/10"
                        : "text-secondary bg-white/5"
                    }`}
                    >
                      {payment.method === "CHAPA" ? (
                        <Zap className="h-3 w-3" />
                      ) : (
                        <Building2 className="h-3 w-3" />
                      )}
                      {payment.method === "CHAPA" ? "Online" : "Manual"}
                    </span>
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-lg ${statusColors[payment.status]}`}
                    >
                      {payment.status}
                    </span>
                    {payment.status === "REVERSED" &&
                      payment.reversalReason && (
                        <p
                          className="text-[10px] text-muted mt-1 truncate"
                          title={payment.reversalReason}
                        >
                          {payment.reversalReason}
                        </p>
                      )}
                  </div>

                  <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 md:col-span-3 md:flex-nowrap md:gap-2">
                    {payment.receiptPath && (
                      <button
                        type="button"
                        onClick={() => openReceiptImage(payment.id)}
                        className="flex items-center gap-1 text-xs font-medium text-accent
                      hover:text-accent-hover transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Image
                      </button>
                    )}

                    {payment.status === "APPROVED" && (
                      <button
                        type="button"
                        onClick={() => openReceiptPdf(payment.id)}
                        className="flex items-center gap-1 text-xs font-medium text-secondary
                      hover:text-primary transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        PDF
                      </button>
                    )}

                    {payment.status === "APPROVED" && isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => openReverseDialog(payment)}
                        title="Reverse this approved payment"
                        className="flex items-center gap-1 text-xs font-medium
                      text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reverse
                      </button>
                    )}

                    {payment.status === "PENDING" && (
                      <>
                        {payment.method === "MANUAL" && reviewEvidence && (
                          <button
                            onClick={() => handleApprove(payment.id)}
                            disabled={actionId === payment.id}
                            className="flex items-center gap-1 text-xs font-medium
                          text-green-400 hover:text-green-300 disabled:opacity-50"
                          >
                            {actionId === payment.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => handleReject(payment.id)}
                          disabled={actionId === payment.id}
                          className="flex items-center gap-1 text-xs font-medium
                        text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {payment.verification && (
                  <VerificationStrip
                    payment={payment}
                    v={payment.verification}
                  />
                )}
                {payment.status === "PENDING" && !reviewEvidence && (
                  <p className="px-5 pb-4 text-xs text-red-400">
                    Approval blocked: no receipt or bank evidence is stored.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* -- Reverse payment dialog (SUPER_ADMIN only) ---------------- */}
      <Dialog
        open={Boolean(reverseTarget)}
        onOpenChange={(open) => {
          if (!open) closeReverseDialog();
        }}
      >
        <DialogContent className="max-w-md gap-5 border border-default bg-surface p-5 text-primary">
          <DialogHeader>
            <DialogTitle className="text-base text-primary">Reverse this payment?</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm leading-relaxed text-secondary">
              {reverseTarget
                ? `${reverseTarget.user.fullName}'s ${reverseTarget.plan.name} payment will be marked as reversed and the receipt number invalidated. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-secondary">
            If no other approved payment backs the student&apos;s
            subscription, their access is removed and they must pay again.
          </p>

          <div>
            <label
              htmlFor="reverse-reason"
              className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase"
            >
              Reason <span style={{ color: "var(--state-error)" }}>*</span>
            </label>
            <textarea
              id="reverse-reason"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              rows={3}
              placeholder="Why is this approved payment being reversed? Recorded in the audit log."
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary placeholder:text-muted/60 outline-none resize-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid rgba(45,212,191,0.12)",
              }}
            />
          </div>

          <DialogFooter className="mx-0 mb-0 gap-2 rounded-none border-0 bg-transparent p-0">
            <button
              type="button"
              onClick={closeReverseDialog}
              disabled={reversing}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-secondary hover:text-primary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReverse}
              disabled={reversing || !reverseReason.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#DC2626" }}
            >
              {reversing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {reversing ? "Reversing…" : "Reverse payment"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
