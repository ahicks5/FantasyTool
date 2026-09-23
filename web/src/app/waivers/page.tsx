"use client";
/**
 * Scouting, in the order a manager reads it: the three worth adding, then who is out there.
 *
 * **The pickups lead.** Three panels in one row, each a face, a stamp that says how hard to
 * go after him and an arrow into his full read (`/waivers/pickup?id=`); "See more" opens
 * the next seven. It answers the tab's first question — what few are worth picking up, why,
 * and who goes — before the reader has scrolled at all.
 *
 * **Then the research room.** Every player in the league, free, with the scout's lenses on
 * top of the filters: my handcuffs, the next man up, defenses by their next three games,
 * bye cover and risers (`edge/api/lenses.py`). That is the tab's second question: who is
 * out there.
 *
 * **The lock does not lead.** A 402 keeps the row of three with the faces withheld, and the
 * offer goes *under* the board. A visitor who has not bought Wire Pass opens this tab onto
 * something real — every player in the league, scored by his own settings — rather than
 * onto a price. `edge/products.py` decides who is locked; the API answers 402 regardless.
 *
 * **The first time, the scout takes his seat** (`ScoutOpening`): once per browser, over
 * whatever has loaded underneath.
 */
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { PlayerBoard } from "@/components/PlayerBoard";
import { ScoutOpening } from "@/components/ScoutOpening";
import { TopPickups, TopPickupsLocked } from "@/components/TopPickups";
import { ErrorBox, Opening, useHeldWait } from "@/components/ui";
import { getWaivers, PaywallError } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { paywallTeaser } from "@/lib/teaser";
import type { Connection } from "@/lib/storage";
import type { Waivers } from "@/lib/types";
import { WIRE } from "@/lib/vocab";
import { wireKey } from "@/lib/wire";

function Rooms({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  // Cached for the session under the key the pickup page and the scout's notepad read, so
  // the arrow into a pickup and the opening's three names paint without a second request.
  const { data, error, cause, reload } = useCached<Waivers>(wireKey(c.platform, c.league_id, c.team_id), () =>
    getWaivers(c.platform, c.league_id, c.team_id),
  );
  // The API is the authority on entitlement, so a 402 here locks the row even when the
  // session thought otherwise.
  const locked = cause instanceof PaywallError;
  // The day's first ride may be playing over this page; the scout waits for it to land.
  const waiting = useHeldWait(!!data || locked || !!error);

  return (
    <div className="grid min-w-0 gap-7">
      {!waiting && <ScoutOpening c={c} />}
      {waiting ? (
        <Opening />
      ) : locked ? (
        <TopPickupsLocked />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <Opening />
      ) : (
        <TopPickups waivers={data} />
      )}

      <PlayerBoard c={c} picks={data?.picks} />

      {locked && <Locked signedIn={signedIn} sku="waivers" what="Wire Pass" teaser={paywallTeaser(cause, WIRE.lockedLine)} onUnlocked={refresh} />}
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
