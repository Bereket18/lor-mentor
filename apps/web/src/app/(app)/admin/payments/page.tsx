"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import api from "@/lib/api";

interface Payment {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
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

  async function openReceipt(id: string) {
    try {
      const res = await api.get(`/payments/${id}/receipt`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch {
      alert("Could not load receipt image");
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
              className={`grid grid-cols-12 gap-4 px-5 py-4 items-center
                ${i < payments.length - 1 ? "border-b border-subtle" : ""}`}
            >
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
              </div>

              <div className="col-span-2">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-lg ${statusColors[payment.status]}`}
                >
                  {payment.status}
                </span>
              </div>

              <div className="col-span-3 flex items-center gap-2">
                <button
                  onClick={() => openReceipt(payment.id)}
                  className="flex items-center gap-1 text-xs font-medium text-accent
                    hover:text-accent-hover transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Receipt
                </button>

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
          ))}
        </div>
      )}
    </div>
  );
}
