"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` while the page is being server-rendered and for the hydration render,
 * `true` from the first client-only render onwards.
 *
 * This replaces the old `const [mounted, setMounted] = useState(false);
 * useEffect(() => setMounted(true), [])` idiom. That pattern works, but it sets
 * state synchronously inside an effect body, which schedules a second render
 * pass on every mount and trips the `react-hooks/set-state-in-effect` rule.
 * `useSyncExternalStore` expresses the same thing declaratively: React uses the
 * server snapshot (`false`) for SSR and hydration, then immediately re-renders
 * with the client snapshot (`true`).
 *
 * Use it to gate anything that must not run before React has hydrated — the
 * auth forms gate their submit button on it so a tap on a slow phone cannot
 * fall through to the browser's native form submit, which would put the
 * credentials in the URL as a GET query string.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

// Module scope keeps these identities stable across renders. `useSyncExternalStore`
// tears down and re-subscribes whenever `subscribe` changes, so an inline arrow
// would resubscribe on every render.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
