"use client";

import { useCallback, useEffect, useState } from "react";

/** Normal cadence for ticket lists and threads. */
export const SUPPORT_POLL_INTERVAL_MS = 30_000;

/** Backoff ceiling when the API is unreachable or failing. */
export const SUPPORT_POLL_MAX_BACKOFF_MS = 5 * 60_000;

/**
 * The interval for a given number of consecutive failures: 30 s, then 1, 2
 * and 4 minutes, capped at 5 minutes. Pure so the unit suite can assert it.
 */
export function supportPollInterval(failureCount: number): number {
  const steps = Math.min(Math.max(Math.trunc(failureCount) || 0, 0), 4);
  return Math.min(
    SUPPORT_POLL_INTERVAL_MS * 2 ** steps,
    SUPPORT_POLL_MAX_BACKOFF_MS,
  );
}

/**
 * Visibility-aware polling for support queries.
 *
 * - every 30 s while the tab is visible (lists and threads share one rule),
 * - never while the tab is hidden: a background tab must not keep the API or
 *   the database busy; becoming visible again resumes immediately,
 * - exponential backoff per consecutive failure (see `supportPollInterval`),
 *   so a down API is not hammered by every open tab.
 *
 * Use it as TanStack Query's interval callback so it sees the real failure
 * count, and set `refetchIntervalInBackground: false` as well:
 *
 *   const polling = useSupportPolling();
 *   useQuery({
 *     …,
 *     refetchInterval: (query) =>
 *       polling.intervalFor(query.state.fetchFailureCount),
 *     refetchIntervalInBackground: false,
 *   });
 *
 * `fetchFailureCount` is the consecutive-failure counter TanStack resets on a
 * successful fetch (`state.failureCount` is the retry counter, not a state
 * field).
 */
export function useSupportPolling(enabled = true) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function sync() {
      setVisible(document.visibilityState === "visible");
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const intervalFor = useCallback(
    (failureCount: number): number | false =>
      visible && enabled ? supportPollInterval(failureCount) : false,
    [visible, enabled],
  );

  return { visible, intervalFor };
}
