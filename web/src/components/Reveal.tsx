"use client";
/** The landing page's soft entrance: a section fades and rises into place the first time it scrolls into view. */

import { useEffect, useRef } from "react";

/**
 * The content is in the server HTML and visible without script. Only once this has
 * mounted does the element take the hidden starting pose, and a section already on
 * screen is revealed on the observer's first callback, so nothing waits on a scroll it
 * will never get. Reduced motion skips the whole thing in CSS (`.reveal` in globals.css).
 * Without IntersectionObserver (an old WebView) nothing is hidden at all.
 */
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    el.classList.add("reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("reveal-in");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}
