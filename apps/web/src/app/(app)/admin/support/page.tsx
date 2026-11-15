"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  TimerReset,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog-provider";
import { useSupportPolling } from "@/hooks/use-support-polling";
import {
  apiErrorMessage,
  categoryLabel,
  relativeTime,
  SUPPORT_CATEGORY_OPTIONS,
} from "@/lib/support";
import type {
  AdminTicketSummary,
  PagedResult,
  SupportCategory,
  SupportStatus,
} from "@/lib/support-types";
import { Select } from "@/components/ui/select";
import { StatusPill, UnreadDot } from "@/components/support/status-pill";

const STATUS_FILTERS: Array<{ value: SupportStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Needs an answer" },
  { value: "AWAITING_STUDENT", label: "Waiting for student" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const ASSIGNED_FILTERS = [
  { value: "ALL", label: "Anyone" },
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
];

export default function AdminSupportQueuePage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const polling = useSupportPolling();

  const [status, setStatus] = useState<SupportStatus | "ALL">("ALL");
  const [category, setCategory] = useState<SupportCategory | "ALL">("ALL");
  const [assignedTo, setAssignedTo] = useState("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const listQuery = useQuery({
    queryKey: [
      "admin",
      "support",
      "tickets",
      status,
      category,
      assignedTo,
      unreadOnly,
      search,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (category !== "ALL") params.set("category", category);
      if (assignedTo !== "ALL") params.set("assignedTo", assignedTo);
      if (unreadOnly) params.set("unreadOnly", "true");
      if (search.trim()) params.set("search", search.trim());
      const query = params.toString();
      return (
        (
          await api.get<PagedResult<AdminTicketSummary>>(
            `/admin/support/tickets${query ? `?${query}` : ""}`,
          )
        ).data ?? { items: [], total: 0, hasMore: false }
      );
    },
    refetchInterval: (query) => polling.intervalFor(query.state.fetchFailureCount),
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  const bulkClose = useMutation({
    mutationFn: async (olderThanDays: number) => {
      const response = await api.post<{ closed: number; numbers: number[] }>(
        "/admin/support/tickets/bulk-close-resolved",
        { olderThanDays },
      );
      return response.data;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
      toast.success(
        result.closed === 0
          ? "No resolved tickets were old enough to close."
          : `${result.closed} resolved ${result.closed === 1 ? "ticket" : "tickets"} closed.`,
      );
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not run the bulk close.")),
  });

  const tickets = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? tickets.length;

  async function runBulkClose() {
    const ok = await confirm({
      title: "Close resolved tickets?",
      description:
        "This closes every ticket that has been RESOLVED for more than seven days and has had no new activity. Students are told to open a new ticket if they still need help.",
      confirmLabel: "Close resolved tickets",
      destructive: true,
    });
    if (ok) bulkClose.mutate(7);
  }

  function applySearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">
            Support inbox
          </h1>
          <p className="mt-1 text-sm text-secondary">
            {total} {total === 1 ? "ticket" : "tickets"} in this view. Replies
            reach the student in the app and by email; internal notes never do.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
            className="inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-[var(--teal-dim)] disabled:opacity-50"
            style={{
              borderColor: "var(--glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            <RefreshCw
              className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runBulkClose()}
            disabled={bulkClose.isPending}
            className="inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-[var(--teal-dim)] disabled:opacity-50"
            style={{
              borderColor: "var(--glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            {bulkClose.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <TimerReset className="h-4 w-4" aria-hidden="true" />
            )}
            Close stale resolved
          </button>
        </div>
      </header>

      <section
        className="rounded-2xl border p-3 sm:p-4"
        style={{
          borderColor: "var(--glass-border)",
          background: "var(--bg-glass)",
        }}
        aria-label="Ticket filters"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Status
            </span>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as SupportStatus | "ALL")
              }
              options={STATUS_FILTERS}
              ariaLabel="Filter by status"
            />
          </div>
          <div>
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Category
            </span>
            <Select
              value={category}
              onValueChange={(value) =>
                setCategory(value as SupportCategory | "ALL")
              }
              options={[
                { value: "ALL", label: "All categories" },
                ...SUPPORT_CATEGORY_OPTIONS,
              ]}
              ariaLabel="Filter by category"
            />
          </div>
          <div>
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Assignment
            </span>
            <Select
              value={assignedTo}
              onValueChange={setAssignedTo}
              options={ASSIGNED_FILTERS}
              ariaLabel="Filter by assignment"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((value) => !value)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors"
              style={{
                borderColor: unreadOnly ? "var(--teal)" : "var(--glass-border)",
                background: unreadOnly ? "var(--teal-dim)" : "transparent",
                color: unreadOnly ? "var(--teal)" : "var(--text-secondary)",
              }}
            >
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Unread only
            </button>
          </div>
        </div>

        <form onSubmit={applySearch} className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="admin-support-search" className="sr-only">
            Search tickets
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--text-secondary)" }}
            />
            <input
              id="admin-support-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Subject, ticket number, reference, student name or email"
              className="h-11 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              style={{
                borderColor: "var(--glass-border)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--teal)" }}
          >
            Apply
          </button>
        </form>
      </section>

      <section aria-label="Ticket queue" aria-busy={listQuery.isFetching}>
        {listQuery.isPending ? (
          <div className="flex items-center justify-center rounded-2xl border p-10">
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: "var(--text-secondary)" }}
              aria-hidden="true"
            />
            <span className="sr-only">Loading queue</span>
          </div>
        ) : listQuery.isError ? (
          <div
            className="rounded-2xl border p-5 text-sm text-secondary"
            style={{ borderColor: "var(--glass-border)" }}
          >
            Could not load the queue.
            <button
              type="button"
              onClick={() => void listQuery.refetch()}
              className="ml-2 inline-flex h-11 items-center font-semibold"
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
            <Inbox
              className="mx-auto h-7 w-7"
              style={{ color: "var(--text-secondary)" }}
              aria-hidden="true"
            />
            <p className="mt-2 text-sm font-medium text-primary">
              Nothing in this view
            </p>
            <p className="mt-1 text-sm text-secondary">
              Change the filters, or wait for a student to write in.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/admin/support/${ticket.id}`}
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
                      <span
                        className="text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {ticket.ticketNumber}
                      </span>
                      <StatusPill status={ticket.status} admin />
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {categoryLabel(ticket.category)}
                      </span>
                      {ticket.unread && (
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: "var(--teal)" }}
                        >
                          Unread
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold text-primary">
                      {ticket.subject}
                    </span>
                    <span
                      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <span className="truncate">
                        {ticket.user.fullName} · {ticket.user.email}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Updated {relativeTime(ticket.lastMessageAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {ticket.assignedTo
                          ? `Assigned to ${ticket.assignedTo.fullName}`
                          : "Unassigned"}
                      </span>
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
