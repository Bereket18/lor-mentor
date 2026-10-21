"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import api from "@/lib/api";

interface AuditLog {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  actor?: { fullName: string; email: string } | null;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/audit")
      .then((r) => setLogs(r.data ?? []))
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        setError(
          status === 403
            ? "Audit logs are visible to super admins only."
            : "Could not load audit logs. Try again later.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Audit Logs</h1>
        <p className="text-secondary text-sm">Track all admin actions on the platform.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2DD4BF" }} />
        </div>
      ) : error ? (
        <div
          className="rounded-2xl p-16 text-center"
          style={{ border: "1px dashed rgba(239,68,68,0.25)" }}
        >
          <AlertTriangle className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(239,68,68,0.4)" }} />
          <p className="text-secondary text-sm font-medium">{error}</p>
        </div>
      ) : logs.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center"
          style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
        >
          <BarChart3 className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(45,212,191,0.3)" }} />
          <p className="text-secondary text-sm font-medium">No audit logs yet</p>
          <p className="text-muted text-xs mt-1">Admin actions will be recorded here.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
          {logs.map((log, i) => (
            <div
              key={log.id}
              className="flex flex-col gap-1 px-4 py-3.5 text-sm transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-5"
              style={{ borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              <div className="min-w-0 sm:flex-1">
                <p className="text-primary font-medium truncate">{log.action}</p>
                {log.entityType && (
                  <p className="text-xs text-muted">{log.entityType} {log.entityId ? `· ${log.entityId.slice(0, 8)}…` : ""}</p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted sm:flex-shrink-0">
                <span className="truncate">{log.actor?.fullName ?? "System"}</span>
                <span aria-hidden>·</span>
                <span className="flex-shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
