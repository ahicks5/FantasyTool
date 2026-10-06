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
import type { Lineup, LineupSlot, Matchup, Player } from "./types";
import { liveValue } from "./gameday.ts";
import { pct } from "./format.ts";
import { WEEK } from "./vocab.ts";

export interface SlotDuel {
  /** Slot label from the league's own starting slots: QB, RB, FLEX, DEF… */
  slot: string;
  mine: Player | null;
  theirs: Player | null;
  /** Mine minus theirs, at this slot. Positive is points you win the slot by. */
  margin: number;
  /** Which side this slot belongs to. `even` is a margin inside `EVEN_MARGIN`, or a dead
   *  heat once both men have played. */
  edge: "mine" | "theirs" | "even";
  /**
   * How the margin was reached (W-017): `final` when both men have played (actual minus
   * actual), `live` when either has kicked off (actual so far + the projection still to
   * come), `proj` before either has. The row says which, so a projected margin never sits
   * bare beside a final score.
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

/** His number as the week stands, rounded the way the row prints it (`liveValue`). */
export const live = (p: Player | null): number => Math.round(liveValue(p) * 10) / 10;

const played = (p: Player | null) => !!p && (p.game === "in" || p.game === "final");
/** Done for the week: his game is over, or he has none (no team, empty slot). */
const done = (p: Player | null) => !p || p.game === "final" || !p.nfl_team;

function duel(slot: string, mine: LineupSlot | undefined, theirs: LineupSlot | undefined): SlotDuel {
  const a = mine?.player ?? null;
  const b = theirs?.player ?? null;
  const state = played(a) || played(b) ? (done(a) && done(b) ? "final" : "live") : "proj";
  const margin = +(live(a) - live(b)).toFixed(1);
  // Once both have played, a point is a point: only a dead heat is even. Before that the
  // even band is the projection's noise, and a live slot still has projection in it.
  const band = state === "final" ? 0.05 : EVEN_MARGIN;
  return {
    slot,
    mine: a,
    theirs: b,
    margin,
    edge: Math.abs(margin) < band ? "even" : margin > 0 ? "mine" : "theirs",
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
export function matchupCall(myProj: number, theirProj: number): string {
  const d = myProj - theirProj;
  const a = Math.abs(d);
  if (a < 3) return "Coin flip. This one comes down to the slate.";
  if (a < 10) return d > 0 ? "You're ahead, not safe. Make every call." : "You're behind. You need the swaps.";
  if (a < 20) return d > 0 ? "You're the favourite. Don't give it back." : "Uphill. Take the upside everywhere.";
  return d > 0 ? "Comfortable. Bank it." : "Long shot. Swing on every slot.";
}

/**
 * The matchup's hero, read one way for the desk card and the full page (W-013, W-017).
 *
 * Before kickoff: the two projections and the pre-game odds. Once a starter has played:
 * the points on the board, the live totals under them ("projects 131.2"), odds labelled
 * "· live", and the staff's line chosen from the live margin. Once every starter on both
 * sides has played: the final score and "Final. Lost by 1.7." in place of the odds. An
 * older API build that sends no `state` reads as before, from `live` and the points.
 */
export interface MatchupRead {
  state: "pre" | "live" | "final";
  myBig: number;
  theirBig: number;
  /** Under each big number: the live total while games are on, else null. */
  mySub: number | null;
  theirSub: number | null;
  /** The odds, labelled, or null when there are none to show (final, or no odds). */
  odds: string | null;
  /** The share of the meter on your side, 0..1. */
  share: number;
  /** The margin the well prints, and the staff's line beside it. */
  diff: number;
  line: string;
}

export function matchupRead(m: Matchup): MatchupRead {
  const theirProj = m.their_proj ?? 0;
  const state = m.state ?? (m.live && m.my_points != null && m.their_points != null ? "live" : "pre");
  const share = m.win_prob ?? 0.5;
  if (state === "pre") {
    return {
      state, myBig: m.my_proj, theirBig: theirProj, mySub: null, theirSub: null,
      odds: m.win_prob != null ? WEEK.odds.pre(pct(share)) : null, share,
      diff: m.my_proj - theirProj, line: matchupCall(m.my_proj, theirProj),
    };
  }
  const myBig = m.my_points ?? 0;
  const theirBig = m.their_points ?? 0;
  if (state === "final") {
    const diff = +(myBig - theirBig).toFixed(1);
    const by = Math.abs(diff).toFixed(1);
    return {
      state, myBig, theirBig, mySub: null, theirSub: null, odds: null, share: diff > 0 ? 1 : diff < 0 ? 0 : 0.5,
      diff, line: diff > 0 ? WEEK.final.won(by) : diff < 0 ? WEEK.final.lost(by) : WEEK.final.tied,
    };
  }
  const myLive = m.my_live ?? myBig;
  const theirLive = m.their_live ?? theirBig;
  return {
    state, myBig, theirBig, mySub: m.my_live ?? null, theirSub: m.their_live ?? null,
    odds: m.win_prob != null ? WEEK.odds.live(pct(share)) : null, share,
    diff: myLive - theirLive, line: matchupCall(myLive, theirLive),
  };
}
