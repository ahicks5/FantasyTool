"use client";
/**
 * The full read on this week's opponent: the scoreline, the win meter, and every
 * starting slot set against the slot opposite it.
 *
 * Built from two calls to the free `/lineup` endpoint — yours and theirs — so it is
 * the engine's own flex-aware lineups being compared, and it needs no API this app is
 * not already shipping against. The maths lives in `lib/matchup.ts`, which is pure and
 * tested; this file only lays it out.
 */

import Link from "next/link";
import { AppShell } from "@/components/Shell";
import { Avatar } from "@/components/Avatar";
import { Countdown, ErrorBox, Eyebrow, OnAirLive, SkeletonList, SplitMeter, Why } from "@/components/ui";
import { getActions, getLineup } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { pct, signed } from "@/lib/format";
import { EVEN_MARGIN, matchupCall, printProj, splitMatchup, type SlotDuel } from "@/lib/matchup";
import type { Connection } from "@/lib/storage";
import type { ActionFeed, Lineup, Player } from "@/lib/types";
import { IconChevron } from "@/components/icons";

/**
 * One slot, both sides, stacked.
 *
 * Stacked rather than side by side because a phone is 320px wide and two names facing
 * each other across a centre column left each of them about fifty pixels — every row
 * read "Jord…" against "Jare…", which is not a comparison. Down the page each name gets
 * the full width, and the two projections still line up in one right-hand column, which
 * is what actually makes the pair comparable.
 */
