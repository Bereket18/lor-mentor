"use client";

import { useEffect, useRef, useState } from "react";

// Detects when an element scrolls into view and triggers a fade-up animation
// Usage:
//   const { ref, isVisible } = useScrollReveal()
//   <div ref={ref} className={cn('reveal', isVisible && 'visible')}>
export function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // IntersectionObserver watches when an element enters the viewport
    // Much more performant than listening to scroll events directly
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Stop observing once revealed — animation only plays once
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}
