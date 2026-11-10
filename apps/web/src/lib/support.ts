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
    color: "var(--teal)",
    background: "var(--teal-dim)",
  },
  RESOLVED: {
    label: "Resolved",
    color: "var(--state-success)",
    background: "rgba(16, 185, 129, 0.12)",
  },
  CLOSED: {
    label: "Closed",
    color: "var(--text-muted)",
    background: "rgba(71, 85, 105, 0.18)",
  },
};

/** Admin-side label for the same statuses. */
export const SUPPORT_ADMIN_STATUS_META: typeof SUPPORT_STATUS_META = {
  ...SUPPORT_STATUS_META,
  AWAITING_STUDENT: {
    label: "Waiting for student",
    color: "var(--teal)",
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
