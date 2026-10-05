"use client";
/** The age line under the title band: how old the numbers on screen are, and a Refresh. */
import { useEffect, useState } from "react";
import { refreshReads } from "@/lib/cache";
import { useFreshness } from "@/lib/saved";
import { FRESH } from "@/lib/vocab";
import { Spinner } from "./ui";

/**
 * One line, one fixed height, on every tab that has a league, so it never moves the page
 * when it fills in. Empty until a read lands. "Updated 12 min ago" is the oldest answer on
 * screen, as the API built it (`X-Edge-As-Of`), not when the browser received it, so a
 * league the API served while rebuilding says its true age.
 */
export function Freshness() {
  const f = useFreshness();
  // Re-render twice a minute so "just now" turns into "1 min ago" on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // A stamp from this render's clock: a read that landed after the last tick is "just now".
  const ago = f.at === null ? "" : FRESH.ago(Math.max(now, f.at) - f.at);

  return (
    <div className="-mt-2 mb-3 flex h-5 items-center justify-end gap-2 text-[11px] font-semibold text-muted" aria-live="polite">
      {f.at === null ? null : f.refreshing ? (
        <span className="flex items-center gap-1.5">
          <Spinner size={11} label={null} />
          {FRESH.refreshing}
        </span>
      ) : (
        <>
          <span className={`tnum ${f.failed ? "text-ink-2" : ""}`}>{f.failed ? FRESH.failed(ago) : FRESH.updated(ago)}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => {
              setNow(Date.now());
              refreshReads();
            }}
            aria-label={FRESH.aria}
            className="-my-3 -mr-2 px-2 py-3 font-bold text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink"
          >
            {FRESH.refresh}
          </button>
        </>
      )}
    </div>
  );
}
