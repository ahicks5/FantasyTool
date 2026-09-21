"use client";
/**
 * Scouting: this week's claims first, then every player in the league.
 *
 * **The plan leads.** It is the thing a manager opens this tab to act on, and the board
 * under it is four thousand pixels of browsable rows — so when the board was on top the
 * claims sat below all of them and were, in practice, unreachable. Order is the whole fix;
 * the board loses nothing by being second, because you arrive at it by scrolling, which is
 * what you were going to do to it anyway.
 *
 * **The lock does not lead.** When the API answers 402 there is no plan to put first, and
 * the offer goes *under* the board instead of over it. A visitor who has not bought Wire
 * Pass still opens this tab onto something real — every player in the league, scored by
 * his own settings — rather than onto a price. That is the growth loop and it is older
 * than this layout; only the paid reader's order changed here.
 *
 * Which half is which is not decided on this page: `edge/products.py` is the only source
 * of truth, and the API still answers 402 for the plan itself.
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { PlayerBoard } from "@/components/PlayerBoard";
import { WaiverPlanView } from "@/components/WaiverPlanView";
import { WaiversView } from "@/components/WaiversView";
import { ErrorBox, H2, Opening, useHeldWait } from "@/components/ui";
import { getWaiverPlan, getWaivers, PaywallError } from "@/lib/api";
import { once, useCached } from "@/lib/cache";
import { paywallTeaser } from "@/lib/teaser";
import type { Connection } from "@/lib/storage";
import type { WaiverPlanResponse, Waivers } from "@/lib/types";

/** The fallback, for a 402 that arrived without one. Never the first choice: see below. */
const TEASER =
  "We price every add against the player you would drop, tell you what to bid, and line up a fallback claim for when you lose the first one.";

/**
 * The paid half: the plan, and the ranked wire under it. Never the player board.
 *
 * It takes the plan rather than fetching it, because the page above needs to know whether
 * this reader is locked *before* it decides what goes where — the lock belongs under the
 * board and the plan belongs over it, and one component cannot render into two slots.
 */
function WaiverPlan({ c, plan }: { c: Connection; plan: WaiverPlanResponse }) {
  const [board, setBoard] = useState<Waivers | null>(null);
  const [showBoard, setShowBoard] = useState(false);

  // Held back until the plan lands. The board is the same paid feature, so firing it for
  // a locked reader buys a second 402 and nothing else.
  useEffect(() => {
    if (!plan) return;
    let alive = true;
    once(`waivers:${c.platform}:${c.league_id}:${c.team_id}`, () => getWaivers(c.platform, c.league_id, c.team_id))
      .then((b) => alive && setBoard(b))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, plan]);

  return (
    <div className="grid gap-5">
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

/**
 * The room, in the order a manager reads it: the claims, then everyone else.
 *
 * The read happens here rather than inside `WaiverPlan` because the answer decides the
 * *layout*, not just one section's contents — a plan goes above the board, a 402 goes
 * below it. One branch, not two: asking the session whether this reader has Wire Pass and
 * rendering the constant when it says no looked like a saved request, and what it actually
 * did was throw away the only sentence on this page that is about *this* roster. The
 * engine computes a concrete, name-free teaser for the 402, and the locked reader — the
 * only one it was ever written for — never saw it. So the read always happens.
 */
function Rooms({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  // Cached for the session: coming back to the wire paints on the first frame rather than
  // flashing a loading state for one render.
  const { data: plan, error, cause, reload } = useCached<WaiverPlanResponse>(
    `waiverPlan:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getWaiverPlan(c.platform, c.league_id, c.team_id),
  );
  // The API is the authority on entitlement, so a 402 here still locks the plan even when
  // the session thought otherwise.
  const locked = cause instanceof PaywallError;
  const waiting = useHeldWait(!!plan || locked || !!error);

  return (
    <div className="grid min-w-0 gap-7">
      {/* The top slot holds the plan, or the wait for it. It stays empty for a locked
          reader — his offer is at the bottom — so the board rises to meet him instead of
          sitting under a hole where a price used to be. */}
      {!locked &&
        (error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : waiting || !plan ? (
          <Opening />
        ) : (
          <WaiverPlan c={c} plan={plan} />
        ))}

      <PlayerBoard c={c} />

      {locked && (
        <Locked signedIn={signedIn} sku="waivers" what="Wire Pass" teaser={paywallTeaser(cause, TEASER)} onUnlocked={refresh} />
      )}
    </div>
  );
}

export default function WaiversPage() {
  return (
    <AppShell section="waivers" needsMe>
      {(s) => <Rooms c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />}
    </AppShell>
  );
}
