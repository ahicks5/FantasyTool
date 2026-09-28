import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESPN_URL,
  KEY_NAME,
  RETURN_PATH,
  CODE_PREFIX,
  buildEspnKeyBookmarklet,
  detectHand,
  parseEspnCode,
  espnKeyReturnUrl,
  parseEspnKeyReturn,
} from "./espnKey.ts";

/**
 * The bookmark is a script the user cannot read and we cannot debug on their phone, so
 * its behaviour is pinned here by running it against a fake page: the cookie jar, the
 * host, and what it does next.
 */
interface Page {
  cookie: string;
  hostname: string;
  /** ESPN's page URL: `?leagueId=…&teamId=…` on a team page. */
  search?: string;
}

/** `clip` is what landed on the clipboard; `went` is where it navigated, which is nowhere now. */
function run(bookmarklet: string, page: Page): { alerts: string[]; clip: string[]; went: string | null } {
  assert.ok(bookmarklet.startsWith("javascript:"));
  const alerts: string[] = [];
  const clip: string[] = [];
  const location = { hostname: page.hostname, href: "https://x", search: page.search ?? "" };
  const navigator = { clipboard: { writeText: (t: string) => void clip.push(t) } };
  const src = bookmarklet.slice("javascript:".length);
  new Function("document", "location", "alert", "navigator", src)({ cookie: page.cookie }, location, (m: string) => alerts.push(m), navigator);
  return { alerts, clip, went: location.href === "https://x" ? null : location.href };
}

/** The key the bookmark put on the clipboard, or null when it put nothing there. */
function copied(r: { clip: string[] }) {
  return r.clip.length ? parseEspnCode(r.clip[0]) : null;
}

const BACK = "https://penthousefantasy.com/connect/espn?id=123";
/** What ESPN actually writes: the s2 is long and percent-encoded, the SWID has braces. */
const S2 = "AEBx%2Bq7Y%2FabcDEF0123456789%3D%3D";
const SWID = "{DEAD0000-BEEF-1111-2222-333333333333}";

test("the bookmark is one line, and carries no address to jump to", () => {
  const b = buildEspnKeyBookmarklet(BACK, "123");
  assert.ok(!/[\n\r]/.test(b), "a bookmark's address is one line");
  assert.ok(!b.includes("location.href="), "it copies and says so; it does not navigate (Andrew, 2026-09-28)");
});

test("on ESPN with both cookies it leaves for Penthouse with the key in the fragment, untouched", () => {
  const r = run(buildEspnKeyBookmarklet(BACK, "123"), {
    hostname: "fantasy.espn.com",
    cookie: `region=ccpa; SWID=${SWID}; espn_s2=${S2}; edition=espn-en-us`,
  });
  assert.equal(r.alerts.length, 1, "it says copied, and stays on ESPN");
  assert.match(r.alerts[0], /Copied/);
  assert.equal(r.went, null, "no jump back (Andrew, 2026-09-28)");
  const key = copied(r);
  // The percent-encoded s2 is the value ESPN wants back; it must survive the round trip byte for byte.
  assert.deepEqual(key, { s2: S2, swid: SWID, league: "", team: "" });
});

test("on a team page it brings the league and the team back too, so nobody digs out an ID", () => {
  const r = run(buildEspnKeyBookmarklet("https://penthousefantasy.com/connect/espn"), {
    hostname: "fantasy.espn.com",
    search: "?leagueId=98765&teamId=4&seasonId=2026",
    cookie: `SWID=${SWID}; espn_s2=${S2}`,
  });
  assert.match(r.alerts[0], /Copied/);
  assert.deepEqual(copied(r), { s2: S2, swid: SWID, league: "98765", team: "4" });
});

test("with no league carried and none on the page, it says to open the league first", () => {
  const r = run(buildEspnKeyBookmarklet("https://penthousefantasy.com/connect/espn"), {
    hostname: "www.espn.com",
    search: "",
    cookie: `SWID=${SWID}; espn_s2=${S2}`,
  });
  assert.equal(copied(r), null);
  assert.match(r.alerts[0], /Open your league/);
  // But a league carried from the walk is enough on its own.
  const carried = run(buildEspnKeyBookmarklet(BACK, "123"), { hostname: "www.espn.com", search: "", cookie: `SWID=${SWID}; espn_s2=${S2}` });
  assert.ok(copied(carried));
});

test("the key goes to the clipboard and nowhere else: no navigation, no URL carries it", () => {
  const r = run(buildEspnKeyBookmarklet(BACK, "123"), { hostname: "fantasy.espn.com", cookie: `SWID=${SWID}; espn_s2=${S2}` });
  assert.equal(r.went, null);
  assert.equal(r.clip.length, 1);
  assert.ok(r.clip[0].startsWith(CODE_PREFIX));
  assert.ok(r.clip[0].includes("s2="));
});

