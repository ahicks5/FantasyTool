import { test } from "node:test";
import assert from "node:assert/strict";
import { attrFrom } from "./track.ts";

const HOST = "penthousefantasy.com";

test("the first touch keeps the campaign tags and the referring host only", () => {
  const a = attrFrom(
    "https://penthousefantasy.com/?utm_source=reddit&utm_campaign=wk4&utm_content=hookA&fbclid=x",
    "https://www.reddit.com/r/fantasyfootball/comments/abc?secret=1",
    HOST,
  );
  assert.deepEqual(a, { utm_source: "reddit", utm_campaign: "wk4", utm_content: "hookA", referrer: "www.reddit.com" });
});

test("our own pages are not a source, and a share card is", () => {
  assert.deepEqual(attrFrom("https://penthousefantasy.com/team", "https://www.penthousefantasy.com/", HOST), {});
  assert.deepEqual(attrFrom("https://penthousefantasy.com/s/ab3kx9qz", "", HOST), { share: "ab3kx9qz" });
  assert.deepEqual(attrFrom("not a url", "", HOST), {});
});
