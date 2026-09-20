/**
 * The film, worked out: a season of played weeks turned into the rows the page draws.
 *
 * Pure (no React, no DOM, no clock, no fetching) so it can be unit tested with node:test.
 * Everything the page shows is derived here; the components only render what comes back.
 *
 * Two rules shape this module.
 *
 * **`RecapStarter.projected` is normally null.** No projection for a past week can be
 * recovered after the fact, so we only ever have what was recorded at the time: someone
 * who connected in week 6 has nulls for weeks 1 to 5. Every derived row therefore carries
 * `hasRecord` beside its number, and the page says "no record" rather than drawing a blank
 * where a number belongs or quietly showing a shorter season.
 *
 * **Nothing here sums to a score.** There is no hit rate, no "we were right N of M", no
 * percentage over calls — CLAUDE.md forbids a decision-accuracy claim until
 * `scripts/score_runs.py` exists. What this module exposes is per-week fact about the
 * reader's own team: what we had a player at, what he scored, what the roster could have
 * scored. Stated flat, never as a scolding: the number is the point.
 */

import type { BenchScore, RecapStarter, SeasonRecap, Standings, StandingsTeam, WeekRecap } from "./types";

/* ---------------------------------------------------------------------------
   TEMPORARY COPY BLOCK — every word a user reads on the film.

   These belong in `web/src/lib/vocab.ts`, which this session does not own. They
   are gathered here, in one object, so moving them is a cut and a re-import and
   never a sweep through three components. Nothing below inlines a string.
--------------------------------------------------------------------------- */

export const RECAP_COPY = {
  /** The paywall's product name. `edge/products.py` is the source of truth for it. */
  product: "The Penthouse",

  /** The season panel: the best thing on the page. */
  seasonHead: "The season",
  weeksPlayed: (n: number) => `${n} week${n === 1 ? "" : "s"} played`,
  recordLabel: "Record",
  rankLabel: "Points rank",
  rankValue: (rank: number, size: number) => `${ordinal(rank)} of ${size}`,
  winsBar: "Wins",
  scoringBar: "Scoring",
  luckNote: "Your scoring against your record. One is the roster, the other is the draw.",
  luck: {
    unlucky: "Scoring better than the record shows.",
    even: "Record matches the scoring.",
    fortunate: "Winning more than the scoring says.",
  },

  /** The week-by-week line. */
  chartHead: "Points by week",
  chartNote: "Filled dot: a win. Hollow: a loss.",
  chartAlt: (n: number, low: string, high: string) =>
    `Points scored in each of ${n} week${n === 1 ? "" : "s"}, from ${low} to ${high}.`,
  avgLabel: "Average",

  /** The weeks themselves. */
  weeksHead: "Week by week",
  weekLabel: (n: number) => `Week ${n}`,
  won: "Won",
  lost: "Lost",
  tied: "Tied",
  noGame: "No game",
  noGameLine: "No opponent on the schedule this week.",
  vs: (name: string) => `vs ${name}`,

  startersHead: "Your starters",
  colHad: "Had",
  colWent: "Went",
  /** Read out where the page prints the em dash placeholder. */
  noRecordCell: "no record",
  noRecordFoot: "— no record of our number",
  noRecordWeek: "No record of our numbers this week.",
  noRecordSeason: "We have no record of our numbers for these weeks. We only keep what we showed at the time.",
  vacantSlot: "Empty",

  bestHead: "Best you could have set",
  bestSub: (set: string, diff: string) => `You set ${set} · ${diff} on the bench`,
  bestPerfect: "You set the best lineup available.",
  bestUnknown: "No bench on record this week.",

  benchHead: "On the bench",
  benchEmpty: "Nothing on the bench outscored a starter.",

  /** Preseason, and any team whose league has not played yet. */
  nothingPlayedHead: "No film yet",
  nothingPlayed: "Nothing played yet. The film opens after week 1.",
} as const;

/* ------------------------------------------------------------------ numbers --- */

/** One decimal, everywhere, so a column of points does not jitter. */
export function points(n: number): string {
  return n.toFixed(1);
}

