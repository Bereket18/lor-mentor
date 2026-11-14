"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MessageSquarePlus, Send } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  apiErrorMessage,
  formatPaymentAmount,
  SUPPORT_CATEGORY_OPTIONS,
} from "@/lib/support";
import { SUPPORT_EXPECTED_REPLY_NOTE } from "@/lib/support-faq";
import type {
  OwnPayment,
  PagedResult,
  StudentTicketDetail,
  SupportCategory,
} from "@/lib/support-types";
import { Select } from "@/components/ui/select";
import { AttachmentPicker } from "@/components/support/attachments";

const FIELD_CLASS =
  "w-full rounded-lg border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function cardStyle() {
  return {
    borderColor: "var(--glass-border)",
    background: "var(--bg-glass)",
  } as const;
}

function fieldStyle() {
  return {
    borderColor: "var(--glass-border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
  } as const;
}

function NewTicketForm() {
  const router = useRouter();
  const params = useSearchParams();

  const initialCategory = SUPPORT_CATEGORY_OPTIONS.some(
    (option) => option.value === params.get("category"),
  )
    ? (params.get("category") as SupportCategory)
    : "OTHER";

  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [category, setCategory] = useState<SupportCategory>(initialCategory);
  const [reference, setReference] = useState(params.get("reference") ?? "");
  const [body, setBody] = useState("");
  const [paymentId, setPaymentId] = useState(params.get("payment") ?? "");
  const [files, setFiles] = useState<File[]>([]);

  const paymentsQuery = useQuery({
    queryKey: ["support", "payments"],
    queryFn: async () =>
      (
        await api.get<PagedResult<OwnPayment>>("/support/payments")
      ).data ?? { items: [], total: 0 },
    staleTime: 60_000,
  });

  const payments = useMemo(
    () => paymentsQuery.data?.items ?? [],
    [paymentsQuery.data],
  );
  const selectedPayment = useMemo(
    () => payments.find((payment) => payment.id === paymentId),
    [payments, paymentId],
  );

  const paymentOptions = useMemo(
    () => [
      // Radix Select forbids an empty item value, so "no payment" is a
      // sentinel mapped back to "" at the edge.
      { value: "none", label: "No payment — general question" },
      ...payments.map((payment) => ({
        value: payment.id,
        label: `${formatPaymentAmount(payment.amount, payment.currency)} · ${
          payment.planName ?? payment.method
        } · ${payment.status} · ${new Date(
          payment.createdAt,
        ).toLocaleDateString()}`,
      })),
    ],
    [payments],
  );

  const createTicket = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("subject", subject.trim());
      form.append("category", category);
      if (reference.trim()) form.append("reference", reference.trim());
      // The API re-checks that this payment belongs to the caller.
      if (paymentId) form.append("paymentId", paymentId);
      form.append("body", body.trim());
      for (const file of files) form.append("attachments", file);

      const response = await api.post<StudentTicketDetail>(
        "/support/tickets",
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    },
    onSuccess: (ticket) => {
      toast.success("Ticket sent. The college will reply here and by email.");
      router.push(`/support/tickets/${ticket.id}`);
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Could not send the ticket.")),
  });

  const canSubmit =
    subject.trim().length >= 4 &&
    body.trim().length >= 10 &&
    !createTicket.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-3">
        <Link
          href="/support"
          className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold"
          style={{ color: "var(--teal)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Help centre
        </Link>
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">
            Open a ticket
          </h1>
          <p className="mt-1 text-sm text-secondary">
            One clear message gets you a faster answer. You can add up to three
            screenshots.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {SUPPORT_EXPECTED_REPLY_NOTE}
          </p>
        </div>
      </header>

      <form
        className="space-y-5 rounded-2xl border p-4 sm:p-6"
        style={cardStyle()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) createTicket.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="ticket-subject"
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Subject
            </label>
            <input
              id="ticket-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              minLength={4}
              maxLength={120}
              required
              placeholder="Payment not showing on my account"
              className={`${FIELD_CLASS} h-11`}
                style={fieldStyle()}
            />
          </div>

          <div>
            <span
              id="ticket-category-label"
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Topic
            </span>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as SupportCategory)}
              options={SUPPORT_CATEGORY_OPTIONS}
              ariaLabel="Topic"
            />
          </div>

          <div>
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Related payment{" "}
              <span style={{ color: "var(--text-muted)" }}>(optional)</span>
            </span>
            <Select
              value={paymentId || "none"}
              onValueChange={(value) => setPaymentId(value === "none" ? "" : value)}
              options={paymentOptions}
              ariaLabel="Related payment"
              placeholder={
                paymentsQuery.isPending ? "Loading payments…" : "No payment"
              }
            />
            {selectedPayment && (
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Linked to {formatPaymentAmount(
                  selectedPayment.amount,
                  selectedPayment.currency,
                )}{" "}
                ({selectedPayment.status}).
              </p>
            )}
            {paymentsQuery.isError && (
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--state-warning)" }}
              >
                Payments could not be loaded. You can still send the ticket.
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="ticket-reference"
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Payment reference or ticket number{" "}
              <span style={{ color: "var(--text-muted)" }}>(optional)</span>
            </label>
            <input
              id="ticket-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              placeholder="e.g. FT260311ABC or T-000123"
              className={`${FIELD_CLASS} h-11`}
              style={fieldStyle()}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="ticket-body"
            className="mb-1 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            What happened?
          </label>
          <textarea
            id="ticket-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={10}
            maxLength={4000}
            rows={7}
            required
            placeholder="Tell the college what you need help with. Include the date and the reference if you have one."
            className={`${FIELD_CLASS} resize-y py-2`}
            style={fieldStyle()}
            aria-describedby="ticket-body-hint"
          />
          <p
            id="ticket-body-hint"
            className="mt-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {body.length}/4000 · at least 10 characters
          </p>
        </div>

        <div>
          <span
            className="mb-2 block text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Screenshots{" "}
            <span style={{ color: "var(--text-muted)" }}>(optional)</span>
          </span>
          <AttachmentPicker
            files={files}
            onChange={setFiles}
            disabled={createTicket.isPending}
            idPrefix="new-ticket"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--glass-border)" }}>
          <p className="max-w-md text-[11px]" style={{ color: "var(--text-muted)" }}>
            By sending this you agree the college may contact you by email
            about this ticket. Do not include passwords or full card numbers.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/support"
              className="inline-flex h-11 items-center px-2 text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--teal)" }}
            >
              {createTicket.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              {createTicket.isPending ? "Sending…" : "Send ticket"}
            </button>
          </div>
        </div>
      </form>

      <p className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <MessageSquarePlus className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        You can have three open tickets at once. If you already have an open
        ticket about this problem, reply there instead so the history stays in
        one place.
      </p>
    </div>
  );
}

export default function NewTicketPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-10">
          <Loader2
            className="h-5 w-5 animate-spin"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <span className="sr-only">Loading form</span>
        </div>
      }
    >
      <NewTicketForm />
    </Suspense>
  );
}
