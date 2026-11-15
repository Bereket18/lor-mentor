/**
 * Shapes returned by the support API (apps/api/src/modules/support).
 *
 * Written out rather than imported from the API package: the web app is a
 * separate build, and these are the exact fields the UI is allowed to read.
 * Student responses never include staff-only columns (assignee, staff read
 * marker, internal notes) — see `forStudent()` in support.service.ts.
 */

export type SupportStatus = "OPEN" | "AWAITING_STUDENT" | "RESOLVED" | "CLOSED";

export type SupportCategory =
  | "PAYMENT"
  | "ACCOUNT"
  | "COURSE"
  | "TECHNICAL"
  | "OTHER";

export type SupportAttachmentMime = "image/jpeg" | "image/png" | "image/webp";

/** Metadata only; bytes are fetched through the authorised endpoint. */
export interface SupportAttachmentMeta {
  id: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export interface SupportMessageView {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  author: { id: string; fullName: string; role: string };
  attachments: SupportAttachmentMeta[];
}

export interface StudentPaymentSummary {
  id: string;
  status: string;
  amount: string | number;
  currency: string;
  method: string;
  planName: string | null;
  receiptNumber: string | null;
  createdAt: string;
}

export interface StudentTicketSummary {
  id: string;
  number: number;
  ticketNumber: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  reference: string | null;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  unread: boolean;
  canReply: boolean;
  reopenUntil: string | null;
  _count: { messages: number };
}

export interface StudentTicketDetail
  extends Omit<StudentTicketSummary, "_count"> {
  messages: SupportMessageView[];
  payment?: StudentPaymentSummary | null;
}

export interface OwnPayment {
  id: string;
  status: string;
  amount: string | number;
  currency: string;
  method: string;
  planName: string | null;
  receiptNumber: string | null;
  txRef: string | null;
  bankReference: string | null;
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  take?: number;
  skip?: number;
  hasMore?: boolean;
}

/* ── Admin inbox ─────────────────────────────────────────────────── */

export interface AdminTicketSummary {
  id: string;
  number: number;
  ticketNumber: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  reference: string | null;
  paymentId: string | null;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastStaffReadAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  unread: boolean;
  _count: { messages: number };
  user: { id: string; fullName: string; email: string; role: string };
  assignedTo: { id: string; fullName: string } | null;
  payment: StudentPaymentSummary | null;
}

export interface AdminInternalNote {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string };
}

export interface AdminPaymentDetail {
  id: string;
  status: string;
  amount: string | number;
  currency: string;
  method: string;
  planName: string | null;
  receiptNumber: string | null;
  txRef: string | null;
  bankReference: string | null;
  rejectionReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminTicketDetail
  extends Omit<AdminTicketSummary, "_count" | "user"> {
  canReply: boolean;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    phoneNumber: string | null;
    createdAt: string;
    isActive: boolean;
  };
  payment: AdminPaymentDetail | null;
  messages: SupportMessageView[];
  internalNotes: AdminInternalNote[];
}

export interface CannedReply {
  id: string;
  title: string;
  body: string;
  category: SupportCategory;
}

export interface StaffOption {
  id: string;
  fullName: string;
  email?: string;
}