export function ordinal(n: number): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = Math.abs(n) % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/* -------------------------------------------------------------------- weeks --- */

export type WeekResult = "won" | "lost" | "tied" | "none";

/** One started slot: what we had him at, and what he did. */
export interface StarterLine {
  slot: string;
  /** The player's name, or the copy block's word for an empty slot. */
  name: string;
  position: string | null;
  actual: number;
  /** What we recorded at the time. Null is the normal case. */
  projected: number | null;
  /** `actual - projected`, or null when there is no record to compare against. */
  delta: number | null;
  hasRecord: boolean;
}

export interface WeekView {
  week: number;
  opponent: string | null;
  myPoints: number;
  theirPoints: number | null;
  result: WeekResult;
  /** Absolute points between the two teams, or null when there was no game. */
  margin: number | null;
  starters: StarterLine[];
  /** True when at least one starter has a number on record. */
  hasRecord: boolean;
  /** True when some starters have a record and others do not, so the column needs a footnote. */
  partialRecord: boolean;
  bestPossible: number | null;
  /** `bestPossible - myPoints`, never negative. Null when the bench is unknown. */
  onTheBench: number | null;
  /** Worst miss first. */
  bench: BenchScore[];
}

function starterLine(s: RecapStarter): StarterLine {
  const hasRecord = s.projected !== null;
  return {
    slot: s.slot,
    name: s.player?.name ?? RECAP_COPY.vacantSlot,
    position: s.player?.position ?? null,
    actual: s.actual,
    projected: s.projected,
    delta: hasRecord ? s.actual - (s.projected as number) : null,
    hasRecord,
  };
}

/**
 * Bench misses, biggest first.
 *
 * The contract already promises this order; re-sorting costs nothing and means one
 * connector shipping them the other way round cannot put the smallest miss at the top of
 * the list the page calls the worst. Ties break on name so the order is stable.
 */
export function benchOrder(bench: BenchScore[]): BenchScore[] {
  return [...bench].sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name));
}

export function weekView(w: WeekRecap): WeekView {
  const starters = w.starters.map(starterLine);
  const recorded = starters.filter((s) => s.hasRecord).length;
  const tied = w.their_points !== null && w.my_points === w.their_points;
  const result: WeekResult = tied ? "tied" : w.won === true ? "won" : w.won === false ? "lost" : "none";
  return {
    week: w.week,
    opponent: w.opponent,
    myPoints: w.my_points,
    theirPoints: w.their_points,
    result,
    margin: w.their_points === null ? null : Math.abs(w.my_points - w.their_points),
    starters,
    hasRecord: recorded > 0,
    partialRecord: recorded > 0 && recorded < starters.length,
    bestPossible: w.best_possible,
    onTheBench: w.best_possible === null ? null : Math.max(0, w.best_possible - w.my_points),
    bench: benchOrder(w.bench),
  };
}

/** The score as one string: "128.0–121.4", or just your own when there was no game. */
export function finalLine(w: WeekView): string {
  if (w.theirPoints === null) return points(w.myPoints);
  return `${points(w.myPoints)}–${points(w.theirPoints)}`;
}

export function resultWord(r: WeekResult): string {
  return r === "won" ? RECAP_COPY.won : r === "lost" ? RECAP_COPY.lost : r === "tied" ? RECAP_COPY.tied : RECAP_COPY.noGame;
}

/* ------------------------------------------------------------------- season --- */

export type LuckKey = "unlucky" | "even" | "fortunate";

/**
 * How far the record sits from the scoring.
 *
 * Both sides are put on the same 0-to-1 scale so they can be drawn as two bars above one
 * another: `winShare` is the share of games won, `scoreShare` is where the team's points
 * rank sits between worst (0) and best (1) in the league. In a league where the schedule
 * is a draw, those two track each other; the gap between them is the honest word for luck,
 * and it is a fact about this team's season, not a claim about our calls.
 */
export interface LuckRead {
  key: LuckKey;
  winShare: number;
  scoreShare: number;
  /** `winShare - scoreShare`. Negative means the scoring is ahead of the record. */
  gap: number;
  line: string;
}

