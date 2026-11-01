"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCheck,
  Eye,
  EyeOff,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import api from "@/lib/api";
import { ANATOMY_FOCUS_RING } from "@/components/anatomy/anatomy-focus";
import { AnatomyReviewEditor } from "@/components/anatomy/anatomy-review-editor";
import { ReviewStatusChip } from "@/components/anatomy/anatomy-review-status";
import { useConfirm } from "@/components/ui/confirm-dialog-provider";
import { matchesStructureQuery } from "@/lib/anatomy";
import { cn } from "@/lib/utils";
import type {
  AnatomyReviewCounts,
  AnatomyReviewStatus,
  AnatomyReviewStructure,
  AnatomyReviewSystemDetail,
  AnatomyReviewSystemSummary,
  AnatomyRevision,
} from "@/types/anatomy";

interface WorkspaceMessage {
  tone: "success" | "error";
  text: string;
}

interface AnatomyReviewWorkspaceProps {
  reviewerName: string;
}

function countStatuses(
  structures: AnatomyReviewStructure[],
): AnatomyReviewCounts {
  const counts: AnatomyReviewCounts = {
    empty: 0,
    draft: 0,
    pending: 0,
    reviewed: 0,
  };
  for (const structure of structures) {
    counts[structure.status] += 1;
  }
  return counts;
}

function messageFromError(
  error: unknown,
  fallback: string,
): { status?: number; text: string } {
  if (!isAxiosError(error)) return { text: fallback };
  const status = error.response?.status;
  const payload = error.response?.data?.message;
  const text = Array.isArray(payload)
    ? payload.join(" ")
    : typeof payload === "string"
      ? payload
      : fallback;
  return { status, text };
}

function countSummary(counts: AnatomyReviewCounts): string {
  const parts = [
    `${counts.reviewed} reviewed`,
    `${counts.pending} pending`,
    `${counts.draft} draft`,
    `${counts.empty} empty`,
  ];
  return parts.join(" · ");
}

