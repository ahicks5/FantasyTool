/**
 * Position Battle, minus React: the corner lists, the clash's clock, and the tape's geometry.
 *
 * Pure (no React, no DOM, no clock read at load), so every rule the page draws by is
 * tested with `node --test` (`battle.test.ts`). Every number is the engine's
 * (`edge/engine/battle.py`); this file only decides how it is laid out.
 */
import type { Battle, BattleBrief, BattleFamily, BattleHorizon, BattleOptions, BattleRow, BattleSide, BattleWeek } from "./types";

/* ------------------------------------------------------------ the corner --- */

export type CornerTab = "roster" | "wire" | "trade";
export const CORNER_TABS: readonly CornerTab[] = ["roster", "wire", "trade"];

/** Lower-case, accents off, punctuation out: "Ja'Marr" is "jamarr". */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "");
}

/**
 * One corner's list, cut by position and by name.
 *
 * A typed name searches all three corners at once -- a manager typing "Shakir" does not
 * know or care whether he is on the wire -- so the tab is only honoured with an empty box.
 */
export function cornerList(o: BattleOptions, tab: CornerTab, pos: string | null, q: string): BattleBrief[] {
  const needle = fold(q.trim());
  const rows = needle ? [...o.roster, ...o.wire, ...o.trade] : o[tab];
  return rows.filter((r) => (!pos || r.position === pos) && (!needle || fold(r.name).includes(needle)));
}

/** The tab to open on: your own roster when it has anyone to offer, else the wire. */
export function firstTab(o: BattleOptions, pos: string | null): CornerTab {
  return CORNER_TABS.find((t) => cornerList(o, t, pos, "").length > 0) ?? "roster";
}

/* ------------------------------------------------------------- the clash --- */

/**
 * The clash's schedule, in milliseconds from the moment the challenger is picked.
 *
 * Lead-up first, because the hit means nothing without it: the blue corner walks out, the
 * red corner walks out, both wind back, then they meet. The verdict slams once the hit has
 * landed AND the judges are back (the API call); if they are slow, the stage holds on the
 * charge rather than slamming a word it does not have.
 */
export const CLASH = {
  BLUE_MS: 650,
  RED_MS: 650,
  WIND_MS: 700,
  HIT_MS: 520,
  VERDICT_MS: 1100,
  OUT_MS: 380,
} as const;

export type ClashPhase = "blue" | "red" | "wind" | "hit" | "verdict" | "out" | "done";

const T_RED = CLASH.BLUE_MS;
const T_WIND = T_RED + CLASH.RED_MS;
const T_HIT = T_WIND + CLASH.WIND_MS;
const T_VERDICT = T_HIT + CLASH.HIT_MS;
/** The earliest the stage can hand over to the page. */
export const CLASH_MIN_MS = T_VERDICT + CLASH.VERDICT_MS + CLASH.OUT_MS;

/**
 * Where the stage is at `t` ms. `ready` is the judges: until the result is in, the stage
 * holds on the wind-up rather than hitting, and the verdict starts counting from when it
 * landed (`readyAt`), so a slow API never cuts the slam short.
 */
export function clashPhase(t: number, readyAt: number | null): ClashPhase {
  if (t < T_RED) return "blue";
  if (t < T_WIND) return "red";
  const hitAt = Math.max(T_HIT, readyAt ?? Infinity);
  if (t < hitAt) return "wind";
  if (t < hitAt + CLASH.HIT_MS) return "hit";
  if (t < hitAt + CLASH.HIT_MS + CLASH.VERDICT_MS) return "verdict";
  if (t < hitAt + CLASH.HIT_MS + CLASH.VERDICT_MS + CLASH.OUT_MS) return "out";
  return "done";
}

/* ----------------------------------------------------------- the verdict --- */

export const HORIZON_ORDER = ["week", "next5", "ros", "playoffs"] as const;

