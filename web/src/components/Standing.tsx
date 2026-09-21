"use client";
/** Where you stand, in one line under the call sheet's hero: grade, rank, record. */
import Link from "next/link";
import { getLeague, getTeamGrades } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { standingLabel, standingLine, type StandingParts } from "@/lib/format";
import { SECTIONS, STANDING } from "@/lib/vocab";
import type { LeagueSummary, Platform, TeamGrades } from "@/lib/types";
import { IconChevron } from "./icons";

/**
 * The height the line occupies, reserved while it is still being fetched.
 *
 * The hero is the first thing on the screen and this is the last thing in it, so a line
 * that appears a beat late shoves the matchup cell, the three benches and the first card
 * down the page after the reader has already started reading. Costing a blank 30px for
 * one request is cheaper than moving the whole sheet under someone's thumb.
 */
const LINE_H = "min-h-[30px]";

/**
 * Where this team stands, printed under "Synced … · Projected …".
 *
 * The call sheet is about the next kickoff and says nothing about the season it sits in,
 * so "how am I doing" had no answer anywhere a free reader would find one. This is that
 * answer in nineteen characters, and it is the door into the film.
 *
 * **No stamp.** A stamp is the loudest device the app has and it is reserved for a
 * decision the reader is being asked to make — see the header comment in `Scorecard.tsx`.
 * A grade is a read on a roster, not a call, and stamping one would put the same device
 * on "C" as on a start/sit verdict.
 *
 * **No colour carrying meaning.** The grade tile on the depth chart tones its letter
 * green/amber/red and doubles every tone with a word (Loaded / Strong / Even / Soft /
 * Hole). There is no room for that word here, so the tone does not come with it: the line
 * is chrome on the dark hero in both themes, and the letter is the whole signal.
 *
 * Two reads, both free, both already in the client, both on the cache keys the other
 * screens use — `grades:…` is the one `/trade` warms for the compare view, `league:…` the
 * one it uses for the roster picker — so this costs one request per session, not one per
 * visit, and warms those tabs rather than duplicating their work.
 *
 * Additive, always. A failed read renders nothing and the hero closes up behind it: the
 * call sheet is the product and paints from its own feed, and a scorecard that will not
 * load must never cost the reader the page.
 */
export function Standing({
  platform,
  leagueId,
  teamId,
}: {
  platform: Platform;
  leagueId: string;
  teamId: string;
}) {
  const { data: card, error: cardError } = useCached<TeamGrades>(
    `grades:${platform}:${leagueId}:${teamId}`,
    () => getTeamGrades(platform, leagueId, teamId),
  );
  // The record rides along on the league summary the connect flow already reads. Its own
  // failure is not this line's failure: grade and rank are the two halves that must be
  // present, and a league whose connector gave us no record simply loses that segment.
  const { data: league } = useCached<LeagueSummary>(
    `league:${platform}:${leagueId}`,
    () => getLeague(platform, leagueId),
  );

  if (!card) {
    // Nothing to say yet, or nothing to say at all. Either way the hero keeps its height
    // until the question is settled, and gives the space back once it is.
    return cardError ? null : <span aria-hidden className={`mt-2 block ${LINE_H}`} />;
  }

  const g = card.grades;
  const parts: StandingParts = {
    grade: g.overall,
    rank: g.overall_rank,
    leagueSize: g.league_size,
    record: league?.teams.find((t) => t.id === teamId)?.record ?? null,
  };

  return (
    <Link
      href={SECTIONS.report.href}
      aria-label={`${standingLabel(parts)} ${STANDING.go} ${SECTIONS.report.title}.`}
      className={`-mx-1.5 mt-2 inline-flex ${LINE_H} max-w-full items-center gap-1.5 rounded-lg px-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white`}
    >
      <span className="tnum truncate text-[13px] font-bold leading-none">{standingLine(parts)}</span>
      <IconChevron size={13} strokeWidth={2.8} className="shrink-0" />
    </Link>
  );
}