/**
 * How far apart the two shares have to be before the season gets a word for it.
 *
 * Wide on purpose. Five games in, one flipped result moves `winShare` by 0.2, so a
 * narrower band would call a coin flip unlucky.
 */
export const LUCK_BAND = 0.2;

export function luckRead(
  record: SeasonRecap["record"],
  pointsRank: number | null,
  leagueSize: number,
): LuckRead | null {
  if (!record || pointsRank === null || leagueSize < 2) return null;
  const games = record.wins + record.losses + record.ties;
  if (games <= 0) return null;
  const winShare = (record.wins + record.ties * 0.5) / games;
  const scoreShare = (leagueSize - pointsRank) / (leagueSize - 1);
  const gap = winShare - scoreShare;
  const key: LuckKey = gap <= -LUCK_BAND ? "unlucky" : gap >= LUCK_BAND ? "fortunate" : "even";
  return { key, winShare, scoreShare, gap, line: RECAP_COPY.luck[key] };
}

export function recordLine(record: SeasonRecap["record"]): string | null {
  if (!record) return null;
  return record.ties > 0 ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
}

/* -------------------------------------------------------------------- chart --- */

export interface ChartDot {
  week: number;
  value: number;
  x: number;
  y: number;
  result: WeekResult;
  /** Drawn under the line. Empty when this week's number would collide with its neighbour. */
  label: string;
}

export interface ChartModel {
  width: number;
  height: number;
  /** The polyline through every week. Empty when there is only one week to draw. */
  path: string;
  dots: ChartDot[];
  average: number;
  averageY: number;
  low: number;
  high: number;
  alt: string;
}

/** Geometry only. The viewBox scales uniformly, so a 320px phone gets the same drawing. */
const CHART = { width: 320, height: 96, padX: 10, padTop: 12, padBottom: 20 } as const;

/** At most this many week numbers under the line before they start touching at 320px. */
const MAX_TICKS = 6;

/**
 * The week-by-week scoring line, oldest week on the left.
 *
 * Takes the weeks in display order (newest first) and reverses them itself, so a caller
 * cannot draw the season backwards by forgetting to. Null when there is nothing to draw.
 */