export function AnatomyReviewWorkspace({
  reviewerName,
}: AnatomyReviewWorkspaceProps) {
  const confirm = useConfirm();
  const [systems, setSystems] = useState<AnatomyReviewSystemSummary[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(true);
  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [systemsReloadKey, setSystemsReloadKey] = useState(0);

  const [selectedSystemSlug, setSelectedSystemSlug] = useState<string | null>(
    null,
  );
  const [system, setSystem] = useState<AnatomyReviewSystemDetail | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [systemReloadKey, setSystemReloadKey] = useState(0);
  const [systemMessage, setSystemMessage] = useState<WorkspaceMessage | null>(
    null,
  );
  const [reviewingSystem, setReviewingSystem] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);

  const [revisions, setRevisions] = useState<AnatomyRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsReloadKey, setRevisionsReloadKey] = useState(0);

  const refreshSystemList = useCallback(async () => {
    try {
      const response = await api.get<AnatomyReviewSystemSummary[]>(
        "/anatomy/review/systems",
      );
      setSystems(response.data);
    } catch {
      // The selected system remains usable; the next full reload refreshes
      // the progress cards.
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Reset fetch state before the request starts. */
    let active = true;
    setSystemsLoading(true);
    setSystemsError(null);

    api
      .get<AnatomyReviewSystemSummary[]>("/anatomy/review/systems")
      .then((response) => {
        if (!active) return;
        const data = response.data ?? [];
        setSystems(data);
        setSelectedSystemSlug(
          (current) => current ?? data[0]?.slug ?? null,
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        const { status } = messageFromError(
          error,
          "The review library could not be loaded.",
        );
        setSystemsError(
          status === 403
            ? "Faculty review is restricted to approved reviewers."
            : "The review library could not be loaded. Please try again.",
        );
      })
      .finally(() => {
        if (active) setSystemsLoading(false);
      });

    return () => {
      active = false;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [systemsReloadKey]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Clear the previous system before loading the next one. */
    if (!selectedSystemSlug) {
      setSystem(null);
      return;
    }

    let active = true;
    setSystemLoading(true);
    setSystemError(null);
    setSystemMessage(null);

    api
      .get<AnatomyReviewSystemDetail>(
        `/anatomy/review/systems/${encodeURIComponent(selectedSystemSlug)}/structures`,
      )
      .then((response) => {
        if (!active) return;
        const nextSystem = response.data;
        setSystem(nextSystem);
        setSelectedId((current) =>
          current && nextSystem.structures.some((item) => item.id === current)
            ? current
            : (nextSystem.structures[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        const { status } = messageFromError(
          error,
          "The system could not be loaded.",
        );
        setSystem(null);
        setSystemError(
          status === 404
            ? "This anatomy system no longer exists."
            : "This system could not be loaded. Please try again.",
        );
      })
      .finally(() => {
        if (active) setSystemLoading(false);
      });

    return () => {
      active = false;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedSystemSlug, systemReloadKey]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Clear revisions when the selected structure changes. */
    if (!selectedId) {
      setRevisions([]);
      return;
    }

    let active = true;
    setRevisionsLoading(true);

    api
      .get<AnatomyRevision[]>(
        `/anatomy/review/structures/${encodeURIComponent(selectedId)}/revisions`,
      )
      .then((response) => {
        if (active) setRevisions(response.data ?? []);
      })
      .catch(() => {
        if (active) setRevisions([]);
      })
      .finally(() => {
        if (active) setRevisionsLoading(false);
      });

    return () => {
      active = false;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedId, revisionsReloadKey]);

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description:
        "Switching to another structure or system discards the edits currently in the form.",
      confirmLabel: "Discard changes",
      destructive: true,
    });
  }, [confirm, dirty]);

  const selectSystem = useCallback(
    async (slug: string) => {
      if (slug === selectedSystemSlug) return;
      if (!(await confirmDiscard())) return;
      setDirty(false);
      setSelectedSystemSlug(slug);
      setSelectedId(null);
      setQuery("");
      setSystemMessage(null);
    },
    [confirmDiscard, selectedSystemSlug],
  );

  const selectStructure = useCallback(
    async (structure: AnatomyReviewStructure) => {
      if (structure.id === selectedId) return;
      if (!(await confirmDiscard())) return;
      setDirty(false);
      setSelectedId(structure.id);
    },
    [confirmDiscard, selectedId],
  );

  const handleStructureChange = useCallback(
    (updated: AnatomyReviewStructure) => {
      setSystem((current) =>
        current
          ? {
              ...current,
              structures: current.structures.map((structure) =>
                structure.id === updated.id ? updated : structure,
              ),
            }
          : current,
      );
    },
    [],
  );

  const selected = useMemo(
    () =>
      system?.structures.find((structure) => structure.id === selectedId) ??
      null,
    [selectedId, system],
  );

  const counts = useMemo(
    () => countStatuses(system?.structures ?? []),
    [system],
  );

  const filteredStructures = useMemo(() => {
    const structures = system?.structures ?? [];
    if (!query.trim()) return structures;
    return structures.filter((structure) =>
      matchesStructureQuery(structure, query),
    );
  }, [query, system]);

  const canReviewSystem =
    !!system &&
    system.structures.length > 0 &&
    counts.empty === 0 &&
    counts.draft === 0 &&
    counts.reviewed < system.structures.length;

  // Publishing mirrors the API/CLI gate: the system must have structures and
  // none may be empty, draft, or pending (pending = complete but unreviewed).
  const canPublish =
    !!system &&
    system.structures.length > 0 &&
    counts.empty === 0 &&
    counts.draft === 0 &&
    counts.pending === 0;

  const reviewSystem = useCallback(async () => {
    if (!system || !canReviewSystem || reviewingSystem) return;
    const pendingCount = system.structures.filter(
      (structure) => !structure.isReviewed,
    ).length;
    const approved = await confirm({
      title: `Mark all ${pendingCount} remaining structure${pendingCount === 1 ? "" : "s"} reviewed?`,
      description: `Every structure in ${system.name} has complete teaching text. This records faculty approval for the whole system in one transaction.`,
      confirmLabel: "Mark system reviewed",
    });
    if (!approved) return;

    setReviewingSystem(true);
    setSystemMessage(null);
    try {
      const response = await api.post<{
        systemSlug: string;
        structureCount: number;
        updatedCount: number;
      }>(
        `/anatomy/review/systems/${encodeURIComponent(system.slug)}/review`,
        {},
      );
      setSystemMessage({
        tone: "success",
        text: `Faculty approval recorded for the whole system (${response.data.updatedCount} newly reviewed).`,
      });
      setSystemReloadKey((key) => key + 1);
      await refreshSystemList();
    } catch (error) {
      const { text } = messageFromError(
        error,
        "The system could not be marked reviewed.",
      );
      setSystemMessage({ tone: "error", text });
    } finally {
      setReviewingSystem(false);
    }
  }, [
    canReviewSystem,
    confirm,
    refreshSystemList,
    reviewingSystem,
    system,
  ]);

  // Publish or unpublish the selected system. Both directions ask for
  // confirmation because they change what students can see.
  const setPublication = useCallback(
    async (published: boolean) => {
      if (!system || publicationBusy) return;
      const approved = await confirm({
        title: published
          ? `Publish ${system.name} to students?`
          : `Return ${system.name} to draft?`,
        description: published
          ? `Students will see ${system.name} in the Anatomy Lab. You can return it to draft at any time.`
          : `Students will stop seeing ${system.name}. Faculty approvals and saved text are unchanged.`,
        confirmLabel: published ? "Publish to students" : "Return to draft",
        destructive: !published,
      });
      if (!approved) return;

      setPublicationBusy(true);
      setSystemMessage(null);
      try {
        await api.post(
          `/anatomy/review/systems/${encodeURIComponent(system.slug)}/${
            published ? "publish" : "unpublish"
          }`,
          {},
        );
        setSystem((current) =>
          current ? { ...current, isPublished: published } : current,
        );
        setSystemMessage({
          tone: "success",
          text: published
            ? `${system.name} is now published. Students can see it in the Anatomy Lab.`
            : `${system.name} is back to a draft. Students can no longer see it.`,
        });
        await refreshSystemList();
      } catch (error) {
        const { text } = messageFromError(
          error,
          published
            ? "The system could not be published."
            : "The system could not be unpublished.",
        );
        setSystemMessage({ tone: "error", text });
      } finally {
        setPublicationBusy(false);
      }
    },
    [confirm, publicationBusy, refreshSystemList, system],
  );

  const statusOrder: AnatomyReviewStatus[] = [
    "empty",
    "draft",
    "pending",
    "reviewed",
  ];

  return (
    <div
      className="-m-6 flex min-h-[calc(100vh-3.5rem)] flex-col bg-base"
      data-testid="anatomy-review-page"
    >
      <header className="border-b border-border bg-surface/70 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/anatomy"
            aria-label="Back to Anatomy Lab"
            className={`mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Faculty workspace
            </p>
            <h1 className="font-display text-xl font-semibold text-primary sm:text-2xl">
              Anatomy review
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
                Approved reviewer
              </span>
              <span className="text-muted">·</span>
              <span>{reviewerName}</span>
              <span className="text-muted">·</span>
              <span>Edits are attributed and saved as revisions.</span>
            </p>
          </div>
        </div>
      </header>

      <div className="min-w-0 flex-1 space-y-5 p-4 sm:p-6">
        {systemMessage && (
          <div
            role={systemMessage.tone === "error" ? "alert" : "status"}
            data-testid="review-system-message"
            className={cn(
              "flex items-start gap-2 rounded-xl border p-3 text-sm",
              systemMessage.tone === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-error/30 bg-error/10 text-error",
            )}
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              aria-hidden
            />
            <span>{systemMessage.text}</span>
          </div>
        )}

        <section aria-labelledby="review-systems-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="review-systems-heading"
                className="font-display text-lg font-semibold text-primary"
              >
                Systems
              </h2>
              <p className="text-xs text-secondary">
                Progress includes drafts and unpublished systems.
              </p>
            </div>
            <p className="text-xs text-muted" aria-live="polite">
              {systems.length} {systems.length === 1 ? "system" : "systems"}
            </p>
          </div>

          {systemsLoading ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-28 animate-pulse rounded-xl border border-border bg-surface"
                />
              ))}
            </div>
          ) : systemsError ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-error/20 bg-error/10 p-4"
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-error"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-primary">
                    Could not load the review library
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-secondary">
                    {systemsError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSystemsReloadKey((key) => key + 1)}
                    className={`mt-3 inline-flex min-h-11 items-center rounded-lg border border-border bg-elevated px-4 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          ) : systems.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center">
              <Boxes className="mx-auto mb-2 h-7 w-7 text-muted" aria-hidden />
              <p className="text-sm font-medium text-primary">
                No anatomy systems found
              </p>
              <p className="mt-1 text-xs text-secondary">
                Seed the anatomy library before reviewing it.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {systems.map((candidate) => {
                const total = candidate.structureCount;
                const percent =
                  total > 0
                    ? Math.round((candidate.counts.reviewed / total) * 100)
                    : 0;
                const isSelected = candidate.slug === selectedSystemSlug;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={isSelected}
                    data-testid={`review-system-${candidate.slug}`}
                    onClick={() => void selectSystem(candidate.slug)}
                    className={cn(
                      "min-h-11 rounded-xl border p-3 text-left transition-colors",
                      isSelected
                        ? "border-accent/50 bg-accent/10"
                        : "border-border bg-surface hover:border-border-accent",
                      ANATOMY_FOCUS_RING,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-primary">
                        {candidate.name}
                      </span>
                      {!candidate.isPublished && (
                        <span className="rounded-full border border-warning/20 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                          Draft
                        </span>
                      )}
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-label={`${candidate.name} review progress`}
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
                    >
                      <div
                        className="h-full rounded-full bg-success transition-[width]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-secondary">
                      {candidate.counts.reviewed}/{total} reviewed
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {countSummary(candidate.counts)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {systemLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-surface">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden />
              <p className="text-sm text-secondary">Loading structures…</p>
            </div>
          </div>
        ) : systemError ? (
          <div
            role="alert"
            className="rounded-xl border border-error/20 bg-error/10 p-5"
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-error"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-primary">
                  Could not load this system
                </p>
                <p className="mt-1 text-xs text-secondary">{systemError}</p>
                <button
                  type="button"
                  onClick={() => setSystemReloadKey((key) => key + 1)}
                  className={`mt-3 inline-flex min-h-11 items-center rounded-lg border border-border bg-elevated px-4 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : system ? (
          <section aria-labelledby="review-structures-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="review-structures-heading"
                    className="font-display text-lg font-semibold text-primary"
                  >
                    {system.name}{" "}
                    <span className="text-sm font-normal text-muted">
                      ({system.structureCount} structures)
                    </span>
                  </h2>
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
                </div>
                <p className="mt-0.5 text-xs text-secondary">
                  {countSummary(counts)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void setPublication(!system.isPublished)}
                  disabled={
                    publicationBusy ||
                    dirty ||
                    (!system.isPublished && !canPublish)
                  }
                  data-testid="review-system-publication"
                  title={
                    !system.isPublished && !canPublish
                      ? "Review every structure before publishing to students."
                      : undefined
                  }
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-4 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    system.isPublished
                      ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15"
                      : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/15",
                    ANATOMY_FOCUS_RING,
                  )}
                >
                  {publicationBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : system.isPublished ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {system.isPublished
                    ? "Return to draft"
                    : "Publish to students"}
                </button>
                <button
                  type="button"
                  onClick={() => void reviewSystem()}
                  disabled={!canReviewSystem || reviewingSystem || dirty}
                  data-testid="review-system-all"
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-4 text-xs font-medium text-success transition-colors hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
                >
                  {reviewingSystem ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Mark system reviewed
                </button>
              </div>
            </div>

            <div className="mt-3 grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="min-w-0 rounded-xl border border-border bg-surface p-3">
                <label
                  htmlFor="review-structure-search"
                  className="text-xs font-medium text-primary"
                >
                  Find a structure
                </label>
                <div className="relative mt-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <input
                    id="review-structure-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name or notes"
                    data-testid="review-structure-search"
                    className={`min-h-11 w-full rounded-lg border border-border bg-elevated pl-9 pr-3 text-sm text-primary placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${ANATOMY_FOCUS_RING}`}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden>
                  {statusOrder.map((status) => (
                    <ReviewStatusChip
                      key={status}
                      status={status}
                      className="text-[10px]"
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted" aria-live="polite">
                  {filteredStructures.length} of {system.structures.length}{" "}
                  shown
                </p>

                <ul className="mt-2 max-h-[calc(100vh-26rem)] min-h-40 space-y-1 overflow-y-auto pr-1">
                  {filteredStructures.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-secondary">
                      No structures match “{query.trim()}”.
                    </li>
                  ) : (
                    filteredStructures.map((structure) => (
                      <li key={structure.id}>
                        <button
                          type="button"
                          aria-pressed={structure.id === selectedId}
                          data-testid={`review-structure-${structure.slug}`}
                          onClick={() => void selectStructure(structure)}
                          className={cn(
                            "w-full min-h-11 rounded-lg border p-2 text-left transition-colors",
                            structure.id === selectedId
                              ? "border-accent/50 bg-accent/10"
                              : "border-transparent hover:border-border hover:bg-elevated",
                            ANATOMY_FOCUS_RING,
                          )}
                        >
                          <span className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="min-w-0 truncate text-sm font-medium text-primary">
                              {structure.name}
                            </span>
                            <ReviewStatusChip
                              status={structure.status}
                              testId={`review-status-${structure.slug}`}
                            />
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {structure.summary.trim().length > 0
                              ? structure.summary
                              : "No teaching text yet"}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </aside>

              <div className="min-w-0">
                {selected ? (
                  <AnatomyReviewEditor
                    key={`${selected.id}-${editorVersion}`}
                    structure={selected}
                    system={system}
                    revisions={revisions}
                    revisionsLoading={revisionsLoading}
                    onStructureChange={handleStructureChange}
                    onSelectStructure={(next) =>
                      void selectStructure(next)
                    }
                    onRefreshRevisions={() =>
                      setRevisionsReloadKey((key) => key + 1)
                    }
                    onRefreshSystems={() => void refreshSystemList()}
                    onReloadStructure={() => {
                      setSystemMessage(null);
                      setEditorVersion((version) => version + 1);
                      setSystemReloadKey((key) => key + 1);
                    }}
                    onDirtyChange={setDirty}
                  />
                ) : (
                  <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center">
                    <Boxes
                      className="mb-2 h-7 w-7 text-muted"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-primary">
                      Choose a structure to review
                    </p>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-secondary">
                      The split view shows the model and the editable teaching
                      text side by side on wide screens.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center">
            <p className="text-sm font-medium text-primary">
              Select a system to begin
            </p>
            <p className="mt-1 text-xs text-secondary">
              Choose one of the systems above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
