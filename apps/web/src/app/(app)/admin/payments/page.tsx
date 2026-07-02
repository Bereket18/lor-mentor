"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import api from "@/lib/api";

import { toast } from "sonner";

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
}

interface Payment {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  method: "MANUAL" | "CHAPA";
  receiptNumber?: string | null;
  createdAt: string;
  bankName?: string | null;
  bankReference?: string | null;
  verification?: Verification | null;
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

const statusColors = {
  PENDING: "text-yellow-400 bg-yellow-500/10",
  APPROVED: "text-green-400 bg-green-500/10",
  REJECTED: "text-red-400 bg-red-500/10",
};

// Renders the data extracted from a bank receipt so an admin can eyeball it.
// A green header means every auto-approval check passed; amber means it was
// routed here for review (reviewNote explains why).
function VerificationStrip({ v }: { v: Verification }) {
  const flagged = Boolean(v.reviewNote);
  const fields: [string, string][] = [
    ["Reference", v.reference ?? "—"],
    ["Amount", v.amount != null ? `${v.amount.toLocaleString()} ETB` : "—"],
    ["Payer", v.payerName ?? "—"],
    ["Receiver", v.receiverName ?? "—"],
    ["Receiver acct", v.receiverAccount ?? "—"],
    [
      "Bank status",
      v.statusKnown ? (v.status ?? "—") : "not reported by bank",
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
          {v.bank && (
            <span className="text-muted uppercase">· {v.bank}</span>
          )}
        </div>

        {flagged && (
          <p className="text-xs text-yellow-400/90 mb-2">{v.reviewNote}</p>
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
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/payments/admin");
      setPayments(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPayments();
  }, [loadPayments]);

  async function handleApprove(id: string) {
    setActionId(id);
    try {
      await api.patch(`/payments/${id}/approve`);
      await loadPayments();
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
      await loadPayments();
    } finally {
      setActionId(null);
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Payment Review
      </h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted text-center py-12">
          No payments submitted yet.
        </p>
      ) : (
        <div className="bg-surface border border-default rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-default">
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

          {payments.map((payment, i) => (
            <div
              key={payment.id}
              className={
                i < payments.length - 1 ? "border-b border-subtle" : ""
              }
            >
            <div className="grid grid-cols-12 gap-4 px-5 py-4 items-center">
              <div className="col-span-3 min-w-0">
                <p className="text-sm font-medium text-primary truncate">
                  {payment.user.fullName}
                </p>
                <p className="text-xs text-muted truncate">
                  {payment.user.email}
                </p>
              </div>

              <p className="col-span-2 text-sm text-secondary">
                {payment.user.phoneNumber ?? "—"}
              </p>

              <div className="col-span-2">
                <p className="text-sm text-primary">{payment.plan.name}</p>
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

              <div className="col-span-2">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-lg ${statusColors[payment.status]}`}
                >
                  {payment.status}
                </span>
              </div>

              <div className="col-span-3 flex items-center gap-2">
                {payment.method === "MANUAL" && (
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

                {payment.status === "PENDING" && (
                  <>
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
              <VerificationStrip v={payment.verification} />
            )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
