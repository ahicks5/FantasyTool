"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { WaiverPlanView } from "@/components/WaiverPlanView";
import { WaiversView } from "@/components/WaiversView";
import { ErrorBox, H2, SkeletonList } from "@/components/ui";
import { getWaiverPlan, getWaivers, PaywallError } from "@/lib/api";
import type { Connection } from "@/lib/storage";
import type { WaiverPlanResponse, Waivers } from "@/lib/types";

function WaiversBody({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  const [plan, setPlan] = useState<WaiverPlanResponse | null>(null);
  const [board, setBoard] = useState<Waivers | null>(null);
  const [paywall, setPaywall] = useState<PaywallError | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [showBoard, setShowBoard] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getWaiverPlan(c.platform, c.league_id, c.team_id)
      .then((p) => alive && setPlan(p))
      .catch((e: unknown) => alive && (e instanceof PaywallError ? setPaywall(e) : setError(e)));
    getWaivers(c.platform, c.league_id, c.team_id)
      .then((b) => alive && setBoard(b))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, tick]);

  const load = () => {
    setError(null);
    setPlan(null);
    setTick((t) => t + 1);
  };

  if (paywall) return <Locked signedIn={signedIn} sku="waivers" what="Waiver Wire Pass" teaser={paywall.teaser} onUnlocked={refresh} />;
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!plan) return <SkeletonList rows={4} tall />;

  return (
    <div className="grid gap-6">
      <WaiverPlanView plan={plan} />
      {board && board.picks.length > 0 && (
        <section>
          <button onClick={() => setShowBoard((s) => !s)} aria-expanded={showBoard} className="min-h-0 w-full text-left">
            <H2 className="flex items-center justify-between gap-3">
              <span>Full waiver board</span>
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
    <AppShell title="Waivers">
      {(s) =>
        s.has("waivers") ? (
          <WaiversBody c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
        ) : (
          <Locked signedIn={s.signedIn} sku="waivers"
            what="Waiver Wire Pass"
            teaser="Edge prices every add against the player you would drop, tells you what to bid, and lines up a fallback claim for when you lose the first one."
            onUnlocked={s.refresh}
          />
        )
      }
    </AppShell>
  );
}
