"use client";

import { Bell, Loader2, CheckCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const LIST_KEY = ["notifications", "list"] as const;
const COUNT_KEY = ["notifications", "unread-count"] as const;

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data: notifications = [], isPending } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () =>
      (await api.get<Notification[]>("/notifications")).data ?? [],
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: LIST_KEY });
    queryClient.invalidateQueries({ queryKey: COUNT_KEY });
  }

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: refresh,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: refresh,
  });

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary mb-1">
            Notifications
          </h1>
          <p className="text-secondary text-sm">
            Stay updated on your courses, payments and AI content.
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="inline-flex items-center gap-1.5 text-xs font-semibold
              px-3 py-2 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
            style={{ background: "var(--teal-dim)", color: "var(--teal)" }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2DD4BF" }} />
        </div>
      ) : notifications.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center"
          style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
        >
          <Bell
            className="h-10 w-10 mx-auto mb-4"
            style={{ color: "rgba(45,212,191,0.3)" }}
          />
          <p className="text-secondary text-sm font-medium">
            No notifications yet
          </p>
          <p className="text-muted text-xs mt-1">
            You&apos;ll be notified when a payment is approved, AI content is
            ready, or your subscription status changes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => !n.isRead && markRead.mutate(n.id)}
              className="w-full text-left rounded-2xl px-4 py-3.5 transition-colors"
              style={{
                background: n.isRead
                  ? "var(--bg-surface)"
                  : "rgba(45,212,191,0.04)",
                border: n.isRead
                  ? "1px solid var(--border-default)"
                  : "1px solid rgba(45,212,191,0.2)",
                cursor: n.isRead ? "default" : "pointer",
              }}
            >
              <div className="flex items-start gap-2">
                {!n.isRead && (
                  <span
                    aria-hidden
                    className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "var(--teal)" }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">{n.title}</p>
                  <p className="text-xs text-secondary mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-muted mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
