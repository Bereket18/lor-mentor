"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useConfirm } from "@/components/ui/confirm-dialog-provider";
import { cn } from "@/lib/utils";
import type {
  AnatomyReviewSystemDetail,
  AnatomyReviewSystemSummary,
} from "@/types/anatomy";

interface AdminMessage {
  tone: "success" | "error";
  text: string;
}

interface ReviewSettings {
  requireSecondReviewer: boolean;
  updatedAt: string | null;
}

function messageFromError(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  const payload = error.response?.data?.message;
  if (Array.isArray(payload)) return payload.join(" ");
  return typeof payload === "string" ? payload : fallback;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminAnatomyPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();
  const confirm = useConfirm();

  const [systems, setSystems] = useState<AnatomyReviewSystemSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnatomyReviewSystemDetail | null>(null);
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<AdminMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Administrators never gain the anatomy lab; this separate surface is their
  // only publication path. Non-admins are sent back rather than shown a shell
  // that would only produce 403 responses.
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAdmin, router]);

  const loadSystems = useCallback(async () => {
    const response = await api.get<AnatomyReviewSystemSummary[]>(
      "/admin/anatomy/systems",
    );
    const data = response.data ?? [];
    setSystems(data);
    setSelectedSlug((current) => current ?? data[0]?.slug ?? null);
    return data;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    /* eslint-disable react-hooks/set-state-in-effect -- Reset fetch state before the request starts. */
    let active = true;
    setLoading(true);
    setMessage(null);

    Promise.all([
      api.get<AnatomyReviewSystemSummary[]>("/admin/anatomy/systems"),
      api.get<ReviewSettings>("/admin/anatomy/settings"),
    ])
      .then(([systemsResponse, settingsResponse]) => {
        if (!active) return;
        const data = systemsResponse.data ?? [];
        setSystems(data);
        setSettings(settingsResponse.data);
        setSelectedSlug((current) => current ?? data[0]?.slug ?? null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage({
          tone: "error",
          text: messageFromError(
            error,
            "The publication queue could not be loaded.",
          ),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, reloadKey]);

  useEffect(() => {
    if (!isAdmin || !selectedSlug) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);

    api
      .get<AnatomyReviewSystemDetail>(
        `/admin/anatomy/systems/${encodeURIComponent(selectedSlug)}`,
      )
      .then((response) => {
        if (active) setDetail(response.data);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDetail(null);
        setMessage({
          tone: "error",
          text: messageFromError(
            error,
            "The selected system could not be loaded.",
          ),
        });
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, selectedSlug, reloadKey]);

  const allSignedOff =
    !!detail &&
    detail.structures.length > 0 &&
    detail.structures.every((structure) => structure.isReviewed);

  const approvalCurrent =
    !!detail &&
    !!detail.publicationApprovedAt &&
    detail.publicationApprovedRevision === detail.contentRevision;

  const unsignedNames = useMemo(
    () =>
      (detail?.structures ?? [])
        .filter((structure) => !structure.isReviewed)
        .map((structure) => structure.name),
    [detail],
  );

  const perform = useCallback(
    async (
      action: "approve" | "publish" | "unpublish",
      system: AnatomyReviewSystemDetail,
    ) => {
      const labels = {
        approve: {
          title: `Approve ${system.name} for publication?`,
          description:
            "This records your administrator approval for the current content revision. Publishing is a separate step and still requires every structure to be signed off.",
          confirmLabel: "Approve current revision",
          destructive: false,
        },
        publish: {
          title: `Publish ${system.name} to students?`,
          description:
            "Every structure is signed off and the current revision is approved. Students will see this system in the Anatomy Lab.",
          confirmLabel: "Publish to students",
          destructive: false,
        },
        unpublish: {
          title: `Return ${system.name} to draft?`,
          description:
            "Students will stop seeing this system. Faculty sign-offs stay intact, but administrator approval is invalidated.",
          confirmLabel: "Return to draft",
          destructive: true,
        },
      }[action];

      const approved = await confirm(labels);
      if (!approved) return;

      setBusy(action);
      setMessage(null);
      try {
        await api.post(
          `/admin/anatomy/systems/${encodeURIComponent(system.slug)}/${action}`,
          {},
        );
        setMessage({
          tone: "success",
          text:
            action === "approve"
              ? `${system.name} approved for the current revision.`
              : action === "publish"
                ? `${system.name} is now published.`
                : `${system.name} is back to a draft.`,
        });
        await loadSystems();
        setReloadKey((key) => key + 1);
      } catch (error) {
        setMessage({
          tone: "error",
          text: messageFromError(
            error,
            action === "approve"
              ? "The revision could not be approved."
              : action === "publish"
                ? "The system could not be published."
                : "The system could not be unpublished.",
          ),
        });
      } finally {
        setBusy(null);
      }
    },
    [confirm, loadSystems],
  );

  const toggleSecondReviewer = useCallback(async () => {
    if (!settings) return;
    const next = !settings.requireSecondReviewer;
    setBusy("settings");
    setMessage(null);
    try {
      const response = await api.patch<ReviewSettings>(
        "/admin/anatomy/settings",
        { requireSecondReviewer: next },
      );
      setSettings(response.data);
      setMessage({
        tone: "success",
        text: next
          ? "Second reviewer requirement enabled. The last editor can no longer sign off their own structure."
          : "Second reviewer requirement disabled. Any reviewer may sign off a structure.",
      });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setMessage({
        tone: "error",
        text: messageFromError(
          error,
          "The review setting could not be updated.",
        ),
      });
    } finally {
      setBusy(null);
    }
  }, [settings]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center">
        <p className="text-sm text-secondary">
          Administrator access is required.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary">
          Anatomy publication
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Approve the current revision and publish only after every structure
          has faculty sign-off. This workflow is separate from the anatomy lab.
        </p>
      </div>

      {message && (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-xl border p-3 text-sm",
            message.tone === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-error/30 bg-error/10 text-error",
          )}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{message.text}</span>
        </div>
      )}

      <section
        aria-labelledby="review-policy-heading"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <h2
          id="review-policy-heading"
          className="text-sm font-semibold text-primary"
        >
          Review policy
        </h2>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <p className="text-sm text-primary">Require a second reviewer</p>
            <p className="mt-0.5 text-xs leading-relaxed text-secondary">
              When enabled, the teacher who last edited a structure cannot sign
              it off. Another reviewer must approve it.
            </p>
            {settings?.updatedAt && (
              <p className="mt-1 text-[11px] text-muted">
                Last changed {formatDateTime(settings.updatedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void toggleSecondReviewer()}
            disabled={busy === "settings" || !settings}
            aria-pressed={settings?.requireSecondReviewer ?? false}
            data-testid="admin-second-reviewer-toggle"
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-xs font-medium transition-colors disabled:opacity-50",
              settings?.requireSecondReviewer
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-elevated text-secondary",
            )}
          >
            {busy === "settings" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : settings?.requireSecondReviewer ? (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ShieldOff className="h-3.5 w-3.5" aria-hidden />
            )}
            {settings?.requireSecondReviewer ? "On" : "Off"}
          </button>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-border bg-surface">
          <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden />
        </div>
      ) : systems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center">
          <p className="text-sm font-medium text-primary">
            No anatomy systems found
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border bg-surface p-2">
            <ul className="space-y-1">
              {systems.map((system) => {
                const approved =
                  !!system.publicationApprovedAt &&
                  system.publicationApprovedRevision ===
                    system.contentRevision;
                return (
                  <li key={system.slug}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlug(system.slug)}
                      aria-pressed={system.slug === selectedSlug}
                      className={cn(
                        "w-full rounded-lg border p-2.5 text-left transition-colors",
                        system.slug === selectedSlug
                          ? "border-accent/50 bg-accent/10"
                          : "border-transparent hover:border-border hover:bg-elevated",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-primary">
                          {system.name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            system.isPublished
                              ? "border-success/20 bg-success/10 text-success"
                              : "border-warning/20 bg-warning/10 text-warning",
                          )}
                        >
                          {system.isPublished ? "Published" : "Draft"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {system.signedOffCount ?? 0}/{system.structureCount}{" "}
                        signed off
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {approved
                          ? "Current revision approved"
                          : "No current approval"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section
            aria-labelledby="admin-system-heading"
            className="rounded-xl border border-border bg-surface p-4"
          >
            {detailLoading || !detail ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <Loader2
                  className="h-5 w-5 animate-spin text-accent"
                  aria-hidden
                />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2
                      id="admin-system-heading"
                      className="font-display text-lg font-semibold text-primary"
                    >
                      {detail.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-secondary">
                      {detail.structures.filter((s) => s.isReviewed).length} of{" "}
                      {detail.structures.length} structures signed off ·
                      revision {detail.contentRevision ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {approvalCurrent
                        ? `Approved by ${detail.publicationApprovedByName ?? "an administrator"} on ${formatDateTime(detail.publicationApprovedAt)}`
                        : "No administrator approval for the current revision."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void perform("approve", detail)}
                      disabled={!allSignedOff || busy !== null}
                      title={
                        allSignedOff
                          ? undefined
                          : "Every structure must be signed off first."
                      }
                      data-testid="admin-approve"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-4 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === "approve" ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Approve current revision
                    </button>
                    {detail.isPublished ? (
                      <button
                        type="button"
                        onClick={() => void perform("unpublish", detail)}
                        disabled={busy !== null}
                        data-testid="admin-unpublish"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-4 text-xs font-medium text-warning transition-colors hover:bg-warning/15 disabled:opacity-50"
                      >
                        {busy === "unpublish" ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Return to draft
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void perform("publish", detail)}
                        disabled={
                          !allSignedOff || !approvalCurrent || busy !== null
                        }
                        title={
                          !allSignedOff
                            ? "Every structure must be signed off first."
                            : !approvalCurrent
                              ? "Approve the current revision before publishing."
                              : undefined
                        }
                        data-testid="admin-publish"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-4 text-xs font-medium text-success transition-colors hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy === "publish" ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Publish to students
                      </button>
                    )}
                  </div>
                </div>

                {unsignedNames.length > 0 && (
                  <div
                    role="status"
                    data-testid="admin-unsigned-list"
                    className="mt-4 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs leading-relaxed text-warning"
                  >
                    <p className="font-medium">
                      Publication is blocked until these structures are signed
                      off:
                    </p>
                    <ul className="mt-1 list-inside list-disc">
                      {unsignedNames.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
                  {detail.structures.map((structure) => (
                    <li
                      key={structure.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm text-primary">{structure.name}</p>
                        <p className="text-[11px] text-muted">
                          {structure.isReviewed
                            ? `Signed off by ${structure.reviewedByName ?? "a reviewer"}`
                            : "Awaiting faculty sign-off"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          structure.isReviewed
                            ? "border-success/20 bg-success/10 text-success"
                            : "border-warning/20 bg-warning/10 text-warning",
                        )}
                      >
                        {structure.isReviewed ? "Signed off" : "Unsigned"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
