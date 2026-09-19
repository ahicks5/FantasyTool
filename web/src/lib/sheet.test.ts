import { test } from "node:test";
import assert from "node:assert/strict";
import { groupActions, groupFor, groupForHref, groupStatus, type PlacedAction } from "./sheet.ts";
import type { Action, ActionType, Feature } from "./types.ts";

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

test("every action type lands on the bench its CTA points at", () => {
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

test("an empty feed still produces all three benches", () => {
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

test("a clear bench has no status line of its own", () => {
  assert.equal(groupStatus("team", []), null);
  assert.equal(groupStatus("waivers", []), null);
  // A hold is the reason the wire is quiet, not a call to make.
  const hold = { action: action("hold", "/waivers"), n: 1 };
  assert.equal(groupStatus("waivers", [hold]), null);
});

test("lineup fixes add up, because they are independent slots", () => {
  const items = [
    { action: action("start", "/team", { benefit_value: 4.1 }), n: 1 },
    { action: action("start", "/team", { benefit_value: 4.3 }), n: 2 },
  ];
  assert.equal(groupStatus("team", items), "2 moves · +8.4 pts");
  assert.equal(groupStatus("team", items.slice(0, 1)), "1 move · +4.1 pts");
});

test("ranked alternatives quote the leader rather than a total", () => {
  // The second claim is what you do if the first is gone, so the two cannot both land.
  const items = [
    { action: action("waiver", "/waivers", { benefit: "+5.3 wk · +12 ROS", benefit_value: 5.3 }), n: 1 },
    { action: action("waiver", "/waivers", { benefit: "+2.0 wk", benefit_value: 2 }), n: 2 },
  ];
  assert.equal(groupStatus("waivers", items), "2 moves · +5.3 wk · +12 ROS");
});

test("a locked teaser prints only the number the server sent", () => {
  const locked = { action: action("trade", "/trade", { locked: true, benefit: "+14 ROS", benefit_value: 14 }), n: 1 };
  assert.equal(groupStatus("trade", [locked]), "1 move · +14 ROS");
  // Nothing is derived from a withheld lineup gain either: the total skips locked calls.
  const lockedStart = { action: action("start", "/team", { locked: true, benefit_value: 9.9 }), n: 1 };
  assert.equal(groupStatus("team", [lockedStart]), "1 move");
});
