// Pure helpers (no React, no DOM) so they can be unit tested with node:test.
import { signed } from "./format.ts";
import type { Action, ActionType } from "./types";
import { GROUP_ORDER, type GroupKey } from "./vocab.ts";

/**
 * An action together with the place it held in the server's ranking of the whole sheet.
 *
 * The number printed in a card's margin is that rank, not the card's position inside its
 * group. `actions.py` scores every call against every other one and sorts the feed, so
 * renumbering within a group would print "01" on both the top lineup fix and the top
 * waiver claim and quietly throw away the only ordering the engine actually asserts.
 */
export interface PlacedAction {
  action: Action;
  /** 1-based position in `feed.actions`. */
  n: number;
}

/** One bench on the call sheet. Always present, even when it holds nothing. */
export interface ActionGroup {
  key: GroupKey;
  items: PlacedAction[];
}

/**
 * Which tab owns a call, keyed by the first segment of its CTA href.
 *
 * The href is the authority and the type is only a fallback, because the two disagree on
 * exactly the case that matters: `waiver:hold` is typed `hold` and carries the `my_team`
 * feature, but its CTA is "See the wire" → `/waivers`. It is the staff saying the wire is
 * quiet, so it belongs under Scouting; filed under the lineup it reads as a claim about
 * your starters, which it is not.
 */
const HREF_GROUP: Record<string, GroupKey> = { team: "team", waivers: "waivers", trade: "trade" };

/** Used only when a CTA points somewhere this map has never heard of. */
const TYPE_GROUP: Record<ActionType, GroupKey> = {
  start: "team",
  waiver: "waivers",
  trade: "trade",
  hold: "team",
};

/** The first path segment of a CTA href, with any query or hash dropped. */
function firstSegment(href: string): string {
  return href.replace(/[?#].*$/, "").split("/").filter(Boolean)[0] ?? "";
}

/** The group a CTA points at, or null if the href is not one of the three tabs. */
export function groupForHref(href: string): GroupKey | null {
  return HREF_GROUP[firstSegment(href)] ?? null;
}

export function groupFor(a: Action): GroupKey {
  return groupForHref(a.cta.href) ?? TYPE_GROUP[a.type];
}

/**
 * Partition the feed into the three benches, in `GROUP_ORDER`, always all three.
 *
 * Returning the empty ones is the entire point of the grouping: a settled lineup
 * contributes no `start` action at all, so a flat list of cards cannot answer "is my
 * lineup set?" — it can only fail to mention it.
 */
export function groupActions(actions: Action[]): ActionGroup[] {
  const buckets = new Map<GroupKey, PlacedAction[]>(GROUP_ORDER.map((k) => [k, []]));
  actions.forEach((action, i) => {
    // `?? team` is a runtime guard, not a type one: an action type the server adds after
    // this build shipped must land on a bench rather than disappear off the sheet.
    const bucket = buckets.get(groupFor(action)) ?? buckets.get("team")!;
    bucket.push({ action, n: i + 1 });
  });
  return GROUP_ORDER.map((key) => ({ key, items: buckets.get(key)! }));
}

/** A hold is the staff telling you to stand pat. It is not a move, so it is not counted. */
const isMove = (p: PlacedAction) => p.action.type !== "hold";

/**
 * What a group row says when it has calls on it: how many, and what they are worth.
 *
 * `null` means the bench is clear and the row shows `GROUPS[key].clear` and its stamp
 * instead. A group holding nothing but a hold is clear — the hold is the reason, which
 * is why the row still opens.
 *
 * The wording lives here rather than in `vocab.ts` for the same reason `sheetStatus`
 * lives in `format.ts`: vocab holds the names of rooms and the brand's lines, and a
 * string that only exists as the output of a formatter belongs with the formatter.
 * "move" is what the engine already calls them in `feed.summary`.
 */
export function groupStatus(key: GroupKey, items: PlacedAction[]): string | null {
  const moves = items.filter(isMove);
  if (!moves.length) return null;
  const worth = worthText(key, moves);
  const count = `${moves.length} move${moves.length === 1 ? "" : "s"}`;
  return worth ? `${count} · ${worth}` : count;
}

/**
 * The figure on a group row, and it is never arithmetic we invented.
 *
 * Lineup fixes are independent slot swaps, so their gains genuinely add and the row can
 * quote the total. Waiver claims are ranked *alternatives* — `actions.py` labels the
 * second one "Fallback: add …" — so adding them up would promise points you cannot both
 * have. Those groups quote the leading call's own `benefit`, the string the server chose
 * to print on the card face.
 *
 * That also settles the paywall: a locked teaser's `benefit` is server-supplied, so
 * repeating it leaks nothing, while `benefit_value` is only ever summed for calls the
 * user has already paid to see.
 */
function worthText(key: GroupKey, moves: PlacedAction[]): string {
  if (key === "team") {
    const total = moves.filter((p) => !p.action.locked).reduce((sum, p) => sum + p.action.benefit_value, 0);
    return total > 0.05 ? `${signed(total)} pts` : "";
  }
  return moves[0]?.action.benefit ?? "";
}
