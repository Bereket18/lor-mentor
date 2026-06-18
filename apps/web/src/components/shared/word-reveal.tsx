"use client";

interface WordRevealProps {
  text: string;
  className?: string;
  delay?: number;   // delay before first word starts (ms)
  stagger?: number; // gap between each word (ms)
}

// Splits text into words and animates each one upward + fade in
// Usage: <WordReveal text="Study Smarter. Learn Medicine Deeper." />
export function WordReveal({
  text,
  className = "",
  delay = 0,
  stagger = 80,
}: WordRevealProps) {
  const words = text.split(" ");

  return (
    <span className={`word-reveal ${className}`}>
      {words.map((word, i) => (
        // Outer span clips the inner so the word slides up into view
        <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
          <span
            style={{
              display: "inline-block",
              // Start invisible and below — animation brings it in
              animation: `word-reveal 0.55s cubic-bezier(0.4, 0, 0.2, 1) both`,
              animationDelay: `${delay + i * stagger}ms`,
            }}
          >
            {word}
            {/* Non-breaking space to preserve gaps between words */}
            {i < words.length - 1 ? "\u00A0" : ""}
          </span>
        </span>
      ))}
    </span>
  );
}
