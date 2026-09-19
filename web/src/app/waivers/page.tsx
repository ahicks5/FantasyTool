"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { WaiverPlanView } from "@/components/WaiverPlanView";
import { WaiversView } from "@/components/WaiversView";
import { BoothOpening, useHeldWait, ErrorBox, H2 } from "@/components/ui";
import { getWaiverPlan, getWaivers, PaywallError } from "@/lib/api";
import { once, useCached } from "@/lib/cache";
import type { Connection } from "@/lib/storage";
import type { WaiverPlanResponse, Waivers } from "@/lib/types";

function WaiversBody({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
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

  if (cause instanceof PaywallError)
    return <Locked signedIn={signedIn} sku="waivers" what="Wire Pass" teaser={cause.teaser} onUnlocked={refresh} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !plan) return <BoothOpening />;

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
      {(s) =>
        s.has("waivers") ? (
          <WaiversBody c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
        ) : (
          <Locked signedIn={s.signedIn} sku="waivers"
            what="Wire Pass"
            teaser="The booth prices every add against the player you would drop, tells you what to bid, and lines up a fallback claim for when you lose the first one."
            onUnlocked={s.refresh}
          />
        )
      }
    </AppShell>
  );
}
