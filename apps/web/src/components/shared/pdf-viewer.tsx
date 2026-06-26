"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Loader2, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize, Minimize,
} from "lucide-react";

interface Props {
  materialId: string;
  title?: string;
  height?: string;
}

export function PdfViewer({ materialId, title = "PDF Viewer", height = "100%" }: Props) {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);

  const [numPages,    setNumPages]    = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale,       setScale]       = useState(1.4);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef       = useRef<any>(null);
  const renderingRef = useRef(false);

  // ── Render a single page onto the canvas ──────────────────────
  const renderPage = useCallback(async (pageNum: number, sc: number) => {
    if (!pdfRef.current || renderingRef.current) return;
    renderingRef.current = true;

    try {
      const page = await pdfRef.current.getPage(pageNum);

      // Multiply by devicePixelRatio for crisp rendering on HiDPI screens
      const dpr      = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: sc * dpr });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set the canvas backing store size (actual pixels)
      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      // Scale the canvas back down via CSS so it occupies the right
      // logical size — this is what makes it crisp on Retina displays
      canvas.style.width  = `${viewport.width  / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } finally {
      renderingRef.current = false;
    }
  }, []);

  // ── Load the PDF via Next.js proxy (forwards JWT cookie) ──────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/proxy/materials/${materialId}/file`,
          { credentials: "include" },
        );

        if (!response.ok) {
          const status = response.status;
          if (status === 404) throw new Error("404");
          if (status === 401 || status === 403) throw new Error(String(status));
          throw new Error(`HTTP ${status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (cancelled) return;

        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (cancelled) return;

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);

        await renderPage(1, scale);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === "404") {
            setError("This PDF file no longer exists on the server. Please contact your administrator.");
          } else if (msg === "401" || msg === "403") {
            setError("You do not have permission to view this file.");
          } else {
            setError("Could not load the PDF. Please try again.");
          }
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId]);

  // ── Re-render when page or scale changes ──────────────────────
  useEffect(() => {
    if (!loading && pdfRef.current) renderPage(currentPage, scale);
  }, [currentPage, scale, loading, renderPage]);

  // ── Track fullscreen state changes (e.g. user presses Esc) ────
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function prevPage() { if (currentPage > 1) setCurrentPage((p) => p - 1); }
  function nextPage() { if (currentPage < numPages) setCurrentPage((p) => p + 1); }
  function zoomIn()   { setScale((s) => Math.min(s + 0.25, 4)); }
  function zoomOut()  { setScale((s) => Math.max(s - 0.25, 0.5)); }

  function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="flex flex-col w-full select-none bg-base"
      style={{ height: isFullscreen ? "100vh" : height }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Toolbar ─────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <p className="text-xs font-semibold text-primary truncate max-w-[35%]">{title}</p>

        <div className="flex items-center gap-1.5">
          {/* Zoom out */}
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <span className="text-xs text-muted w-12 text-center font-mono">
            {Math.round(scale * 100)}%
          </span>

          {/* Zoom in */}
          <button
            onClick={zoomIn}
            disabled={scale >= 4}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <div className="w-px h-4 mx-1" style={{ background: "var(--border-default)" }} />

          {/* Prev page */}
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="text-xs text-muted font-mono">
            {currentPage} / {numPages || "—"}
          </span>

          {/* Next page */}
          <button
            onClick={nextPage}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-30"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="w-px h-4 mx-1" style={{ background: "var(--border-default)" }} />

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen
              ? <Minimize className="h-4 w-4" />
              : <Maximize className="h-4 w-4" />
            }
          </button>
        </div>
      </div>

      {/* ── Canvas area ─────────────────────────────── */}
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
          <div
            className="rounded-xl px-5 py-4 max-w-sm text-center mt-8"
            style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: "#EF4444" }}>
              Could not open file
            </p>
            <p className="text-xs text-secondary">{error}</p>
          </div>
        )}

        {!error && (
          <canvas
            ref={canvasRef}
            style={{
              display: loading ? "none" : "block",
              boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
              borderRadius: "4px",
              // maxWidth keeps it within the container when zoomed out
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
