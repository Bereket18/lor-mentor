import { formatDisplayDate } from "./dates";

/** Mirrors the API's SupportTicketStatus enum. */
export type SupportStatus = "OPEN" | "AWAITING_STUDENT" | "RESOLVED" | "CLOSED";

export type SupportCategory =
  | "PAYMENT"
  | "ACCOUNT"
  | "COURSE"
  | "TECHNICAL"
  | "OTHER";

export const SUPPORT_CATEGORY_OPTIONS: Array<{
  value: SupportCategory;
  label: string;
}> = [
  { value: "PAYMENT", label: "Payment or receipt" },
  { value: "ACCOUNT", label: "Account or sign-in" },
  { value: "COURSE", label: "Course or materials" },
  { value: "TECHNICAL", label: "Something is broken" },
  { value: "OTHER", label: "Something else" },
];

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  PAYMENT: "Payment",
  ACCOUNT: "Account",
  COURSE: "Course",
  TECHNICAL: "Technical",
  OTHER: "Other",
};

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value as SupportCategory] ?? value;
}

/**
 * How the student and the admin both read a ticket's position.
 *
 * The status names are the API's; the labels describe whose turn it is, which
 * is the only thing either side actually needs to know.
 */
export const SUPPORT_STATUS_META: Record<
  SupportStatus,
  { label: string; color: string; background: string }
> = {
  OPEN: {
    label: "Waiting for the college",
    color: "var(--state-warning)",
    background: "rgba(245, 158, 11, 0.12)",
  },
  AWAITING_STUDENT: {
    label: "Waiting for you",
    color: "var(--teal-text)",
    background: "var(--teal-dim)",
  },
  RESOLVED: {
    label: "Resolved",
    color: "var(--state-success)",
    background: "rgba(16, 185, 129, 0.12)",
  },
  CLOSED: {
    label: "Closed",
    // --text-muted is below AA on the glass background in both themes.
    color: "var(--text-secondary)",
    background: "rgba(71, 85, 105, 0.18)",
  },
};

/** Admin-side label for the same statuses. */
export const SUPPORT_ADMIN_STATUS_META: typeof SUPPORT_STATUS_META = {
  ...SUPPORT_STATUS_META,
  AWAITING_STUDENT: {
    label: "Waiting for student",
    color: "var(--teal-text)",
    background: "var(--teal-dim)",
  },
  OPEN: {
    label: "Needs an answer",
    color: "var(--state-warning)",
    background: "rgba(245, 158, 11, 0.12)",
  },
};

/**
 * "just now" / "5 min ago" / "3 h ago" / "2 d ago", then a plain date.
 *
 * `now` is injectable so the unit test does not depend on the wall clock.
 */
export function relativeTime(
  value: string | Date | null | undefined,
  now: number = Date.now(),
): string {
  if (!value) return "—";
  const then = value instanceof Date ? value : new Date(value);
  const elapsed = now - then.getTime();
  if (Number.isNaN(elapsed)) return "—";
  if (elapsed < 60_000) return "just now";

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;

  return formatDisplayDate(then);
}

/** The API's validation messages arrive as a string or an array of them. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (
    err as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;

  if (Array.isArray(message)) return message.join(" ");
  if (typeof message === "string" && message.trim()) return message;
  return fallback;
}

/* ── Attachments ─────────────────────────────────────────────────── */

/**
 * Client-side mirror of the API's attachment policy. These are a courtesy
 * check so a student learns about a problem before uploading; the API repeats
 * every check (and validates the real bytes, not the MIME type).
 */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_ATTACHMENTS_PER_MESSAGE = 3;
export const SUPPORT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const SUPPORT_ATTACHMENT_ACCEPT = SUPPORT_ATTACHMENT_MIME_TYPES.join(",");

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

/**
 * Validates files before they are put in a FormData. Pure so the unit suite
 * can exercise the limits without a browser File object.
 */
export function validateAttachmentFiles<T extends FileLike>(
  existing: readonly T[],
  incoming: readonly T[],
): { accepted: T[]; errors: string[] } {
  const accepted: T[] = [];
  const errors: string[] = [];
  const room = SUPPORT_ATTACHMENTS_PER_MESSAGE - existing.length;

  if (room <= 0) {
    return {
      accepted,
      errors: [
        `You can attach at most ${SUPPORT_ATTACHMENTS_PER_MESSAGE} images to one message.`,
      ],
    };
  }

  for (const file of incoming) {
    if (
      !(SUPPORT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      errors.push(`${file.name}: only JPEG, PNG or WebP images are accepted.`);
      continue;
    }
    if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      errors.push(`${file.name}: images must be 5 MB or smaller.`);
      continue;
    }
    if (accepted.length >= room) {
      errors.push(
        `You can attach at most ${SUPPORT_ATTACHMENTS_PER_MESSAGE} images to one message.`,
      );
      break;
    }
    accepted.push(file);
  }

  return { accepted, errors };
}

/** Appends files to a FormData under the field name the API expects. */
export function appendAttachments(
  form: FormData,
  files: readonly File[],
): FormData {
  for (const file of files) form.append("attachments", file);
  return form;
}

/* ── Routing ─────────────────────────────────────────────────────── */

export function supportTicketHref(ticketId: string): string {
  return `/support/tickets/${encodeURIComponent(ticketId)}`;
}

/**
 * Entry point used by a payment a student needs help with. The payment id is
 * only a prefill hint; the API re-checks that the payment belongs to them.
 */
export function newPaymentTicketHref(paymentId: string): string {
  return `/support/new?category=PAYMENT&payment=${encodeURIComponent(paymentId)}`;
}

export function newTicketHref(category?: string): string {
  return category
    ? `/support/new?category=${encodeURIComponent(category)}`
    : "/support/new";
}

/* ── Payment entry points ────────────────────────────────────────── */

/**
 * How long a PENDING payment may sit before "get help" is offered. Manual
 * receipts are reviewed by a person, so some wait is normal; two days is long
 * enough that the student should be able to ask without opening a ticket for
 * an ordinary same-day review.
 */
export const PAYMENT_SUPPORT_PENDING_HOURS = 48;

/**
 * True for the payment states where a support ticket is the right next step:
 * rejected, expired, reversed (an approved payment later invalidated), or a
 * pending payment that has been waiting longer than the review window.
 *
 * `now` is injectable so the unit suite never depends on the wall clock.
 */
export function shouldOfferPaymentSupport(
  payment: { status: string; createdAt: string | Date },
  now: number = Date.now(),
): boolean {
  const status = payment.status.toUpperCase();
  if (status === "REJECTED" || status === "EXPIRED") return true;
  // REVERSED is the exceptional case: money was taken and later reversed.
  if (status === "REVERSED") return true;
  if (status !== "PENDING") return false;

  const created = new Date(payment.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created >= PAYMENT_SUPPORT_PENDING_HOURS * 3_600_000;
}

/** `T-000123` from the numeric `number` field. */
export function ticketNumberLabel(number: number): string {
  return `T-${String(number).padStart(6, "0")}`;
}

/** A human amount for payment rows. */
export function formatPaymentAmount(
  amount: string | number,
  currency = "ETB",
): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

