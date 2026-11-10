"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  apiErrorMessage,
  categoryLabel,
  relativeTime,
  SUPPORT_ADMIN_STATUS_META,
  SUPPORT_CATEGORY_OPTIONS,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";
import { formatDisplayDate } from "@/lib/dates";

interface AdminTicket {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  _count: { messages: number };
  user: { id: string; fullName: string; email: string; role: string };
}

interface TicketMessage {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  author: { id: string; fullName: string; role: string };
}

interface AdminTicketDetail extends Omit<AdminTicket, "_count" | "user"> {
  reference: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    phoneNumber: string | null;
  };
  messages: TicketMessage[];
}

interface TicketList {
  items: AdminTicket[];
  total: number;
  hasMore: boolean;
}

const STATUS_FILTERS: Array<{ value: SupportStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Needs an answer" },
  { value: "AWAITING_STUDENT", label: "Waiting for student" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

function StatusPill({ status }: { status: SupportStatus }) {
  const meta = SUPPORT_ADMIN_STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, background: meta.background }}
    >
      {meta.label}
    </span>
  );
}

function AdminSupportContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<SupportStatus | "ALL">("ALL");
  const [category, setCategory] = useState<SupportCategory | "ALL">("ALL");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("ticket"),
  );
  const [reply, setReply] = useState("");
  const [statusDraft, setStatusDraft] = useState<SupportStatus | null>(null);

  const listKey = [
    "admin",
    "support",
    "tickets",
    status,
    category,
    search,
  ] as const;
  const detailKey = (id: string) => ["admin", "support", "ticket", id] as const;

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (category !== "ALL") params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      const query = params.toString();
      return (
        (
          await api.get<TicketList>(
            `/admin/support/tickets${query ? `?${query}` : ""}`,
          )
        ).data ?? { items: [], total: 0, hasMore: false }
      );
    },
  });

  const detailQuery = useQuery({
    queryKey: detailKey(selectedId ?? ""),
    enabled: Boolean(selectedId),
    queryFn: async () =>
      (
        await api.get<AdminTicketDetail>(
          `/admin/support/tickets/${selectedId}`,
        )
      ).data,
  });

  function refresh(id?: string) {
    queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
    if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
  }

  const sendReply = useMutation({
    mutationFn: async () =>
      api.post(`/admin/support/tickets/${selectedId}/messages`, {
        body: reply.trim(),
      }),
    onSuccess: () => {
      setReply("");
      refresh(selectedId ?? undefined);
      toast.success("Reply sent to the student.");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not send the reply.")),
  });

  const updateStatus = useMutation({
    mutationFn: async (next: SupportStatus) =>
      api.patch(`/admin/support/tickets/${selectedId}/status`, {
        status: next,
      }),
    onSuccess: () => {
      refresh(selectedId ?? undefined);
      toast.success("Ticket status updated.");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not update the status.")),
  });

  const tickets = listQuery.data?.items ?? [];
  const detail = detailQuery.data;
  const effectiveStatus = statusDraft ?? detail?.status ?? "OPEN";

  function openTicket(id: string) {
    setSelectedId(id);
    setReply("");
    setStatusDraft(null);
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">
            Support inbox
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Answer student tickets. Replies reach the student in the app and by
            email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={listQuery.isFetching}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:text-primary disabled:opacity-50"
          style={{ borderColor: "var(--glass-border)" }}
        >
          <RefreshCw
            className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-2xl border p-3"
        style={{
          background: "var(--bg-glass)",
          borderColor: "var(--glass-border)",
        }}
        onSubmit={applyFilters}
      >
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-secondary">Status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as SupportStatus | "ALL")
            }
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-secondary">
            Category
          </span>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as SupportCategory | "ALL")
            }
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="ALL">All categories</option>
            {SUPPORT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-48 flex-1 text-xs">
          <span className="mb-1 block font-medium text-secondary">
            Search
          </span>
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Subject, reference, student name or email"
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <button
          type="submit"
          className="h-9 rounded-lg px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--teal)" }}
        >
          Apply
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-5">
        <section
          className={`space-y-2 lg:col-span-2 ${selectedId ? "hidden lg:block" : ""}`}
          aria-label="Ticket queue"
        >
          {listQuery.isPending ? (
            <div className="flex items-center justify-center rounded-2xl border p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : listQuery.isError ? (
            <div className="rounded-2xl border p-5 text-sm text-secondary">
              Could not load the queue.
            </div>
          ) : tickets.length === 0 ? (
            <div
              className="rounded-2xl border p-6 text-center"
              style={{
                background: "var(--bg-glass)",
                borderColor: "var(--glass-border)",
              }}
            >
              <p className="text-sm font-medium text-primary">
                Nothing in this view
              </p>
              <p className="mt-1 text-sm text-secondary">
                Change the filters, or the queue is clear.
              </p>
            </div>
          ) : (
            tickets.map((ticket) => {
              const active = ticket.id === selectedId;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => openTicket(ticket.id)}
                  className="w-full rounded-xl border p-3 text-left transition-colors"
                  style={{
                    background: active ? "var(--teal-dim)" : "var(--bg-glass)",
                    borderColor: active
                      ? "var(--teal-glow)"
                      : "var(--glass-border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold text-primary">
                      {ticket.subject}
                    </span>
                    <StatusPill status={ticket.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-secondary">
                    {ticket.user.fullName} · {ticket.user.email}
                  </p>
                  <p className="mt-0.5 text-xs text-secondary">
                    {categoryLabel(ticket.category)} ·{" "}
                    {relativeTime(ticket.lastMessageAt)} ·{" "}
                    {ticket._count.messages}{" "}
                    {ticket._count.messages === 1 ? "message" : "messages"}
                  </p>
                </button>
              );
            })
          )}
        </section>

        <section
          className={`lg:col-span-3 ${selectedId ? "" : "hidden lg:block"}`}
          aria-label="Ticket"
        >
          {!selectedId ? (
            <div
              className="flex h-full min-h-48 items-center justify-center rounded-2xl border p-6 text-center"
              style={{
                background: "var(--bg-glass)",
                borderColor: "var(--glass-border)",
              }}
            >
              <p className="text-sm text-secondary">
                Select a ticket to read it and reply.
              </p>
            </div>
          ) : detailQuery.isPending ? (
            <div className="flex min-h-48 items-center justify-center rounded-2xl border p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : detailQuery.isError || !detail ? (
            <div className="rounded-2xl border p-5 text-sm">
              <p className="text-secondary">Could not load this ticket.</p>
              <button
                type="button"
                onClick={() => detailQuery.refetch()}
                className="mt-2 text-sm font-semibold"
                style={{ color: "var(--teal)" }}
              >
                Try again
              </button>
            </div>
          ) : (
            <div
              className="rounded-2xl border"
              style={{
                background: "var(--bg-glass)",
                borderColor: "var(--glass-border)",
              }}
            >
              <div
                className="border-b p-4"
                style={{ borderColor: "var(--glass-border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-primary">
                      {detail.subject}
                    </h2>
                    <p className="mt-1 text-xs text-secondary">
                      {detail.user.fullName} ·{" "}
                      <a
                        href={`mailto:${detail.user.email}`}
                        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        style={{ color: "var(--teal)" }}
                      >
                        <Mail className="h-3 w-3" />
                        {detail.user.email}
                      </a>
                    </p>
                    <p className="mt-1 text-xs text-secondary">
                      {categoryLabel(detail.category)} · opened{" "}
                      {formatDisplayDate(detail.createdAt)}
                      {detail.reference ? ` · ref ${detail.reference}` : ""}
                      {detail.user.phoneNumber
                        ? ` · ${detail.user.phoneNumber}`
                        : ""}
                    </p>
                  </div>
                  <StatusPill status={detail.status} />
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex items-center gap-1 text-sm text-secondary transition-colors hover:text-primary lg:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Queue
                  </button>

                  <label className="ml-auto block text-xs">
                    <span className="mb-1 block font-medium text-secondary">
                      Status
                    </span>
                    <select
                      value={effectiveStatus}
                      onChange={(event) =>
                        setStatusDraft(event.target.value as SupportStatus)
                      }
                      className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {STATUS_FILTERS.filter(
                        (option) => option.value !== "ALL",
                      ).map((option) => (
                        <option key={option.value} value={option.value}>
                          {SUPPORT_ADMIN_STATUS_META[option.value as SupportStatus]
                            .label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => updateStatus.mutate(effectiveStatus)}
                    disabled={
                      updateStatus.isPending ||
                      effectiveStatus === detail.status
                    }
                    className="h-8 rounded-lg px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: "var(--teal)" }}
                  >
                    {updateStatus.isPending ? "Saving…" : "Update"}
                  </button>
                </div>
              </div>

              <div className="max-h-[26rem] space-y-3 overflow-y-auto p-4">
                {detail.messages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-xl border p-3"
                    style={{
                      background: message.isStaff
                        ? "var(--teal-dim)"
                        : "var(--bg-subtle)",
                      borderColor: message.isStaff
                        ? "var(--teal-glow)"
                        : "var(--glass-border)",
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-secondary">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {message.isStaff && (
                          <ShieldCheck className="h-3 w-3" />
                        )}
                        {message.isStaff
                          ? message.author.fullName
                          : detail.user.fullName}
                      </span>
                      <span>{relativeTime(message.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-primary">
                      {message.body}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className="border-t p-4"
                style={{ borderColor: "var(--glass-border)" }}
              >
                {detail.status === "CLOSED" ? (
                  <p className="text-sm text-secondary">
                    This ticket is closed. Set it to “Needs an answer” above to
                    reopen it before replying.
                  </p>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (reply.trim()) sendReply.mutate();
                    }}
                  >
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-secondary">
                        Reply to the student
                      </span>
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        maxLength={4000}
                        rows={4}
                        placeholder="Answer in plain language; the student sees this in the app and by email."
                        className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </label>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-xs text-secondary">
                        Sending marks the ticket “Waiting for student”.
                      </p>
                      <button
                        type="submit"
                        disabled={!reply.trim() || sendReply.isPending}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: "var(--teal)" }}
                      >
                        {sendReply.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send reply
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      }
    >
      <AdminSupportContent />
    </Suspense>
  );
}
