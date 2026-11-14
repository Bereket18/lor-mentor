"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Mail,
  StickyNote,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatDisplayDate } from "@/lib/dates";
import { useConfirm } from "@/components/ui/confirm-dialog-provider";
import { useSupportPolling } from "@/hooks/use-support-polling";
import {
  apiErrorMessage,
  categoryLabel,
  formatPaymentAmount,
  relativeTime,
  SUPPORT_ADMIN_STATUS_META,
} from "@/lib/support";
import type {
  AdminTicketDetail,
  CannedReply,
  StaffOption,
  SupportStatus,
} from "@/lib/support-types";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/support/status-pill";
import { MessageComposer, TicketThread } from "@/components/support/thread";

const STATUS_OPTIONS: Array<{ value: SupportStatus; label: string }> = [
  { value: "OPEN", label: SUPPORT_ADMIN_STATUS_META.OPEN.label },
  {
    value: "AWAITING_STUDENT",
    label: SUPPORT_ADMIN_STATUS_META.AWAITING_STUDENT.label,
  },
  { value: "RESOLVED", label: SUPPORT_ADMIN_STATUS_META.RESOLVED.label },
  { value: "CLOSED", label: SUPPORT_ADMIN_STATUS_META.CLOSED.label },
];

type Tab = "conversation" | "notes";