function DuelRow({ d, index }: { d: SlotDuel; index: number }) {
  const tone = d.edge === "mine" ? "text-start" : d.edge === "theirs" ? "text-sit" : "text-muted";
  return (
    <li className={`px-4 py-3 print print-${Math.min(index + 1, 5)}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted">{d.slot}</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className={`tnum text-[12px] font-black ${tone}`}>{d.edge === "even" ? "Even" : signed(d.margin)}</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        <Side p={d.mine} mine won={d.edge === "mine"} />
        <Side p={d.theirs} won={d.edge === "theirs"} />
      </div>
    </li>
  );
}

/**
 * Half a duel: who is in the slot and what they are projected for.
 *
 * The winning side is marked by a rule down its left edge as well as by its ink, so the
 * row never depends on colour alone — and an even slot marks neither.
 */
function Side({ p, mine = false, won }: { p: Player | null; mine?: boolean; won: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 rounded-lg border-l-[3px] py-0.5 pl-2 ${won ? (mine ? "border-start bg-start-soft" : "border-sit bg-sit-soft") : "border-line-2"}`}>
      {p ? <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="sm" /> : <span aria-hidden className="h-9 w-9 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold leading-tight">{p?.name ?? "Empty"}</div>
        <div className="truncate text-[11px] leading-tight text-muted">
          {mine ? "You" : "Them"}
          {p?.nfl_team ? ` · ${p.position} ${p.nfl_team}` : ""}
        </div>
      </div>
      <span className="display tnum shrink-0 text-[17px] leading-none">{printProj(p)}</span>
    </div>
  );
}

/** The one line naming where the game is won or lost. Skipped when nothing is decided. */
function Swing({ label, d, tone }: { label: string; d: SlotDuel | null; tone: "start" | "sit" }) {
  if (!d) return null;
  const who = tone === "start" ? d.mine : d.theirs;
  return (
    <div className="min-w-0 rounded-2xl bg-soft p-3.5">
      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1 truncate text-[14px] font-black leading-tight">{who?.name ?? "—"}</div>
      <div className={`tnum mt-0.5 text-[12px] font-bold ${tone === "start" ? "text-start" : "text-sit"}`}>
        {d.slot} {signed(d.margin)}
      </div>
    </div>
  );
}

function MatchupBody({ c }: { c: Connection }) {
  // Same key the call sheet uses, so arriving from the cell paints the header on the
  // first frame instead of opening the room a second time.
  const feedKey = `actions:${c.platform}:${c.league_id}:${c.team_id}`;
  const { data: feed, error: feedError, reload } = useCached<ActionFeed>(feedKey, () =>
    getActions(c.platform, c.league_id, c.team_id),
  );

  const m = feed?.matchup ?? null;
  const oppId = m?.opponent_id ?? null;

  // Both lineups share the depth chart's cache keys, so the depth chart is warm after
  // this page and vice versa. Null keys until the feed names the opponent: `useCached`
  // fetches nothing while its key is null, which is what lets both hooks sit
  // unconditionally at the top of the component.
  const { data: mine } = useCached<Lineup>(`lineup:${c.platform}:${c.league_id}:${c.team_id}`, () =>
    getLineup(c.platform, c.league_id, c.team_id),
  );
  const { data: theirs, error: theirError } = useCached<Lineup>(
    oppId ? `lineup:${c.platform}:${c.league_id}:${oppId}` : null,
    () => getLineup(c.platform, c.league_id, oppId!),
  );

  if (feedError) return <ErrorBox message={feedError} onRetry={reload} />;
  if (!feed) return <SkeletonList rows={4} />;

  if (!m || !m.opponent || m.their_proj === null) {
    return (
      <div className="card p-6 text-center">
        <Eyebrow>No matchup</Eyebrow>
        <p className="mx-auto mt-2 max-w-[18rem] text-[15px] leading-relaxed text-ink-2">
          This league has no opponent on the board for week {feed.week}. The call sheet still stands.
        </p>
      </div>
    );
  }

  const ahead = m.my_proj >= m.their_proj;
  const diff = m.my_proj - m.their_proj;
  const share = m.win_prob ?? 0.5;
  const split = mine && theirs ? splitMatchup(mine, theirs) : null;

  return (
    <div className="grid gap-3.5">
      <section className="hero callsheet rise overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <OnAirLive className="text-white/70" />
          <Countdown onHero />
        </div>
        <div className="p-5">
          <Eyebrow>Week {feed.week}</Eyebrow>
          {/* Names above the numbers, each on its own half, so a long team name
              truncates instead of pushing the scoreline around. */}
          <div className="mt-1.5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-bold text-white/60">{feed.team}</div>
              <div className={`display tnum text-[36px] leading-none ${ahead ? "text-white" : "text-white/55"}`}>
                {m.my_proj.toFixed(1)}
              </div>
            </div>
            <div aria-hidden className="pt-4 text-[16px] font-bold text-white/35">
              –
            </div>
            <div className="min-w-0 flex-1 text-right">
              <div className="truncate text-[12px] font-bold text-white/60">{m.opponent}</div>
              <div className={`display tnum text-[36px] leading-none ${ahead ? "text-white/55" : "text-white"}`}>
                {m.their_proj.toFixed(1)}
              </div>
            </div>
          </div>

          {m.win_prob !== null && (
            <div className="mt-4">
              <SplitMeter
                left={share}
                right={1 - share}
                leftLabel={`${pct(share)} to win`}
                rightLabel={pct(1 - share)}
                onHero
              />
            </div>
          )}

          {/* Not a stamp: a stamp is reserved for a call you are being asked to make, and
              a margin is a reading, not a decision. A heavy tabular number in a well does
              the same job without spending the loudest device in the kit. */}
          <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
            <span className="display tnum shrink-0 rounded-lg bg-white/10 px-2.5 py-1.5 text-[19px] leading-none text-white">
              {signed(diff)}
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/70">{matchupCall(m.my_proj, m.their_proj)}</p>
          </div>
        </div>
      </section>

      {split && (
        <section className="rise rise-1 grid grid-cols-2 gap-3">
          <Swing label="Biggest edge" d={split.best} tone="start" />
          <Swing label="Biggest hole" d={split.worst} tone="sit" />
        </section>
      )}

      <section className="card rise rise-2 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Eyebrow>Slot by slot</Eyebrow>
          {split && (
            <span className="tnum shrink-0 text-[11px] font-bold">
              <span className="text-start">{split.won} won</span>
              <span className="text-muted"> · {split.even} even · </span>
              <span className="text-sit">{split.lost} lost</span>
            </span>
          )}
        </div>
        {split ? (
          <ol className="divide-y divide-line">
            {split.duels.map((d, i) => (
              <DuelRow key={`${d.slot}-${i}`} d={d} index={i} />
            ))}
          </ol>
        ) : theirError ? (
          <div className="p-4">
            <ErrorBox message={theirError} />
          </div>
        ) : (
          <div className="p-4">
            <SkeletonList rows={4} quiet />
          </div>
        )}
      </section>

      {/* Stacked, not side by side: at 320px the evidence toggle and the back link
          together left each of them half a phone, and both broke onto two lines. */}
      <div className="rise rise-3 grid gap-3">
        <Why
          lines={[
            "Both sides show the lineup we would set for that team, rescored to this league's settings. Not whatever is currently in the slots.",
            "The scoreline above is the best each roster can do. A recommended lineup can sum a fraction under it, because a swap worth less than 1.5 points is not worth making and we hold the incumbent.",
            `A slot inside ${EVEN_MARGIN} points is called even: below that gap the higher projection wins barely half the time.`,
            "Win probability treats a weekly team total as normal with a spread of about 22 points, which is what a nine-slot lineup actually swings by.",
          ]}
          label="How's this scored?"
        />
        <Link
          href="/home"
          className="btn inline-flex min-h-0 items-center justify-center gap-1 rounded-xl border border-line-2 bg-soft px-3.5 py-2.5 text-[13px] font-bold hover:bg-line"
        >
          Back to the sheet
          <IconChevron size={13} strokeWidth={2.8} />
        </Link>
      </div>
    </div>
  );
}

export default function MatchupPage() {
  return (
    <AppShell section="matchup">
      {(s) => <MatchupBody c={s.connection!} />}
    </AppShell>
  );
}
