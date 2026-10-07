import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOORS, attrFrom, doorOf } from "./track.ts";

const HOST = "ownerssuite.io";

test("the first touch keeps the campaign tags and the referring host only", () => {
  const a = attrFrom(
    "https://ownerssuite.io/?utm_source=reddit&utm_campaign=wk4&utm_content=hookA&fbclid=x",
    "https://www.reddit.com/r/fantasyfootball/comments/abc?secret=1",
    HOST,
  );
  assert.deepEqual(a, { utm_source: "reddit", utm_campaign: "wk4", utm_content: "hookA", referrer: "www.reddit.com" });
});

test("our own pages are not a source, and a share card is", () => {
  assert.deepEqual(attrFrom("https://ownerssuite.io/team", "https://www.ownerssuite.io/", HOST), {});
  assert.deepEqual(attrFrom("https://ownerssuite.io/s/ab3kx9qz", "", HOST), { share: "ab3kx9qz" });
  assert.deepEqual(attrFrom("not a url", "", HOST), {});
});

// ---- the landing page's doors (cta_click) -------------------------------------------------

test("the web's doors are the API's doors, and every one of them is on the page", () => {
  const py = readFileSync(join(import.meta.dirname, "../../../edge/api/telemetry.py"), "utf8");
  const tuple = py.match(/^DOORS = \(([^)]*)\)/m);
  assert.ok(tuple, "DOORS is a tuple in telemetry.py");
  assert.deepEqual([...DOORS], [...tuple[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]));

  const page = readFileSync(join(import.meta.dirname, "../app/page.tsx"), "utf8");
  const bar = readFileSync(join(import.meta.dirname, "../components/LandingBar.tsx"), "utf8");
  const marked = [...(page + bar).matchAll(/data-door="([a-z]+)"/g)].map((m) => m[1]);
  for (const d of marked) assert.ok((DOORS as readonly string[]).includes(d), `data-door="${d}" is not a door the API accepts`);
  assert.deepEqual([...new Set(marked)].sort(), [...DOORS].sort(), "every door is marked once somewhere on the page");
  assert.match(page, /<DoorClicks \/>/);
});

test("a press counts only on a link inside a door, and only under a known name", () => {
  // Just enough of the DOM: closest() walks up a chain of fake elements.
  type Fake = { tag: string; door?: string; parent?: Fake };
  const el = (f: Fake) => ({
    ...f,
    getAttribute: (k: string) => (k === "data-door" ? (f.door ?? null) : null),
    closest(sel: string): unknown {
      for (let n: Fake | undefined = f; n; n = n.parent) {
        if ((sel === "a" && n.tag === "a") || (sel === "[data-door]" && n.door)) return el(n);
      }
      return null;
    },
  });
  const hero: Fake = { tag: "div", door: "hero" };
  const link: Fake = { tag: "a", parent: hero };
  assert.equal(doorOf(el({ tag: "span", parent: link }) as unknown as EventTarget), "hero", "the words inside the button");
  assert.equal(doorOf(el({ tag: "p", parent: hero }) as unknown as EventTarget), null, "the line under the button is not a press");
  const odd: Fake = { tag: "a", parent: { tag: "div", door: "made_up" } };
  assert.equal(doorOf(el(odd) as unknown as EventTarget), null);
  assert.equal(doorOf(null), null);
});
