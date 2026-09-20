/**
 * The scout report, worked out: one player's recorded season turned into the tiles,
 * the table and the bars the page draws.
 *
 * Pure (no React, no DOM, no clock, no fetching) so `node --test` can load it and the
 * components only render what comes back.
 *
 * Three rules shape every function here.
 *
 * **A null is not a zero.** The contract on `ScoutGame` and `ScoutSplit` says a stat the
 * platform does not record for this position is null, and a quarterback's target count is
 * the standing example: printing it as "0 targets" is the page telling a lie it could have
 * told the truth about for free. So nothing below coerces, and every formatter that can be
 * handed a null hands back {@link NO_VALUE}. A row whose number is missing on *both* sides
 * is dropped from the table rather than filled with dashes.
 *
 * **Nothing here is a forecast, and nothing here scores us.** Every figure is a count that
 * has already happened. There is no projection, no "due", no hit rate — the line
 * `docs/ACCURACY_PROGRAM.md` draws and CLAUDE.md repeats.
 *
 * **The points are already the reader's points.** `edge/data/scoring.py` scored them
 * through this league's own settings, so nothing here multiplies, re-weights or re-derives
 * them; they are printed to one decimal and left alone. Said once on the page, by
 * `SCOUT.footnote`.
 *
 * Copy lives here rather than in `vocab.ts`, on the precedent `recap.ts`, `compare.ts` and
 * `deadline.ts` already set and `SCOUT`'s own doc comment names: vocab holds room names and
 * the brand's lines, and a string that only exists as the output of a formatter belongs
 * beside the formatter. Nothing user-visible is inlined in a component.
 */

import type { PlayerProfile, ScoutGame, ScoutRead, ScoutSplit } from "./types";

/* -------------------------------------------------------------------- copy ---
   Voice: clipped, plural, verb first, no em dashes, no hedging and no promises
   about a week that has not happened. See docs/BRAND.md §3.                     */

export const PROFILE_COPY = {
  /** Over the ownership plate. Who holds him is the most actionable fact on the page. */
  ownerHead: "Rostered by",
  /** The same plate when nobody in the league holds him. The value is `SCOUT.free`. */
  ownerFreeHead: "Availability",
  /** Badge beside the team name when the reader is the one holding him. */
  ownerMine: "Yours",

  /** The week he is off. Null is the platform not saying, and never 0, which is a week. */
  byeHead: "Bye",
  rookie: "Rookie",
  seasons: (n: number) => `${n} season${n === 1 ? "" : "s"}`,

  /** The season panel. `sub` counts the games every per-game number divides by. */
  seasonHead: (season: number) => `${season} season`,
  gamesPlayed: (n: number) => `${n} game${n === 1 ? "" : "s"} played`,
  /** Shown instead of the panel's numbers when this season has not started for him. */
  nothingYet: "Nothing played this season yet.",
  /** The panel falls back to last year, and says so rather than looking current. */
  lastYearHead: "Last season",
  nothingAtAll: "No season on record for him.",

  statPoints: "Points",
  statPerGame: "Per game",
  statRank: "Pos rank",
  rankOf: (total: number) => `of ${total}`,

  /** The read: the plain-English report, and the centrepiece of the page. */
  readsHead: "The read",
  /** Week 2 of a season is a real reason to have nothing to say, and we say that. */
  readsEmpty: "Too little played this season to read a change.",
  /** Read out beside the arrow, so direction never rides on a shape alone. */
  toneUp: "Up",
  toneDown: "Down",
  toneFlat: "Unchanged",

  /** The two-season table. */
  splitsHead: "This season vs last",
  colThis: "This season",
  colLast: "Last season",
  rowGames: "Games",
  rowPoints: "Points",
  rowPerGame: "Per game",
  rowSnaps: "Snap share",
  rowTargets: "Targets",
  rowTargetShare: "Target share",
  rowCarries: "Carries",
  rowRushShare: "Rush share",
  rowRedZone: "Red-zone touches",
  rowYards: "Yards",
  rowTds: "Touchdowns",
  rowRank: "Position rank",
  rowBest: "Best week",
  rowWorst: "Worst week",
  /** Read out where the table prints the dash. */
  notRecorded: "Not recorded",
  /** The table opens on the rows a manager came for and keeps the rest one tap away. */
  showAll: "Show every number",
  showLess: "Show less",

  /** The game log. */
  gamesHead: "Game log",
  gamesEmpty: "No games on record this season.",
  weekLabel: (week: number) => `Week ${week}`,
  vs: (opponent: string) => `vs ${opponent}`,
  noOpponent: "Opponent not recorded",
  /** A week he took no snap in. Never printed as a 0-point game. */
  didNotPlay: "Did not play",
  detailSnaps: "Snaps",
  detailTargets: "Targets",
  detailCarries: "Carries",
  detailRedZone: "Red zone",
  detailYards: "Yards",
  detailTds: "TD",

  /** The bars. */
  chartHead: "Points by week",
  chartAvg: "Average",
  chartNote: "Hollow: no snap taken that week.",
  chartAlt: (n: number, low: string, high: string) =>
    `Points in each of ${n} week${n === 1 ? "" : "s"}, from ${low} to ${high}.`,

  /** An id the league has never heard of. A 404 stays a 404, so there is no retry. */
  notFoundHead: "No file on him",
  notFoundLine: "Nothing in this league under that player.",
} as const;

