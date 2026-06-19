import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Resolves the active theme by reading the DOM attribute first,
 * then falling back to localStorage.
 * The DOM attribute is set by the inline script in layout.tsx and by
 * toggleTheme(), so it's always the most up-to-date source of truth.
 */
export function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark"

  // Primary source of truth: the data-theme attribute on <html>
  const attr = document.documentElement.getAttribute("data-theme")
  if (attr === "light" || attr === "dark") return attr

  // Fallback: localStorage with the "lm-theme" key used by the inline script
  const saved = localStorage.getItem("lm-theme")
  if (saved === "light" || saved === "dark") return saved

  // System preference fallback
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

/**
 * Toggles the theme by updating the data-theme attribute on <html>
 * and persisting the choice in localStorage under "lm-theme".
 */
export function toggleTheme(): void {
  if (typeof window === "undefined") return

  const current = getTheme()
  const next = current === "dark" ? "light" : "dark"

  document.documentElement.setAttribute("data-theme", next)
  localStorage.setItem("lm-theme", next)
}
