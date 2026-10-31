"use client";

import { CircleDashed, Clock3, FileText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { AnatomyReviewStatus } from "@/types/anatomy";

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  className: string;
}

export const REVIEW_STATUS_META: Record<AnatomyReviewStatus, StatusMeta> = {
  empty: {
    label: "Empty",
    icon: CircleDashed,
    className: "border-border bg-elevated text-muted",
  },
  draft: {
    label: "Draft",
    icon: FileText,
    className: "border-accent/20 bg-accent/10 text-accent",
  },
  pending: {
    label: "Pending review",
    icon: Clock3,
    className: "border-warning/20 bg-warning/10 text-warning",
  },
  reviewed: {
    label: "Reviewed",
    icon: ShieldCheck,
    className: "border-success/20 bg-success/10 text-success",
  },
};

export function ReviewStatusChip({
  status,
  testId,
  className,
}: {
  status: AnatomyReviewStatus;
  testId?: string;
  className?: string;
}) {
  const meta = REVIEW_STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      data-testid={testId}
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  );
}
