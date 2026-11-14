"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDisplayDate } from "@/lib/dates";
import { useSupportPolling } from "@/hooks/use-support-polling";
import {
  apiErrorMessage,
  categoryLabel,
  formatPaymentAmount,
} from "@/lib/support";
import type { StudentTicketDetail } from "@/lib/support-types";
import { StatusPill } from "@/components/support/status-pill";
import { MessageComposer, TicketThread } from "@/components/support/thread";

export default function StudentTicketThreadPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const queryClient = useQueryClient();
  const polling = useSupportPolling();
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const markedRead = useRef<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["support", "ticket", ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () =>
      (await api.get<StudentTicketDetail>(`/support/tickets/${ticketId}`)).data,
    refetchInterval: (query) => polling.intervalFor(query.state.fetchFailureCount),
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const detail = detailQuery.data;

  // Opening the thread is reading it: stamp the student's read marker once per
  // ticket so the list's unread dot clears. Server-side truth, not local state.
  useEffect(() => {
    if (!detail?.unread || markedRead.current === detail.id) return;
    markedRead.current = detail.id;
    void api
      .post(`/support/tickets/${detail.id}/read`)
      .then(() => queryClient.invalidateQueries({ queryKey: ["support", "tickets"] }))
      .catch(() => undefined);
  }, [detail, queryClient]);

  const sendReply = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("body", reply.trim());
      for (const file of files) form.append("attachments", file);
      await api.post(`/support/tickets/${ticketId}/messages`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      setReply("");
      setFiles([]);
      void queryClient.invalidateQueries({
        queryKey: ["support", "ticket", ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      toast.success("Reply sent.");
      composerRef.current?.focus();
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not send the reply.")),
  });

  const resolveTicket = useMutation({
    mutationFn: async () => {
      await api.patch(`/support/tickets/${ticketId}/resolve`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["support", "ticket", ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      toast.success("Ticket marked resolved.");
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not resolve the ticket.")),
  });

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2
          className="h-5 w-5 animate-spin"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        />
        <span className="sr-only">Loading ticket</span>
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/support/tickets"
          className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold"
          style={{ color: "var(--teal)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          My tickets
        </Link>
        <div
          className="rounded-2xl border p-6"
          style={{ borderColor: "var(--glass-border)" }}
        >
          <p className="text-sm text-secondary">
            This ticket could not be loaded. It may have been deleted, or the
            link may belong to another account.
          </p>
          <button
            type="button"
            onClick={() => void detailQuery.refetch()}
            className="mt-2 inline-flex h-11 items-center text-sm font-semibold"
            style={{ color: "var(--teal)" }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const readOnly = !detail.canReply;
  const isResolved = detail.status === "RESOLVED";
  const isClosed = detail.status === "CLOSED";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/support/tickets"
            className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--teal)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            My tickets
          </Link>
          <Link
            href="/support/new"
            className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            New ticket
          </Link>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              {detail.ticketNumber}
            </span>
            <StatusPill status={detail.status} />
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {categoryLabel(detail.category)}
            </span>
          </div>
          <h1 className="mt-1 font-display text-xl font-semibold text-primary sm:text-2xl">
            {detail.subject}
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Opened {formatDisplayDate(detail.createdAt)}
            {detail.reference ? ` · Reference ${detail.reference}` : ""}
          </p>
        </div>
      </header>

      {detail.payment && (
        <section
          className="rounded-xl border p-4"
          style={{
            borderColor: "var(--glass-border)",
            background: "var(--bg-glass)",
          }}
          aria-label="Related payment"
        >
          <h2 className="flex items-center gap-2 text-xs font-semibold text-primary">
            <CreditCard className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} />
            Related payment
          </h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt style={{ color: "var(--text-muted)" }}>Amount</dt>
              <dd style={{ color: "var(--text-secondary)" }}>
                {formatPaymentAmount(detail.payment.amount, detail.payment.currency)}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--text-muted)" }}>Plan</dt>
              <dd style={{ color: "var(--text-secondary)" }}>
                {detail.payment.planName ?? "—"}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--text-muted)" }}>Status</dt>
              <dd style={{ color: "var(--text-secondary)" }}>
                {detail.payment.status}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--text-muted)" }}>Receipt</dt>
              <dd className="truncate" style={{ color: "var(--text-secondary)" }}>
                {detail.payment.receiptNumber ?? "Not issued"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {(isResolved || isClosed) && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--glass-border)",
            background: "var(--bg-glass)",
            color: "var(--text-secondary)",
          }}
        >
          {isClosed ? (
            <span className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              This ticket is closed and read-only. If you still need help, open
              a new ticket and quote {detail.ticketNumber}.
            </span>
          ) : readOnly ? (
            <span>
              This ticket was resolved and the reply window has ended. Open a
              new ticket and quote {detail.ticketNumber}.
            </span>
          ) : (
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                Marked resolved. Replying before{" "}
                {detail.reopenUntil ? formatDisplayDate(detail.reopenUntil) : "the window ends"}{" "}
                reopens this ticket.
              </span>
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Reply below to reopen
              </span>
            </span>
          )}
        </div>
      )}

      <section aria-label="Conversation" className="space-y-4">
        {detail.messages.length === 0 ? null : (
          <TicketThread messages={detail.messages} perspective="student" />
        )}
      </section>

      {!readOnly && !isResolved && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => resolveTicket.mutate()}
            disabled={resolveTicket.isPending}
            className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{
              borderColor: "var(--glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            {resolveTicket.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            Mark as resolved
          </button>
        </div>
      )}

      <section
        className="rounded-2xl border p-4"
        style={{
          borderColor: "var(--glass-border)",
          background: "var(--bg-glass)",
        }}
        aria-label="Reply"
      >
        <h2 className="mb-2 text-sm font-semibold text-primary">
          {isResolved ? "Reply to reopen" : "Reply"}
        </h2>
        <MessageComposer
          value={reply}
          onChange={setReply}
          onSend={() => sendReply.mutate()}
          pending={sendReply.isPending}
          disabled={readOnly}
          disabledReason={
            isClosed
              ? "This ticket is closed and read-only. Open a new ticket if you still need help."
              : "The reply window for this resolved ticket has ended. Open a new ticket and quote this number."
          }
          placeholder="Add anything that will help the college answer…"
          files={files}
          onFilesChange={setFiles}
          textareaRef={composerRef}
          sendLabel="Send reply"
        />
      </section>
    </div>
  );
}
