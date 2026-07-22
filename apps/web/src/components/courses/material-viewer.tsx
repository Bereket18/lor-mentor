"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2, AlertCircle, X } from "lucide-react";
import api from "@/lib/api";

// pdfjs-dist is large; only load it when a PDF is actually opened.
const PdfViewer = dynamic(
  () => import("@/components/shared/pdf-viewer").then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    ),
  },
);

interface MaterialViewerProps {
  materialId: string;
  type: "PDF" | "IMAGE" | "YOUTUBE";
  youtubeUrl?: string | null;
  title: string;
  onClose: () => void;
}

// Extracts the video ID from any common YouTube URL format
function getYoutubeEmbedUrl(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

export function MaterialViewer({
  materialId,
  type,
  youtubeUrl,
  title,
  onClose,
}: MaterialViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(type === "IMAGE");
  const [error, setError] = useState("");

  useEffect(() => {
    // Only fetch blob for IMAGE — PDF uses canvas renderer, YouTube is embed
    if (type !== "IMAGE") return;

    let objectUrl: string | null = null;

    async function loadFile() {
      try {
        const res = await api.get(`/materials/${materialId}/file`, {
          responseType: "blob",
        });
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        setError(
          status === 403
            ? "You do not have access to this material"
            : "Failed to load this material",
        );
      } finally {
        setLoading(false);
      }
    }

    loadFile();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [materialId, type]);

  const youtubeEmbed = youtubeUrl ? getYoutubeEmbedUrl(youtubeUrl) : null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50
      flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        className="bg-surface border border-default rounded-2xl
        w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden
        animate-scale-in"
      >
        {/* Header — PDF viewer has its own header, hide this one for PDF */}
        {type !== "PDF" && (
          <div
            className="flex items-center justify-between px-5 py-3.5
            border-b border-default flex-shrink-0"
          >
            <p className="text-sm font-medium text-primary truncate">{title}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close material viewer"
              className="text-muted hover:text-primary transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-base flex items-center justify-center">
          {/* -- PDF — canvas renderer, no browser toolbar -- */}
          {type === "PDF" && (
            <div
              className="w-full h-full flex flex-col"
              style={{ height: "80vh" }}
            >
              {/* Custom header with close button */}
              <div
                className="flex items-center justify-between px-5 py-3 flex-shrink-0"
                style={{
                  background: "var(--bg-surface)",
                  borderBottom: "1px solid var(--border-default)",
                }}
              >
                <p className="text-sm font-medium text-primary truncate max-w-[70%]">
                  {title}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close material viewer"
                  className="text-muted hover:text-primary transition-colors p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <PdfViewer
                  materialId={materialId}
                  title={title}
                  height="100%"
                />
              </div>
            </div>
          )}

          {/* -- YouTube embed -- */}
          {type === "YOUTUBE" && youtubeEmbed && (
            <iframe
              src={youtubeEmbed}
              title="Medical Course Material PDF Viewer"
              className="w-full aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}

          {type === "YOUTUBE" && !youtubeEmbed && (
            <p className="text-sm text-error p-8">Invalid YouTube link</p>
          )}

          {/* -- Image -- */}
          {loading && type === "IMAGE" && (
            <div className="flex flex-col items-center gap-2 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
              <p className="text-xs text-muted">Loading material...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 py-16 text-center px-8">
              <AlertCircle className="h-5 w-5 text-error" />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {!loading && !error && type === "IMAGE" && blobUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={blobUrl}
              alt={title}
              className="max-w-full max-h-[80vh] object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
