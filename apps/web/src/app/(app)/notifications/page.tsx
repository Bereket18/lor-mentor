"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import api from "@/lib/api";

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/notifications")
      .then((r) => setNotifications(r.data ?? []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Notifications</h1>
        <p className="text-secondary text-sm">Stay updated on your courses and AI content.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2DD4BF" }} />
        </div>
      ) : notifications.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center"
          style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
        >
          <Bell className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(45,212,191,0.3)" }} />
          <p className="text-secondary text-sm font-medium">No notifications yet</p>
          <p className="text-muted text-xs mt-1">You&apos;ll be notified when AI content is ready or your subscription status changes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl px-4 py-3.5"
              style={{
                background: n.isRead ? "var(--bg-surface)" : "rgba(45,212,191,0.04)",
                border: n.isRead ? "1px solid var(--border-default)" : "1px solid rgba(45,212,191,0.2)",
              }}
            >
              <p className="text-sm font-semibold text-primary">{n.title}</p>
              <p className="text-xs text-secondary mt-0.5">{n.message}</p>
              <p className="text-[10px] text-muted mt-1">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