export default function AdminTicketThreadPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const polling = useSupportPolling();

  const [tab, setTab] = useState<Tab>("conversation");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [cannedId, setCannedId] = useState("none");
  const [note, setNote] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const detailQuery = useQuery({
    queryKey: ["admin", "support", "ticket", ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () =>
      (
        await api.get<AdminTicketDetail>(
          `/admin/support/tickets/${ticketId}`,
        )
      ).data,
    refetchInterval: (query) => polling.intervalFor(query.state.fetchFailureCount),
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const cannedQuery = useQuery({
    queryKey: ["admin", "support", "canned-replies"],
    queryFn: async () =>
      (await api.get<{ items: CannedReply[] }>("/admin/support/canned-replies"))
        .data.items,
    staleTime: Infinity,
  });

  const staffQuery = useQuery({
    queryKey: ["admin", "support", "staff"],
    queryFn: async () =>
      (await api.get<{ items: StaffOption[] }>("/admin/support/staff")).data
        .items,
    staleTime: 60_000,
  });

  const detail = detailQuery.data;

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["admin", "support", "ticket", ticketId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["admin", "support", "tickets"],
    });
  }

  const sendReply = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("body", reply.trim());
      for (const file of files) form.append("attachments", file);
      await api.post(`/admin/support/tickets/${ticketId}/messages`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      setReply("");
      setFiles([]);
      setCannedId("none");
      refresh();
      toast.success("Reply sent to the student.");
      composerRef.current?.focus();
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not send the reply.")),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/support/tickets/${ticketId}/notes`, {
        body: note.trim(),
      });
    },
    onSuccess: () => {
      setNote("");
      refresh();
      toast.success("Internal note added. The student cannot see it.");
      noteRef.current?.focus();
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not add the note.")),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: SupportStatus) => {
      await api.patch(`/admin/support/tickets/${ticketId}/status`, { status });
    },
    onSuccess: () => {
      refresh();
      toast.success("Ticket status updated.");
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not update the status.")),
  });

  const assign = useMutation({
    mutationFn: async (assignedToId: string | null) => {
      await api.patch(`/admin/support/tickets/${ticketId}/assign`, {
        assignedToId,
      });
    },
    onSuccess: () => {
      refresh();
      toast.success("Assignment updated.");
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not update the assignment.")),
  });

  async function changeStatus(next: SupportStatus) {
    if (next === detail?.status) return;
    if (next === "CLOSED") {
      const ok = await confirm({
        title: "Close this ticket?",
        description:
          "A closed ticket is read-only for the student. They must open a new ticket if they still need help.",
        confirmLabel: "Close ticket",
        destructive: true,
      });
      if (!ok) return;
    }
    updateStatus.mutate(next);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Tab = tab === "conversation" ? "notes" : "conversation";
    setTab(next);
    const buttons =
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[next === "conversation" ? 0 : 1]?.focus();
  }

  function insertCanned(value: string) {
    setCannedId(value);
    if (value === "none") return;
    const canned = cannedQuery.data?.find((item) => item.id === value);
    if (!canned) return;
    setReply((current) =>
      current.trim() ? `${current.trimEnd()}\n\n${canned.body}` : canned.body,
    );
    // Reset so the same reply can be inserted again after editing.
    setCannedId("none");
    composerRef.current?.focus();
  }

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
          href="/admin/support"
          className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold"
          style={{ color: "var(--teal)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Support inbox
        </Link>
        <div
          className="rounded-2xl border p-6 text-sm text-secondary"
          style={{ borderColor: "var(--glass-border)" }}
        >
          This ticket could not be loaded.
          <button
            type="button"
            onClick={() => void detailQuery.refetch()}
            className="ml-2 inline-flex h-11 items-center font-semibold"
            style={{ color: "var(--teal)" }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const cannedSorted = [...(cannedQuery.data ?? [])].sort((a, b) => {
    const aMatch = a.category === detail.category ? 0 : 1;
    const bMatch = b.category === detail.category ? 0 : 1;
    return aMatch - bMatch;
  });

  const cannedOptions = [
    { value: "none", label: "Insert a canned reply…" },
    ...cannedSorted.map((item) => ({
      value: item.id,
      label:
        item.category === detail.category
          ? `${item.title} (matches topic)`
          : item.title,
    })),
  ];

  const canReply = detail.status !== "CLOSED";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/admin/support"
            className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--teal)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Support inbox
          </Link>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Last student activity {relativeTime(detail.lastMessageAt)}
          </span>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              {detail.ticketNumber}
            </span>
            <StatusPill status={detail.status} admin />
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {categoryLabel(detail.category)}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Opened {formatDisplayDate(detail.createdAt)}
            </span>
          </div>
          <h1 className="mt-1 font-display text-xl font-semibold text-primary sm:text-2xl">
            {detail.subject}
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            {detail.user.fullName} · {detail.user.email}
            {detail.reference ? ` · Reference ${detail.reference}` : ""}
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          className="min-w-0 rounded-2xl border"
          style={{
            borderColor: "var(--glass-border)",
            background: "var(--bg-glass)",
          }}
        >
          <div
            role="tablist"
            aria-label="Ticket sections"
            className="flex gap-1 border-b p-2"
            style={{ borderColor: "var(--glass-border)" }}
            onKeyDown={onTabKeyDown}
          >
            <button
              type="button"
              role="tab"
              id="tab-conversation"
              aria-selected={tab === "conversation"}
              aria-controls="panel-conversation"
              tabIndex={tab === "conversation" ? 0 : -1}
              onClick={() => setTab("conversation")}
              className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors"
              style={{
                background:
                  tab === "conversation" ? "var(--teal-dim)" : "transparent",
                color:
                  tab === "conversation"
                    ? "var(--teal)"
                    : "var(--text-secondary)",
              }}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Conversation
              <span className="text-[11px] font-normal">
                ({detail.messages.length})
              </span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-notes"
              aria-selected={tab === "notes"}
              aria-controls="panel-notes"
              tabIndex={tab === "notes" ? 0 : -1}
              onClick={() => setTab("notes")}
              className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors"
              style={{
                background: tab === "notes" ? "var(--teal-dim)" : "transparent",
                color:
                  tab === "notes" ? "var(--teal)" : "var(--text-secondary)",
              }}
            >
              <StickyNote className="h-4 w-4" aria-hidden="true" />
              Internal notes
              <span className="text-[11px] font-normal">
                ({detail.internalNotes.length})
              </span>
            </button>
          </div>

          {tab === "conversation" ? (
            <div
              role="tabpanel"
              id="panel-conversation"
              aria-labelledby="tab-conversation"
              className="space-y-4 p-4"
            >
              <TicketThread
                messages={detail.messages}
                perspective="staff"
                emptyText="No student messages in this ticket."
              />
              <div
                className="border-t pt-4"
                style={{ borderColor: "var(--glass-border)" }}
              >
                <MessageComposer
                  value={reply}
                  onChange={setReply}
                  onSend={() => sendReply.mutate()}
                  pending={sendReply.isPending}
                  disabled={!canReply}
                  disabledReason="This ticket is closed. Set its status to OPEN (or AWAITING_STUDENT) in the panel before replying."
                  placeholder="Write the reply the student will see…"
                  files={files}
                  onFilesChange={setFiles}
                  textareaRef={composerRef}
                  sendLabel="Send to student"
                  accessory={
                    canReply ? (
                      <div>
                        <span
                          className="mb-1 block text-xs font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Canned replies
                        </span>
                        <Select
                          value={cannedId}
                          onValueChange={insertCanned}
                          options={cannedOptions}
                          ariaLabel="Insert a canned reply"
                          disabled={cannedQuery.isPending}
                        />
                      </div>
                    ) : undefined
                  }
                />
              </div>
            </div>
          ) : (
            <div
              role="tabpanel"
              id="panel-notes"
              aria-labelledby="tab-notes"
              className="space-y-4 p-4"
            >
              <p
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{
                  borderColor: "var(--glass-border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                }}
              >
                <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                Internal notes are visible only to administrators. They are
                never sent to the student, never emailed, and never appear on a
                student response.
              </p>

              {detail.internalNotes.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  No internal notes yet.
                </p>
              ) : (
                <ul className="space-y-2" aria-label="Internal notes">
                  {detail.internalNotes.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border px-3 py-2"
                      style={{
                        borderColor: "var(--glass-border)",
                        background: "var(--bg-elevated)",
                      }}
                    >
                      <p
                        className="text-[11px] font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.author.fullName} · {relativeTime(item.createdAt)}
                      </p>
                      <p
                        className="mt-1 whitespace-pre-wrap break-words text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {item.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <label htmlFor="internal-note" className="sr-only">
                  New internal note
                </label>
                <textarea
                  id="internal-note"
                  ref={noteRef}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder="Add context for other administrators…"
                  className="w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  style={{
                    borderColor: "var(--glass-border)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                  }}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => addNote.mutate()}
                    disabled={addNote.isPending || note.trim().length === 0}
                    className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "var(--teal)" }}
                  >
                    {addNote.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <StickyNote className="h-4 w-4" aria-hidden="true" />
                    )}
                    Add note
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: "var(--glass-border)",
              background: "var(--bg-glass)",
            }}
            aria-labelledby="student-heading"
          >
            <h2
              id="student-heading"
              className="flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <UserRound className="h-4 w-4" style={{ color: "var(--teal)" }} />
              Student
            </h2>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Name</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {detail.user.fullName}
                </dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Email</dt>
                <dd className="break-all" style={{ color: "var(--text-secondary)" }}>
                  {detail.user.email}
                </dd>
              </div>
              {detail.user.phoneNumber && (
                <div>
                  <dt style={{ color: "var(--text-muted)" }}>Phone</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>
                    {detail.user.phoneNumber}
                  </dd>
                </div>
              )}
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Role</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {detail.user.role}
                </dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Joined</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {formatDisplayDate(detail.user.createdAt)}
                </dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Account</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {detail.user.isActive ? "Active" : "Inactive"}
                </dd>
              </div>
            </dl>
          </section>

          {detail.payment && (
            <section
              className="rounded-2xl border p-4"
              style={{
                borderColor: "var(--glass-border)",
                background: "var(--bg-glass)",
              }}
              aria-labelledby="payment-heading"
            >
              <h2
                id="payment-heading"
                className="flex items-center gap-2 text-sm font-semibold text-primary"
              >
                <CreditCard className="h-4 w-4" style={{ color: "var(--teal)" }} />
                Related payment
              </h2>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div>
                  <dt style={{ color: "var(--text-muted)" }}>Amount</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>
                    {formatPaymentAmount(
                      detail.payment.amount,
                      detail.payment.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--text-muted)" }}>Status</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>
                    {detail.payment.status}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--text-muted)" }}>Method</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>
                    {detail.payment.method}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--text-muted)" }}>Plan</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>
                    {detail.payment.planName ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--text-muted)" }}>Receipt</dt>
                  <dd className="break-all" style={{ color: "var(--text-secondary)" }}>
                    {detail.payment.receiptNumber ?? "Not issued"}
                  </dd>
                </div>
                {detail.payment.txRef && (
                  <div>
                    <dt style={{ color: "var(--text-muted)" }}>Gateway ref</dt>
                    <dd className="break-all" style={{ color: "var(--text-secondary)" }}>
                      {detail.payment.txRef}
                    </dd>
                  </div>
                )}
                {detail.payment.rejectionReason && (
                  <div>
                    <dt style={{ color: "var(--state-error)" }}>Rejection reason</dt>
                    <dd style={{ color: "var(--text-secondary)" }}>
                      {detail.payment.rejectionReason}
                    </dd>
                  </div>
                )}
              </dl>
              <Link
                href="/admin/payments"
                className="mt-3 inline-flex h-9 items-center text-xs font-semibold"
                style={{ color: "var(--teal)" }}
              >
                Open payment queue
              </Link>
            </section>
          )}

          <section
            className="space-y-3 rounded-2xl border p-4"
            style={{
              borderColor: "var(--glass-border)",
              background: "var(--bg-glass)",
            }}
            aria-labelledby="actions-heading"
          >
            <h2
              id="actions-heading"
              className="text-sm font-semibold text-primary"
            >
              Ticket actions
            </h2>

            <div>
              <span
                className="mb-1 block text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Status
              </span>
              <Select
                value={detail.status}
                onValueChange={(value) => void changeStatus(value as SupportStatus)}
                options={STATUS_OPTIONS}
                ariaLabel="Ticket status"
                disabled={updateStatus.isPending}
              />
            </div>

            <div>
              <span
                className="mb-1 block text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Assigned to
              </span>
              <Select
                value={detail.assignedToId ?? "unassigned"}
                onValueChange={(value) =>
                  assign.mutate(value === "unassigned" ? null : value)
                }
                options={[
                  { value: "unassigned", label: "Unassigned" },
                  ...(staffQuery.data ?? []).map((member) => ({
                    value: member.id,
                    label: member.fullName,
                  })),
                ]}
                ariaLabel="Assign ticket"
                disabled={assign.isPending || staffQuery.isPending}
              />
            </div>

            <dl className="space-y-1 border-t pt-2 text-[11px]" style={{ borderColor: "var(--glass-border)" }}>
              <div className="flex justify-between gap-2">
                <dt style={{ color: "var(--text-muted)" }}>Resolved</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {detail.resolvedAt ? formatDisplayDate(detail.resolvedAt) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt style={{ color: "var(--text-muted)" }}>Closed</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {detail.closedAt ? formatDisplayDate(detail.closedAt) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt style={{ color: "var(--text-muted)" }}>Read by staff</dt>
                <dd style={{ color: "var(--text-secondary)" }}>
                  {detail.lastStaffReadAt
                    ? relativeTime(detail.lastStaffReadAt)
                    : "Never"}
                </dd>
              </div>
            </dl>

            {detail.status === "RESOLVED" && (
              <p
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px]"
                style={{ background: "rgba(16,185,129,0.12)", color: "var(--state-success)" }}
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                Resolved tickets are closed automatically after seven days
                without activity.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
