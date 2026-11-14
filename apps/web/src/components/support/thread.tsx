"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { Loader2, Lock, Send } from "lucide-react";
import { formatDisplayDate } from "@/lib/dates";
import { relativeTime } from "@/lib/support";
import type { SupportMessageView } from "@/lib/support-types";
import { cn } from "@/lib/utils";
import { AttachmentGallery, AttachmentPicker } from "@/components/support/attachments";

function MessageBubble({
  message,
  mine,
}: {
  message: SupportMessageView;
  mine: boolean;
}) {
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <article
        className={cn(
          "max-w-[85%] rounded-2xl border px-4 py-3 sm:max-w-[75%]",
          mine ? "rounded-br-md" : "rounded-bl-md",
        )}
        style={{
          background: mine ? "var(--teal-dim)" : "var(--bg-glass)",
          borderColor: "var(--glass-border)",
        }}
      >
        <header className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            {message.isStaff ? "College support" : message.author.fullName}
          </span>
          {message.isStaff && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--teal-dim)", color: "var(--teal)" }}
            >
              <Lock className="h-2.5 w-2.5" aria-hidden="true" />
              Staff
            </span>
          )}
          <time
            dateTime={message.createdAt}
            title={formatDisplayDate(message.createdAt)}
            className="text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {relativeTime(message.createdAt)}
          </time>
        </header>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {message.body}
        </p>
        <AttachmentGallery attachments={message.attachments} />
      </article>
    </li>
  );
}

/**
 * One ordered conversation. `perspective` decides which side is "yours":
 * a student sees their own messages on the right, staff see theirs on the
 * right. The isStaff flag comes from the server, never from styling.
 */
export function TicketThread({
  messages,
  perspective,
  emptyText = "No messages yet.",
}: {
  messages: SupportMessageView[];
  perspective: "student" | "staff";
  emptyText?: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyText}
      </p>
    );
  }

  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          mine={message.isStaff === (perspective === "staff")}
        />
      ))}
    </ol>
  );
}

export interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  pending: boolean;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  sendLabel?: string;
  /** Rendered above the textarea (canned replies in the admin inbox). */
  accessory?: ReactNode;
}

/** Shared composer: text, images, Ctrl/Cmd+Enter, and an honest disabled state. */
export function MessageComposer({
  value,
  onChange,
  onSend,
  pending,
  disabled = false,
  disabledReason,
  placeholder = "Write a message…",
  files,
  onFilesChange,
  textareaRef,
  sendLabel = "Send",
  accessory,
}: MessageComposerProps) {
  const hintedId = useId();
  const textareaId = `support-composer-${hintedId}`;
  const canSend = !disabled && !pending && value.trim().length > 0;

  if (disabled) {
    return (
      <div
        className="rounded-xl border px-4 py-3 text-sm"
        style={{
          borderColor: "var(--glass-border)",
          background: "var(--bg-glass)",
          color: "var(--text-secondary)",
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Lock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {disabledReason ?? "This conversation is read-only."}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {accessory}
      <label htmlFor={textareaId} className="sr-only">
        Message
      </label>
      <textarea
        id={textareaId}
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        rows={4}
        maxLength={4000}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{
          borderColor: "var(--glass-border)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
        }}
      />
      <AttachmentPicker
        files={files}
        onChange={onFilesChange}
        disabled={pending}
        idPrefix="composer"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {value.length}/4000 · Ctrl/⌘ + Enter to send
        </span>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--teal)" }}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {pending ? "Sending…" : sendLabel}
        </button>
      </div>
    </div>
  );
}
