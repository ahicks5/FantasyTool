import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESPN_URL,
  KEY_NAME,
  RETURN_PATH,
  buildEspnKeyBookmarklet,
  detectHand,
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
}

function run(bookmarklet: string, page: Page): { alerts: string[]; went: string | null } {
  assert.ok(bookmarklet.startsWith("javascript:"));
  const alerts: string[] = [];
  const location = { hostname: page.hostname, href: "https://x" };
  const src = bookmarklet.slice("javascript:".length);
  new Function("document", "location", "alert", src)({ cookie: page.cookie }, location, (m: string) => alerts.push(m));
  return { alerts, went: location.href === "https://x" ? null : location.href };
}

const BACK = "https://penthousefantasy.com/connect/espn?id=123";
/** What ESPN actually writes: the s2 is long and percent-encoded, the SWID has braces. */
const S2 = "AEBx%2Bq7Y%2FabcDEF0123456789%3D%3D";
const SWID = "{DEAD0000-BEEF-1111-2222-333333333333}";

test("the bookmark is one line and carries the return address", () => {
  const b = buildEspnKeyBookmarklet(BACK);
  assert.ok(!/[\n\r]/.test(b), "a bookmark's address is one line");
  assert.ok(b.includes(BACK));
});

test("on ESPN with both cookies it leaves for Penthouse with the key in the fragment, untouched", () => {
  const { alerts, went } = run(buildEspnKeyBookmarklet(BACK), {
    hostname: "fantasy.espn.com",
    cookie: `region=ccpa; SWID=${SWID}; espn_s2=${S2}; edition=espn-en-us`,
  });
  assert.deepEqual(alerts, []);
  assert.ok(went?.startsWith(BACK + "#"), went ?? "did not leave");
  const key = parseEspnKeyReturn(new URL(went!).hash);
  // The percent-encoded s2 is the value ESPN wants back; it must survive the round trip byte for byte.
  assert.deepEqual(key, { s2: S2, swid: SWID });
});

test("the key rides in the fragment, never the query, so no server ever receives it", () => {
  const { went } = run(buildEspnKeyBookmarklet(BACK), { hostname: "fantasy.espn.com", cookie: `SWID=${SWID}; espn_s2=${S2}` });
  const url = new URL(went!);
  assert.equal(url.search, "?id=123");
  assert.ok(!url.search.includes("s2"));
  assert.ok(url.hash.includes("s2="));
});

test("on any other site it says to open ESPN and stays put", () => {
  for (const hostname of ["penthousefantasy.com", "espn.com.evil.example", "www.google.com"]) {
    const { alerts, went } = run(buildEspnKeyBookmarklet(BACK), { hostname, cookie: `SWID=${SWID}; espn_s2=${S2}` });
    assert.equal(went, null, hostname);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /fantasy\.espn\.com/);
  }
});

test("www.espn.com and fantasy.espn.com both count as ESPN", () => {
  for (const hostname of ["fantasy.espn.com", "www.espn.com", "espn.com"]) {
    const { went } = run(buildEspnKeyBookmarklet(BACK), { hostname, cookie: `SWID=${SWID}; espn_s2=${S2}` });
    assert.ok(went, hostname);
  }
});

test("half a key is no key: it says so and never leaves with one value", () => {
  for (const cookie of [`SWID=${SWID}`, `espn_s2=${S2}`, "", "SWID=; espn_s2="]) {
    const { alerts, went } = run(buildEspnKeyBookmarklet(BACK), { hostname: "fantasy.espn.com", cookie });
    assert.equal(went, null, cookie);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /sign back in/i);
    assert.ok(!alerts[0].includes(S2) && !alerts[0].includes(SWID), "the message never shows a value");
  }
});

test("a cookie whose name merely ends in the right letters is not the cookie", () => {
  const { went } = run(buildEspnKeyBookmarklet(BACK), {
    hostname: "fantasy.espn.com",
    cookie: `xSWID=wrong; SWID=${SWID}; not_espn_s2=wrong; espn_s2=${S2}`,
  });
  assert.deepEqual(parseEspnKeyReturn(new URL(went!).hash), { s2: S2, swid: SWID });
});

test("the return fragment is read strictly", () => {
  assert.equal(parseEspnKeyReturn(""), null);
  assert.equal(parseEspnKeyReturn("#"), null);
  assert.equal(parseEspnKeyReturn("#player=123"), null);
  assert.equal(parseEspnKeyReturn("#s2=abc"), null, "half a key is no key");
  assert.equal(parseEspnKeyReturn("#s2=&swid=x"), null);
  assert.deepEqual(parseEspnKeyReturn("#s2=abc&swid=%7BX%7D"), { s2: "abc", swid: "{X}" });
  assert.deepEqual(parseEspnKeyReturn("s2=abc&swid=x"), { s2: "abc", swid: "x" }, "with or without the hash");
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
