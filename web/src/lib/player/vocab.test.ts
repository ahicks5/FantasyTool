import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYER } from "../vocab.ts";

/**
 * The player page's own words, swept for the two rules it adds to the house ones.
 *
 * It lives here rather than in `vocab.test.ts` because the digit rule is this page's, not
 * the vocabulary's: everywhere else in the app a string is free to carry a number, and the
 * Vibes side is the one surface where a digit is a bug.
 */

/**
 * Every string a reader can see out of the block, however deeply it is nested.
 *
 * Walked rather than listed. A hand-written list is a list someone forgets to add to, and
 * the one line that never made it onto it is exactly the line that would carry the digit
 * this file exists to catch. Functions are called with placeholder words, so a composed
 * sentence is swept as well as a literal one.
 */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") out.push((value as (...a: string[]) => string)("Feature back", "Usage"));
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

const COPY: string[] = strings(PLAYER);

test("not one word on the player page carries a digit", () => {
  // The Vibes side is words only, forever. The take is written against it in phase D, and
  // this is the rule that block of copy is written to: the engine hands over tiers and
  // directions, never a stat, so nothing downstream has a number to print.
  for (const line of COPY) {
    assert.ok(!/\d/.test(line), `player copy states a number: ${line}`);
  }
});

test("the voice rules hold here too: no exclamation marks, no em dashes", () => {
  for (const line of COPY) {
    assert.ok(!line.includes("!"), `exclamation mark in: ${line}`);
    assert.ok(!line.includes("—"), `em dash in: ${line}`);
  }
});

test("no line a user reads claims an accuracy figure", () => {
  for (const line of COPY) {
    assert.ok(!/\d\s*%/.test(line), `copy states a percentage: ${line}`);
    assert.ok(!/\b(accuracy|accurate|hit rate)\b/i.test(line), `copy claims accuracy: ${line}`);
  }
});

test("the walk actually reaches the nested words", () => {
  // The sweep is only worth anything if it goes all the way down. These three live at
  // three different depths, and the deepest is the one a hand-written list would miss.
  assert.ok(COPY.includes(PLAYER.sheet), "a top-level string was missed");
  assert.ok(COPY.includes(PLAYER.footer.chat), "a nested string was missed");
  assert.ok(COPY.includes(PLAYER.vibes.snaps.every), "a twice-nested string was missed");
  assert.ok(COPY.some((c) => c.includes("Feature back")), "a composed sentence was missed");
});

test("the three doors fit three-up on the narrowest phone", () => {
  // 320px, minus the bar's own padding, is about 98px a door. Measured against the widest
  // label that has ever fitted a control in this app; anything longer wraps to two lines
  // and the footer grows under the page it is supposed to be frozen beneath.
  for (const label of Object.values(PLAYER.footer)) {
    assert.ok(label.length <= "Position Battle".length, `footer label "${label}" is too wide for the bar`);
  }
});

test("each mode has a word, because the colour never carries the meaning alone", () => {
  for (const m of Object.values(PLAYER.modes)) {
    assert.ok(m.label.length > 0 && m.said.length > 0);
  }
});
