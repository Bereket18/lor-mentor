"use client";

import { useEffect, useRef } from "react";

interface ParallaxBackgroundProps {
  children: React.ReactNode;
  speed?: number; // how much it moves — 0.1 subtle, 0.5 strong
  className?: string;
}

// Moves the background slower than scroll speed — creates depth
// Usage: wrap your hero section content with this
export function ParallaxBackground({
  children,
  speed = 0.15,
  className = "",
}: ParallaxBackgroundProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleScroll() {
      if (!layerRef.current) return;
      const scrolled = window.scrollY;
      // Move the layer at a fraction of scroll speed
      layerRef.current.style.transform = `translateY(${scrolled * speed}px)`;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [speed]);

  return (
    <div className={`parallax-container ${className}`}>
      <div ref={layerRef} className="parallax-layer">
        {children}
      </div>
    </div>
  );
}