/** The last word of a name, for a tile: "St. Brown", not "Amon-Ra St. Brown". */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  if (/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(last) && parts.length > 2) return parts[parts.length - 2];
  if (parts.length > 2 && /^(st\.?|de|van|von|la|le)$/i.test(parts[parts.length - 2])) {
    return `${parts[parts.length - 2]} ${last}`;
  }
  return last;
}

/** The winner's percentage for this week, never 0 or 100. Null for the longer windows. */
export function chancePct(h: BattleHorizon): number | null {
  if (h.p == null) return null;
  return Math.min(99, Math.max(1, Math.round(h.p * 100)));
}

/** The horizon's lead as a share of the bar, 0..1 for the blue corner. Even at 0.5. */
export function horizonSplit(h: BattleHorizon): number {
  const total = Math.max(0, h.a) + Math.max(0, h.b);
  if (total <= 0) return 0.5;
  return clamp(Math.max(0, h.a) / total, 0.06, 0.94);
}

/* -------------------------------------------------------------- the tape --- */

export const FAMILY_ORDER: readonly BattleFamily[] = ["outlook", "season", "usage", "risk", "schedule", "situation", "depth"];

/** The tape, grouped by family in reading order. A family with no rows is left out. */
export function families(rows: BattleRow[]): { family: BattleFamily; rows: BattleRow[] }[] {
  return FAMILY_ORDER.map((family) => ({ family, rows: rows.filter((r) => r.family === family) })).filter(
    (f) => f.rows.length > 0,
  );
}

/** Rows where a smaller number is the better one: a rank, a depth order, sacks, injuries. */
export const LOWER_BETTER = new Set(["rank_week", "rank_ros", "rank_season", "depth", "sacks", "line_hurt"]);
/** Rows whose number is a label's position on a scale, not an amount: no bar under them. */
export const NO_BAR = new Set([
  "style", "spread", "team_change", "experience", "handcuff", "ahead", "buzz", "bye", "around", "health", "snap_trend",
]);

/**
 * The tug-of-war under a row: the blue corner's share of the bar, or null for no bar.
 *
 * Only for amounts, where "more of it" is a comparison a bar can honestly show. A rank is
 * turned round (lower is better) before it is split, so the longer half is always the
 * better man's; the edge itself is the engine's, never this.
 */
export function tug(row: BattleRow): number | null {
  if (NO_BAR.has(row.key)) return null;
  let a = row.a.v;
  let b = row.b.v;
  if (a == null || b == null || a < 0 || b < 0) return null;
  if (LOWER_BETTER.has(row.key)) {
    a = 1 / Math.max(a, 0.5);
    b = 1 / Math.max(b, 0.5);
  }
  if (a + b <= 0) return 0.5;
  return clamp(a / (a + b), 0.06, 0.94);
}

/** How a week on the road reads: the engine's rank against the position, in thirds. */
export function weekTone(w: BattleWeek): "soft" | "average" | "tough" | "bye" | "none" {
  if (w.bye) return "bye";
  if (w.rank == null || !w.of) return "none";
  if (w.rank > (w.of * 2) / 3) return "soft";
  if (w.rank <= w.of / 3) return "tough";
  return "average";
}

/** Who leads a family's rows, for the tick beside its heading. */
export function familyLead(rows: BattleRow[]): BattleSide | null {
  const a = rows.filter((r) => r.edge === "a").length;
  const b = rows.filter((r) => r.edge === "b").length;
  return a > b ? "a" : b > a ? "b" : null;
}

/* ------------------------------------------------------------ the share --- */

/** What the share button sends. The API strips it again (`share.battle_snapshot`). */
export function shareBody(battle: Battle) {
  return {
    spot: battle.spot,
    a: battle.a,
    b: battle.b,
    horizons: battle.horizons,
    headline: battle.headline,
    tally: battle.tally,
  };
}

/* --------------------------------------------------------------- the url --- */

/** `/team/battle?a=` for a page, `&b=` once a challenger is in. */
export function battleHref(a: string, b?: string | null): string {
  const q = new URLSearchParams({ a });
  if (b) q.set("b", b);
  return `/team/battle?${q.toString()}`;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