/**
 * How many rows of the two-season table are open before the expander.
 *
 * Eight is what fits a 320px phone above the fold under the panel, and the order in
 * `ROWS` puts volume before efficiency, so the rows a manager came for are the open ones.
 */
export const SPLIT_ROWS_OPEN = 8;

/** The no-value-yet glyph. A dash is not copy, which is why it is a constant and not a line. */
export const NO_VALUE = "—";

/* ----------------------------------------------------------------- numbers --- */

/** One decimal, everywhere, so a column of points does not jitter. */
export function points(n: number): string {
  return n.toFixed(1);
}

/** A whole count, or the dash. `0` is a count and prints as "0". */
export function count(n: number | null | undefined): string {
  return n === null || n === undefined ? NO_VALUE : String(Math.round(n));
}

/** A number to one decimal, or the dash. */
export function decimal(n: number | null | undefined): string {
  return n === null || n === undefined ? NO_VALUE : n.toFixed(1);
}

/** A 0..1 share as whole percent, or the dash. A null snap share is not 0%. */
export function share(p: number | null | undefined): string {
  return p === null || p === undefined ? NO_VALUE : `${Math.round(p * 100)}%`;
}

export function ordinal(n: number): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = Math.abs(n) % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** "12th", or the dash. The total rides beside it as a sub-line, never inside the value. */
export function rank(n: number | null | undefined): string {
  return n === null || n === undefined ? NO_VALUE : ordinal(n);
}

/* ---------------------------------------------------------------- identity --- */

/** "WR · DET", or just the position when the platform did not name a team. */
export function positionLine(position: string, nflTeam: string | null): string {
  return nflTeam ? `${position} · ${nflTeam}` : position;
}

/**
 * How long he has been in the league.
 *
 * `0` is a rookie and says so; null is the platform declining to answer, which is not the
 * same thing, so it produces nothing rather than a zero.
 */
export function experience(yearsExp: number | null | undefined): string | null {
  if (yearsExp === null || yearsExp === undefined) return null;
  return yearsExp <= 0 ? PROFILE_COPY.rookie : PROFILE_COPY.seasons(yearsExp);
}

/**
 * The quiet line under the position: his bye and how long he has been at it.
 *
 * Assembled here rather than in the component for the reason the whole copy block exists:
 * "Bye 8 · 5 seasons" is a string a reader reads, and a string a reader reads is never put
 * together out of pieces inside JSX. Null when neither half is on record, so the page drops
 * the line instead of printing a stray separator.
 */
export function metaLine(bye: number | null | undefined, exp: string | null): string | null {
  const parts: string[] = [];
  if (bye !== null && bye !== undefined) parts.push(`${PROFILE_COPY.byeHead} ${bye}`);
  if (exp) parts.push(exp);
  return parts.length === 0 ? null : parts.join(" \u00b7 ");
}

export interface Ownership {
  /** Eyebrow over the plate. */
  label: string;
  /** The team that holds him, or the word for the wire. */
  value: string;
  /** Nobody in this league holds him. The reason a reader is on this page at all. */
  free: boolean;
  /** The reader's own team holds him. */
  mine: boolean;
}

