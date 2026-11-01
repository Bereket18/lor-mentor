"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Database,
  GraduationCap,
  Loader2,
  MessageSquareWarning,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AuditPeriod = "all" | "today" | "7d" | "30d" | "90d";
type CategoryName =
  | "Users"
  | "Academic"
  | "Billing"
  | "Moderation"
  | "Anatomy"
  | "Security"
  | "System";

const ANATOMY_AREA = "ANATOMY";

interface AuditActor {
  id?: string;
  fullName?: string;
  email?: string;
  role?: string;
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: AuditActor | null;
}

interface AuditFacet {
  value: string;
  label: string;
  count: number;
}

interface AuditPage {
  items: AuditLog[];
  total: number;
  take: number;
  skip: number;
  hasMore: boolean;
  stats: {
    total: number;
    today: number;
    actors: number;
  };
  facets: {
    actions: AuditFacet[];
    entities: AuditFacet[];
  };
}

const PAGE_SIZES = [25, 50, 100];

const PERIOD_OPTIONS: Array<{ value: AuditPeriod; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const CATEGORY_CONFIG: Record<
  CategoryName,
  { icon: LucideIcon; color: string; bg: string; border: string }
> = {
  Users: {
    icon: Users,
    color: "#A78BFA",
    bg: "rgba(167, 139, 250, 0.12)",
    border: "rgba(167, 139, 250, 0.24)",
  },
  Academic: {
    icon: GraduationCap,
    color: "#2DD4BF",
    bg: "rgba(45, 212, 191, 0.12)",
    border: "rgba(45, 212, 191, 0.24)",
  },
  Billing: {
    icon: CreditCard,
    color: "#38BDF8",
    bg: "rgba(56, 189, 248, 0.12)",
    border: "rgba(56, 189, 248, 0.24)",
  },
  Moderation: {
    icon: MessageSquareWarning,
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.24)",
  },
  Anatomy: {
    icon: Stethoscope,
    color: "#2DD4BF",
    bg: "rgba(45, 212, 191, 0.12)",
    border: "rgba(45, 212, 191, 0.24)",
  },
  Security: {
    icon: ShieldAlert,
    color: "#F87171",
    bg: "rgba(248, 113, 113, 0.12)",
    border: "rgba(248, 113, 113, 0.24)",
  },
  System: {
    icon: Activity,
    color: "#94A3B8",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.24)",
  },
};

const CATEGORY_NAMES = new Set<string>(Object.keys(CATEGORY_CONFIG));

const LEGACY_ACTION_LABELS: Record<string, string> = {
  USER_ACTIVATED: "User activated",
  USER_DEACTIVATED: "User deactivated",
  AUTH_LOGIN_FAILED: "Login failed",
  AUTH_ACCOUNT_LOCKED: "Account locked after repeated login failures",
  PAYMENT_APPROVED: "Payment approved",
  PAYMENT_REJECTED: "Payment rejected",
  PAYMENT_REVERSED: "Payment reversed",
  ANATOMY_STRUCTURE_UPDATE: "Anatomy structure edited",
  ANATOMY_STRUCTURE_REVIEW: "Anatomy structure reviewed",
  ANATOMY_STRUCTURE_REVOKE: "Anatomy review revoked",
  ANATOMY_SYSTEM_REVIEW: "Anatomy system reviewed",
  ANATOMY_SYSTEM_PUBLISH: "Anatomy system published",
  ANATOMY_SYSTEM_UNPUBLISH: "Anatomy system unpublished",
  ANATOMY_REVIEWER_GRANT: "Anatomy reviewer access granted",
  ANATOMY_REVIEWER_REVOKE: "Anatomy reviewer access revoked",
};

