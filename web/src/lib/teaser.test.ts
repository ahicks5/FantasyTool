import { test } from "node:test";
import assert from "node:assert/strict";
import { paywallTeaser } from "./teaser.ts";

const GENERIC = "We price every add against the player you would drop.";

test("the engine's sentence wins whenever the API sent one", () => {
  const err = Object.assign(new Error("waivers requires a purchase"), {
    teaser: "Two starters are on bye. The wire has a replacement for both.",
  });
  assert.equal(paywallTeaser(err, GENERIC), "Two starters are on bye. The wire has a replacement for both.");
});

test("the generic line is the fallback, not the default", () => {
  assert.equal(paywallTeaser(Object.assign(new Error("nope"), { teaser: null }), GENERIC), GENERIC);
  assert.equal(paywallTeaser(Object.assign(new Error("nope"), { teaser: "   " }), GENERIC), GENERIC);
  assert.equal(paywallTeaser(new Error("nope"), GENERIC), GENERIC);
  assert.equal(paywallTeaser(null, GENERIC), GENERIC);
  assert.equal(paywallTeaser(undefined, GENERIC), GENERIC);
  assert.equal(paywallTeaser({ teaser: 42 }, GENERIC), GENERIC);
});