/**
 * Who rosters him *in this league*.
 *
 * `free` is not an inference from a missing field: the contract says `owner` is null
 * exactly when he is on the wire, and the league is the one that knows.
 */
export function ownership(owner: PlayerProfile["owner"], freeWord: string): Ownership {
  if (!owner) return { label: PROFILE_COPY.ownerFreeHead, value: freeWord, free: true, mine: false };
  return { label: PROFILE_COPY.ownerHead, value: owner.team_name, free: false, mine: owner.is_me };
}

/* ------------------------------------------------------------ season panel --- */

export interface StatCell {
  label: string;
  value: string;
  sub: string | null;
  /** True when the number is not on record, so the tile can be read out as such. */
  missing: boolean;
}

/**
 * The three numbers the panel leads with: what he has scored, per game, and where that ranks.
 *
 * The per-game tile only carries the games count when the panel is showing *last* season,
 * because the panel's own sub-line already says it for this one and printing it twice
 * costs a line of a 320px screen to say nothing.
 */
export function headlineStats(split: ScoutSplit, fallback = false): StatCell[] {
  return [
    { label: PROFILE_COPY.statPoints, value: points(split.points), sub: null, missing: false },
    {
      label: PROFILE_COPY.statPerGame,
      value: decimal(split.ppg),
      sub: fallback ? PROFILE_COPY.gamesPlayed(split.games) : null,
      missing: split.ppg === null,
    },
    {
      label: PROFILE_COPY.statRank,
      value: rank(split.pos_rank),
      sub: split.pos_total === null || split.pos_rank === null ? null : PROFILE_COPY.rankOf(split.pos_total),
      missing: split.pos_rank === null,
    },
  ];
}

export interface SeasonPanel {
  season: number;
  /** The panel's eyebrow: this season by name, or last season said as last season. */
  head: string;
  sub: string;
  stats: StatCell[];
  /** True when this season has nothing in it and the panel is showing last year instead. */
  fallback: boolean;
}

/**
 * The lit panel at the top.
 *
 * `this_season` is null in week 1 and that is the normal case for the first month, so the
 * panel falls back to last season — and says "Last season" over it, because a panel that
 * silently shows a year-old number is worse than no panel at all. Null when neither season
 * exists, and the page prints one plain line instead.
 */
export function seasonPanel(now: ScoutSplit | null, last: ScoutSplit | null): SeasonPanel | null {
  const split = now ?? last;
  if (!split) return null;
  const fallback = now === null;
  return {
    season: split.season,
    head: fallback ? PROFILE_COPY.lastYearHead : PROFILE_COPY.seasonHead(split.season),
    sub: fallback ? PROFILE_COPY.nothingYet : PROFILE_COPY.gamesPlayed(split.games),
    stats: headlineStats(split, fallback),
    fallback,
  };
}

/* ------------------------------------------------------------ the two years --- */

export interface SplitRow {
  key: string;
  label: string;
  /** This season's figure, already formatted. `NO_VALUE` when it is not on record. */
  now: string;
  prev: string;
  nowMissing: boolean;
  prevMissing: boolean;
}

type Pick = (s: ScoutSplit) => number | null;
type Fmt = (n: number | null) => string;

const ROWS: { key: string; label: string; pick: Pick; fmt: Fmt }[] = [
  { key: "games", label: PROFILE_COPY.rowGames, pick: (s) => s.games, fmt: count },
  { key: "points", label: PROFILE_COPY.rowPoints, pick: (s) => s.points, fmt: decimal },
  { key: "ppg", label: PROFILE_COPY.rowPerGame, pick: (s) => s.ppg, fmt: decimal },
  { key: "snaps", label: PROFILE_COPY.rowSnaps, pick: (s) => s.snap_pct, fmt: share },
  { key: "targets", label: PROFILE_COPY.rowTargets, pick: (s) => s.targets, fmt: count },
  { key: "target_share", label: PROFILE_COPY.rowTargetShare, pick: (s) => s.target_share, fmt: share },
  { key: "carries", label: PROFILE_COPY.rowCarries, pick: (s) => s.carries, fmt: count },
  { key: "rush_share", label: PROFILE_COPY.rowRushShare, pick: (s) => s.rush_share, fmt: share },
  { key: "rz", label: PROFILE_COPY.rowRedZone, pick: (s) => s.rz_touches, fmt: count },
  { key: "yards", label: PROFILE_COPY.rowYards, pick: (s) => s.yards, fmt: count },
  { key: "tds", label: PROFILE_COPY.rowTds, pick: (s) => s.tds, fmt: count },
  { key: "rank", label: PROFILE_COPY.rowRank, pick: (s) => s.pos_rank, fmt: (n) => rank(n) },
  { key: "best", label: PROFILE_COPY.rowBest, pick: (s) => s.best, fmt: decimal },
  { key: "worst", label: PROFILE_COPY.rowWorst, pick: (s) => s.worst, fmt: decimal },
];

