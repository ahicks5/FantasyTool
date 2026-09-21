// Pure helpers (no React, no DOM) so they can be unit tested with node:test.
import { signed } from "./format.ts";
import type { Action, ActionType } from "./types";
import { DEPARTMENT_ORDER, GROUP_ORDER, ROOM_ORDER, type DepartmentKey, type GroupKey, type RoomKey } from "./vocab.ts";

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

/**
 * A row on the sheet: a bench you work, or a room you read.
 *
 * The two are different in kind, not just in content, which is why this is a tagged union
 * rather than a bench with its calls left empty. A bench carries a verdict — a status line,
 * a stamp, a count, calls folded underneath — and all of that is a claim about *your team*.
 * A room carries none of it: nothing on the feed measures the film, so a row for it that
 * borrowed the bench's furniture would have to invent a verdict to fill it.
 *
 * `kind` is the discriminant so a renderer has to decide which it is holding before it can
 * read `items`; a nullable `items` would let a room quietly render as an empty bench.
 */
export type SheetRow =
  | { kind: "bench"; key: GroupKey; items: PlacedAction[] }
  | { kind: "room"; key: RoomKey };

/**
 * Every row on the call sheet, in reading order: the three benches, then the rooms.
 *
 * Built on `groupActions` rather than beside it, so there is still exactly one place that
 * decides which bench a call lands on. Benches come first and all three are always there —
 * that is `groupActions`' whole point, and the rooms sit under the week's work because you
 * work the sheet first and then go read about it.
 *
 * The rooms are constant. They are listed here anyway so the home screen renders one list
 * of rows instead of a list plus a hand-written tail: the front door is the map of the
 * building, and a room appended by the page is a room the next page forgets.
 */
export function sheetRows(actions: Action[]): SheetRow[] {
  const benches: SheetRow[] = groupActions(actions).map(({ key, items }) => ({ kind: "bench", key, items }));
  const rooms: SheetRow[] = ROOM_ORDER.map((key) => ({ kind: "room", key }));
  return [...benches, ...rooms];
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
