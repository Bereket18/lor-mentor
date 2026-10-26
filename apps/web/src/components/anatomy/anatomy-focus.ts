/**
 * Shared focus treatment for the anatomy lab. The global stylesheet draws an
 * outline, but several controls opt out of it; a ring keeps keyboard focus
 * visible on those controls without inventing new colours.
 */
export const ANATOMY_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base";
