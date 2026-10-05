import { test } from "node:test";
import assert from "node:assert/strict";
import { identityKey, isDeadSession, retryable, safeNext, shouldDropToken } from "./identity.ts";
import { HttpError } from "./errors.ts";
import type { Me } from "./types.ts";

const out: Me = { email: null, signed_in: false, entitlements: ["my_team"], leagues_allowed: 3, leagues: [] };
const me = (over: Partial<Me> = {}, plan: { tier: "free" | "premium"; skus: string[] } = { tier: "free", skus: [] }): Me =>
  ({
    email: "a@b.c",
    signed_in: true,
    entitlements: ["my_team"],
    leagues_allowed: 3,
    leagues: [{ platform: "sleeper", league_id: "1", team_id: "5", name: "L" }],
    account: { email: "a@b.c", name: "A", role: "user", plan },
    ...over,
  }) as unknown as Me;

test("a failure on the wire or a 5xx is asked again; a refusal is an answer", () => {
  assert.equal(retryable(new TypeError("Failed to fetch")), true);
  assert.equal(retryable(new HttpError(502, "bad gateway")), true);
  assert.equal(retryable(new HttpError(503, "")), true);
  assert.equal(retryable(new HttpError(429, "")), true);
  assert.equal(retryable(new HttpError(401, "")), false);
  assert.equal(retryable(new HttpError(404, "")), false);
});

test("the identity key ignores noise and catches what repaints the page", () => {
  assert.equal(identityKey(me()), identityKey(me({ email_opt_in: true })), "an unrelated field");
  assert.notEqual(identityKey(me()), identityKey(out), "signed out elsewhere");
  assert.notEqual(identityKey(me()), identityKey(me({ email: "x@y.z" })), "another account");
  assert.notEqual(identityKey(me()), identityKey(me({}, { tier: "premium", skus: ["full_report"] })), "a pass bought on the phone");
  assert.notEqual(identityKey(me()), identityKey(me({ leagues: [] })), "a league forgotten elsewhere");
  assert.notEqual(identityKey(me()), identityKey(null), "unknown is not signed out");
  assert.equal(identityKey(me({ entitlements: ["waivers", "my_team"] })), identityKey(me({ entitlements: ["my_team", "waivers"] })), "order does not matter");
});

test("only the token that was asked with, and is still on file, is dropped", () => {
  assert.equal(shouldDropToken("t1", "t1", out), true, "the API no longer knows it");
  assert.equal(shouldDropToken("t1", "t2", out), false, "a sign-in landed while the old answer was in flight");
  assert.equal(shouldDropToken(null, "t2", out), false, "asked with no token at all");
  assert.equal(shouldDropToken("t1", "t1", me()), false, "still good");
  assert.equal(shouldDropToken("t1", "t1", null), false, "no answer is not a no");
});

test("only the API's dead-session 401 counts as a dead session", () => {
  assert.equal(isDeadSession(401, "session expired, sign in again"), true);
  assert.equal(isDeadSession(401, "sign in required"), false);
  assert.equal(isDeadSession(401, "wrong email or password"), false);
  assert.equal(isDeadSession(403, "session expired"), false);
  assert.equal(isDeadSession(401, { error: "expired" }), false);
});

test("next stays on this site", () => {
  assert.equal(safeNext("/waivers?x=1"), "/waivers?x=1");
  assert.equal(safeNext(null), "/home");
  assert.equal(safeNext("https://evil.example"), "/home");
  assert.equal(safeNext("//evil.example"), "/home");
  assert.equal(safeNext("/\\evil.example"), "/home");
  assert.equal(safeNext("/\tevil"), "/home");
  assert.equal(safeNext("", "/account"), "/account");
});
