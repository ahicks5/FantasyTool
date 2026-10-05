import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  AS_OF,
  SAVED_MAX_AGE_MS,
  asOfOf,
  clearSaved,
  dropSaved,
  freshness,
  isKept,
  isRefusal,
  markShown,
  readSaved,
  setSavedStorage,
  stampAsOf,
  startRefresh,
  unmarkShown,
  wantsFresh,
  writeSaved,
} from "./saved.ts";
import { cacheClear } from "./cache.ts";
import { FRESH } from "./vocab.ts";

/** A Storage stand-in that can be told to run out of room. */
function fakeStorage(limitChars = Infinity) {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const used = [...m.entries()].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0);
      if (used + v.length > limitChars) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
  };
}

let s = fakeStorage();
beforeEach(() => {
  s = fakeStorage();
  setSavedStorage(s);
});

test("a league read comes back after a reload; an account read is never kept", () => {
  writeSaved("desk:sleeper:1:8", { headline: "x" }, 1000);
  assert.deepEqual(readSaved("desk:sleeper:1:8", 2000), { v: { headline: "x" }, at: 1000 });
  writeSaved("me", { email: "a@b.co" }, 1000);
  assert.equal(readSaved("me", 2000), undefined);
  assert.ok(![...s.m.keys()].some((k) => k.includes("me")), "nothing about the account touches storage");
  assert.equal(isKept("profile:sleeper:1:8:4034"), false, "a player page is one of thousands; not kept");
});

test("a saved read from another week is not painted", () => {
  writeSaved("actions:sleeper:1:8", [1], 0);
  assert.equal(readSaved("actions:sleeper:1:8", SAVED_MAX_AGE_MS + 1), undefined);
});

test("the oldest go first past the cap, and a full store drops the older half and still saves", () => {
  for (let i = 0; i < 35; i++) writeSaved(`lineup:sleeper:1:${i}`, i, i);
  assert.equal(readSaved("lineup:sleeper:1:0", 50), undefined, "the oldest is gone");
  assert.equal(readSaved("lineup:sleeper:1:34", 50)?.v, 34);

  const tight = fakeStorage(400);
  setSavedStorage(tight);
  for (let i = 0; i < 6; i++) writeSaved(`grades:sleeper:1:${i}`, "x".repeat(40), i);
  writeSaved("grades:sleeper:1:new", "y".repeat(40), 99);
  assert.equal(readSaved("grades:sleeper:1:new", 100)?.v, "y".repeat(40));
});

test("storage switched off is not an error, just no saved answers", () => {
  setSavedStorage(null);
  writeSaved("desk:sleeper:1:8", 1, 1);
  assert.equal(readSaved("desk:sleeper:1:8", 2), undefined);
});

test("signing out, or a purchase, clears every saved read; a prefix clears only its own", () => {
  writeSaved("desk:sleeper:1:8", 1, 1);
  writeSaved("lineup:sleeper:1:8", 2, 1);
  clearSaved("desk:");
  assert.equal(readSaved("desk:sleeper:1:8", 2), undefined);
  assert.equal(readSaved("lineup:sleeper:1:8", 2)?.v, 2);
  cacheClear();
  assert.equal(readSaved("lineup:sleeper:1:8", 2), undefined, "the read cache's full clear takes the saved copies too");
  writeSaved("film:sleeper:1:8:paid", 3, 1);
  dropSaved("film:sleeper:1:8:paid");
  assert.equal(readSaved("film:sleeper:1:8:paid", 2), undefined);
});

test("a refusal drops the saved answer; a failure to answer keeps it", () => {
  assert.equal(isRefusal({ name: "PaywallError" }), true, "a lapsed pass must not keep showing paid calls");
  assert.equal(isRefusal({ name: "EspnAuthError" }), true);
  assert.equal(isRefusal({ name: "HttpError", status: 401 }), true);
  assert.equal(isRefusal({ name: "HttpError", status: 404 }), false, "an upstream timeout comes back as a 404");
  assert.equal(isRefusal({ name: "HttpError", status: 503 }), false);
  assert.equal(isRefusal(new TypeError("Failed to fetch")), false);
});

test("the API's age rides on the body without becoming part of it", () => {
  const body = { a: 1 };
  stampAsOf(body, "1700000000");
  assert.equal(asOfOf(body), 1_700_000_000_000);
  assert.equal(JSON.stringify(body), '{"a":1}', "never saved or sent back");
  assert.equal((body as { [AS_OF]?: number })[AS_OF], 1_700_000_000_000);
  const plain = { a: 1 };
  stampAsOf(plain, null);
  assert.equal(asOfOf(plain), undefined);
});

test("the age line reads the oldest answer on screen and whether any is refreshing", () => {
  markShown("desk:x", { at: 5000, refreshing: false, failed: false });
  markShown("actions:x", { at: 3000, refreshing: true, failed: false });
  assert.deepEqual(freshness(), { at: 3000, refreshing: true, failed: false });
  unmarkShown("actions:x");
  assert.deepEqual(freshness(), { at: 5000, refreshing: false, failed: false });
  unmarkShown("desk:x");
  assert.equal(freshness().at, null, "nothing on screen, no line");
});

test("Refresh asks the API for a rebuild for a few seconds, not forever", () => {
  startRefresh(1000);
  assert.equal(wantsFresh(1000), true);
  assert.equal(wantsFresh(1000 + 60_000), false);
});

test("ages read the way a person says them", () => {
  assert.equal(FRESH.ago(20_000), "just now");
  assert.equal(FRESH.ago(12 * 60_000), "12 min ago");
  assert.equal(FRESH.ago(3 * 3600_000), "3 hr ago");
  assert.equal(FRESH.ago(26 * 3600_000), "1 day ago");
  assert.equal(FRESH.ago(-5), "just now", "a clock a little ahead is not the future");
});
