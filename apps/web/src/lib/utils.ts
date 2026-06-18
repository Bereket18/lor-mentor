// import { clsx, type ClassValue } from "clsx"
// import { twMerge } from "tailwind-merge"

// export function cn(...inputs: ClassValue[]) {
//   return twMerge(clsx(inputs))
// }

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Resolves the active theme state safely for both SSR and Client environments
 * Uses 'lm-theme' as the localStorage key — matches the layout script
 */
export function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark"

  const savedTheme = localStorage.getItem("lm-theme")
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme
  }

  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  return systemPrefersDark ? "dark" : "light"
}

/**
 * Toggles the DOM data-theme attribute and updates localStorage
 * Uses 'lm-theme' as the localStorage key — matches the layout script
 */
export function toggleTheme(): void {
  if (typeof window === "undefined") return

  const currentTheme = getTheme()
  const newTheme = currentTheme === "dark" ? "light" : "dark"

  // Update the data-theme attribute — Tailwind reads this for dark mode
  document.documentElement.setAttribute("data-theme", newTheme)

  // Persist preference across page reloads
  localStorage.setItem("lm-theme", newTheme)
}