"use client";
/** The owner's desk: the front page. What landed, who is next, and the staff's binders. */
import { AppShell } from "@/components/Shell";
import { DeskView } from "@/components/Desk";
import { ErrorBox, Opening, useHeldWait } from "@/components/ui";
import { getActions, getDesk } from "@/lib/api";
import { useCached } from "@/lib/cache";
import type { Connection } from "@/lib/storage";
import type { ActionFeed, Desk } from "@/lib/types";

function DeskBody({ c }: { c: Connection }) {
  // Cached for the session, so coming back to the desk paints on the first frame.
  const { data: desk, error, instant, reload } = useCached<Desk>(
    `desk:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getDesk(c.platform, c.league_id, c.team_id),
  );
  // Warm the call sheet while the reader is looking at the desk: the sheet paper and the
  // binders both lead there, and its cache key is the one the sheet page reads. Its error
  // is swallowed; the desk paints from its own payload.
  useCached<ActionFeed>(`actions:${c.platform}:${c.league_id}:${c.team_id}`, () => getActions(c.platform, c.league_id, c.team_id));

  // Held so the ride cannot be cut off while the camera is still moving.
  const waiting = useHeldWait(!!desk);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !desk) return <Opening />;
  return <DeskView desk={desk} c={c} animate={!instant} />;
}

export default function HomePage() {
  return <AppShell section="home">{(s) => <DeskBody c={s.connection!} />}</AppShell>;
}
