"use client";
/**
 * Scouting: look anyone up, then the waiver plan over the ranked free-agent board.
 *
 * The search box is deliberately outside the lock and the wire plan is deliberately
 * inside it. A profile says what already happened; the wire says what to do about it,
 * and what to do is the product. So a visitor who has not bought Wire Pass still gets a
 * working room — every player in the NFL, scored by his own league — while the board,
 * the bids and the cuts stay behind `Locked`. Nothing on this page decides that:
 * `edge/products.py` does, and the API still answers 402 for the plan itself.
 *
 * Which is why `WaiversBody` no longer returns `Locked` from the top. The lock is now a
 * sibling of the search rather than a replacement for the whole tab, in both the
 * entitlement branch and the paywall branch below.
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { PlayerSearch } from "@/components/PlayerSearch";
import { WaiverPlanView } from "@/components/WaiverPlanView";
import { WaiversView } from "@/components/WaiversView";
import { ErrorBox, H2, Opening, useHeldWait } from "@/components/ui";
import { getWaiverPlan, getWaivers, PaywallError } from "@/lib/api";
import { once, useCached } from "@/lib/cache";
import type { Connection } from "@/lib/storage";
import type { WaiverPlanResponse, Waivers } from "@/lib/types";

const TEASER =
  "We price every add against the player you would drop, tell you what to bid, and line up a fallback claim for when you lose the first one.";

/** The paid half: the plan, and the board under it. Never the search. */
function WaiverPlan({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  const [board, setBoard] = useState<Waivers | null>(null);
  const [showBoard, setShowBoard] = useState(false);

  // Cached for the session: coming back to the wire paints on the first frame
  // rather than flashing a loading state for one render.
  const { data: plan, error, cause, reload } = useCached<WaiverPlanResponse>(
    `waiverPlan:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getWaiverPlan(c.platform, c.league_id, c.team_id),
  );

  useEffect(() => {
    let alive = true;
    once(`waivers:${c.platform}:${c.league_id}:${c.team_id}`, () => getWaivers(c.platform, c.league_id, c.team_id))
      .then((b) => alive && setBoard(b))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id]);

  const waiting = useHeldWait(!!plan);

  // The API is the authority on entitlement, so a 402 here still locks the plan even
  // when the session thought otherwise. It replaces the plan, not the page.
  if (cause instanceof PaywallError)
    return <Locked signedIn={signedIn} sku="waivers" what="Wire Pass" teaser={cause.teaser} onUnlocked={refresh} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !plan) return <Opening />;

  return (
    <div className="grid gap-6">
      <WaiverPlanView plan={plan} />
      {board && board.picks.length > 0 && (
        <section>
          <button onClick={() => setShowBoard((s) => !s)} aria-expanded={showBoard} className="min-h-0 w-full text-left">
            <H2 className="flex items-center justify-between gap-3">
              <span>Every free agent</span>
              <span className="text-[13px] font-bold text-lean">{showBoard ? "Hide" : `Show all ${board.picks.length}`}</span>
            </H2>
          </button>
          {showBoard && (
            <div className="mt-2">
              <WaiversView waivers={board} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function WaiversPage() {
  return (
    <AppShell section="waivers" needsMe>
      {(s) => (
        <div className="grid min-w-0 gap-7">
          <PlayerSearch c={s.connection!} />
          {s.has("waivers") ? (
            <WaiverPlan c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
          ) : (
            <Locked signedIn={s.signedIn} sku="waivers" what="Wire Pass" teaser={TEASER} onUnlocked={s.refresh} />
          )}
        </div>
      )}
    </AppShell>
  );
}