const INTERNAL_META_KEYS = new Set([
  "label",
  "category",
  "source",
  "changes",
  "actor",
  "method",
  "path",
  "route",
  "statusCode",
  "durationMs",
  "userAgent",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metaOf(log: AuditLog): Record<string, unknown> {
  return isRecord(log.meta) ? log.meta : {};
}

function splitIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanizeActionKey(value: string): string {
  const words = splitIdentifier(value).split(" ").filter(Boolean);
  if (!words.length) return value;
  words[0] = capitalize(words[0]);
  return words.join(" ");
}

function formatEntityType(value: string): string {
  const words = splitIdentifier(value).split(" ").filter(Boolean);
  if (!words.length) return value;
  words[0] = capitalize(words[0]);
  return words.join(" ");
}

function formatMetaKey(value: string): string {
  const words = splitIdentifier(value).split(" ").filter(Boolean);
  if (!words.length) return value;
  words[0] = capitalize(words[0]);
  return words.join(" ");
}

function formatRole(value?: string): string | undefined {
  if (!value) return undefined;
  const words = splitIdentifier(value).split(" ").filter(Boolean);
  if (!words.length) return value;
  words[0] = capitalize(words[0]);
  return words.join(" ");
}

function actionLabel(log: AuditLog): string {
  const meta = metaOf(log);
  if (typeof meta.label === "string" && meta.label.trim()) return meta.label;
  if (LEGACY_ACTION_LABELS[log.action]) return LEGACY_ACTION_LABELS[log.action];

  const parts = log.action.split(".");
  const lastPart = parts[parts.length - 1] ?? log.action;
  return humanizeActionKey(lastPart);
}

function categoryFor(log: AuditLog): CategoryName {
  const meta = metaOf(log);
  if (typeof meta.category === "string" && CATEGORY_NAMES.has(meta.category)) {
    return meta.category as CategoryName;
  }

  const entity = log.entityType ?? "";
  if (log.action.startsWith("AUTH_")) return "Security";
  if (
    log.action.startsWith("ANATOMY_") ||
    entity === "AnatomyStructure" ||
    entity === "AnatomySystem"
  ) {
    return "Anatomy";
  }
  if (
    log.action.startsWith("PAYMENT_") ||
    ["Payment", "PaymentBank", "Plan", "Subscription"].includes(entity)
  ) {
    return "Billing";
  }
  if (log.action.startsWith("USER_") || entity === "User") return "Users";
  if (
    [
      "Department",
      "AcademicYear",
      "Semester",
      "Course",
      "Material",
    ].includes(entity)
  ) {
    return "Academic";
  }
  if (entity.startsWith("Forum") || log.action.startsWith("FORUM_")) {
    return "Moderation";
  }
  return "System";
}

function actorFor(log: AuditLog): {
  name: string;
  email?: string;
  role?: string;
  isSystemAuto: boolean;
} {
  const meta = metaOf(log);
  const snapshot = isRecord(meta.actor) ? meta.actor : {};
  const isSystemAuto = meta.auto === true && log.action === "PAYMENT_APPROVED";

  const snapshotName =
    typeof snapshot.fullName === "string" ? snapshot.fullName : undefined;
  const snapshotEmail =
    typeof snapshot.email === "string" ? snapshot.email : undefined;
  const snapshotRole =
    typeof snapshot.role === "string" ? snapshot.role : undefined;

  return {
    name: isSystemAuto
      ? "System (auto-verified)"
      : log.actor?.fullName || snapshotName || "System",
    email: log.actor?.email || snapshotEmail,
    role: log.actor?.role || snapshotRole,
    isSystemAuto,
  };
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function pluralEvents(value: number): string {
  return `${formatCount(value)} ${value === 1 ? "event" : "events"}`;
}

function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        isRecord(item) || Array.isArray(item)
          ? JSON.stringify(item)
          : formatMetaValue(item),
      )
      .join(", ");
  }
  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unavailable]";
    }
  }
  return String(value);
}

function formatAbsoluteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDateHeading(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffDays = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function periodStart(period: AuditPeriod): Date | null {
  if (period === "all") return null;
  if (period === "today") return startOfDay(new Date());

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000);
}

function requestSummary(meta: Record<string, unknown>): string | undefined {
  const method = typeof meta.method === "string" ? meta.method : undefined;
  const path = typeof meta.path === "string" ? meta.path : undefined;
  if (method && path) return `${method} ${path}`;
  return path ?? method;
}

function requestTiming(meta: Record<string, unknown>): string | undefined {
  const status =
    typeof meta.statusCode === "number" ? `HTTP ${meta.statusCode}` : undefined;
  const duration =
    typeof meta.durationMs === "number" ? `${meta.durationMs} ms` : undefined;
  return [status, duration].filter(Boolean).join(" · ") || undefined;
}

