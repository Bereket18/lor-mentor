"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  apiErrorMessage,
  categoryLabel,
  relativeTime,
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_STATUS_META,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";
import { formatDisplayDate } from "@/lib/dates";

interface TicketSummary {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  _count: { messages: number };
}

interface TicketMessage {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  author: { id: string; fullName: string; role: string };
}

interface TicketDetail extends Omit<TicketSummary, "_count"> {
  messages: TicketMessage[];
}

interface TicketList {
  items: TicketSummary[];
  total: number;
}

const LIST_KEY = ["support", "tickets"] as const;
const detailKey = (id: string) => ["support", "ticket", id] as const;

function StatusPill({ status }: { status: SupportStatus }) {
  const meta = SUPPORT_STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, background: meta.background }}
    >
      {meta.label}
    </span>
  );
}

function SupportContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("ticket"),
  );
  const [showForm, setShowForm] = useState(false);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("PAYMENT");
  const [reference, setReference] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");

  const listQuery = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () =>
      (await api.get<TicketList>("/support/tickets")).data ?? {
        items: [],
        total: 0,
      },
  });

  const detailQuery = useQuery({
    queryKey: detailKey(selectedId ?? ""),
    enabled: Boolean(selectedId),
    queryFn: async () =>
      (await api.get<TicketDetail>(`/support/tickets/${selectedId}`)).data,
  });

  function refresh(id?: string) {
    queryClient.invalidateQueries({ queryKey: LIST_KEY });
    if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
  }

  const createTicket = useMutation({
    mutationFn: async () =>
      (
        await api.post<TicketDetail>("/support/tickets", {
          subject: subject.trim(),
          category,
          body: body.trim(),
          reference: reference.trim() || undefined,
        })
      ).data,
    onSuccess: (ticket) => {
      setSubject("");
      setReference("");
      setBody("");
      setShowForm(false);
      setSelectedId(ticket.id);
      refresh(ticket.id);
      toast.success("Ticket sent. The college will reply here and by email.");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not send the ticket.")),
  });

  const sendReply = useMutation({
    mutationFn: async () =>
      api.post(`/support/tickets/${selectedId}/messages`, {
        body: reply.trim(),
      }),
    onSuccess: () => {
      setReply("");
      refresh(selectedId ?? undefined);
      toast.success("Reply sent.");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not send the reply.")),
  });

  const closeTicket = useMutation({
    mutationFn: async () =>
      api.patch(`/support/tickets/${selectedId}/close`),
    onSuccess: () => {
      refresh(selectedId ?? undefined);
      toast.success("Ticket closed.");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not close the ticket.")),
  });

  const tickets = listQuery.data?.items ?? [];
  const detail = detailQuery.data;
  const detailStatus = detail?.status;

  function openTicket(id: string) {
    setSelectedId(id);
    setReply("");
  }

  const canSubmit =
    subject.trim().length >= 4 &&
    body.trim().length >= 10 &&
    !createTicket.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">
            Support
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Ask the college about a payment, your account or your courses.
            Replies arrive here and by email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--teal)" }}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New ticket
        </button>
      </div>

      {showForm && (
        <form
          className="rounded-2xl border p-5"
          style={{
            background: "var(--bg-glass)",
            borderColor: "var(--glass-border)",
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) createTicket.mutate();
          }}
        >
          <h2 className="mb-4 text-sm font-semibold text-primary">
            Start a conversation
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-secondary">
                Subject
              </span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={120}
                minLength={4}
                required
                placeholder="Payment not showing on my account"
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-secondary">
                Category
              </span>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as SupportCategory)
                }
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-secondary">
              Payment reference or receipt number{" "}
              <span className="font-normal text-muted">(optional)</span>
            </span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              placeholder="e.g. FT260311ABC"
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>

          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-secondary">
              What happened?
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
              minLength={10}
              required
              rows={5}
              placeholder="Tell the college what you need help with. Include the date and the reference if you have one."
              className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-secondary transition-colors hover:text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--teal)" }}
            >
              {createTicket.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send ticket
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <section
          className={`space-y-2 lg:col-span-2 ${selectedId ? "hidden lg:block" : ""}`}
          aria-label="Your tickets"
        >
          {listQuery.isPending ? (
            <div className="flex items-center justify-center rounded-2xl border p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : listQuery.isError ? (
            <div className="rounded-2xl border p-5 text-sm">
              <p className="text-secondary">Could not load your tickets.</p>
              <button
                type="button"
                onClick={() => listQuery.refetch()}
                className="mt-2 text-sm font-semibold"
                style={{ color: "var(--teal)" }}
              >
                Try again
              </button>
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
                No tickets yet
              </p>
              <p className="mt-1 text-sm text-secondary">
                Open one and the college will answer here.
              </p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm font-semibold"
                style={{ color: "var(--teal)" }}
              >
                Start a conversation
              </button>
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
                  <p className="mt-1 text-xs text-secondary">
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
          aria-label="Conversation"
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
                Select a ticket to read the conversation.
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
              <div className="border-b p-4" style={{ borderColor: "var(--glass-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-primary">
                      {detail.subject}
                    </h2>
                    <p className="mt-1 text-xs text-secondary">
                      {categoryLabel(detail.category)} · opened{" "}
                      {formatDisplayDate(detail.createdAt)}
                      {detail.reference ? ` · ref ${detail.reference}` : ""}
                    </p>
                  </div>
                  <StatusPill status={detail.status} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex items-center gap-1 text-sm text-secondary transition-colors hover:text-primary lg:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    All tickets
                  </button>
                  {detail.status !== "CLOSED" && (
                    <button
                      type="button"
                      onClick={() => closeTicket.mutate()}
                      disabled={closeTicket.isPending}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-secondary transition-colors hover:text-primary disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Close ticket
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
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
                      <span className="font-semibold">
                        {message.isStaff ? "College support" : "You"}
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
                {detailStatus === "CLOSED" ? (
                  <p className="flex items-start gap-2 text-sm text-secondary">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    You closed this ticket. If the problem comes back, open a
                    new ticket.
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
                        Reply
                      </span>
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        maxLength={4000}
                        rows={3}
                        placeholder="Add anything the college should know."
                        className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </label>
                    <div className="mt-2 flex justify-end">
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

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      }
    >
      <SupportContent />
    </Suspense>
  );
}