/**
 * The two seasons, side by side, minus every row neither of them has.
 *
 * A quarterback carries no target count in either year, so the page does not print him two
 * dashes under "Targets" and let the reader wonder whether we lost the number. A row
 * survives if *one* side has it, because "88 last year, nothing yet this year" is exactly
 * the comparison this table exists to make.
 */
export function splitRows(now: ScoutSplit | null, prev: ScoutSplit | null): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const row of ROWS) {
    const a = now ? row.pick(now) : null;
    const b = prev ? row.pick(prev) : null;
    if (a === null && b === null) continue;
    rows.push({
      key: row.key,
      label: row.label,
      now: row.fmt(a),
      prev: row.fmt(b),
      nowMissing: a === null,
      prevMissing: b === null,
    });
  }
  return rows;
}

/* --------------------------------------------------------------- game log --- */

export interface GameDetail {
  label: string;
  value: string;
}

export interface GameRow {
  week: number;
  /** "vs KC", or the line for a week the platform gave no opponent for. */
  opponent: string;
  played: boolean;
  /** The week's points, or null when he did not play, so the page can say the words. */
  points: number | null;
  /** Only the stats actually on record. A null is left out, never printed as a zero. */
  detail: GameDetail[];
}

function gameDetail(g: ScoutGame): GameDetail[] {
  const out: GameDetail[] = [];
  if (g.snap_pct !== null) out.push({ label: PROFILE_COPY.detailSnaps, value: share(g.snap_pct) });
  if (g.targets !== null) out.push({ label: PROFILE_COPY.detailTargets, value: count(g.targets) });
  if (g.carries !== null) out.push({ label: PROFILE_COPY.detailCarries, value: count(g.carries) });
  if (g.rz_touches !== null) out.push({ label: PROFILE_COPY.detailRedZone, value: count(g.rz_touches) });
  if (g.yards !== null) out.push({ label: PROFILE_COPY.detailYards, value: count(g.yards) });
  if (g.tds !== null) out.push({ label: PROFILE_COPY.detailTds, value: count(g.tds) });
  return out;
}

/**
 * The log, newest week first.
 *
 * Re-sorted rather than trusted: the list order is what the reader takes as "most recent",
 * and one connector shipping the array the other way round would put week 1 at the top
 * under a heading that says otherwise.
 */
export function gameRows(games: ScoutGame[]): GameRow[] {
  return [...games]
    .sort((a, b) => b.week - a.week)
    .map((g) => ({
      week: g.week,
      opponent: g.opponent ? PROFILE_COPY.vs(g.opponent) : PROFILE_COPY.noOpponent,
      played: g.played,
      points: g.played ? g.points : null,
      detail: gameDetail(g),
    }));
}

/* ------------------------------------------------------------------ chart --- */

export interface Bar {
  week: number;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
  played: boolean;
  /** His highest-scoring week of those drawn. Ties go to the earlier week. */
  best: boolean;
  label: string;
}

export interface BarChart {
  width: number;
  height: number;
  baseline: number;
  bars: Bar[];
  average: number;
  averageY: number;
  low: number;
  high: number;
  alt: string;
}

/** Geometry only. The viewBox scales uniformly, so a 320px phone gets the same drawing. */
const CHART = { width: 320, height: 96, padX: 8, padTop: 10, padBottom: 18, maxBar: 30 } as const;

/**
 * The height of the stub that stands in for a week he did not play.
 *
 * Tall enough to see against the baseline, short enough that nobody reads it as a score —
 * the smallest real bar in a normal season is several times this, and the drawing hollows
 * it out and captions it besides.
 */
export const MISSED_WEEK_STUB = 4;

