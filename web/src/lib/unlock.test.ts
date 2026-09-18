import { test } from "node:test";
import assert from "node:assert/strict";
import {
  featuresForSku,
  hasFeatures,
  paidSkuFromSearch,
  urlWithoutPurchaseParams,
  waitForFeatures,
} from "./unlock.ts";
import type { Feature, Me, Product } from "./types.ts";

const me = (entitlements: Feature[]): Me => ({
  email: "a@b.c",
  signed_in: true,
  entitlements,
  leagues_allowed: 1,
  leagues: [],
});

/** Counts calls and never actually sleeps, so the whole file runs in milliseconds. */
function stub(responses: (Me | Error)[]) {
  let calls = 0;
  const slept: number[] = [];
  return {
    get calls() {
      return calls;
    },
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
    },
    fetchMe: async () => {
      const r = responses[Math.min(calls, responses.length - 1)];
      calls++;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

test("returns immediately when the purchase already landed", async () => {
  const s = stub([me(["my_team", "trade_lab"])]);
  const out = await waitForFeatures(s.fetchMe, ["trade_lab"], { sleep: s.sleep });
  assert.equal(out.ok, true);
  assert.equal(out.attempts, 1);
  assert.equal(s.calls, 1);
  assert.deepEqual(s.slept, [], "no reason to wait when it is already there");
});

test("keeps asking until the webhook grants it", async () => {
  const s = stub([me(["my_team"]), me(["my_team"]), me(["my_team", "waivers"])]);
  const out = await waitForFeatures(s.fetchMe, ["waivers"], { sleep: s.sleep, delayMs: 1500 });
  assert.equal(out.ok, true);
  assert.equal(out.attempts, 3);
  assert.deepEqual(s.slept, [1500, 1500]);
});

test("a purchase that never lands times out instead of hanging", async () => {
  const s = stub([me(["my_team"])]);
  const out = await waitForFeatures(s.fetchMe, ["trade_lab"], { attempts: 4, sleep: s.sleep });
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.reason, "timeout");
  assert.equal(s.calls, 4);
  assert.equal(s.slept.length, 3, "sleeps between attempts, not after the last one");
});

test("a blip mid-wait does not strand someone who has paid", async () => {
  const s = stub([new Error("network"), me(["my_team"]), me(["my_team", "full_report"])]);
  const out = await waitForFeatures(s.fetchMe, ["full_report"], { attempts: 5, sleep: s.sleep });
  assert.equal(out.ok, true);
  assert.equal(out.attempts, 3);
});

test("an unbroken run of failures is reported as an error, not a timeout", async () => {
  const s = stub([new Error("offline")]);
  const out = await waitForFeatures(s.fetchMe, ["waivers"], { attempts: 3, sleep: s.sleep });
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.reason, "error");
  assert.match(out.ok === false ? (out.error?.message ?? "") : "", /offline/);
});

test("the full bundle has to grant every feature it promises", async () => {
  const s = stub([me(["my_team", "waivers"])]);
  const out = await waitForFeatures(s.fetchMe, ["waivers", "trade_lab"], { attempts: 2, sleep: s.sleep });
  assert.equal(out.ok, false, "a partial grant is not an unlock");
});

test("asking for nothing succeeds without a request", async () => {
  const s = stub([me([])]);
  const out = await waitForFeatures(s.fetchMe, [], { sleep: s.sleep });
  assert.equal(out.ok, true);
  assert.equal(s.calls, 1);
});

const PRODUCTS: Product[] = [
  { sku: "waivers", name: "Waiver Wire Pass", price_cents: 300, features: ["waivers"], leagues: 1, blurb: "" },
  {
    sku: "full_report",
    name: "Full Report",
    price_cents: 700,
    features: ["my_team", "waivers", "trade_lab", "full_report"],
    leagues: 5,
    blurb: "",
  },
];

test("sku to features", () => {
  assert.deepEqual(featuresForSku(PRODUCTS, "waivers"), ["waivers"]);
  assert.equal(featuresForSku(PRODUCTS, "full_report").length, 4);
  assert.deepEqual(featuresForSku(PRODUCTS, "free"), [], "an unknown sku unlocks nothing");
});

test("hasFeatures", () => {
  assert.equal(hasFeatures(me(["my_team", "waivers"]), ["waivers"]), true);
  assert.equal(hasFeatures(me(["my_team"]), ["waivers"]), false);
});

test("reads the sku Stripe sends back, and ignores anything else", () => {
  const known = ["waivers", "trade_lab", "full_report"];
  assert.equal(paidSkuFromSearch("?paid=trade_lab", known), "trade_lab");
  assert.equal(paidSkuFromSearch("?paid=nonsense", known), null, "an unknown sku is not trusted");
  assert.equal(paidSkuFromSearch("?canceled=1", known), null);
  assert.equal(paidSkuFromSearch("", known), null);
});

test("clears the purchase params so a reload does not replay the wait", () => {
  assert.equal(urlWithoutPurchaseParams("https://x.test/waivers?paid=waivers"), "/waivers");
  assert.equal(urlWithoutPurchaseParams("https://x.test/trade?paid=trade_lab&team=8"), "/trade?team=8");
  assert.equal(urlWithoutPurchaseParams("https://x.test/?canceled=1"), "/");
});
