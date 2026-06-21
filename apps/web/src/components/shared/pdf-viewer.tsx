"use client";

interface Props {
  /**
   * Material ID — the viewer builds a relative URL via the Next.js proxy
   * so the iframe stays same-origin and Edge/Chrome won't block it.
   */
  materialId: string;
  title?: string;
  /** Optional height — defaults to 100% of the parent container */
  height?: string;
}

/**
 * PdfViewer — renders a PDF inside an iframe using a same-origin proxied
 * URL (/api/v1/materials/:id/file) so browsers don't block cross-origin
 * requests from localhost:3000 → localhost:4000.
 *
 * Toolbar is hidden via PDF URL fragment params (#toolbar=0).
 * Right-click is suppressed on the wrapper to deter casual saving.
 */
export function PdfViewer({ materialId, title = "PDF Viewer", height = "100%" }: Props) {
  // Use a relative path — Next.js rewrites /api/v1/* → API server
  // This keeps the iframe same-origin with the web app (localhost:3000)
  const src = `/api/v1/materials/${materialId}/file#toolbar=0&navpanes=0&scrollbar=0`;

  return (
    <div
      className="w-full select-none rounded-xl overflow-hidden"
      style={{ height }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <iframe
        src={src}
        className="w-full h-full border-0"
        title={title}
      />
    </div>
  );
}