export function scoringChart(weeks: WeekView[]): ChartModel | null {
  if (weeks.length === 0) return null;
  const series = [...weeks].sort((a, b) => a.week - b.week);
  const values = series.map((w) => w.myPoints);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const average = values.reduce((a, b) => a + b, 0) / values.length;

  const plotTop = CHART.padTop;
  const plotBottom = CHART.height - CHART.padBottom;
  const plotLeft = CHART.padX;
  const plotRight = CHART.width - CHART.padX;
  const span = high - low;
  // A flat season (one week, or every week identical) has no range to scale against, so
  // the line sits on the middle of the plot rather than dividing by zero.
  const y = (v: number) => (span <= 0 ? (plotTop + plotBottom) / 2 : plotBottom - ((v - low) / span) * (plotBottom - plotTop));
  const x = (i: number) => (series.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + (i / (series.length - 1)) * (plotRight - plotLeft));

  const stride = Math.max(1, Math.ceil(series.length / MAX_TICKS));
  const ticks = new Set<number>();
  for (let i = series.length - 1; i >= 0; i -= stride) ticks.add(i);

  const dots: ChartDot[] = series.map((w, i) => ({
    week: w.week,
    value: w.myPoints,
    x: round(x(i)),
    y: round(y(w.myPoints)),
    result: w.result,
    label: ticks.has(i) ? String(w.week) : "",
  }));

  return {
    width: CHART.width,
    height: CHART.height,
    path: dots.length < 2 ? "" : dots.map((d, i) => `${i === 0 ? "M" : "L"}${d.x} ${d.y}`).join(" "),
    dots,
    average,
    averageY: round(y(average)),
    low,
    high,
    alt: RECAP_COPY.chartAlt(series.length, points(low), points(high)),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------- season --- */

export interface SeasonView {
  team: string;
  league: string;
  leagueSize: number;
  /** Newest week first, which is the order the page lists them in. */
  weeks: WeekView[];
  played: number;
  record: SeasonRecap["record"];
  recordLine: string | null;
  pointsRank: number | null;
  luck: LuckRead | null;
  chart: ChartModel | null;
  /** False when not one starter in the whole season has a number on record. */
  anyRecord: boolean;
}

/**
 * The whole page, derived once.
 *
 * Weeks are re-sorted newest first rather than trusted, because the list order is what the
 * reader takes as "most recent", and the chart reads the same array the other way round.
 */
export function seasonView(recap: SeasonRecap): SeasonView {
  const weeks = [...recap.weeks].sort((a, b) => b.week - a.week).map(weekView);
  return {
    team: recap.team,
    league: recap.league,
    leagueSize: recap.league_size,
    weeks,
    played: weeks.length,
    record: recap.record,
    recordLine: recordLine(recap.record),
    pointsRank: recap.points_rank,
    luck: luckRead(recap.record, recap.points_rank, recap.league_size),
    chart: scoringChart(weeks),
    anyRecord: weeks.some((w) => w.hasRecord),
  };
}

/* ===========================================================================
   THE TABLE — standings and the power ranking.

   Free for every reader, so this half of the film page has to stand on its own:
   it is the "how am I doing" screen, and for someone who has not paid it is the
   whole of `/report`. Everything below is pure, like the rest of this module —
   the component renders what `standingsView` hands it and works nothing out.
=========================================================================== */

/* ---------------------------------------------------------------------------
   TEMPORARY COPY BLOCK — every word a reader sees on the table.

   Same deal as RECAP_COPY above: destined for `web/src/lib/vocab.ts`, gathered
   in one object so the move is a cut and a re-import. The luck sentences are
   NOT repeated here — the table reuses RECAP_COPY.luck, so the film and the
   table cannot drift into two different words for the same fact.
--------------------------------------------------------------------------- */

export const STANDINGS_COPY = {
  head: "The table",
  /** Column labels. Short enough to survive 320px; spelled out in the row's second line. */
  colRank: "#",
  colTeam: "Team",
  colRecord: "Rec",
  colPoints: "PF",
  /** The marker on the reader's own row. Says it in a word, so the rail is never the only cue. */
  you: "You",
  pointsAgainst: (v: string) => `PA ${v}`,
  scoringRank: (rank: string) => `Scoring ${rank}`,
  strengthRank: (rank: string) => `Roster ${rank}`,
  /** The read when the season is too young to have a shape yet. */
  earlyRead: (rank: string, size: number) => `Your roster rates ${rank} of ${size} from here.`,
  /** The film teaser, built from this reader's own free row. Never a generic pitch. */
  teaserRecord: (record: string, joiner: string, rank: string, size: number) =>
    `You're ${record} ${joiner} ${rank} of ${size} in scoring.`,
  teaserRoster: (rank: string, size: number) => `Your roster rates ${rank} of ${size} from here.`,
  teaserTail: "The film shows which calls it came down to.",
  teaserTailEarly: "The film grades every week against what we showed at the time.",
  /** Joins the record to the scoring rank. "but" when the two disagree, "and" when they do not. */
  joinerAgainst: "but",
  joinerWith: "and",
  /** What the two derived columns mean, said once under the table rather than in a header. */
  legend: "Scoring is where the points sit. Roster is what the starting lineup is worth from here.",
  /** A league that came back without a single team. Not expected; still rendered. */
  empty: "No teams in this table yet.",
} as const;

/**
 * How far the all-play record has to sit from the real one before the table says a word.
 *
 * One game in eight. Tighter than `LUCK_BAND`, and deliberately: that band reads a rank
 * against a win rate, where one flipped result in a short season moves the number 0.2.
 * All-play counts eleven games a week instead of one, so the same confidence costs far
 * less of the season — and the gap it measures is the schedule directly, not a proxy.
 */
export const ALL_PLAY_BAND = 0.125;

/** Share of games won, a tie counting half. Null when nothing has been played. */
export function winShare(row: { wins: number; losses: number; ties: number }): number | null {
  const games = row.wins + row.losses + row.ties;
  return games <= 0 ? null : (row.wins + row.ties * 0.5) / games;
}

/**
 * The reader's season in one word: is the record telling the truth about the scoring?
 *
 * Prefers the all-play gap, which is the real answer — every team against every other
 * team, every week — and falls back to the rank-against-record read the film already
 * uses when no week has been played yet. Null when there is nothing to say.
 *
 * `StandingsTeam.luck` is POSITIVE when the scoring is ahead of the record, which is the
 * opposite sign to `LuckRead.gap`. That is the one trap in this module and it is why the
 * comparison below reads the way it does.
 */
export function standingsRead(row: StandingsTeam | null, size: number): LuckRead | null {
  if (!row) return null;
  if (row.luck === null || row.all_play === null) {
    return luckRead({ wins: row.wins, losses: row.losses, ties: row.ties }, row.points_rank, size);
  }
  const key: LuckKey = row.luck >= ALL_PLAY_BAND ? "unlucky" : row.luck <= -ALL_PLAY_BAND ? "fortunate" : "even";
  return {
    key,
    winShare: winShare(row) ?? 0,
    scoreShare: winShare(row.all_play) ?? 0,
    gap: -row.luck,
    line: RECAP_COPY.luck[key],
  };
}

/**
 * The paid half's teaser, built out of the free half's numbers.
 *
 * A paywall that says what we found beats one that describes a product, and everything
 * here is already on screen above it — so it gives nothing away, and it is about this
 * reader's own season rather than about the app. Null only when the table itself failed
 * to load, and the component falls back to the product blurb for that.
 */
export function filmTeaser(row: StandingsTeam | null, size: number): string | null {
  if (!row) return null;
  const C = STANDINGS_COPY;
  const record = recordLine(row);
  if (record && row.points_rank !== null && winShare(row) !== null) {
    const joiner = standingsRead(row, size)?.key === "unlucky" ? C.joinerAgainst : C.joinerWith;
    return `${C.teaserRecord(record, joiner, ordinal(row.points_rank), size)} ${C.teaserTail}`;
  }
  return `${C.teaserRoster(ordinal(row.strength_rank), size)} ${C.teaserTailEarly}`;
}

/** One row of the table, every field already worded and formatted. */
export interface StandingsRowView {
  id: string;
  name: string;
  rank: number;
  /** "3-0", or "3-0-1" when the league has ties. */
  record: string;
  pointsFor: string;
  /** The second line, in order: points against, scoring rank, roster rank, streak. */
  notes: string[];
  isMe: boolean;
}

export interface StandingsView {
  rows: StandingsRowView[];
  size: number;
  /** The reader's own row, or null when the connected team is not in this league's table. */
  me: StandingsTeam | null;
  /** The one-line read above the table. Null when the season cannot support one. */
  read: LuckRead | null;
  /** The real teaser for the locked film below the table. */
  teaser: string | null;
}

/**
 * The whole table, derived once.
 *
 * Rows are re-sorted by rank rather than trusted: the order is what a reader takes as the
 * standing, and the API's order is not something this page should depend on. A tie keeps
 * the better-named team first, which is the API's own tiebreak, so the two agree.
 *
 * The second line carries points against, both ranks and the streak. They are a line
 * rather than four more columns because twelve rows of seven columns cannot be read at
 * 320px without scrolling sideways, and a table you have to drag is not a table.
 */
export function standingsView(standings: Standings, teamId: string): StandingsView {
  const teams = [...standings.teams].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const size = teams.length;
  const C = STANDINGS_COPY;
  const rows = teams.map((t) => ({
    id: t.id,
    name: t.name,
    rank: t.rank,
    record: recordLine(t) ?? "",
    pointsFor: points(t.points_for),
    notes: [
      C.pointsAgainst(points(t.points_against)),
      t.points_rank === null ? null : C.scoringRank(ordinal(t.points_rank)),
      C.strengthRank(ordinal(t.strength_rank)),
      t.streak,
    ].filter((n): n is string => !!n),
    isMe: t.id === teamId,
  }));
  const me = teams.find((t) => t.id === teamId) ?? null;
  const read = standingsRead(me, size);
  return { rows, size, me, read, teaser: filmTeaser(me, size) };
}
