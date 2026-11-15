"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleHelp,
  CreditCard,
  FileText,
  Loader2,
  Lock,
  MessageSquarePlus,
  Search,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import api from "@/lib/api";
import { useSupportPolling } from "@/hooks/use-support-polling";
import {
  SUPPORT_FAQ_ARTICLES,
  SUPPORT_FAQ_CATEGORY_ORDER,
  SUPPORT_FAQ_IS_DRAFT,
  SUPPORT_EXPECTED_REPLY_NOTE,
  searchFaq,
} from "@/lib/support-faq";
import { categoryLabel, relativeTime } from "@/lib/support";
import type {
  PagedResult,
  StudentTicketSummary,
  SupportCategory,
} from "@/lib/support-types";
import { StatusPill, UnreadDot } from "@/components/support/status-pill";

const LIST_KEY = ["support", "tickets", "help"] as const;

export default function HelpCentrePage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SupportCategory | "ALL">("ALL");
  const polling = useSupportPolling();

  const ticketsQuery = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () =>
      (
        await api.get<PagedResult<StudentTicketSummary>>("/support/tickets")
      ).data ?? { items: [], total: 0 },
    refetchInterval: (ticketQuery) =>
      polling.intervalFor(ticketQuery.state.fetchFailureCount),
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });

  const tickets = ticketsQuery.data?.items ?? [];
  const unread = tickets.filter((ticket) => ticket.unread);
  const articles = useMemo(() => searchFaq(query, category), [query, category]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--teal)" }}
          >
            Help centre
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-primary sm:text-3xl">
            Help and support
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary">
            Answers to the questions the college is asked most, and a direct
            line to support when you need a person.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/support/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--teal)" }}
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            New ticket
          </Link>
          <Link
            href="/support/tickets"
            className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors hover:bg-[var(--teal-dim)]"
            style={{
              borderColor: "var(--glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            <Ticket className="h-4 w-4" aria-hidden="true" />
            My tickets
            {unread.length > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-bold"
                style={{ background: "var(--teal)", color: "#04110f" }}
              >
                {unread.length} new
              </span>
            )}
          </Link>
        </div>
      </header>

      {SUPPORT_FAQ_IS_DRAFT && (
        <p
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--glass-border)",
            background: "var(--bg-glass)",
            color: "var(--text-secondary)",
          }}
        >
          These articles are draft guidance and are being reviewed by the
          college. If a payment or account detail looks wrong, ask support
          before acting on it.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="faq-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="faq-heading"
              className="font-display text-lg font-semibold text-primary"
            >
              Common questions
            </h2>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {articles.length} of {SUPPORT_FAQ_ARTICLES.length} articles
            </span>
          </div>

          <div className="space-y-3">
            <label htmlFor="faq-search" className="sr-only">
              Search help articles
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--text-secondary)" }}
              />
              <input
                id="faq-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search help articles"
                className="h-11 w-full rounded-xl border pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                style={{
                  borderColor: "var(--glass-border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter articles by topic"
            >
              {SUPPORT_FAQ_CATEGORY_ORDER.map((option) => {
                const active = category === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(option.value)}
                    className="inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: active
                        ? "var(--teal)"
                        : "var(--glass-border)",
                      background: active
                        ? "var(--teal-dim)"
                        : "transparent",
                      color: active ? "var(--teal)" : "var(--text-secondary)",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {articles.length === 0 ? (
            <div
              className="rounded-2xl border p-6 text-center"
              style={{
                borderColor: "var(--glass-border)",
                background: "var(--bg-glass)",
              }}
            >
              <CircleHelp
                className="mx-auto h-6 w-6"
                style={{ color: "var(--text-secondary)" }}
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-medium text-primary">
                No article matches that search
              </p>
              <p className="mt-1 text-sm text-secondary">
                Try fewer words, or open a ticket and ask directly.
              </p>
              <Link
                href="/support/new"
                className="mt-3 inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-white"
                style={{ background: "var(--teal)" }}
              >
                Ask support
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {articles.map((article) => (
                <li key={article.id}>
                  <details
                    className="group rounded-xl border px-4 py-1"
                    style={{
                      borderColor: "var(--glass-border)",
                      background: "var(--bg-glass)",
                    }}
                  >
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] [&::-webkit-details-marker]:hidden">
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: "var(--teal-dim)",
                          color: "var(--teal)",
                        }}
                      >
                        {article.category === "PAYMENT" ? (
                          <CreditCard className="h-3.5 w-3.5" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold text-primary">
                        {article.question}
                      </span>
                      <span
                        className="hidden flex-shrink-0 text-[11px] font-medium sm:block"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {categoryLabel(article.category)}
                      </span>
                      <ArrowRight
                        className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-90"
                        style={{ color: "var(--text-secondary)" }}
                        aria-hidden="true"
                      />
                    </summary>
                    <div
                      className="space-y-2 border-t pb-4 pt-3 text-sm leading-relaxed"
                      style={{
                        borderColor: "var(--glass-border)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {article.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: "var(--glass-border)",
              background: "var(--bg-glass)",
            }}
            aria-labelledby="contact-heading"
          >
            <h2
              id="contact-heading"
              className="flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <CircleHelp className="h-4 w-4" style={{ color: "var(--teal)" }} />
              Still need help?
            </h2>
            <p className="mt-2 text-sm text-secondary">
              Open a ticket and the college will answer in the app and by
              email. Include a payment reference or ticket number if you have
              one.
            </p>
            <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              {SUPPORT_EXPECTED_REPLY_NOTE}
            </p>
            <Link
              href="/support/new"
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--teal)" }}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              Open a ticket
            </Link>
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: "var(--glass-border)",
              background: "var(--bg-glass)",
            }}
            aria-labelledby="recent-heading"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="recent-heading"
                className="text-sm font-semibold text-primary"
              >
                Your recent tickets
              </h2>
              <Link
                href="/support/tickets"
                className="text-xs font-semibold"
                style={{ color: "var(--teal)" }}
              >
                View all
              </Link>
            </div>

            {ticketsQuery.isPending ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading…
              </p>
            ) : ticketsQuery.isError ? (
              <p className="mt-3 text-sm text-secondary">
                Could not load your tickets right now.
              </p>
            ) : tickets.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">
                No tickets yet. When you open one, it appears here.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {tickets.slice(0, 3).map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/support/tickets/${ticket.id}`}
                      className="block rounded-lg px-2 py-2 transition-colors hover:bg-[var(--teal-dim)]"
                    >
                      <span className="flex items-start gap-2">
                        {ticket.unread && <UnreadDot className="mt-1.5" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-primary">
                            {ticket.subject}
                          </span>
                          <span
                            className="mt-0.5 block text-[11px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {ticket.ticketNumber} ·{" "}
                            {relativeTime(ticket.lastMessageAt)}
                            {ticket.unread && " · New reply"}
                          </span>
                        </span>
                        <StatusPill status={ticket.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{
              borderColor: "var(--glass-border)",
              background: "var(--bg-glass)",
            }}
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" style={{ color: "var(--teal)" }} />
              Private by default
            </h2>
            <ul className="mt-2 space-y-1.5 text-xs text-secondary">
              <li className="flex gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                Attachments are visible only to you and support staff.
              </li>
              <li className="flex gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                Never send your password or full card number in a ticket.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
