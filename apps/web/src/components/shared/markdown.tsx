"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders markdown (AI tutor answers, AI summaries) with on-brand styling.
 * Previously these were dumped as raw text with `whitespace-pre-wrap`, so
 * bullets, bold and headings showed up as literal `*`/`#` characters.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-primary leading-relaxed space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (p) => <p className="leading-relaxed" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 space-y-1" {...p} />,
          li: (p) => <li className="leading-relaxed" {...p} />,
          strong: (p) => (
            <strong className="font-semibold text-primary" {...p} />
          ),
          em: (p) => <em className="italic" {...p} />,
          h1: (p) => (
            <h1 className="text-base font-semibold text-primary mt-3" {...p} />
          ),
          h2: (p) => (
            <h2 className="text-sm font-semibold text-primary mt-3" {...p} />
          ),
          h3: (p) => (
            <h3 className="text-sm font-semibold text-primary mt-2" {...p} />
          ),
          code: (p) => (
            <code
              className="px-1 py-0.5 rounded bg-elevated text-[0.85em] font-mono"
              {...p}
            />
          ),
          a: (p) => (
            <a
              className="text-accent underline"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote
              className="border-l-2 border-default pl-3 text-secondary"
              {...p}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
