"use client";
/**
 * Any wait that is not the ride: the mark in the middle, a ring turning around it, and a
 * line under it that changes while the staff work (Andrew: "seem productive"). The lines
 * name things the engine really does; none of them promises a number. Under reduced motion
 * the ring holds and the first line stays.
 */
import { useEffect, useState } from "react";
import { LOADING } from "@/lib/vocab";
import { IconMark } from "./icons";

export function Loading({ compact = false }: { compact?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((k) => (k + 1) % LOADING.lines.length), LOADING.stepMs);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={`loading ${compact ? "loading-compact" : ""}`} role="status" aria-busy="true" aria-label={LOADING.aria}>
      <span className="loading-ring" aria-hidden>
        <IconMark size={compact ? 22 : 30} className="loading-mark" />
      </span>
      {/* Keyed on the line so each one arrives with the app's own `tick`. */}
      <span key={i} className="loading-line tick" aria-hidden>
        {LOADING.lines[i]}
      </span>
      <span className="sr-only">{LOADING.lines[i]}</span>
    </div>
  );
}
