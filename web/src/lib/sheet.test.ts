import { test } from "node:test";
import assert from "node:assert/strict";
import { dismissable, groupActions, groupFor, groupForHref, memos, type PlacedAction } from "./sheet.ts";
import type { Action, ActionType, Feature } from "./types.ts";
import { DEPARTMENT_ORDER } from "./vocab.ts";

const FEATURE: Record<ActionType, Feature> = {
  start: "my_team",
  waiver: "waivers",
  trade: "trade_lab",
  hold: "my_team",
};

/** The shape `edge/engine/actions.py` builds, with only the fields under test spelled out. */
function action(type: ActionType, href: string, over: Partial<Action> = {}): Action {
  return {
    id: `${type}:1`,
    type,
    feature: FEATURE[type],
    locked: false,
    priority: 1,
    title: "Start Jacobs over Pollard",
    subtitle: "RB2 · RB GB",
    benefit: "+4.1 pts",
    benefit_value: 4.1,
    confidence: "Lock",
    reason: "He is the better play.",
    why: [],
    players: [],
    cta: { label: "Depth chart", href },
    ...over,
  };
}

const keys = (gs: ReturnType<typeof groupActions>) => gs.map((g) => g.key);
const ids = (items: PlacedAction[]) => items.map((p) => p.action.id);

test("every action type lands on the department its CTA points at", () => {
  const feed = [
    action("start", "/team", { id: "a" }),
    action("waiver", "/waivers", { id: "b" }),
    action("trade", "/trade?their=4&give=x&get=y", { id: "c" }),
    action("hold", "/waivers", { id: "d" }),
  ];
  const groups = groupActions(feed);
  assert.deepEqual(keys(groups), ["team", "waivers", "trade"]);
  assert.deepEqual(ids(groups[0].items), ["a"]);
  assert.deepEqual(ids(groups[1].items), ["b", "d"]);
  assert.deepEqual(ids(groups[2].items), ["c"]);
});

test("a hold belongs to scouting, not the lineup", () => {
  // The only hold the engine builds is `waiver:hold`, and it is typed `hold` with the
  // `my_team` feature — mapping on type would file "no waiver claim worth making" under
  // the depth chart. The href is what makes it right.
  const hold = action("hold", "/waivers", { id: "waiver:hold", feature: "my_team" });
  assert.equal(groupFor(hold), "waivers");
});

test("a query string does not hide the trade board", () => {
  assert.equal(groupForHref("/trade?their=4&give=a,b&get=c"), "trade");
  assert.equal(groupForHref("/trade"), "trade");
});

test("an unknown destination falls back to the action type", () => {
  assert.equal(groupForHref("/pricing"), null);
  assert.equal(groupFor(action("waiver", "/pricing")), "waivers");
  assert.equal(groupFor(action("trade", "/")), "trade");
  assert.equal(groupFor(action("start", "/somewhere/new")), "team");
  // Type is the only signal left here, and by type a hold is a lineup note.
  assert.equal(groupFor(action("hold", "/somewhere/new")), "team");
});

test("an empty feed still produces all three working departments", () => {
  const groups = groupActions([]);
  assert.deepEqual(keys(groups), ["team", "waivers", "trade"]);
  assert.deepEqual(groups.map((g) => g.items.length), [0, 0, 0]);
});

test("play numbers keep their place in the server's ranking", () => {
  // Second on the sheet overall is the first card in its own group; it still prints 02.
  const feed = [
    action("start", "/team", { id: "a" }),
    action("trade", "/trade", { id: "b" }),
    action("start", "/team", { id: "c" }),
  ];
  const groups = groupActions(feed);
  assert.deepEqual(groups[0].items.map((p) => p.n), [1, 3]);
  assert.deepEqual(groups[2].items.map((p) => p.n), [2]);
});

/* ------------------------------------------------------------------ memos ---
   The Debrief's unit. One per department, always all four, each holding the one
   item that department most wants seen and a count of what is behind it.        */

const memoKeys = (ms: ReturnType<typeof memos>) => ms.map((m) => m.key);
const memoById = (ms: ReturnType<typeof memos>, key: string) => ms.find((m) => m.key === key)!;

test("an empty feed still prints all four memos", () => {
  // Same reason the empty bench was the point: a settled lineup contributes no action
  // at all, so a page built from the feed alone could only fail to mention it. Four
  // memos, four clear lines, four doors.
  const ms = memos([]);
  assert.deepEqual(memoKeys(ms), [...DEPARTMENT_ORDER]);
  for (const m of ms) {
    assert.equal(m.item, null);
    assert.equal(m.more, 0);
  }
});

