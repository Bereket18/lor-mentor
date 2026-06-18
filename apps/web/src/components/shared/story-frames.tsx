"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Sparkles, Layers } from "lucide-react";

interface Frame {
  icon: React.ElementType;
  title: string;
  description: string;
}

// Three product stories that rotate automatically
// Each previews a real (or upcoming) Lor Mentor feature
const frames: Frame[] = [
  {
    icon: Bot,
    title: "Your AI tutor knows your syllabus",
    description:
      "Ask anything about your current courses — answers grounded in your actual materials, not generic textbook fluff.",
  },
  {
    icon: Layers,
    title: "Explore anatomy in 3D",
    description:
      "Rotate, zoom, and click through interactive 3D models of the human body. Coming to every Anatomy course.",
  },
  {
    icon: Sparkles,
    title: "Every PDF becomes a quiz",
    description:
      "Upload once. Lor Mentor generates flashcards, summaries, and exam-style questions automatically.",
  },
];

const AUTO_ROTATE_MS = 4500;

export function StoryFrames() {
  const [active, setActive] = useState(0);

  // Auto-rotate every 4.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % frames.length);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  const frame = frames[active];
  const Icon = frame.icon;

  return (
    <div className="relative">
      {/* ── Visual mockup area ─────────────────────────────── */}
      <div
        className="relative h-56 mb-8 rounded-2xl overflow-hidden
        bg-surface border border-default"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {active === 0 && <AiChatMockup />}
            {active === 1 && <AnatomyMockup />}
            {active === 2 && <FlashcardMockup />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Text content ───────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Icon className="h-4 w-4 text-accent" />
            <h3 className="font-display text-lg font-semibold text-primary">
              {frame.title}
            </h3>
          </div>
          <p className="text-secondary text-sm leading-relaxed max-w-sm">
            {frame.description}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* ── Manual controls — clickable dots ──────────────────── */}
      <div className="flex items-center gap-2 mt-6">
        {frames.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Show story ${i + 1}`}
            className="group py-2"
          >
            <span
              className={`
              block h-1 rounded-full transition-all duration-300
              ${
                i === active
                  ? "w-8 bg-accent"
                  : "w-4 bg-border group-hover:bg-muted"
              }
            `}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Mockup visuals — abstract, not real screenshots ────────────

function AiChatMockup() {
  return (
    <div className="w-full px-6 space-y-2">
      <div
        className="bg-elevated border border-default rounded-xl
        rounded-bl-sm px-3 py-2 max-w-[80%] text-xs text-secondary"
      >
        Explain the brachial plexus simply
      </div>
      <div
        className="bg-ai-dim border border-ai/20 rounded-xl
        rounded-br-sm px-3 py-2 max-w-[85%] ml-auto text-xs text-primary
        flex items-start gap-2"
      >
        <Sparkles className="h-3 w-3 text-ai mt-0.5 flex-shrink-0" />
        <span>
          Think of it as your arm&apos;s wiring system — five roots, three
          trunks...
        </span>
      </div>
    </div>
  );
}

function AnatomyMockup() {
  return (
    <div className="relative w-32 h-32">
      <div
        className="absolute inset-0 rounded-full bg-teal/20
        animate-pulse-glow blur-xl"
      />
      <div
        className="absolute inset-4 rounded-full border-2
        border-teal/40 animate-float"
      />
      <div
        className="absolute inset-8 rounded-full bg-gradient-to-br
        from-teal/30 to-accent/20 border border-teal/30"
      />
    </div>
  );
}

function FlashcardMockup() {
  return (
    <div className="flex gap-3">
      <div
        className="w-28 h-20 bg-elevated border border-default
        rounded-xl flex items-center justify-center p-3 -rotate-3"
      >
        <span className="text-xs text-secondary text-center">
          What supplies the deltoid?
        </span>
      </div>
      <div
        className="w-28 h-20 bg-accent rounded-xl flex items-center
        justify-center p-3 rotate-3 shadow-glow-sm"
      >
        <span className="text-xs text-white text-center">Axillary nerve</span>
      </div>
    </div>
  );
}
