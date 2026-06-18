"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle, X } from "lucide-react";
import api from "@/lib/api";

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
  const [loading, setLoading] = useState(type !== "YOUTUBE");
  const [error, setError] = useState("");

  useEffect(() => {
    // YouTube needs no fetch — it's a public embed, no auth required
    if (type === "YOUTUBE") return;

    let objectUrl: string | null = null;

    async function loadFile() {
      try {
        // responseType: 'blob' tells axios to return raw binary data
        // instead of trying to parse it as JSON
        const res = await api.get(`/materials/${materialId}/file`, {
          responseType: "blob",
        });

        // Create a temporary browser-local URL pointing to those bytes
        // This URL only works in THIS browser tab, and only until revoked
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
      } catch (err: any) {
        setError(
          err?.response?.status === 403
            ? "You do not have access to this material"
            : "Failed to load this material",
        );
      } finally {
        setLoading(false);
      }
    }

    loadFile();

    // Cleanup — revoke the blob URL when the component unmounts
    // to free up browser memory
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
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5
          border-b border-default flex-shrink-0"
        >
          <p className="text-sm font-medium text-primary truncate">{title}</p>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-base flex items-center justify-center">
          {type === "YOUTUBE" && youtubeEmbed && (
            <iframe
              src={youtubeEmbed}
              className="w-full aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}

          {type === "YOUTUBE" && !youtubeEmbed && (
            <p className="text-sm text-error p-8">Invalid YouTube link</p>
          )}

          {loading && type !== "YOUTUBE" && (
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

          {!loading && !error && type === "PDF" && blobUrl && (
            <iframe src={blobUrl} className="w-full h-[80vh]" />
          )}

          {!loading && !error && type === "IMAGE" && blobUrl && (
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
