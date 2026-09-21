// Pure helpers (no React, no DOM) so they can be unit tested with node:test.
import type { Action, ActionType } from "./types";
import { DEPARTMENT_ORDER, GROUP_ORDER, type DepartmentKey, type GroupKey } from "./vocab.ts";

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

/** One department's calls. Always present, even when it holds nothing. */
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

/* ------------------------------------------------------------------ memos ---
   The Debrief is four memos, one per department, each holding the single thing
   that department most wants the owner to see. `groupActions` above still does
   the filing; this decides which one call comes out of each drawer.            */

/**
 * One department's memo: who is talking, the one item, and what is behind it.
 *
 * `item` is null when the department has nothing left to show — either it sent
 * nothing this week, or everything it sent has been thumbed down — and the memo
 * prints `GROUPS[key].clear` instead. `report` is always null: nothing on the
 * feed measures the film, so the film room's memo is built from last week's
 * result rather than from a call (D6).
 */
export interface Memo {
  key: DepartmentKey;
  item: PlacedAction | null;
  /**
   * How many more items this memo could still show you, behind the one it is.
   *
   * It counts what the **Debrief** has left, not what the tab holds: a dismissed
   * item is gone from this page for the week (D5) and stays on the depth chart,
   * the wire and the trade board, so counting it here would offer a card the
   * thumb has already refused. The lineup's number is overridden by the page
   * from `lineup.changes.length`, because the feed is capped at five actions and
   * drops swaps inside the noise band the depth chart still lists.
   */
  more: number;
}

/**
 * Whether a thumbs-down may take this item off the Debrief.
 *
 * Two kinds of card are exempt, and it is the same predicate that decides which
 * cards wear the thumbs at all.
 *
 * A **locked teaser** is the department reporting that it found something, with
 * the names withheld until the pass is bought. There is nothing there to be
 * wrong about yet, so there is nothing to reject — and a dismissal would quietly
 * delete the upsell rather than answer it.
 *
 * A **hold** is the staff telling you to stand pat. It is the reason the wire is
 * quiet, not a move, so it cannot be ticked off and it cannot be waved away;
 * hiding it would leave the memo asserting the same quiet with nothing behind it.
 */
export function dismissable(a: Action): boolean {
  return !a.locked && a.type !== "hold";
}

/**
 * The four memos, in tab order, always all four.
 *
 * Built on `groupActions` for the same reason `sheetRows` is: one place decides
 * which department owns a call. The item is the highest-ranked survivor of
 * `dismissed` in feed order, which is the server's ranking across the whole
 * sheet — `actions.py` scores every call against every other one, so "the top
 * item" means the top one the engine ranked, never the first one that happens to
 * be filed here.
 *
 * `dismissed` holds ids the reader thumbed down this week on this device. Ids
 * that are not on this week's feed are simply never matched, so a stale key
 * cannot hide a call it was never about.
 */
export function memos(actions: Action[], dismissed: readonly string[] = []): Memo[] {
  const gone = new Set(dismissed);
  const live = new Map<DepartmentKey, PlacedAction[]>(
    groupActions(actions).map(({ key, items }) => [
      key,
      items.filter(({ action }) => !(dismissable(action) && gone.has(action.id))),
    ]),
  );
  return DEPARTMENT_ORDER.map((key) => {
    const items = live.get(key) ?? [];
    return { key, item: items[0] ?? null, more: Math.max(0, items.length - 1) };
  });
}
