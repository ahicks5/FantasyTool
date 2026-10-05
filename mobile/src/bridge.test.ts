import { test } from "node:test";
import assert from "node:assert/strict";
import { bootScript, isRoom, parseMessage, pulses } from "./bridge.ts";
import { APP_UA_TOKEN } from "../../web/src/lib/native.ts";

test("only the five message shapes get through, and only well-formed", () => {
  assert.deepEqual(parseMessage('{"type":"route","path":"/team?x=1"}'), { type: "route", path: "/team?x=1" });
  assert.equal(parseMessage('{"type":"route","path":"https://evil.test/"}'), null);
  assert.deepEqual(parseMessage('{"type":"theme","mode":"light"}'), { type: "theme", mode: "light" });
  assert.deepEqual(parseMessage('{"type":"theme","mode":"neon"}'), { type: "theme", mode: "dark" });
  assert.deepEqual(parseMessage('{"type":"share","url":"https://penthousefantasy.com/s/abc"}'), { type: "share", url: "https://penthousefantasy.com/s/abc" });
  assert.equal(parseMessage('{"type":"share","url":"javascript:alert(1)"}'), null);
  assert.deepEqual(parseMessage('{"type":"tap"}'), { type: "tap" });
  assert.equal(parseMessage('{"type":"open","url":"https://x.test"}'), null);
  assert.equal(parseMessage("not json"), null);
  assert.equal(parseMessage("null"), null);
});

test("the page's message to share is the one the app reads", () => {
  // web/src/lib/native.ts sends exactly this shape; a drift here would silently drop shares.
  const sent: string[] = [];
  const w = { navigator: { userAgent: `Mobile ${APP_UA_TOKEN}1.0.0` }, ReactNativeWebView: { postMessage: (d: string) => void sent.push(d) } };
  return import("../../web/src/lib/native.ts").then(({ shareInApp }) => {
    assert.equal(shareInApp("https://penthousefantasy.com/s/abc", w), true);
    assert.deepEqual(parseMessage(sent[0]), { type: "share", url: "https://penthousefantasy.com/s/abc" });
  });
});

test("the GM's ring becomes taps at the start of each buzz", () => {
  // CallOpening.tsx: navigator.vibrate([220, 140, 220, 700, 220, 140, 220])
  assert.deepEqual(pulses([220, 140, 220, 700, 220, 140, 220]), [0, 360, 1280, 1640]);
  assert.deepEqual(pulses(200), [0]);
  assert.deepEqual(pulses([0, 100, 50]), [100]);
  assert.deepEqual(pulses([100, -1]), []);
  assert.deepEqual(pulses(["x"]), []);
  assert.ok(pulses(Array(100).fill(50)).length <= 12, "capped");
  assert.deepEqual(parseMessage('{"type":"haptic","pattern":[]}'), null);
});

test("reminders are asked for in a room, never on the front desk or at the door", () => {
  for (const p of ["/team", "/team/decide?role=RB2", "/waivers", "/waivers/123", "/trade?build=1", "/report#season"]) assert.ok(isRoom(p), p);
  for (const p of ["/", "/home", "/home/plan", "/connect", "/login", "/teams", "/account"]) assert.ok(!isRoom(p), p);
});

test("the boot script runs at document start, reports the route and turns vibrate into haptics", () => {
  const sent: Record<string, unknown>[] = [];
  const listeners: Record<string, () => void> = {};
  const history = { pushState() {}, replaceState() {} };
  const w: Record<string, unknown> = {
    ReactNativeWebView: { postMessage: (d: string) => void sent.push(JSON.parse(d)) },
    addEventListener: (k: string, fn: () => void) => void (listeners[k] = fn),
  };
  const nav: Record<string, unknown> = {};
  const doc = { documentElement: null, addEventListener() {} };
  const loc = { pathname: "/home", search: "", hash: "" };
  new Function("window", "navigator", "document", "location", "history", "setTimeout", "MutationObserver", bootScript("1.0.0"))(
    w, nav, doc, loc, history, (fn: () => void) => fn(), class {},
  );
  assert.deepEqual(w.OwnersSuiteNative, { platform: "ios", version: "1.0.0" });
  assert.equal(typeof w.fbq, "function", "the Meta loader bails out on an existing fbq");
  assert.deepEqual(sent.shift(), { type: "route", path: "/home" });
  loc.pathname = "/team";
  history.pushState();
  assert.deepEqual(sent.shift(), { type: "route", path: "/team" });
  (nav.vibrate as (p: number[]) => boolean)([200, 100, 200]);
  assert.deepEqual(parseMessage(JSON.stringify(sent.shift())), { type: "haptic", pulses: [0, 300] });
});
