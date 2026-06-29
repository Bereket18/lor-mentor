"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * Topbar bell showing the live unread-notification count. Polls every 60s and
 * shares the ["notifications","unread-count"] cache key so the notifications
 * page can invalidate it after marking things read.
 */
export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () =>
      (await api.get<{ count: number }>("/notifications/unread-count")).data,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const count = data?.count ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
      className="relative w-9 h-9 flex items-center justify-center rounded-xl
        transition-all text-[var(--text-secondary)]
        hover:text-[var(--text-primary)] hover:bg-[var(--teal-dim)]"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full
            text-[10px] font-bold flex items-center justify-center text-white"
          style={{ background: "#EF4444" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
