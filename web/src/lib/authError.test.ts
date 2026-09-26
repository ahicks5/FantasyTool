import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAuthError } from "./authError.ts";
import { HttpError } from "./errors.ts";

test("a wrong password says wrong password, not that a session expired", () => {
  const c = describeAuthError(new HttpError(401, "Sign in to continue."));
  assert.match(c.title, /wrong email or password/i);
  assert.doesNotMatch(c.title + c.detail, /session|expired/i);
});

test("a taken email points at sign in", () => {
  assert.match(describeAuthError(new HttpError(409, "x")).detail, /sign in/i);
});

test("the account throttle does not blame the league platform", () => {
  const c = describeAuthError(new HttpError(429, "too many requests"));
  assert.doesNotMatch(c.detail, /platform|league/i);
  assert.match(c.detail, /reset/i);
});

test("a dead reset link says so and a password rule is passed through, capitalised", () => {
  assert.match(describeAuthError(new HttpError(400, "that reset link has expired or was already used")).detail, /expired/);
  assert.equal(describeAuthError(new HttpError(400, "your current password is wrong")).detail, "Your current password is wrong");
});

test("offline and server trouble fall through to the generic copy", () => {
  assert.match(describeAuthError(new HttpError(401, "x"), { online: false }).title, /offline/i);
  assert.match(describeAuthError(new HttpError(503, "x")).title, /problem/i);
});
