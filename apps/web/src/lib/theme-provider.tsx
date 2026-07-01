"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import { AppToaster } from "./app-toaster";

/**
 * App theme provider (next-themes).
 *
 * Replaces the hand-rolled inline <script> + getTheme/toggleTheme approach,
 * which caused (a) a React "script tag while rendering" warning and (b) a
 * hydration mismatch in ThemeToggle. next-themes injects its own no-flash
 * script and exposes a hydration-safe useTheme() hook.
 *
 *  - attribute="data-theme"  → sets <html data-theme="…">, matching globals.css
 *  - storageKey="lm-theme"   → preserves the key the old script used
 *  - defaultTheme="dark", enableSystem=false → app is dark-first
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="lm-theme"
      disableTransitionOnChange
    >
      {children}
      <AppToaster />
    </NextThemeProvider>
  );
}
