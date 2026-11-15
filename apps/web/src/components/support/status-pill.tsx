import {
  SUPPORT_ADMIN_STATUS_META,
  SUPPORT_STATUS_META,
} from "@/lib/support";
import type { SupportStatus } from "@/lib/support-types";
import { cn } from "@/lib/utils";

/** Status chip shared by the student list and the admin queue. */
export function StatusPill({
  status,
  admin = false,
  className,
}: {
  status: SupportStatus;
  admin?: boolean;
  className?: string;
}) {
  const meta = admin
    ? SUPPORT_ADMIN_STATUS_META[status]
    : SUPPORT_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        className,
      )}
      style={{ color: meta.color, background: meta.background }}
    >
      {meta.label}
    </span>
  );
}

/**
 * The "new reply" dot. Purely decorative: the surrounding link always carries
 * the words "New reply" as well, so the state is not conveyed by colour alone.
 */
export function UnreadDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2.5 w-2.5 rounded-full", className)}
      style={{ background: "var(--teal)", boxShadow: "0 0 8px var(--teal-glow)" }}
    />
  );
}
