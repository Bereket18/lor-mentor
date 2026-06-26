"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
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

  useEffect(() => {
    api.get("/audit")
      .then((r) => setLogs(r.data ?? []))
      .catch(() => setLogs([]))
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
              className="flex items-center gap-4 px-5 py-3.5 text-sm transition-colors"
              style={{ borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-primary font-medium truncate">{log.action}</p>
                {log.entityType && (
                  <p className="text-xs text-muted">{log.entityType} {log.entityId ? `· ${log.entityId.slice(0, 8)}…` : ""}</p>
                )}
              </div>
              <p className="text-xs text-muted flex-shrink-0">
                {log.actor?.fullName ?? "System"}
              </p>
              <p className="text-xs text-muted flex-shrink-0">
                {new Date(log.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
