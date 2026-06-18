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
 */
export function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"

  const savedTheme = localStorage.getItem("theme")
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme
  }

  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  return systemPrefersDark ? "dark" : "light"
}

/**
 * Toggles the DOM theme class list and updates localStorage
 */
export function toggleTheme(): void {
  if (typeof window === "undefined") return

  const currentTheme = getTheme()
  const newTheme = currentTheme === "dark" ? "light" : "dark"
  
  const root = window.document.documentElement
  
  // Update the DOM classes for Tailwind's dark: variant modifiers
  if (newTheme === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }

  // Persist preference across page reloads
  localStorage.setItem("theme", newTheme)
}