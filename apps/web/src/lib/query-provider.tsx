"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * App-wide React Query provider.
 *
 * Created once with useState so the QueryClient is stable across re-renders.
 * Sensible defaults for an auth-cookie SPA:
 *  - staleTime 60s: data stays fresh between route changes (no refetch storms)
 *  - retry false: a 401 should not be retried; our axios interceptor handles refresh
 *  - no refetch on window focus: avoids surprise network bursts
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
