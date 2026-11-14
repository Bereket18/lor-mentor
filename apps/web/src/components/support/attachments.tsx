"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  SUPPORT_ATTACHMENTS_PER_MESSAGE,
  validateAttachmentFiles,
} from "@/lib/support";
import type { SupportAttachmentMeta } from "@/lib/support-types";

/* ── Authenticated thumbnails ────────────────────────────────────── */

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useObjectUrl(blob: Blob | undefined): string | null {
  // createObjectURL is an external resource, so it is created from the blob
  // value and revoked when that value (or the component) goes away. No state
  // is involved, which keeps the effect to a pure cleanup subscription.
  const url = useMemo(
    () => (blob ? URL.createObjectURL(blob) : null),
    [blob],
  );
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function useAttachmentUrl(id: string) {
  const query = useQuery({
    queryKey: ["support", "attachment", id],
    queryFn: async () => {
      const response = await api.get<Blob>(`/support/attachments/${id}`, {
        responseType: "blob",
      });
      return response.data;
    },
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  return {
    url: useObjectUrl(query.data),
    refetch: query.refetch,
    isError: query.isError,
  };
}

function AttachmentTile({
  attachment,
  index,
}: {
  attachment: SupportAttachmentMeta;
  index: number;
}) {
  // The endpoint needs the signed cookie, so a plain <img src> cannot be used.
  // Fetch the bytes with the axios client (which refreshes auth) and preview
  // the resulting object URL.
  const { url, refetch, isError } = useAttachmentUrl(attachment.id);
  const label = `Open attachment ${index + 1} (${attachment.mimeType}, ${bytesLabel(
    attachment.sizeBytes,
  )})`;

  if (isError) {
    return (
      <button
        type="button"
        onClick={() => void refetch()}
        className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium"
        style={{
          borderColor: "var(--glass-border)",
          color: "var(--text-secondary)",
        }}
      >
        <RotateCcw className="h-4 w-4" />
        Retry attachment {index + 1}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!url}
      onClick={() => {
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
      className="group relative block overflow-hidden rounded-lg border transition-opacity hover:opacity-90 disabled:cursor-progress"
      style={{ borderColor: "var(--glass-border)" }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL, not a static asset
        <img
          src={url}
          alt={`Attachment ${index + 1}`}
          className="max-h-44 w-auto max-w-full object-contain"
        />
      ) : (
        <span className="flex h-24 w-32 items-center justify-center">
          <Loader2
            className="h-5 w-5 animate-spin"
            style={{ color: "var(--text-secondary)" }}
            aria-hidden="true"
          />
          <span className="sr-only">Loading attachment {index + 1}</span>
        </span>
      )}
    </button>
  );
}

export function AttachmentGallery({
  attachments,
}: {
  attachments: SupportAttachmentMeta[];
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <AttachmentTile
          key={attachment.id}
          attachment={attachment}
          index={index}
        />
      ))}
    </div>
  );
}

/* ── Local (not yet uploaded) previews ───────────────────────────── */

function LocalPreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const url = useObjectUrl(file);

  return (
    <li className="relative">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL before upload
        <img
          src={url}
          alt={`Preview of ${file.name}`}
          className="h-24 w-32 rounded-lg border object-cover"
          style={{ borderColor: "var(--glass-border)" }}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        title={`Remove ${file.name}`}
        className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center"
      >
        {/* 44 px hit area; the visible disc stays small enough not to cover
            the preview. */}
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow-lg"
          style={{ background: "var(--state-error)" }}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
      <p
        className="mt-1 max-w-32 truncate text-[11px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {bytesLabel(file.size)}
      </p>
    </li>
  );
}

export interface AttachmentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /** Prefix for the input id; a random id is used when omitted. */
  idPrefix?: string;
}

/**
 * Image picker for a new message.
 *
 * Checks type, size and count on the client so the student sees the problem
 * immediately, then leaves the authoritative checks (real magic bytes, re-
 * encode, pixel cap) to the API. Removing a file before sending is always
 * possible; removing one already sent is not.
 */
export function AttachmentPicker({
  files,
  onChange,
  disabled = false,
  idPrefix,
}: AttachmentPickerProps) {
  const generatedId = useId();
  const inputId = `${idPrefix ?? "attachments"}-${generatedId}`;
  const [errors, setErrors] = useState<string[]>([]);
  const canAddMore = files.length < SUPPORT_ATTACHMENTS_PER_MESSAGE;

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const { accepted, errors: problems } = validateAttachmentFiles(
      files,
      Array.from(selected),
    );
    setErrors(problems);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          aria-disabled={disabled || !canAddMore}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--glass-border)",
            color: canAddMore ? "var(--text-secondary)" : "var(--text-secondary)",
            opacity: disabled || !canAddMore ? 0.55 : 1,
            pointerEvents: disabled || !canAddMore ? "none" : undefined,
          }}
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          Add images
        </label>
        <input
          id={inputId}
          type="file"
          accept={SUPPORT_ATTACHMENT_ACCEPT}
          multiple
          disabled={disabled || !canAddMore}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
          className="sr-only"
        />
        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          JPEG, PNG or WebP · up to 5 MB each ·{" "}
          {SUPPORT_ATTACHMENTS_PER_MESSAGE - files.length} of{" "}
          {SUPPORT_ATTACHMENTS_PER_MESSAGE} slots left
        </span>
      </div>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="mt-2 space-y-1 text-xs"
          style={{ color: "var(--state-error)" }}
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {files.map((file, index) => (
            <LocalPreview
              key={`${file.name}-${file.size}-${index}`}
              file={file}
              onRemove={() => {
                setErrors([]);
                onChange(files.filter((_, i) => i !== index));
              }}
            />
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        Attachments are private: only you and college support staff can open
        them. Do not attach screenshots that show your password or full card
        number.
      </p>
    </div>
  );
}