/**
 * Weekly points as bars, oldest week on the left.
 *
 * Bars, not a line: a bar starts at zero, which is the honest baseline for a count, and a
 * week he did not play is a hole in the row rather than a dip in a curve. A week with no
 * snap is drawn as a {@link MISSED_WEEK_STUB} stub at the baseline and marked
 * `played: false` so the drawing can hollow it out — it is not a zero-point game and must not read as one.
 *
 * Null below two weeks: one bar on its own is a rectangle with nothing to compare against,
 * and in week 2 of a season that is the normal case. The log underneath still carries the
 * week, so nothing is lost by not drawing it.
 */
export function pointsBars(games: ScoutGame[]): BarChart | null {
  if (games.length < 2) return null;
  const series = [...games].sort((a, b) => a.week - b.week);
  const played = series.filter((g) => g.played);
  if (played.length < 2) return null;

  const values = played.map((g) => g.points);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const bestWeek = played.reduce((a, b) => (b.points > a.points ? b : a)).week;

  const baseline = CHART.height - CHART.padBottom;
  const plotTop = CHART.padTop;
  const plotLeft = CHART.padX;
  const plotWidth = CHART.width - CHART.padX * 2;
  const slot = plotWidth / series.length;
  const w = Math.min(CHART.maxBar, Math.max(4, slot * 0.62));
  // Bars are measured from zero, never from the low week: a bar whose baseline floats is a
  // bar whose length means nothing.
  const top = high <= 0 ? 0 : high;
  const scale = (v: number) => (top <= 0 ? 0 : (v / top) * (baseline - plotTop));

  const bars: Bar[] = series.map((g, i) => {
    const h = g.played ? Math.max(2, round(scale(g.points))) : MISSED_WEEK_STUB;
    return {
      week: g.week,
      value: g.played ? g.points : 0,
      x: round(plotLeft + slot * i + (slot - w) / 2),
      y: round(baseline - h),
      w: round(w),
      h,
      played: g.played,
      best: g.played && g.week === bestWeek,
      label: String(g.week),
    };
  });

  return {
    width: CHART.width,
    height: CHART.height,
    baseline,
    bars,
    average,
    averageY: round(baseline - scale(average)),
    low,
    high,
    alt: PROFILE_COPY.chartAlt(played.length, points(low), points(high)),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------- the report --- */

export interface ProfileView {
  name: string;
  position: string;
  nflTeam: string | null;
  positionLine: string;
  photo: string | null;
  teamLogo: string | null;
  injuryStatus: string | null;
  /** The platform's words for what is wrong. It rides beside the status, never replaces it. */
  injuryBodyPart: string | null;
  bye: number | null;
  experience: string | null;
  /** "Bye 8 · 5 seasons", or null when neither is on record. */
  meta: string | null;
  ownership: Ownership;
  panel: SeasonPanel | null;
  /** The two years the table columns are headed with. Null where the season is not on record. */
  seasons: { now: number | null; prev: number | null };
  reads: ScoutRead[];
  splits: SplitRow[];
  games: GameRow[];
  chart: BarChart | null;
}

/**
 * The whole page, derived once.
 *
 * `freeWord` is passed in rather than imported so the one string a *room* owns
 * (`SCOUT.free`, in `vocab.ts`) stays owned by the room, and this module keeps to strings
 * it produces itself.
 */
export function profileView(p: PlayerProfile, freeWord: string): ProfileView {
  const exp = experience(p.player.years_exp);
  return {
    name: p.player.name,
    position: p.player.position,
    nflTeam: p.player.nfl_team,
    positionLine: positionLine(p.player.position, p.player.nfl_team),
    photo: p.player.photo ?? null,
    teamLogo: p.player.team_logo ?? null,
    injuryStatus: p.player.injury_status ?? null,
    injuryBodyPart: p.player.injury_body_part ?? null,
    bye: p.player.bye_week ?? null,
    experience: exp,
    meta: metaLine(p.player.bye_week, exp),
    ownership: ownership(p.owner, freeWord),
    panel: seasonPanel(p.this_season, p.last_season),
    seasons: { now: p.this_season?.season ?? null, prev: p.last_season?.season ?? null },
    reads: p.reads,
    splits: splitRows(p.this_season, p.last_season),
    games: gameRows(p.games),
    chart: pointsBars(p.games),
  };
}
