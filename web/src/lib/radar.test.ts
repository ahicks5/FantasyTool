import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, visible, waiting } from "./radar.ts";
import type { RadarItem } from "./types.ts";

const row = (id: string, intent: RadarItem["intent"], status: RadarItem["status"] = "new"): RadarItem => ({
  id, source: "reddit", where: "r/fantasyfootball", author: "a", thread: "", text: "?", url: "", created: 0, intent, status, by: null,
});

test("ago reads like a timestamp in a feed", () => {
  assert.equal(ago(5), "now");
  assert.equal(ago(-3), "now", "a clock a little ahead is still now");
  assert.equal(ago(125), "2m");
  assert.equal(ago(3 * 3600 + 10), "3h");
  assert.equal(ago(2 * 86400), "2d");
});

test("handled rows hide unless asked for, and the chips count only what is waiting", () => {
  const items = [row("a", "start_sit"), row("b", "trade"), row("c", "start_sit", "done"), row("d", "waiver", "skip")];
  assert.deepEqual(visible(items, "all", false).map((i) => i.id), ["a", "b"]);
  assert.deepEqual(visible(items, "start_sit", true).map((i) => i.id), ["a", "c"]);
  assert.deepEqual(waiting(items), { all: 2, start_sit: 1, waiver: 0, trade: 1, other: 0 });
});
