/**
 * Vibes, built: what he *is*, then which way he is going.
 *
 * Two tiers, and the split is the whole idea. The base is structural — is he on the field,
 * is the ball his, where does he sit at his position. It moves over months and it is what
 * you actually own. The trend is temporary — usage, chances, efficiency, form — it moves
 * week to week and it is what you act on. A page that mixes them reads as a pile of
 * arrows, and a manager cannot tell a workhorse having a quiet fortnight from a backup
 * having a good one.
 *
 * **Not one digit reaches the screen.** Every number in the payload is turned into a word
 * here, against the thresholds below, and `assertWordsOnly` is run over the finished view
 * so a digit cannot leak through a label someone adds later.
 *
 * The thresholds are this module's judgement and they are the part most worth arguing
 * with. They live in one table so that argument is a diff. **They belong in the engine**
 * once phase D gives the page an endpoint of its own — one definition of "starter" for the
 * web, the take-writer and the backtest, rather than three. Until then they are here,
 * pure and tested.
 */
import type { PlayerProfile, ScoutGame, ScoutRead, ScoutSplit } from "../types.ts";
import { PLAYER } from "../vocab.ts";

/** Green, red, or neither. The word always carries the meaning; this only reinforces it. */
export type Verdict = "good" | "bad" | "flat";

/** One line on either tier: what is being judged, the judgement, and its direction. */
export interface VibeRow {
  key: string;
  /** What is being measured. "On the field", "Usage". */
  label: string;
  /** The answer, in one or two words. "Every down", "Up", "Cooling". */
  word: string;
  verdict: Verdict;
  /** Which glyph rides beside it, so the row reads with the colour stripped out. */
  mark: "up" | "down" | "level" | "yes" | "no";
}

export interface VibesView {
  /** One sentence that sells him, composed from the base. Never a number. */
  headline: string;
  /** Structural. What he is. */
  base: VibeRow[];
  /** Temporary. Which way he is going. */
  trend: VibeRow[];
  /** True when there is nothing on record at all, and the page says so instead. */
  empty: boolean;
}

/* ------------------------------------------------------------------ bands --- */

/**
 * A band is a floor and the word you get for clearing it, richest first.
 *
 * Stated as floors rather than ranges so a band can never leave a gap: whatever the value,
 * some floor catches it, and the last entry is always zero.
 */
interface Band {
  from: number;
  word: string;
  verdict: Verdict;
}

function band(value: number, bands: Band[]): Band {
  return bands.find((b) => value >= b.from) ?? bands[bands.length - 1];
}

/** Snap share. The most structural fact there is: he cannot do anything from the sideline. */
const SNAPS: Band[] = [
  { from: 0.75, word: PLAYER.vibes.snaps.every, verdict: "good" },
  { from: 0.55, word: PLAYER.vibes.snaps.starter, verdict: "good" },
  { from: 0.3, word: PLAYER.vibes.snaps.rotation, verdict: "flat" },
  { from: 0, word: PLAYER.vibes.snaps.sub, verdict: "bad" },
];

/** Share of his position's work. A back's carries and a receiver's targets are not the
 *  same scale, so they are not the same table. */
const RUSH_SHARE: Band[] = [
  { from: 0.55, word: PLAYER.vibes.work.feature, verdict: "good" },
  { from: 0.35, word: PLAYER.vibes.work.lead, verdict: "good" },
  { from: 0.15, word: PLAYER.vibes.work.committee, verdict: "flat" },
  { from: 0, word: PLAYER.vibes.work.backup, verdict: "bad" },
];

const TARGET_SHARE: Band[] = [
  { from: 0.25, word: PLAYER.vibes.work.first, verdict: "good" },
  { from: 0.18, word: PLAYER.vibes.work.inPlan, verdict: "good" },
  { from: 0.1, word: PLAYER.vibes.work.complementary, verdict: "flat" },
  { from: 0, word: PLAYER.vibes.work.afterthought, verdict: "bad" },
];

/**
 * Where he sits at his position, by **rank**, not by percentile.
 *
 * Percentile was tried first and is quietly wrong: it divides by `pos_total`, which is
 * however many men the API counted as having played the position. That number moves with
 * the feed (64 in a fixture, several hundred live), so the same player crosses a band
 * because the denominator grew. Rank does not move, and "a top-twelve back" is the
 * sentence a manager already says.
 *
 * Stated as ceilings rather than floors, because rank counts the wrong way: 1 is best.
 * Single-starter positions get their own table. A twelfth-best quarterback starts in every
 * league in the world; a twelfth-best receiver is a first-round pick. One table calls them
 * the same thing and is wrong twice.
 */
