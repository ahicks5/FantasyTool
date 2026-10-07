import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_UA_TOKEN, isNativeApp, shareInApp } from "./native.ts";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function appWindow(sent: string[] = []) {
  return {
    navigator: { userAgent: `${IPHONE_UA} ${APP_UA_TOKEN}1.0.0` },
    ReactNativeWebView: { postMessage: (d: string) => void sent.push(d) },
  };
}

test("no window, no app: the server never takes the app's path", () => {
  assert.equal(isNativeApp(), false);
  assert.equal(shareInApp("https://ownerssuite.io/s/abc"), false);
});

test("the app needs both its user-agent token and its message channel", () => {
  assert.equal(isNativeApp(appWindow()), true);
  assert.equal(isNativeApp({ navigator: { userAgent: IPHONE_UA } }), false, "mobile Safari");
  assert.equal(isNativeApp({ navigator: { userAgent: `${IPHONE_UA} ${APP_UA_TOKEN}1.0.0` } }), false, "token without the channel");
  assert.equal(isNativeApp({ navigator: { userAgent: IPHONE_UA }, ReactNativeWebView: { postMessage() {} } }), false, "another app's WebView");
});

test("a share in the app goes to the share sheet as one message; in a browser it is refused", () => {
  const sent: string[] = [];
  assert.equal(shareInApp("https://ownerssuite.io/s/abc", appWindow(sent)), true);
  assert.deepEqual(sent.map((s) => JSON.parse(s)), [{ type: "share", url: "https://ownerssuite.io/s/abc" }]);
  assert.equal(shareInApp("", appWindow(sent)), false, "nothing to share");
  assert.equal(shareInApp("https://x.test", { navigator: { userAgent: IPHONE_UA } }), false);
});

test("a broken channel falls back to the clipboard rather than throwing", () => {
  const w = { navigator: { userAgent: `${IPHONE_UA} ${APP_UA_TOKEN}1.0.0` }, ReactNativeWebView: { postMessage() { throw new Error("gone"); } } };
  assert.equal(shareInApp("https://x.test", w), false);
});
