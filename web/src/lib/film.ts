/**
 * The replay, worked out: one finished week turned into the cards the page draws.
 *
 * Pure (no React, no DOM, no fetching) so the rules are unit tested. The engine
 * (`edge/engine/film.py`) owns every number and every sentence about a player; this module
 * only decides which cards a week earns and in what order, and picks the two players the
 * story is about. SPEC-FILM §3 is the order: the game, the swing, your lineup, the man who
 * carried you, the man who let you down, the injuries, every starter, then the takeaway.
 *
 * A card is left out rather than drawn empty. A week with no flop has no "let you down"
 * card, and an ESPN week with a scoreline and no players is the game and nothing else.
 */
import type { FilmAttribution, FilmHistory, WeekFilm } from "./types";
import { FILM } from "./vocab.ts";

export type CardKey = keyof typeof FILM.card;

/** The cards this week earns, in the order they are told. */
export function storyCards(w: WeekFilm): CardKey[] {
  const out: CardKey[] = ["game"];
  if (w.swing?.line) out.push("swing");
  if (w.lineup) out.push("lineup");
  if (standout(w)) out.push("standout");
  if (dud(w)) out.push("dud");
  if (w.injuries.length > 0) out.push("injuries");
  if (starters(w).length > 0) out.push("starters");
  out.push("takeaway");
  return out;
}

export function starters(w: WeekFilm): FilmAttribution[] {
  return w.attributions.filter((a) => a.started);
}

/**
 * The starter who went furthest past his projection, if anyone went off.
 *
 * A starter, not a bench man: "the one who carried you" has to have been in the lineup.
 * The bench man who went off is in the swing and the starters card already.
 */
export function standout(w: WeekFilm): FilmAttribution | null {
  const off = starters(w).filter((a) => a.verdict === "went_off" && a.delta !== null);
  return off.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0] ?? null;
}

/** The starter who fell furthest under his projection. Injuries have their own card. */
export function dud(w: WeekFilm): FilmAttribution | null {
  const flops = starters(w).filter((a) => a.verdict === "flopped" && a.delta !== null);
  return flops.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0] ?? null;
}

/** True when any starter's projection is the vendor's stored number, so the note shows. */
export function hasPlatformSource(w: WeekFilm): boolean {
  return starters(w).some((a) => a.source === "platform");
}

/** His season in one line: the best-since when it is his best game, else where it ranks. */
export function historyLine(h: FilmHistory | null): string | null {
  if (!h) return null;
  if (h.best_since) {
    return h.best_since.earliest
      ? FILM.history.earliest(h.best_since.season)
      : FILM.history.since(h.best_since.season, h.best_since.week);
  }
  if (h.weeks < 2) return null;
  return FILM.history.rank(h.rank_this_season, h.weeks);
}

/** Went over had, 0..1 each, on one scale: the two bars on the lineup card. */
export function lineupBars(lineup: NonNullable<WeekFilm["lineup"]>): { scored: number; best: number } {
  const top = Math.max(lineup.best_possible, lineup.points, 1);
  return { scored: lineup.points / top, best: lineup.best_possible / top };
}

/** The tone a verdict wears: good, bad, or none. Colour is never the only channel. */
export function verdictTone(v: FilmAttribution["verdict"]): "good" | "bad" | null {
  if (v === "went_off") return "good";
  if (v === "flopped" || v === "hurt_pregame" || v === "hurt_in_game" || v === "did_not_play") return "bad";
  return null;
}
