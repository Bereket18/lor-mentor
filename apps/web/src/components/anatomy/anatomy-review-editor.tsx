"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { ANATOMY_FOCUS_RING } from "@/components/anatomy/anatomy-focus";
import { AnatomyReviewViewport } from "@/components/anatomy/anatomy-review-viewport";
import { ReviewStatusChip } from "@/components/anatomy/anatomy-review-status";
import { useConfirm } from "@/components/ui/confirm-dialog-provider";
import { cn } from "@/lib/utils";
import type {
  AnatomyEditableFields,
  AnatomyReviewStructure,
  AnatomyReviewSystemDetail,
  AnatomyRevision,
} from "@/types/anatomy";

const TEXT_FIELDS = [
  { key: "summary", label: "Summary", max: 600, rows: 4 },
  { key: "location", label: "Location", max: 800, rows: 3 },
  { key: "function", label: "Function", max: 800, rows: 3 },
  { key: "bloodSupply", label: "Blood supply", max: 600, rows: 3 },
  { key: "clinicalNotes", label: "Clinical notes", max: 800, rows: 4 },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"];

interface FormState {
  summary: string;
  location: string;
  function: string;
  bloodSupply: string;
  clinicalNotes: string;
  references: string[];
  relatedSlugs: string[];
}

interface EditorMessage {
  tone: "success" | "error" | "info";
  text: string;
}

interface AnatomyReviewEditorProps {
  structure: AnatomyReviewStructure;
  system: AnatomyReviewSystemDetail;
  revisions: AnatomyRevision[];
  revisionsLoading: boolean;
  onStructureChange: (structure: AnatomyReviewStructure) => void;
  onSelectStructure: (structure: AnatomyReviewStructure) => void;
  onRefreshRevisions: () => void;
  onRefreshSystems: () => void;
  onReloadStructure: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function formFromStructure(structure: AnatomyReviewStructure): FormState {
  return {
    summary: structure.summary ?? "",
    location: structure.location ?? "",
    function: structure.function ?? "",
    bloodSupply: structure.bloodSupply ?? "",
    clinicalNotes: structure.clinicalNotes ?? "",
    references: structure.references ?? [],
    relatedSlugs: structure.relatedSlugs ?? [],
  };
}

function normalize(form: FormState): FormState {
  return {
    summary: form.summary.trim(),
    location: form.location.trim(),
    function: form.function.trim(),
    bloodSupply: form.bloodSupply.trim(),
    clinicalNotes: form.clinicalNotes.trim(),
    references: form.references.map((item) => item.trim()).filter(Boolean),
    relatedSlugs: form.relatedSlugs,
  };
}

function formsEqual(left: FormState, right: FormState): boolean {
  const a = normalize(left);
  const b = normalize(right);
  return (
    a.summary === b.summary &&
    a.location === b.location &&
    a.function === b.function &&
    a.bloodSupply === b.bloodSupply &&
    a.clinicalNotes === b.clinicalNotes &&
    a.references.join("\u0000") === b.references.join("\u0000") &&
    a.relatedSlugs.join("\u0000") === b.relatedSlugs.join("\u0000")
  );
}

function missingTextFields(form: FormState): string[] {
  return TEXT_FIELDS.filter((field) => form[field.key].trim().length === 0).map(
    (field) => field.label,
  );
}

function hasHtml(form: FormState): boolean {
  const values = [
    ...TEXT_FIELDS.map((field) => form[field.key]),
    ...form.references,
  ];
  return values.some((value) => /[<>]/.test(value));
}

function messageFromError(error: unknown): { status?: number; text: string } {
  if (!isAxiosError(error)) {
    return {
      text: "The request could not be completed. Check your connection and try again.",
    };
  }

  const status = error.response?.status;
  const payload = error.response?.data?.message;
  const text = Array.isArray(payload)
    ? payload.join(" ")
    : typeof payload === "string"
      ? payload
      : "The request could not be completed. Please try again.";

  return { status, text };
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function revisionForm(
  revision: AnatomyRevision,
  structure: AnatomyReviewStructure,
  system: AnatomyReviewSystemDetail,
): FormState {
  const fields: AnatomyEditableFields = revision.new;
  const validSlugs = new Set(
    system.structures
      .filter((candidate) => candidate.slug !== structure.slug)
      .map((candidate) => candidate.slug),
  );

  return {
    summary: typeof fields.summary === "string" ? fields.summary : "",
    location: typeof fields.location === "string" ? fields.location : "",
    function: typeof fields.function === "string" ? fields.function : "",
    bloodSupply:
      typeof fields.bloodSupply === "string" ? fields.bloodSupply : "",
    clinicalNotes:
      typeof fields.clinicalNotes === "string" ? fields.clinicalNotes : "",
    references: Array.isArray(fields.references)
      ? fields.references
          .filter((item): item is string => typeof item === "string")
          .slice(0, 6)
          .map((item) => item.slice(0, 300))
      : [],
    relatedSlugs: Array.isArray(fields.relatedSlugs)
      ? fields.relatedSlugs.filter(
          (slug): slug is string =>
            typeof slug === "string" &&
            validSlugs.has(slug) &&
            slug !== structure.slug,
        )
      : [],
  };
}

function changedFieldLabels(revision: AnatomyRevision): string[] {
  const labels: string[] = [];
  for (const field of TEXT_FIELDS) {
    const before = revision.previous[field.key] ?? "";
    const after = revision.new[field.key] ?? "";
    if (before !== after) labels.push(field.label);
  }
  if (
    (revision.previous.references ?? []).join("\u0000") !==
    (revision.new.references ?? []).join("\u0000")
  ) {
    labels.push("References");
  }
  if (
    (revision.previous.relatedSlugs ?? []).join("\u0000") !==
    (revision.new.relatedSlugs ?? []).join("\u0000")
  ) {
    labels.push("Related structures");
  }
  return labels;
}

function reviewApprovalText(structure: AnatomyReviewStructure): string {
  if (!structure.isReviewed) return "Pending faculty review";
  const date = formatDate(structure.reviewedAt);
  if (structure.reviewedByName && date) {
    return `Faculty reviewed by ${structure.reviewedByName} on ${date}`;
  }
  if (structure.reviewedByName) {
    return `Faculty reviewed by ${structure.reviewedByName}`;
  }
  return date ? `Faculty reviewed on ${date}` : "Faculty reviewed";
}

export function AnatomyReviewEditor({
  structure,
  system,
  revisions,
  revisionsLoading,
  onStructureChange,
  onSelectStructure,
  onRefreshRevisions,
  onRefreshSystems,
  onReloadStructure,
  onDirtyChange,
}: AnatomyReviewEditorProps) {
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(() =>
    formFromStructure(structure),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<EditorMessage | null>(null);
  const [stale, setStale] = useState(false);
  const [editedThisSession, setEditedThisSession] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = useMemo(
    () => !formsEqual(form, formFromStructure(structure)),
    [form, structure],
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const updateText = useCallback((key: TextFieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }, []);

  const updateReference = useCallback((index: number, value: string) => {
    setForm((current) => ({
      ...current,
      references: current.references.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
    setMessage(null);
  }, []);

  const addReference = useCallback(() => {
    setForm((current) =>
      current.references.length >= 6
        ? current
        : { ...current, references: [...current.references, ""] },
    );
  }, []);

  const removeReference = useCallback((index: number) => {
    setForm((current) => ({
      ...current,
      references: current.references.filter(
        (_item, itemIndex) => itemIndex !== index,
      ),
    }));
    setMessage(null);
  }, []);

  const toggleRelated = useCallback((slug: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      relatedSlugs: checked
        ? [...current.relatedSlugs.filter((item) => item !== slug), slug]
        : current.relatedSlugs.filter((item) => item !== slug),
    }));
    setMessage(null);
  }, []);

  const resetDraft = useCallback(() => {
    setForm(formFromStructure(structure));
    setNote("");
    setMessage({ tone: "info", text: "Unsaved changes discarded." });
  }, [structure]);

  const applyServerStructure = useCallback(
    (updated: AnatomyReviewStructure) => {
      onStructureChange(updated);
      setForm(formFromStructure(updated));
      setNote("");
    },
    [onStructureChange],
  );

  const handleSave = useCallback(
    async (markReviewed: boolean) => {
      if (saving) return;
      setMessage(null);
      setStale(false);

      if (hasHtml(form)) {
        setMessage({
          tone: "error",
          text: "HTML tags are not allowed. Use plain text only.",
        });
        return;
      }

      if (markReviewed) {
        const missing = missingTextFields(form);
        if (missing.length > 0) {
          setMessage({
            tone: "error",
            text: `Fill in ${missing.join(", ")} before marking this structure reviewed.`,
          });
          return;
        }

        if (dirty || editedThisSession) {
          const approved = await confirm({
            title: "Mark this structure reviewed?",
            description:
              "You edited this structure in this session. Confirm that the saved text is the version you want to approve.",
            confirmLabel: "Mark reviewed",
          });
          if (!approved) return;
        }
      }

      setSaving(true);
      try {
        let current = structure;

        if (dirty) {
          const payload = {
            updatedAt: structure.updatedAt,
            ...normalize(form),
            note: note.trim() || undefined,
          };
          const response = await api.patch<AnatomyReviewStructure>(
            `/anatomy/review/structures/${structure.id}`,
            payload,
          );
          current = response.data;
          setEditedThisSession(true);
          applyServerStructure(current);
          onRefreshRevisions();
        }

        if (markReviewed && !current.isReviewed) {
          const response = await api.post<AnatomyReviewStructure>(
            `/anatomy/review/structures/${structure.id}/review`,
            { updatedAt: current.updatedAt, note: note.trim() || undefined },
          );
          current = response.data;
          applyServerStructure(current);
        }

        setMessage({
          tone: "success",
          text: markReviewed ? "Saved and marked as reviewed." : "Changes saved.",
        });
        onRefreshSystems();
      } catch (error) {
        const { status, text } = messageFromError(error);
        if (status === 409) {
          setStale(true);
          setMessage({ tone: "error", text });
        } else {
          setMessage({ tone: "error", text });
        }
      } finally {
        setSaving(false);
      }
    },
    [
      applyServerStructure,
      confirm,
      dirty,
      editedThisSession,
      form,
      note,
      onRefreshRevisions,
      onRefreshSystems,
      saving,
      structure,
    ],
  );

  const handleMarkReviewed = useCallback(async () => {
    if (saving) return;
    if (dirty) {
      setMessage({
        tone: "error",
        text: "Save or discard your changes before marking this structure reviewed.",
      });
      return;
    }

    const missing = missingTextFields(form);
    if (missing.length > 0) {
      setMessage({
        tone: "error",
        text: `Fill in ${missing.join(", ")} before marking this structure reviewed.`,
      });
      return;
    }

    const edited = editedThisSession;
    if (edited) {
      const approved = await confirm({
        title: "Mark this structure reviewed?",
        description:
          "You edited this structure in this session. Confirm that the saved text is the version you want to approve.",
        confirmLabel: "Mark reviewed",
      });
      if (!approved) return;
    }

    setSaving(true);
    setMessage(null);
    setStale(false);
    try {
      const response = await api.post<AnatomyReviewStructure>(
        `/anatomy/review/structures/${structure.id}/review`,
        { updatedAt: structure.updatedAt, note: note.trim() || undefined },
      );
      applyServerStructure(response.data);
      setEditedThisSession(false);
      setMessage({ tone: "success", text: "Marked as reviewed." });
      onRefreshSystems();
    } catch (error) {
      const { status, text } = messageFromError(error);
      if (status === 409) setStale(true);
      setMessage({ tone: "error", text });
    } finally {
      setSaving(false);
    }
  }, [
    applyServerStructure,
    confirm,
    dirty,
    editedThisSession,
    form,
    note,
    onRefreshSystems,
    saving,
    structure,
  ]);

  const handleRevoke = useCallback(async () => {
    if (saving) return;
    const approved = await confirm({
      title: "Remove faculty approval?",
      description:
        "The structure will show “Pending faculty review” again. The teaching text is not changed.",
      confirmLabel: "Remove approval",
      destructive: true,
    });
    if (!approved) return;

    setSaving(true);
    setMessage(null);
    setStale(false);
    try {
      const response = await api.post<AnatomyReviewStructure>(
        `/anatomy/review/structures/${structure.id}/revoke`,
        { note: note.trim() || undefined },
      );
      applyServerStructure(response.data);
      setEditedThisSession(false);
      setMessage({ tone: "info", text: "Faculty approval removed." });
      onRefreshSystems();
    } catch (error) {
      const { text } = messageFromError(error);
      setMessage({ tone: "error", text });
    } finally {
      setSaving(false);
    }
  }, [applyServerStructure, confirm, note, onRefreshSystems, saving, structure]);

  const handleRestore = useCallback(
    async (revision: AnatomyRevision) => {
      if (dirty) {
        const approved = await confirm({
          title: "Replace your unsaved changes?",
          description:
            "Loading this version discards the edits currently in the form. Nothing is saved until you press Save.",
          confirmLabel: "Load version",
          destructive: true,
        });
        if (!approved) return;
      }
      setForm(revisionForm(revision, structure, system));
      setNote("");
      setStale(false);
      setMessage({
        tone: "info",
        text: `Version from ${formatTimestamp(revision.createdAt)} loaded into the editor. Review it, then Save to apply.`,
      });
    },
    [confirm, dirty, structure, system],
  );

  const missing = missingTextFields(form);
  const canReview = missing.length === 0;
  const locked = saving;

  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-3">
        <AnatomyReviewViewport
          modelUrl={system.modelUrl}
          selectedMeshName={structure.meshName}
          structures={system.structures}
          onSelectStructure={(next) => {
            if (next.id === structure.id) return;
            // The workspace owns unsaved-change confirmation before switching.
            onSelectStructure(next);
          }}
        />

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold text-primary">
              {structure.name}
            </h2>
            <ReviewStatusChip status={structure.status} />
          </div>
          {structure.latinName && (
            <p className="mt-0.5 text-xs italic text-muted">
              {structure.latinName}
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            {reviewApprovalText(structure)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Last updated {formatTimestamp(structure.updatedAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {structure.isReviewed ? (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={locked}
                data-testid="review-revoke"
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 text-xs font-medium text-warning transition-colors hover:bg-warning/15 disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
              >
                <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                Remove approval
              </button>
            ) : (
              <button
                type="button"
                onClick={handleMarkReviewed}
                disabled={locked || dirty || !canReview}
                data-testid="review-mark"
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 text-xs font-medium text-success transition-colors hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Mark reviewed
              </button>
            )}
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={historyOpen}
              aria-controls="anatomy-revision-history"
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              Revision history ({revisions.length})
            </button>
          </div>
        </div>

        {historyOpen && (
          <section
            id="anatomy-revision-history"
            aria-labelledby="anatomy-revision-history-heading"
            className="rounded-xl border border-border bg-surface p-4"
          >
            <h3
              id="anatomy-revision-history-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Revision history
            </h3>
            {revisionsLoading ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-secondary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Loading revisions…
              </p>
            ) : revisions.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-secondary">
                No saved revisions yet. The first Save creates one.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {revisions.map((revision) => {
                  const changed = changedFieldLabels(revision);
                  return (
                    <li
                      key={revision.id}
                      className="rounded-lg border border-border bg-elevated/60 p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-xs font-medium text-primary">
                          {formatTimestamp(revision.createdAt)}
                        </p>
                        <p className="text-xs text-muted">
                          {revision.editorName}
                        </p>
                      </div>
                      {revision.note && (
                        <p className="mt-1 text-xs italic text-secondary">
                          “{revision.note}”
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted">
                        {changed.length > 0
                          ? `Changed: ${changed.join(", ")}`
                          : "No teaching text changed"}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRestore(revision)}
                        data-testid={`review-restore-${revision.id}`}
                        className={`mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Load this version
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave(false);
        }}
        className="min-w-0 space-y-4 rounded-xl border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-primary">
              Teaching text
            </h2>
            <p className="text-xs text-secondary">
              Plain text only. Changes are saved with a revision.
            </p>
          </div>
          {dirty && (
            <span
              data-testid="review-unsaved"
              className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Unsaved changes
            </span>
          )}
        </div>

        {stale && (
          <div
            role="alert"
            data-testid="review-stale"
            className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-secondary"
          >
            <p className="font-medium text-warning">
              This structure changed since you loaded it.
            </p>
            <p className="mt-1 leading-relaxed">
              Reload the latest version before editing again. Your unsaved text
              stays in this form until you reload.
            </p>
            <button
              type="button"
              onClick={onReloadStructure}
              className={`mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reload latest
            </button>
          </div>
        )}

        {message && (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            data-testid="review-message"
            className={cn(
              "flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed",
              message.tone === "success" &&
                "border-success/30 bg-success/10 text-success",
              message.tone === "error" &&
                "border-error/30 bg-error/10 text-error",
              message.tone === "info" &&
                "border-border bg-elevated text-secondary",
            )}
          >
            {message.tone === "success" ? (
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                aria-hidden
              />
            ) : message.tone === "error" ? (
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                aria-hidden
              />
            ) : (
              <ArrowUpRight
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                aria-hidden
              />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {TEXT_FIELDS.map((field) => {
          const value = form[field.key];
          const nearLimit = value.length > field.max * 0.9;
          const id = `review-${field.key}`;
          return (
            <div key={field.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <label
                  htmlFor={id}
                  className="text-xs font-medium text-primary"
                >
                  {field.label}
                </label>
                <span
                  className={cn(
                    "text-xs tabular-nums text-muted",
                    nearLimit && "text-warning",
                  )}
                  aria-hidden
                >
                  {value.length}/{field.max}
                </span>
              </div>
              <textarea
                id={id}
                name={field.key}
                data-testid={id}
                value={value}
                rows={field.rows}
                maxLength={field.max}
                onChange={(event) => updateText(field.key, event.target.value)}
                className={`w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2 text-sm leading-relaxed text-primary placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${ANATOMY_FOCUS_RING}`}
                placeholder={`Add ${field.label.toLowerCase()} notes`}
              />
            </div>
          );
        })}

        <fieldset>
          <div className="mb-1 flex items-center justify-between gap-2">
            <legend className="text-xs font-medium text-primary">
              References
            </legend>
            <span className="text-xs text-muted">
              {form.references.length}/6
            </span>
          </div>
          <div className="space-y-2">
            {form.references.map((reference, index) => (
              <div key={index} className="flex items-start gap-2">
                <input
                  type="text"
                  value={reference}
                  maxLength={300}
                  aria-label={`Reference ${index + 1}`}
                  data-testid={`review-reference-${index}`}
                  onChange={(event) =>
                    updateReference(index, event.target.value)
                  }
                  className={`min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3 text-sm text-primary placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${ANATOMY_FOCUS_RING}`}
                  placeholder="FMA concept or textbook citation"
                />
                <span className="mt-3 hidden text-xs tabular-nums text-muted sm:inline">
                  {reference.length}/300
                </span>
                <button
                  type="button"
                  onClick={() => removeReference(index)}
                  aria-label={`Remove reference ${index + 1}`}
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-muted transition-colors hover:border-error/40 hover:text-error ${ANATOMY_FOCUS_RING}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          {form.references.length < 6 && (
            <button
              type="button"
              onClick={addReference}
              data-testid="review-add-reference"
              className={`mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add reference
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-primary">
            Related structures
          </legend>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border bg-elevated p-2">
            {system.structures.filter(
              (candidate) => candidate.slug !== structure.slug,
            ).length === 0 ? (
              <p className="text-xs text-muted">
                No other structures in this system.
              </p>
            ) : (
              system.structures
                .filter((candidate) => candidate.slug !== structure.slug)
                .map((candidate) => (
                  <label
                    key={candidate.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-secondary hover:bg-surface focus-within:ring-2 focus-within:ring-accent/40"
                  >
                    <input
                      type="checkbox"
                      checked={form.relatedSlugs.includes(candidate.slug)}
                      onChange={(event) =>
                        toggleRelated(candidate.slug, event.target.checked)
                      }
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <span className="min-w-0">
                      {candidate.name}
                      <span className="ml-1.5 text-xs text-muted">
                        {candidate.slug}
                      </span>
                    </span>
                  </label>
                ))
            )}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="review-note"
            className="mb-1 block text-xs font-medium text-primary"
          >
            Revision note <span className="text-muted">(optional)</span>
          </label>
          <input
            id="review-note"
            type="text"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            data-testid="review-note"
            className={`min-h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-primary placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${ANATOMY_FOCUS_RING}`}
            placeholder="Why did this text change?"
          />
          <p className="mt-1 text-xs text-muted">
            {note.length}/300 · Stored on the revision, not in the teaching text.
          </p>
        </div>

        {!canReview && (
          <p className="text-xs leading-relaxed text-warning">
            To mark this structure reviewed, fill in: {missing.join(", ")}.
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            type="submit"
            disabled={locked || !dirty}
            data-testid="review-save"
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Save
          </button>
          {!structure.isReviewed && (
            <button
              type="button"
              onClick={() => void handleSave(true)}
              disabled={locked || !canReview}
              data-testid="review-save-review"
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-4 text-sm font-medium text-success transition-colors hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Save and mark reviewed
            </button>
          )}
          {(dirty || note.length > 0) && (
            <button
              type="button"
              onClick={resetDraft}
              disabled={locked}
              data-testid="review-discard"
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-elevated px-4 text-sm font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
            >
              <X className="h-4 w-4" aria-hidden />
              Discard changes
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
