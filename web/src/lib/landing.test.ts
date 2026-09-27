import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The landing page's structure, pinned from its source. The words are swept in
 * `vocab.test.ts`; this is about where the doors go and what the page never says.
 */
const PAGE = readFileSync(join(import.meta.dirname, "../app/page.tsx"), "utf8");
const PRICING = readFileSync(join(import.meta.dirname, "../components/Pricing.tsx"), "utf8");
const BAR = readFileSync(join(import.meta.dirname, "../components/LandingBar.tsx"), "utf8");

test("every door on the landing page opens the account", () => {
  // The account comes first (Andrew, 2026-09-24). Anything else a link points at is the
  // way back in for an owner who has one, or the legal pages.
  const hrefs = [...PAGE.matchAll(/href=\{?"?([^"}\s]+)"?\}?/g)].map((m) => m[1]);
  assert.ok(hrefs.includes("LOGIN"), "log in is on the front page (Andrew, 2026-09-27)");
  assert.match(PAGE, /const LOGIN = "\/login";/);
  const doors = hrefs.filter((h) => !["LOGIN", "/terms", "/privacy"].includes(h));
  assert.ok(doors.length > 0);
  for (const h of doors) assert.equal(h, "WAY_IN", `a link on the landing page goes to ${h}, not the account`);
  assert.match(PAGE, /const WAY_IN = "\/register";/);
  assert.match(PRICING, /href="\/register"/);
});

test("the page asks more than once, and the bar follows the reader between the first ask and the last", () => {
  assert.ok((PAGE.match(/href=\{WAY_IN\}/g) ?? []).length >= 4, "the header, hero, staff and close each carry the door");
  assert.match(PAGE, /<LandingBar heroId=\{HERO_CTA_ID\} closeId=\{CLOSE_CTA_ID\}/);
  assert.match(BAR, /IntersectionObserver/);
  // Off, it is translated out of the viewport and cannot catch a tap.
  const css = readFileSync(join(import.meta.dirname, "../app/globals.css"), "utf8");
  assert.match(css, /\.landing-bar \{[^}]*pointer-events: none/);
  assert.match(css, /\.landing-bar-on \{[^}]*pointer-events: auto/);
});

test("no number on the page is typed where the catalog could say it", () => {
  // The price headline, the stack and the anchor all come through lib/offer.ts.
  assert.match(PRICING, /offerStack\(products\)/);
  assert.match(PRICING, /PRICING\.title\(formatCents\(bundle\.price_cents\)\)/);
  assert.doesNotMatch(PRICING, /\$\d/, "Pricing.tsx types a dollar figure");
  // The guarantee reads the terms' number.
  assert.match(PRICING, /PRICING\.guarantee\.body\(LEGAL\.refundDays\)/);
});

test("the launch-week line only shows when the API says the register is closed", () => {
  assert.match(PRICING, /registerOpen === false &&/);
  // A failed health read must not show it: the upgrade sheet could not honour the promise.
  assert.match(PRICING, /\.catch\(\(\) => setRegisterOpen\(true\)\)/);
});

test("the page still carries no accuracy figure", () => {
  const prose = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(prose, /\d\s*%/);
  assert.doesNotMatch(prose, /\b(accuracy|accurate|hit rate)\b/i);
});

test("the front page carries no pricing table and no theme switch", () => {
  // Andrew, 2026-09-27: the price is met at the upgrade, and dark is the room.
  assert.doesNotMatch(PAGE, /<Pricing|ThemeToggle|#pricing/);
});
