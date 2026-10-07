import { test } from "node:test";
import assert from "node:assert/strict";
import { parts, reloadAfter, routeFor } from "./policy.ts";

const HOME = "https://ownerssuite.io";

test("our own site stays in the app, with or without www", () => {
  assert.equal(routeFor("https://ownerssuite.io/home", HOME), "inside");
  assert.equal(routeFor("https://www.ownerssuite.io/team?x=1#y", HOME), "inside");
  assert.equal(routeFor("https://OWNERSSUITE.io/", HOME), "inside");
});

test("a look-alike host is not our site", () => {
  assert.equal(routeFor("https://ownerssuite.io.evil.test/home", HOME), "browser");
  assert.equal(routeFor("https://evilownerssuite.io/", HOME), "browser");
  assert.equal(routeFor("https://ownerssuite.io@evil.test/", HOME), "browser");
});

test("payments and outside links open in a Safari sheet, never in our frame", () => {
  assert.equal(routeFor("https://checkout.stripe.com/c/pay/cs_test_123", HOME), "browser");
  assert.equal(routeFor("https://billing.stripe.com/p/login/abc", HOME), "browser");
  assert.equal(routeFor("https://fantasy.espn.com/football/team", HOME), "browser");
  assert.equal(routeFor("https://football.fantasysports.yahoo.com/", HOME), "browser");
});

test("the Yahoo sign-in hops stay inside, because they end back on /connect/yahoo", () => {
  assert.equal(routeFor("https://api.login.yahoo.com/oauth2/request_auth?client_id=x", HOME), "inside");
  assert.equal(routeFor("https://login.yahoo.com/", HOME), "inside");
  assert.equal(routeFor("https://guce.yahoo.com/consent", HOME), "inside");
});

test("mail, phone and the App Store go to iOS; the page's own plumbing is left alone", () => {
  assert.equal(routeFor("mailto:help@ownerssuite.io", HOME), "system");
  assert.equal(routeFor("tel:+15555550100", HOME), "system");
  assert.equal(routeFor("sms:+15555550100", HOME), "system");
  assert.equal(routeFor("itms-apps://apps.apple.com/app/id1", HOME), "system");
  assert.equal(routeFor("about:blank", HOME), "inside");
  assert.equal(routeFor("data:text/html,hi", HOME), "inside");
});

test("closing the sheet after Stripe reloads the app, so a new pass shows", () => {
  assert.equal(reloadAfter("https://checkout.stripe.com/c/pay/cs_1"), true);
  assert.equal(reloadAfter("https://billing.stripe.com/p/session/x"), true);
  assert.equal(reloadAfter("https://notstripe.com/"), false);
  assert.equal(reloadAfter("https://fantasy.espn.com/"), false);
});

test("addresses are read without URL", () => {
  assert.deepEqual(parts("https://user:pw@Example.com:8443/a/b?c=1#d"), { scheme: "https", host: "example.com", path: "/a/b", search: "?c=1", hash: "#d" });
  assert.deepEqual(parts("https://example.com"), { scheme: "https", host: "example.com", path: "/", search: "", hash: "" });
  assert.equal(parts("not a url"), null);
});
