"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { getTheme, toggleTheme } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  /** "pill" = the full toggle pill, "icon" = just an icon button */
  variant?: "pill" | "icon";
}

export function ThemeToggle({ className = "", variant = "pill" }: ThemeToggleProps) {
  // Lazy initialisers run on the client only (guarded by typeof window).
  // No useEffect needed — state is read once at mount and then driven
  // exclusively by the toggle handler, matching the actual DOM class.
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return true; // SSR default
    return getTheme() === "dark";
  });

  // On SSR (window === undefined) we can't know the theme, so skip render.
  // suppressHydrationWarning on the parent element handles any brief flash.
  if (typeof window === "undefined") return null;

  function handleToggle() {
    toggleTheme();
    setIsDark((prev) => !prev);
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleToggle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={`
          w-9 h-9 rounded-xl flex items-center justify-center
          transition-all duration-200
          text-white/60 hover:text-white
          hover:bg-white/10
          ${className}
        `}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.span
              key="sun"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Sun className="h-4 w-4" />
            </motion.span>
          ) : (
            <motion.span
              key="moon"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Moon className="h-4 w-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }

  // Pill variant
  return (
    <button
      onClick={handleToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`
        relative flex items-center gap-2 px-3 py-1.5 rounded-full
        border transition-all duration-300 select-none
        ${isDark
          ? "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
          : "bg-[#147878]/10 border-[#147878]/20 text-[#0D5F5F] hover:bg-[#147878]/20"
        }
        ${className}
      `}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="sun"
            initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.2 }}
            className="flex items-center"
          >
            <Sun className="h-3.5 w-3.5" />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={{ rotate: 90, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.2 }}
            className="flex items-center"
          >
            <Moon className="h-3.5 w-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
      <span className="text-[11px] font-medium">
        {isDark ? "Light" : "Dark"}
      </span>
    </button>
  );
}