test("each memo holds its department's top-ranked call, and counts the rest", () => {
  // Feed order is the server's ranking across the whole sheet, so "top" means the one
  // the engine ranked highest, never the first one filed here.
  const feed = [
    action("trade", "/trade", { id: "t1" }),
    action("start", "/team", { id: "s1" }),
    action("start", "/team", { id: "s2" }),
    action("waiver", "/waivers", { id: "w1" }),
    action("start", "/team", { id: "s3" }),
  ];
  const ms = memos(feed);
  assert.equal(memoById(ms, "team").item?.action.id, "s1");
  assert.equal(memoById(ms, "team").more, 2);
  // The play number rides along, because it is the server's rank and not a position
  // inside the memo — "02" on the head coach's memo is second on the whole sheet.
  assert.equal(memoById(ms, "team").item?.n, 2);
  assert.equal(memoById(ms, "waivers").item?.action.id, "w1");
  assert.equal(memoById(ms, "waivers").more, 0);
  assert.equal(memoById(ms, "trade").item?.action.id, "t1");
});

test("the film room never carries a call", () => {
  // Nothing on the feed measures the film (D6): its memo is built from last week's
  // result, so an action that somehow claimed it must not turn up here as one.
  const ms = memos([action("start", "/report", { id: "odd" })]);
  assert.equal(memoById(ms, "report").item, null);
  assert.equal(memoById(ms, "report").more, 0);
});

test("a thumbs-down promotes the next call in that department", () => {
  const feed = [
    action("start", "/team", { id: "s1" }),
    action("start", "/team", { id: "s2" }),
    action("waiver", "/waivers", { id: "w1" }),
  ];
  const ms = memos(feed, ["s1"]);
  assert.equal(memoById(ms, "team").item?.action.id, "s2");
  assert.equal(memoById(ms, "team").more, 0, "the count is what the Debrief has left to show");
  // And only that department: a thumb on the lineup says nothing about the wire.
  assert.equal(memoById(ms, "waivers").item?.action.id, "w1");
});

test("dismissing the last call leaves a clear memo, not a missing one", () => {
  const feed = [action("start", "/team", { id: "s1" }), action("start", "/team", { id: "s2" })];
  const ms = memos(feed, ["s1", "s2"]);
  assert.deepEqual(memoKeys(ms), [...DEPARTMENT_ORDER], "the memo stays on the page");
  assert.equal(memoById(ms, "team").item, null, "so the card falls back to GROUPS.team.clear");
  assert.equal(memoById(ms, "team").more, 0);
});

test("an id that is not on this week's feed hides nothing", () => {
  // Storage is per league and per week, but a key can still outlive the feed it was
  // written against. A stale id must simply never match.
  const feed = [action("start", "/team", { id: "s1" })];
  assert.equal(memoById(memos(feed, ["last-week:9"]), "team").item?.action.id, "s1");
});

test("a locked teaser cannot be thumbed off the page", () => {
  // There is nothing there to be wrong about yet — the names are withheld until the
  // pass is bought — so a dismissal would delete the upsell rather than answer it.
  const locked = action("trade", "/trade", { id: "tl", locked: true });
  assert.equal(dismissable(locked), false);
  assert.equal(memoById(memos([locked], ["tl"]), "trade").item?.action.id, "tl");
});

test("a hold cannot be thumbed off either, and it is what scouting shows", () => {
  // A hold is the staff saying stand pat. It is the reason the wire is quiet rather
  // than a move, so it is neither tickable nor dismissable — hiding it would leave the
  // memo asserting the same quiet with nothing behind it.
  const hold = action("hold", "/waivers", { id: "waiver:hold", feature: "my_team" });
  assert.equal(dismissable(hold), false);
  const ms = memos([hold], ["waiver:hold"]);
  assert.equal(memoById(ms, "waivers").item?.action.id, "waiver:hold");
});

test("memos file calls exactly as groupActions does", () => {
  // One place decides which department owns a call. If these ever disagree, the memo
  // and the tab its door opens are talking about two different rooms.
  const feed = [
    action("start", "/team", { id: "a" }),
    action("hold", "/waivers", { id: "d" }),
    action("trade", "/trade?their=4", { id: "c" }),
  ];
  for (const { key, items } of groupActions(feed)) {
    assert.equal(memoById(memos(feed), key).item?.action.id, items[0]?.action.id);
  }
});