test("on any other site it says to open ESPN and stays put", () => {
  for (const hostname of ["penthousefantasy.com", "espn.com.evil.example", "www.google.com"]) {
    const r = run(buildEspnKeyBookmarklet(BACK, "123"), { hostname, cookie: `SWID=${SWID}; espn_s2=${S2}` });
    assert.equal(copied(r), null, hostname);
    assert.equal(r.alerts.length, 1);
    assert.match(r.alerts[0], /fantasy\.espn\.com/);
  }
});

test("www.espn.com and fantasy.espn.com both count as ESPN", () => {
  for (const hostname of ["fantasy.espn.com", "www.espn.com", "espn.com"]) {
    assert.ok(copied(run(buildEspnKeyBookmarklet(BACK, "123"), { hostname, cookie: `SWID=${SWID}; espn_s2=${S2}` })), hostname);
  }
});

test("half a key is no key: it says so and never leaves with one value", () => {
  for (const cookie of [`SWID=${SWID}`, `espn_s2=${S2}`, "", "SWID=; espn_s2="]) {
    const r = run(buildEspnKeyBookmarklet(BACK, "123"), { hostname: "fantasy.espn.com", cookie });
    assert.equal(copied(r), null, cookie);
    assert.equal(r.alerts.length, 1);
    assert.match(r.alerts[0], /log in/i);
    assert.ok(!r.alerts[0].includes(S2) && !r.alerts[0].includes(SWID), "the message never shows a value");
  }
});

test("a cookie whose name merely ends in the right letters is not the cookie", () => {
  const r = run(buildEspnKeyBookmarklet(BACK, "123"), {
    hostname: "fantasy.espn.com",
    cookie: `xSWID=wrong; SWID=${SWID}; not_espn_s2=wrong; espn_s2=${S2}`,
  });
  assert.deepEqual(copied(r), { s2: S2, swid: SWID, league: "", team: "" });
});

test("the return fragment is read strictly", () => {
  assert.equal(parseEspnKeyReturn(""), null);
  assert.equal(parseEspnKeyReturn("#"), null);
  assert.equal(parseEspnKeyReturn("#player=123"), null);
  assert.equal(parseEspnKeyReturn("#s2=abc"), null, "half a key is no key");
  assert.equal(parseEspnKeyReturn("#s2=&swid=x"), null);
  assert.deepEqual(parseEspnKeyReturn("#s2=abc&swid=%7BX%7D"), { s2: "abc", swid: "{X}", league: "", team: "" });
  assert.deepEqual(parseEspnKeyReturn("s2=abc&swid=x&league=12&team=3"), { s2: "abc", swid: "x", league: "12", team: "3" }, "with or without the hash");
  assert.deepEqual(parseEspnKeyReturn("#s2=abc&swid=x&league=evil&team=<b>"), { s2: "abc", swid: "x", league: "", team: "" }, "ids are digits or nothing");
});

test("the return address carries the league the key was asked for", () => {
  assert.equal(espnKeyReturnUrl("https://penthousefantasy.com", "123"), `https://penthousefantasy.com${RETURN_PATH}?id=123`);
  assert.equal(espnKeyReturnUrl("https://penthousefantasy.com/", " 123 "), `https://penthousefantasy.com${RETURN_PATH}?id=123`);
  assert.equal(espnKeyReturnUrl("http://localhost:3000", ""), `http://localhost:3000${RETURN_PATH}`);
});

test("the device is read off the user agent, and a Mac with touch is an iPad", () => {
  assert.equal(detectHand("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"), "iphone");
  assert.equal(detectHand("Mozilla/5.0 (iPad; CPU OS 13_0 like Mac OS X)"), "iphone");
  assert.equal(detectHand("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"), "iphone");
  assert.equal(detectHand("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36"), "android");
  assert.equal(detectHand("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"), "computer");
  assert.equal(detectHand("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0"), "computer");
  assert.equal(detectHand(""), "computer");
});

test("the bookmark's name and ESPN's door are fixed", () => {
  // Chrome on Android runs a bookmarklet by typing its name; the walk says this name.
  assert.equal(KEY_NAME, "Penthouse key");
  assert.match(ESPN_URL, /^https:\/\/fantasy\.espn\.com\//);
});

test("the pasted code is the fragment behind a prefix, and anything else is refused", () => {
  const r = run(buildEspnKeyBookmarklet(BACK, "123"), { hostname: "fantasy.espn.com", search: "?leagueId=5&teamId=2", cookie: `SWID=${SWID}; espn_s2=${S2}` });
  const code = r.clip[0];
  assert.deepEqual(parseEspnCode(`  ${code}\n`), { s2: S2, swid: SWID, league: "5", team: "2" });
  // A phone keyboard lowercased the prefix on paste (Andrew's iPhone, 2026-09-28): still the code.
  assert.deepEqual(parseEspnCode("phf:" + code.slice(CODE_PREFIX.length)), { s2: S2, swid: SWID, league: "5", team: "2" });
  assert.equal(parseEspnCode(code.slice(CODE_PREFIX.length)), null, "no prefix, no code");
  assert.equal(parseEspnCode("hello"), null);
  assert.equal(parseEspnCode(""), null);
});
