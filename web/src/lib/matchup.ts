/**
 * The week's head-to-head, worked out slot by slot.
 *
 * Deliberately pure and client-side. Both lineups come from the *existing* free
 * `/lineup` endpoint — the flex-aware optimiser still owns who starts where, and the
 * two totals it returns are the same numbers `report.matchup` puts on the call sheet —
 * so this file only has to line the two sheets up against each other. That means no
 * new API surface, and the breakdown works against an API that is already deployed.
 *
 * The pairing is positional on purpose. Both sides are built from the same
 * `league.starting_slots` in the same order, so slot *i* on your sheet and slot *i* on
 * theirs are the same slot. Matching by slot *name* instead would collapse the two
 * FLEXes (and the two RBs, and the two WRs) into one bucket and silently drop half the
 * lineup. A league whose rosters disagree on length — which should not happen, but a
 * connector bug is not a reason to render nonsense — pairs what it can and leaves the
 * short side empty.
 */
import type { Lineup, LineupSlot, Player } from "./types";

export interface SlotDuel {
  /** Slot label from the league's own starting slots: QB, RB, FLEX, DEF… */
  slot: string;
  mine: Player | null;
  theirs: Player | null;
  /** Mine minus theirs, at this slot. Positive is points you win the slot by. */
  margin: number;
  /** Which side this slot belongs to. `even` is a margin inside `EVEN_MARGIN`. */
  edge: "mine" | "theirs" | "even";
  /**
   * What the margin is made of (W-017): `final` when both men have played (actual minus
   * actual), `live` when either is on the field or one has played and one has not, `proj`
   * before either kicks off. The row says which, so a projection never passes for a result.
   */
  state: "final" | "live" | "proj";
}

/**
 * Under this many points a slot is not an advantage, it is noise.
 *
 * It is the same 1.5 the engine uses to stop calling a swap: below that gap the higher
 * projection wins barely half the time (docs/BACKTEST.md), so a slot inside it has not
 * been won by anybody and the sheet says so rather than colouring it in.
 */
export const EVEN_MARGIN = 1.5;

/**
 * A projection as the row will print it.
 *
 * Rounded *before* the subtraction on purpose. The engine carries two decimals, so a
 * slot printing 11.0 against 9.1 was labelled +1.8 — correct to the raw numbers and
 * wrong to every number on screen. A row has to add up in the arithmetic the reader
 * can actually do.
 */
export const proj = (p: Player | null): number => Math.round((p?.projected ?? 0) * 10) / 10;

/**
 * The same number as a string, for the row to print.
 *
 * Exported so the page cannot reach for `toFixed` itself: `toFixed` and `Math.round`
 * disagree on an exact half (10.25 → "10.2" vs 10.3), and a row whose figure and whose
 * margin rounded by different rules is the bug this pair exists to prevent.
 */
export const printProj = (p: Player | null): string => proj(p).toFixed(1);

/** A man's game is over and his number is a result. */
const played = (p: Player | null): boolean => !!p && p.game === "final" && p.points != null;
const onField = (p: Player | null): boolean => !!p && p.game === "in" && p.points != null;

/**
 * What a man is worth to the slot right now, rounded the way the row prints it. A finished
 * man is his points. A man on the field is his points plus half of what he has left against
 * his projection (`IN_LEFT` in edge/engine/report.py, so the page and the win chance agree).
 * A man yet to play is his projection.
 */
export function worth(p: Player | null): number {
  if (!p) return 0;
  if (played(p)) return Math.round(p.points! * 10) / 10;
  if (onField(p)) return Math.round((p.points! + Math.max(0, (p.projected ?? 0) - p.points!) * 0.5) * 10) / 10;
  return proj(p);
}

function duel(slot: string, mine: LineupSlot | undefined, theirs: LineupSlot | undefined): SlotDuel {
  const a = mine?.player ?? null;
  const b = theirs?.player ?? null;
  const done = (p: Player | null) => !p || played(p);
  const state: SlotDuel["state"] = done(a) && done(b) && (played(a) || played(b)) ? "final" : played(a) || played(b) || onField(a) || onField(b) ? "live" : "proj";
  const margin = +(worth(a) - worth(b)).toFixed(1);
  // A finished slot is won by any margin: "Even" is for a projection too close to call, not
  // for 16.0 against 8.0 after the whistle.
  const even = state === "final" ? margin === 0 : Math.abs(margin) < EVEN_MARGIN;
  return {
    slot,
    mine: a,
    theirs: b,
    margin,
    edge: even ? "even" : margin > 0 ? "mine" : "theirs",
    state,
  };
}

/** One row per starting slot, in the league's own slot order. */
export function slotDuels(mine: Lineup, theirs: Lineup): SlotDuel[] {
  const n = Math.max(mine.slots.length, theirs.slots.length);
  return Array.from({ length: n }, (_, i) => {
    const a = mine.slots[i];
    const b = theirs.slots[i];
    return duel(a?.slot ?? b?.slot ?? "—", a, b);
  });
}

export interface MatchupSplit {
  duels: SlotDuel[];
  /** Slots each side wins by more than `EVEN_MARGIN`, and the ones too close to call. */
  won: number;
  lost: number;
  even: number;
  /** The slot you win by most, and the one you lose by most. Null when there is no such slot. */
  best: SlotDuel | null;
  worst: SlotDuel | null;
}

/**
 * The whole comparison in one object, so the page renders it rather than computing it.
 *
 * `best` and `worst` ignore even slots: the point of naming them is "this is where the
 * game is", and a slot nobody has won is not where the game is.
 */
export function splitMatchup(mine: Lineup, theirs: Lineup): MatchupSplit {
  const duels = slotDuels(mine, theirs);
  const decided = duels.filter((d) => d.edge !== "even");
  const ranked = [...decided].sort((x, y) => y.margin - x.margin);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  return {
    duels,
    won: duels.filter((d) => d.edge === "mine").length,
    lost: duels.filter((d) => d.edge === "theirs").length,
    even: duels.filter((d) => d.edge === "even").length,
    best: top && top.margin > 0 ? top : null,
    worst: bottom && bottom.margin < 0 ? bottom : null,
  };
}

/**
 * The read on the game, in the staff's voice: verb first, one line, no hedging past
 * what the number supports.
 *
 * The bands are the confidence tags the rest of the app is validated on — a four-point
 * lineup margin is a Lock, 1.5 to 4 is a Lean, under that is a coin flip — applied to
 * the difference between two whole lineups rather than one slot. Kept here, beside the
 * split, so the call sheet cell and the breakdown page cannot say different things.
 */
export function matchupCall(myProj: number, theirProj: number, final = false): string {
  const d = myProj - theirProj;
  // Over: the line is the result, never "comes down to the slate" (W-017).
  if (final) {
    const by = Math.abs(d).toFixed(1);
    return d > 0 ? `Final. Won by ${by}.` : d < 0 ? `Final. Lost by ${by}.` : "Final. A tie.";
  }
  const a = Math.abs(d);
  if (a < 3) return "Coin flip. This one comes down to the slate.";
  if (a < 10) return d > 0 ? "You're ahead, not safe. Make every call." : "You're behind. You need the swaps.";
  if (a < 20) return d > 0 ? "You're the favourite. Don't give it back." : "Uphill. Take the upside everywhere.";
  return d > 0 ? "Comfortable. Bank it." : "Long shot. Swing on every slot.";
}