function extraMetaEntries(log: AuditLog): Array<[string, unknown]> {
  return Object.entries(metaOf(log)).filter(([key, value]) => {
    if (INTERNAL_META_KEYS.has(key)) return false;
    if (value === null || value === undefined || value === "") return false;
    return true;
  });
}

async function copyToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error("Could not copy to the clipboard.");
  }
}

function copyEvent(log: AuditLog) {
  return copyToClipboard(JSON.stringify(log, null, 2), "Event copied");
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (!isRecord(response)) return undefined;
  return typeof response.status === "number" ? response.status : undefined;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent: string;
}) {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {label}
          </p>
          <p className="mt-2 truncate font-display text-2xl font-semibold text-primary">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 truncate text-[11px] text-muted">{hint}</p>
          ) : null}
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `${accent}18`,
            border: `1px solid ${accent}30`,
            color: accent,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 pr-8 text-xs text-secondary outline-none transition-colors hover:border-[var(--border-accent)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-dim)]"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </label>
  );
}

function Detail({
  label,
  value,
  sub,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 break-words text-xs text-secondary",
          mono && "break-all font-mono text-[11px]",
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 break-words text-[11px] text-muted">{sub}</p>
      ) : null}
    </div>
  );
}

function EventRow({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = metaOf(log);
  const category = categoryFor(log);
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  const actor = actorFor(log);
  const changes = isRecord(meta.changes) ? meta.changes : {};
  const extraEntries = extraMetaEntries(log);
  const userAgent =
    typeof meta.userAgent === "string" ? meta.userAgent : undefined;

  return (
    <div className="border-t border-[var(--border-subtle)] first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
      >
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: config.bg,
            border: `1px solid ${config.border}`,
            color: config.color,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-primary">
              {actionLabel(log)}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: config.bg,
                border: `1px solid ${config.border}`,
                color: config.color,
              }}
            >
              {category}
            </span>
            {meta.auto === true ? (
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-medium text-muted">
                Auto
              </span>
            ) : null}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3 w-3" />
              {actor.name}
            </span>
            {log.entityType ? (
              <>
                <span>·</span>
                <span>
                  {formatEntityType(log.entityType)}
                  {log.entityId ? ` ${shortId(log.entityId)}` : ""}
                </span>
              </>
            ) : null}
            <span>·</span>
            <span title={formatAbsoluteTime(log.createdAt)}>
              {formatRelativeTime(log.createdAt)}
            </span>
          </span>
        </span>

        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded ? (
        <div className="px-4 pb-4 sm:pl-16">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Detail
                label="When"
                value={formatAbsoluteTime(log.createdAt)}
              />
              <Detail
                label={actor.isSystemAuto ? "System / linked account" : "Actor"}
                value={actor.name}
                sub={[actor.email, formatRole(actor.role)]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <Detail
                label="Target"
                value={
                  log.entityType
                    ? formatEntityType(log.entityType)
                    : "Not recorded"
                }
                sub={log.entityId ?? undefined}
                mono={Boolean(log.entityId)}
              />
              <Detail
                label="Request"
                value={requestSummary(meta) ?? "Not recorded"}
                sub={requestTiming(meta)}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Detail
                label="IP address"
                value={log.ipAddress ?? "Not recorded"}
                mono={Boolean(log.ipAddress)}
              />
              <Detail
                label="User agent"
                value={userAgent ?? "Not recorded"}
                className="sm:col-span-2"
              />
            </div>

            {Object.keys(changes).length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Changed fields
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(changes).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2"
                    >
                      <p className="text-[10px] text-muted">
                        {formatMetaKey(key)}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-secondary">
                        {formatMetaValue(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {extraEntries.length > 0 ? (
              <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Additional details
                </p>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {extraEntries.map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-[10px] text-muted">
                        {formatMetaKey(key)}
                      </dt>
                      <dd className="mt-0.5 break-words text-xs text-secondary">
                        {formatMetaValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span
                className="truncate font-mono text-[10px] text-muted"
                title={log.id}
              >
                ID: {log.id}
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyEvent(log)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[11px] font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary"
                >
                  <Copy className="h-3 w-3" />
                  Copy event
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(log.id, "Event ID copied")
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[11px] font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary"
                >
                  <Copy className="h-3 w-3" />
                  Copy ID
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [area, setArea] = useState("");
  const [action, setAction] = useState("");
  const [period, setPeriod] = useState<AuditPeriod>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const query = useQuery({
    queryKey: [
      "audit-logs",
      deferredSearch,
      area,
      action,
      period,
      page,
      pageSize,
    ],
    queryFn: async (): Promise<AuditPage> => {
      const params = new URLSearchParams();
      params.set("take", String(pageSize));
      params.set("skip", String((page - 1) * pageSize));

      const searchValue = deferredSearch.trim();
      if (searchValue) params.set("search", searchValue);
      if (area === ANATOMY_AREA) {
        params.set("actionPrefix", "ANATOMY_");
      } else if (area) {
        params.set("entityType", area);
      }
      if (action) params.set("action", action);

      const from = periodStart(period);
      if (from) params.set("from", from.toISOString());

      const { data } = await api.get<AuditPage>(`/audit?${params.toString()}`);
      return data;
    },
    placeholderData: (previous) => previous,
    staleTime: 15_000,
    refetchInterval: live ? 15_000 : false,
    retry: 1,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const total = query.data?.total ?? 0;
  const stats = query.data?.stats ?? { total: 0, today: 0, actors: 0 };
  const facets = query.data?.facets ?? { actions: [], entities: [] };
  const skip = query.data?.skip ?? (page - 1) * pageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : skip + 1;
  const end = Math.min(skip + items.length, total);
  const loaded = Boolean(query.data);
  const isInitialLoading = query.isPending && !query.data;
  const isFiltered = Boolean(
    deferredSearch.trim() || area || action || period !== "all",
  );
  const errorStatus = getErrorStatus(query.error);
  const topArea = facets.entities[0];

  const groups = useMemo(() => {
    const grouped = new Map<string, AuditLog[]>();
    for (const log of items) {
      const key = dateKey(log.createdAt);
      const group = grouped.get(key);
      if (group) {
        group.push(log);
      } else {
        grouped.set(key, [log]);
      }
    }
    return Array.from(grouped.entries());
  }, [items]);

  const actionOptions = facets.actions;
  const selectedActionMissing =
    Boolean(action) && !actionOptions.some((facet) => facet.value === action);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateArea(value: string) {
    setArea(value);
    setPage(1);
  }

  function updateAction(value: string) {
    setAction(value);
    setPage(1);
  }

  function updatePeriod(value: AuditPeriod) {
    setPeriod(value);
    setPage(1);
  }

  function updatePageSize(value: number) {
    setPageSize(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setArea("");
    setAction("");
    setPeriod("all");
    setPage(1);
  }

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(1, nextPage), pageCount));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
            <ShieldCheck className="h-3.5 w-3.5" />
            Super admin only
          </div>
          <h1 className="font-display text-2xl font-semibold text-primary">
            Audit Logs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            A searchable record of state-changing admin activity across the
            platform, with request context, targets, and submitted changes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLive((value) => !value)}
            aria-pressed={live}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors",
              live
                ? "border-[var(--teal-glow)] bg-[var(--teal-dim)] text-teal"
                : "border-[var(--border-default)] bg-[var(--bg-surface)] text-secondary hover:border-[var(--border-accent)] hover:text-primary",
            )}
          >
            <Radio
              className={cn("h-3.5 w-3.5", live && "animate-pulse")}
            />
            {live ? "Live updates" : "Live off"}
          </button>
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Database}
          label="Total events"
          value={loaded ? formatCount(stats.total) : "—"}
          hint="All recorded activity"
          accent="#38BDF8"
        />
        <StatCard
          icon={CalendarClock}
          label="Today"
          value={loaded ? formatCount(stats.today) : "—"}
          hint="Since midnight"
          accent="#2DD4BF"
        />
        <StatCard
          icon={Users}
          label="People tracked"
          value={loaded ? formatCount(stats.actors) : "—"}
          hint="Distinct actors"
          accent="#A78BFA"
        />
        <StatCard
          icon={Activity}
          label="Most active area"
          value={loaded ? (topArea?.label ?? "—") : "—"}
          hint={
            loaded
              ? topArea
                ? pluralEvents(topArea.count)
                : "No events yet"
              : undefined
          }
          accent="#F59E0B"
        />
      </section>

      <section className="glass-panel p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Search actions, people, emails, or record IDs..."
              aria-label="Search audit logs"
              maxLength={200}
              className="h-10 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-9 text-sm text-primary outline-none transition-colors placeholder:text-muted hover:border-[var(--border-accent)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-dim)]"
            />
            {search ? (
              <button
                type="button"
                onClick={() => updateSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--bg-elevated)] hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:w-auto">
            <FilterSelect
              label="Filter by area"
              value={area}
              onChange={updateArea}
              className="xl:w-44"
            >
              <option value="">All areas</option>
              <option value={ANATOMY_AREA}>Anatomy lab</option>
              {facets.entities.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {facet.label} ({facet.count})
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Filter by action"
              value={action}
              onChange={updateAction}
              className="xl:w-52"
            >
              <option value="">All actions</option>
              {selectedActionMissing ? (
                <option value={action}>
                  {humanizeActionKey(action.split(".").pop() ?? action)}
                </option>
              ) : null}
              {actionOptions.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {facet.label} ({facet.count})
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Filter by time period"
              value={period}
              onChange={(value) => updatePeriod(value as AuditPeriod)}
              className="xl:w-40"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FilterSelect>
          </div>
        </div>

        {isFiltered ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
            <span className="text-[11px] text-muted">
              Filters are narrowing the timeline.
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[11px] font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-primary">
                Activity timeline
              </h2>
              {query.isFetching && !isInitialLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : null}
            </div>
            <p
              className="mt-0.5 text-[11px] text-muted"
              aria-live="polite"
            >
              {total === 0
                ? isFiltered
                  ? "No events match these filters"
                  : "No events recorded yet"
                : `Showing ${formatCount(start)}–${formatCount(end)} of ${pluralEvents(total)}`}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>Newest first</span>
            <label className="inline-flex items-center gap-1.5">
              <span className="sr-only">Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) =>
                  updatePageSize(Number(event.target.value))
                }
                className="h-7 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-1.5 text-[11px] text-secondary outline-none focus:border-[var(--accent-primary)]"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {query.isError ? (
          <div className="glass-panel flex flex-col items-center gap-3 px-6 py-12 text-center">
            <ShieldAlert className="h-8 w-8 text-red-400" />
            <div>
              <h3 className="font-display text-base font-semibold text-primary">
                {errorStatus === 403
                  ? "Super admin access required"
                  : "Could not load the audit trail"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-secondary">
                {errorStatus === 403
                  ? "Audit logs contain sensitive security metadata and are visible to super admins only."
                  : "The audit service did not return a response. Check the API connection and try again."}
              </p>
            </div>
            {errorStatus !== 403 ? (
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            ) : null}
          </div>
        ) : isInitialLoading ? (
          <div className="space-y-3" aria-label="Loading audit events">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="glass-panel flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Database className="h-8 w-8 text-muted" />
            <div>
              <h3 className="font-display text-base font-semibold text-primary">
                {isFiltered
                  ? "No events match these filters"
                  : "No audit events yet"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-secondary">
                {isFiltered
                  ? "Try a broader search or clear one of the filters."
                  : "New admin actions will appear here as they happen."}
              </p>
            </div>
            {isFiltered ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([day, logs]) => (
              <section key={day} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {formatDateHeading(logs[0].createdAt)}
                  </h3>
                  <span className="text-[10px] text-muted">
                    {pluralEvents(logs.length)}
                  </span>
                  <span className="h-px flex-1 bg-[var(--border-default)]" />
                </div>

                <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-card">
                  {logs.map((log) => (
                    <EventRow
                      key={log.id}
                      log={log}
                      expanded={expandedId === log.id}
                      onToggle={() =>
                        setExpandedId((current) =>
                          current === log.id ? null : log.id,
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {total > 0 ? (
        <nav
          className="glass-panel flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Audit log pagination"
        >
          <p className="text-[11px] text-muted">
            Page {formatCount(page)} of {formatCount(pageCount)} ·{" "}
            {pluralEvents(total)}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-secondary transition-colors hover:border-[var(--border-accent)] hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
