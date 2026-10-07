import { test } from "node:test";
import assert from "node:assert/strict";
import { ESPN_READ_SCRIPT, isEspnWalk, keyHidden, keyReturnUrl, readyKey } from "./espn.ts";
// The web's own parser for the bookmark's return: the app's hand-off has to read the same.
import { parseEspnKeyReturn, RETURN_PATH } from "../../web/src/lib/espnKey.ts";

const HOME = "https://ownerssuite.io";
// ESPN's s2 is long and full of characters that need encoding; this is the shape, not a real one.
const S2 = "AEB%2Bq9x/z==abc+def";
const SWID = "{1A2B3C4D-0000-4000-8000-ABCDEFABCDEF}";

test("the walk is answered with the sheet; the walk's landing is left to the page", () => {
  assert.equal(isEspnWalk("/connect/espn"), true);
  assert.equal(isEspnWalk("/connect/espn/"), true);
  assert.equal(isEspnWalk("/connect/espn?id=521131"), true);
  assert.equal(isEspnWalk(`${HOME}/connect/espn?id=521131`), true);
  assert.equal(isEspnWalk("/connect/espn#s2=abc&swid=x&league=1&team=2"), false, "the landing");
  assert.equal(isEspnWalk("/connect?platform=espn&id=1"), false);
  assert.equal(isEspnWalk("/connect/espnish"), false);
});

test("the hand-off reads back through the web's own parser, value for value", () => {
  const key = { s2: S2, swid: SWID, league: "521131", team: "7" };
  const url = keyReturnUrl(`${HOME}/`, key);
  assert.ok(url.startsWith(`${HOME}${RETURN_PATH}#`), url);
  assert.deepEqual(parseEspnKeyReturn(url.slice(url.indexOf("#"))), key);
});

test("the key is ready only once ESPN's own address names the league", () => {
  const msg = { type: "espn-key", s2: S2, swid: SWID, league: "521131", team: "7" };
  assert.deepEqual(readyKey(msg), { s2: S2, swid: SWID, league: "521131", team: "7" });
  assert.equal(readyKey({ ...msg, league: "" }), null, "logged in, not yet on the team page");
  assert.equal(readyKey({ ...msg, s2: "" }), null);
  assert.equal(readyKey({ ...msg, swid: " " }), null);
  assert.equal(readyKey({ ...msg, league: "12a" }), null);
  assert.deepEqual(readyKey({ ...msg, team: "x" }), { s2: S2, swid: SWID, league: "521131", team: "" });
  assert.equal(readyKey({ ...msg, type: "route" }), null);
  assert.equal(readyKey(null), null);
});

test("a team page with no readable key is said out loud, not waited on", () => {
  assert.equal(keyHidden({ type: "espn-key", s2: "", swid: "", league: "521131", team: "7" }), true);
  assert.equal(keyHidden({ type: "espn-key", s2: S2, swid: SWID, league: "521131", team: "7" }), false);
  assert.equal(keyHidden({ type: "espn-key", s2: "", swid: "", league: "", team: "" }), false, "still logging in");
});

test("the script on ESPN's page reads the cookies and the address, and only reports them", () => {
  const sent: string[] = [];
  let tick: (() => void) | null = null;
  const fake = {
    document: { cookie: `SWID=${SWID}; espn_s2=${S2}; other=1` },
    location: { search: "?leagueId=521131&teamId=7&seasonId=2026" },
    ReactNativeWebView: { postMessage: (d: string) => void sent.push(d) },
    setInterval: (fn: () => void) => ((tick = fn), 1),
  } as Record<string, unknown>;
  fake.window = fake;
  new Function("window", "document", "location", "setInterval", ESPN_READ_SCRIPT)(fake, fake.document, fake.location, fake.setInterval);
  assert.ok(tick, "polls");
  tick!();
  assert.deepEqual(readyKey(JSON.parse(sent[0])), { s2: S2, swid: SWID, league: "521131", team: "7" });
});