interface RankBand {
  upTo: number;
  word: string;
  verdict: Verdict;
}

/** QB and TE: one starts per team, so the field is shallow. */
const RANK_SHALLOW: RankBand[] = [
  { upTo: 5, word: PLAYER.vibes.standing.elite, verdict: "good" },
  { upTo: 12, word: PLAYER.vibes.standing.starter, verdict: "good" },
  { upTo: 20, word: PLAYER.vibes.standing.flex, verdict: "flat" },
  { upTo: Infinity, word: PLAYER.vibes.standing.bench, verdict: "bad" },
];

/** RB and WR: two or three start per team, plus the flex, so the field runs deep. */
const RANK_DEEP: RankBand[] = [
  { upTo: 12, word: PLAYER.vibes.standing.elite, verdict: "good" },
  { upTo: 30, word: PLAYER.vibes.standing.starter, verdict: "good" },
  { upTo: 50, word: PLAYER.vibes.standing.flex, verdict: "flat" },
  { upTo: Infinity, word: PLAYER.vibes.standing.bench, verdict: "bad" },
];

export function rankBands(position: string | null | undefined): RankBand[] {
  const p = (position ?? "").toUpperCase();
  return p === "QB" || p === "TE" ? RANK_SHALLOW : RANK_DEEP;
}

/** Recent scoring against his own season. Form, not talent. */
const FORM: Band[] = [
  { from: 1.25, word: PLAYER.vibes.form.hot, verdict: "good" },
  { from: 1.08, word: PLAYER.vibes.form.warming, verdict: "good" },
  { from: 0.92, word: PLAYER.vibes.form.level, verdict: "flat" },
  { from: 0.75, word: PLAYER.vibes.form.cooling, verdict: "bad" },
  { from: 0, word: PLAYER.vibes.form.cold, verdict: "bad" },
];

/** Weeks of scoring before "recent form" means anything. Two games is two games. */
export const FORM_MIN_GAMES = 3;
/** Weeks a positional rank needs before it is a standing rather than a small sample. */
export const STANDING_MIN_GAMES = 3;
const FORM_WINDOW = 3;

/* ------------------------------------------------------------- the pieces --- */

type Group = "QB" | "RB" | "WR";

export function group(position: string | null | undefined): Group {
  const p = (position ?? "").toUpperCase();
  if (p === "QB") return "QB";
  if (p === "RB" || p === "FB" || p === "HB") return "RB";
  return "WR";
}

/** Both band shapes carry a word and a verdict, and that is all a row needs from one. */
function row(key: string, label: string, b: Pick<Band, "word" | "verdict">, mark: VibeRow["mark"]): VibeRow {
  return { key, label, word: b.word, verdict: b.verdict, mark };
}

/**
 * A base row is a question, so it gets a tick or a cross. A middling answer gets neither.
 *
 * A grey tick beside "Complementary" reads as approval in the corner of the eye, which is
 * exactly the glance this page is built for. Neither answer is a rule, the same mark a
 * flat trend gets, and it says what it means: this one is not a yes and not a no.
 */
function answer(v: Verdict): VibeRow["mark"] {
  if (v === "good") return "yes";
  if (v === "bad") return "no";
  return "level";
}

/** Is he on the field. Null snaps means the platform did not log them, which is not zero. */
function onTheField(now: ScoutSplit | null): VibeRow | null {
  if (!now || now.snap_pct === null || now.snap_pct === undefined) return null;
  return row("snaps", PLAYER.vibes.labels.snaps, band(now.snap_pct, SNAPS), answer(band(now.snap_pct, SNAPS).verdict));
}

/** Is the ball his. A quarterback is skipped: his snaps already answered it. */
function theWork(now: ScoutSplit | null, g: Group): VibeRow | null {
  if (!now || g === "QB") return null;
  const share = g === "RB" ? now.rush_share : now.target_share;
  if (share === null || share === undefined) return null;
  const b = band(share, g === "RB" ? RUSH_SHARE : TARGET_SHARE);
  return row("work", PLAYER.vibes.labels.work, b, answer(b.verdict));
}

/**
 * Where he sits at his position.
 *
 * Held back until the season has enough weeks behind it, because a rank after one game is
 * a rank *of* one game, and the man at the top of it after week one is usually someone who
 * caught two touchdowns and will not be there in a fortnight.
 */
