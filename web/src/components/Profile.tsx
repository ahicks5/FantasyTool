"use client";
/**
 * The scout report on one player: who has him, what the counts say, and every week he has
 * on record, scored by the reader's own league.
 *
 * It is the one page in Scouting that is not a recommendation. The wire ranks five adds
 * and prices a bid; this answers "yes, but who *is* he" — so it states facts and stops. No
 * projection, no verdict, no stamp: a stamp is the loudest device the brand has and it is
 * reserved for a decision the reader is being asked to make (`docs/BRAND.md` §8).
 *
 * Free, deliberately. The ranked board and the bid plan are Wire Pass; a profile someone
 * can open, read and send on is the way in, the same way a shared Lock card is.
 *
 * Every number comes through `lib/profile.ts`, which never turns a null into a zero. This
 * file only draws what comes back.
 */
import Link from "next/link";
import { useMemo } from "react";
import { getPlayerProfile } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { HttpError } from "@/lib/errors";
import { PROFILE_COPY as COPY, profileView } from "@/lib/profile";
import type { Connection } from "@/lib/storage";
import type { PlayerProfile } from "@/lib/types";
import { SCOUT, SECTIONS } from "@/lib/vocab";
import { IconChevron } from "./icons";
import { Report } from "./player/Report";
import { AppShell } from "./Shell";
import { ErrorBox, H2, Opening, useHeldWait } from "./ui";

/* ------------------------------------------------------------------ frame --- */

/** Back where you came from. The search is always the way in, so it is always the way out. */
function BackToScouting() {
  return (
    <Link
      href={SECTIONS.waivers.href}
      className="flex min-h-11 shrink-0 items-center gap-0.5 text-[13px] font-bold text-lean"
    >
      <IconChevron size={14} strokeWidth={2.8} className="rotate-180" />
      {SCOUT.back}
    </Link>
  );
}

export function Profile({ playerId }: { playerId: string }) {
  return (
    <AppShell section="waivers" needsMe aside={<BackToScouting />}>
      {(s) => <ProfileBody c={s.connection!} playerId={playerId} />}
    </AppShell>
  );
}

function ProfileBody({ c, playerId }: { c: Connection; playerId: string }) {
  // Keyed by league *and* team as well as player: the points are scored by this league's
  // settings and `owner` is answered by this league, so the same id is a different report
  // in a different room.
  const { data, error, cause, reload } = useCached<PlayerProfile>(
    `profile:${c.platform}:${c.league_id}:${c.team_id}:${playerId}`,
    () => getPlayerProfile(c.platform, c.league_id, playerId, c.team_id),
  );
  const waiting = useHeldWait(!!data);
  const view = useMemo(() => (data ? profileView(data, SCOUT.free) : null), [data]);

  // A 404 is the id itself being wrong, and it will still be wrong on a retry, so it gets
  // a way out rather than a "try again".
  if (cause instanceof HttpError && cause.status === 404) return <NotFound />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !view) return <Opening />;
  return <Report view={view} />;
}

function NotFound() {
  return (
    <div className="card p-5">
      <H2>{COPY.notFoundHead}</H2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{COPY.notFoundLine}</p>
      <div className="mt-3">
        <BackToScouting />
      </div>
    </div>
  );
}
