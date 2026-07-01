"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Trash2, Check, Loader2, Flag } from "lucide-react";
import api from "@/lib/api";

import { toast } from "sonner";

interface Author { id: string; fullName: string; role: string }
interface Report {
  id: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  reporter: { id: string; fullName: string };
  post: { id: string; title: string; content: string; isRemoved: boolean; author: Author } | null;
  reply: { id: string; content: string; isRemoved: boolean; author: Author } | null;
}

const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam", OFFENSIVE: "Offensive", OFF_TOPIC: "Off-topic", OTHER: "Other",
};

export default function ModerationPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.get<Report[]>("/forum/reports")
      .then((r) => setReports(r.data ?? []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, []);

  async function resolve(id: string, action: "REMOVE" | "DISMISS") {
    setBusyId(id);
    try {
      await api.patch(`/forum/reports/${id}`, { action });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(239,68,68,0.12)" }}>
          <ShieldAlert className="h-5 w-5" style={{ color: "var(--state-error)" }} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">Moderation</h1>
          <p className="text-secondary text-sm">Review reported forum content.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl skeleton" />)}</div>
      ) : reports.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Check className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--state-success)", opacity: 0.6 }} />
          <p className="text-secondary text-sm font-medium">All clear</p>
          <p className="text-muted text-xs mt-1">No pending reports to review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const target = r.post ?? r.reply;
            const isThread = !!r.post;
            return (
              <div key={r.id} className="glass-panel p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ background: "rgba(239,68,68,0.12)", color: "var(--state-error)" }}>
                    <Flag className="h-3 w-3" /> {REASON_LABEL[r.reason] ?? r.reason}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "var(--teal-dim)", color: "var(--teal)" }}>
                    {isThread ? "Thread" : "Reply"}
                  </span>
                  <span className="text-xs text-muted ml-auto">
                    reported by {r.reporter.fullName}
                  </span>
                </div>

                {/* Reported content preview */}
                <div className="rounded-xl p-3 mb-3" style={{ background: "var(--bg-elevated)" }}>
                  {isThread && r.post && (
                    <p className="text-sm font-semibold text-primary mb-1">{r.post.title}</p>
                  )}
                  <p className="text-sm text-secondary whitespace-pre-wrap line-clamp-4">
                    {target?.content}
                  </p>
                  <p className="text-[11px] text-muted mt-2">
                    by {target?.author.fullName}
                    {target?.isRemoved && " · already removed"}
                  </p>
                </div>

                {r.note && (
                  <p className="text-xs text-muted italic mb-3">“{r.note}”</p>
                )}

                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => resolve(r.id, "REMOVE")} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50"
                    style={{ background: "var(--state-error)" }}>
                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Remove content
                  </button>
                  <button type="button" onClick={() => resolve(r.id, "DISMISS")} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
                    <Check className="h-3.5 w-3.5" /> Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