function standing(now: ScoutSplit | null, position: string | null | undefined): VibeRow | null {
  if (!now || !now.pos_rank) return null;
  if ((now.games ?? 0) < STANDING_MIN_GAMES) return null;
  const rank = now.pos_rank;
  const bands = rankBands(position);
  const b = bands.find((x) => rank <= x.upTo) ?? bands[bands.length - 1];
  return row("standing", PLAYER.vibes.labels.standing, b, answer(b.verdict));
}

/** A trend row lifted straight off a read the engine already wrote, tone and all. */
function fromRead(reads: ScoutRead[], key: string, label: string): VibeRow | null {
  const r = reads.find((x) => x.key === key);
  if (!r) return null;
  const word = { up: PLAYER.vibes.dir.up, down: PLAYER.vibes.dir.down, flat: PLAYER.vibes.dir.level }[r.tone];
  const verdict: Verdict = r.tone === "up" ? "good" : r.tone === "down" ? "bad" : "flat";
  const mark = r.tone === "up" ? "up" : r.tone === "down" ? "down" : "level";
  return { key, label, word, verdict, mark };
}

/**
 * Hot or cold: his last few weeks against his own season average.
 *
 * Against himself, deliberately, not against his position. "Cold" here means *he* is below
 * what he has been doing, which is the question a manager is asking when he looks at a
 * name he already owns. Only weeks he actually played count -- a bye in the window would
 * otherwise read as the floor falling out.
 */
export function form(games: ScoutGame[], ppg: number | null | undefined): VibeRow | null {
  const played = games.filter((g) => g.played);
  if (played.length < FORM_MIN_GAMES || !ppg) return null;
  const window = played.slice(-FORM_WINDOW);
  const recent = window.reduce((sum, g) => sum + g.points, 0) / window.length;
  const b = band(recent / ppg, FORM);
  return row("form", PLAYER.vibes.labels.form, b, b.verdict === "good" ? "up" : b.verdict === "bad" ? "down" : "level");
}

/* ---------------------------------------------------------------- the view --- */

/**
 * The one sentence at the top, composed from the base rather than from the trend.
 *
 * The base is what he is, so it is what a headline should say. The trend is already three
 * rows of arrows underneath, and a headline that led with "usage is up" would sell a
 * backup having a good week as though he were a starter.
 */
function headline(base: VibeRow[], trend: VibeRow[]): string {
  const what = base.find((r) => r.key === "work") ?? base.find((r) => r.key === "snaps");
  const moving = trend.find((r) => r.verdict !== "flat");
  if (!what) return PLAYER.vibes.fallback;
  if (!moving) return PLAYER.vibes.headline.still(what.word);
  return moving.verdict === "good"
    ? PLAYER.vibes.headline.rising(what.word, moving.label)
    : PLAYER.vibes.headline.slipping(what.word, moving.label);
}

/**
 * The guard, run over the finished view rather than over the vocabulary.
 *
 * The vocabulary is already swept for digits, but a headline is *composed* at runtime out
 * of two words and a template, and that is where a number would actually get in. It throws
 * rather than filtering: a digit on this page is a bug in whatever produced it, and a
 * silently scrubbed sentence would hide it.
 */
export function assertWordsOnly(view: VibesView): void {
  const strings = [view.headline, ...[...view.base, ...view.trend].flatMap((r) => [r.label, r.word])];
  for (const s of strings) {
    if (/\d/.test(s)) throw new Error(`Vibes is words only, and this carries a number: ${s}`);
  }
}

export function vibesView(p: PlayerProfile): VibesView {
  const g = group(p.player.position);
  const now = p.this_season;
  const base = [onTheField(now), theWork(now, g), standing(now, p.player.position)].filter((r): r is VibeRow => r !== null);
  const trend = [
    // Role leads the trend even though the base has already said he starts, and the pair
    // is the point: "Starts" and "His role: Down" together say he is still out there and
    // losing ground, which is the sentence that gets him dropped a week before everyone
    // else works it out. Either tier alone says half of it.
    fromRead(p.reads, "role", PLAYER.vibes.labels.role),
    fromRead(p.reads, "volume", PLAYER.vibes.labels.usage),
    fromRead(p.reads, "chances", PLAYER.vibes.labels.chances),
    fromRead(p.reads, "efficiency", PLAYER.vibes.labels.efficiency),
    form(p.games, now?.ppg),
  ].filter((r): r is VibeRow => r !== null);

  const view: VibesView = {
    headline: headline(base, trend),
    base,
    trend,
    empty: base.length === 0 && trend.length === 0,
  };
  assertWordsOnly(view);
  return view;
}
