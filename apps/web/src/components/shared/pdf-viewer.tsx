"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  materialId: string;
  title?: string;
  height?: string;
}

export function PdfViewer({ materialId, title = "PDF Viewer", height = "100%" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages]     = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]           = useState(1.2);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef        = useRef<any>(null);
  const renderingRef  = useRef(false);

  const renderPage = useCallback(async (pageNum: number, sc: number) => {
    if (!pdfRef.current || renderingRef.current) return;
    renderingRef.current = true;
    try {
      const page     = await pdfRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: sc });
      const canvas   = containerRef.current?.querySelector("canvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } finally {
      renderingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Step 1 — fetch bytes via our Next.js proxy route which forwards
        // cookies to the API server. Direct axios to localhost:4000 fails
        // with CORS/Network Error because browser blocks cross-origin requests.
        const response = await fetch(
          `/api/proxy/materials/${materialId}/file`,
          { credentials: "include" }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (cancelled) return;

        // Step 2 — load PDF.js dynamically
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        // Step 3 — pass the bytes directly, no URL needed
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (cancelled) return;

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);

        await renderPage(1, scale);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF load error:", err);
          setError("Could not load the PDF. Please try again.");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId]);

  useEffect(() => {
    if (!loading && pdfRef.current) renderPage(currentPage, scale);
  }, [currentPage, scale, loading, renderPage]);

  function prevPage() { if (currentPage > 1) setCurrentPage((p) => p - 1); }
  function nextPage() { if (currentPage < numPages) setCurrentPage((p) => p + 1); }
  function zoomIn()   { setScale((s) => Math.min(s + 0.25, 3)); }
  function zoomOut()  { setScale((s) => Math.max(s - 0.25, 0.5)); }

  return (
    <div
      className="flex flex-col w-full select-none"
      style={{ height }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}
      >
        <p className="text-xs font-semibold text-primary truncate max-w-[40%]">{title}</p>
        <div className="flex items-center gap-2">
          <button onClick={zoomOut} disabled={scale <= 0.5}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} disabled={scale >= 3}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="w-px h-4 mx-1" style={{ background: "var(--border-default)" }} />
          <button onClick={prevPage} disabled={currentPage <= 1}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30" title="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted">{currentPage} / {numPages || "—"}</span>
          <button onClick={nextPage} disabled={currentPage >= numPages}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30" title="Next page">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-start justify-center"
        style={{ background: "var(--bg-base)", padding: "16px" }}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#2DD4BF" }} />
            <p className="text-xs text-muted">Loading PDF…</p>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center py-16">
            <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>
          </div>
        )}
        {!error && (
          <canvas
            style={{
              display: loading ? "none" : "block",
              boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
              borderRadius: "4px",
              maxWidth: "100%",
            }}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
        )}
      </div>
    </div>
  );
}
