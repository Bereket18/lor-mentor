"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Makes every framer-motion animation follow the user's OS "reduce motion"
 * setting. CSS transitions are handled by the media query in globals.css; this
 * covers the JS-driven layout/transform animations in the sidebar and mobile
 * drawer, which CSS cannot reach.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
