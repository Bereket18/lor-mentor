"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

/**
 * App-wide toast host (sonner), theme-matched via next-themes. Replaces the
 * native toast.error() dialogs with non-blocking, on-brand notifications.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      theme={resolvedTheme === "light" ? "light" : "dark"}
    />
  );
}
