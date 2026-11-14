"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  Ticket,
} from "lucide-react";
import api from "@/lib/api";
import { useSupportPolling } from "@/hooks/use-support-polling";
import { relativeTime } from "@/lib/support";
import type {
  PagedResult,
  StudentTicketSummary,
  SupportStatus,
} from "@/lib/support-types";
import { Select } from "@/components/ui/select";
import { StatusPill, UnreadDot } from "@/components/support/status-pill";

const STATUS_FILTERS: Array<{ value: SupportStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All tickets" },
  { value: "OPEN", label: "Waiting for the college" },
  { value: "AWAITING_STUDENT", label: "Waiting for me" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export default function SupportTicketsPage() {
  const [status, setStatus] = useState<SupportStatus | "ALL">("ALL");
  const polling = useSupportPolling();

  const listQuery = useQuery({
    queryKey: ["support", "tickets", "list", status],
    queryFn: async () => {
      const query = status === "ALL" ? "" : `?status=${status}`;
      return (
        (
          await api.get<PagedResult<StudentTicketSummary>>(
            `/support/tickets${query}`,
          )
        ).data ?? { items: [], total: 0 }
      );
    },
    refetchInterval: (query) => polling.intervalFor(query.state.fetchFailureCount),
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  const tickets = listQuery.data?.items ?? [];
  const unreadCount = tickets.filter((ticket) => ticket.unread).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-3">
        <Link
          href="/support"
          className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold"
          style={{ color: "var(--teal)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Help centre
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-primary">
              My tickets
            </h1>
            <p className="mt-1 text-sm text-secondary">
              Every conversation with the college, newest activity first.
              {unreadCount > 0 &&
                ` ${unreadCount} ${unreadCount === 1 ? "ticket has" : "tickets have"} a new reply.`}
            </p>
          </div>
          <Link
            href="/support/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--teal)" }}
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            New ticket
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <span
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
            aria-hidden="true"
          >
            Filter by status
          </span>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as SupportStatus | "ALL")}
            options={STATUS_FILTERS}
            ariaLabel="Filter tickets by status"
          />
        </div>
      </div>

      <section aria-label="Your tickets" aria-busy={listQuery.isFetching}>
        {listQuery.isPending ? (
          <div className="flex items-center justify-center rounded-2xl border p-10">
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: "var(--text-secondary)" }}
              aria-hidden="true"
            />
            <span className="sr-only">Loading tickets</span>
          </div>
        ) : listQuery.isError ? (
          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--glass-border)" }}
          >
            <p className="text-sm text-secondary">
              Could not load your tickets.
            </p>
            <button
              type="button"
              onClick={() => void listQuery.refetch()}
              className="mt-2 inline-flex h-11 items-center text-sm font-semibold"
              style={{ color: "var(--teal)" }}
            >
              Try again
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div
            className="rounded-2xl border p-8 text-center"
            style={{
              borderColor: "var(--glass-border)",
              background: "var(--bg-glass)",
            }}
          >
            <Ticket
              className="mx-auto h-7 w-7"
              style={{ color: "var(--text-secondary)" }}
              aria-hidden="true"
            />
            <p className="mt-2 text-sm font-medium text-primary">
              {status === "ALL"
                ? "No tickets yet"
                : "No tickets with that status"}
            </p>
            <p className="mt-1 text-sm text-secondary">
              Open a ticket and the college will answer here and by email.
            </p>
            <Link
              href="/support/new"
              className="mt-3 inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-white"
              style={{ background: "var(--teal)" }}
            >
              Open a ticket
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/support/tickets/${ticket.id}`}
                  className="flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-[var(--teal-dim)]"
                  style={{
                    borderColor: "var(--glass-border)",
                    background: "var(--bg-glass)",
                  }}
                >
                  {ticket.unread ? (
                    <UnreadDot className="mt-1.5" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-2.5 w-2.5 rounded-full"
                      style={{ background: "var(--glass-border)" }}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                        {ticket.ticketNumber}
                      </span>
                      <StatusPill status={ticket.status} />
                      {ticket.unread && (
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: "var(--teal)" }}
                        >
                          New reply
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold text-primary">
                      {ticket.subject}
                    </span>
                    <span
                      className="mt-1 block text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Updated {relativeTime(ticket.lastMessageAt)} ·{" "}
                      {ticket._count.messages}{" "}
                      {ticket._count.messages === 1 ? "message" : "messages"}
                    </span>
                  </span>
                  <ChevronRight
                    className="mt-1 h-4 w-4 flex-shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
