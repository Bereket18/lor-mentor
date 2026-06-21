"use client";

interface Props {
  /** Full URL to the PDF file endpoint, e.g. /api/v1/materials/:id/file */
  src: string;
  /** Optional height — defaults to 100% of the parent container */
  height?: string;
}

/**
 * PdfViewer — renders a PDF inside a sandboxed iframe with the browser's
 * built-in toolbar hidden and the right-click context menu suppressed.
 *
 * This is a best-effort deterrent against casual downloading. It does NOT
 * prevent a determined user from using DevTools to find the URL.
 */
export function PdfViewer({ src, height = "100%" }: Props) {
  return (
    <div
      className="w-full select-none rounded-xl overflow-hidden"
      style={{ height }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <iframe
        // #toolbar=0 hides Chrome/Edge toolbar; navpanes=0 hides side panels;
        // scrollbar=0 hides the scrollbar overlay button
        src={`${src}#toolbar=0&navpanes=0&scrollbar=0`}
        className="w-full h-full border-0"
        title="PDF Viewer"
        // sandbox without allow-downloads prevents the download button in
        // Chromium-based browsers that support the sandbox attribute on iframes
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
