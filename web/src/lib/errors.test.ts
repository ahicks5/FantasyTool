import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError, HttpError } from "./errors.ts";

test("being offline explains everything else, so it is checked first", () => {
  const c = describeError(new HttpError(500, "boom"), { online: false });
  assert.match(c.title, /offline/i);
  assert.equal(c.canRetry, true);
});

test("rate limiting tells you to wait rather than that Penthouse is broken", () => {
  const c = describeError(new HttpError(429, "too many requests"));
  assert.match(c.title, /too many/i);
  assert.match(c.detail, /minute|slow/i);
  assert.equal(c.canRetry, true);
});

test("a 404 does not offer a retry, because it will still be a 404", () => {
  const c = describeError(new HttpError(404, "league not found"));
  assert.equal(c.canRetry, false);
  assert.equal(c.detail, "league not found", "a useful server message is kept");
});

test("a server error owns the problem instead of blaming the user", () => {
  const c = describeError(new HttpError(503, "HTTP 503"));
  assert.match(c.title, /Penthouse is having a problem/i);
  assert.match(c.detail, /on us/i);
  assert.equal(c.canRetry, true);
});

test("an expired session asks for a sign-in and does not offer a pointless retry", () => {
  const c = describeError(new HttpError(401, "Sign in to continue."));
  assert.match(c.title, /sign in/i);
  assert.equal(c.canRetry, false);
});

test("a dropped connection reads as a connection problem", () => {
  for (const m of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
    const c = describeError(new TypeError(m));
    assert.match(c.title, /cannot reach/i, m);
    assert.equal(c.canRetry, true);
  }
});

test("a timeout is named as one", () => {
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.match(describeError(abort).title, /too long/i);
  assert.match(describeError(new HttpError(408, "timeout")).title, /too long/i);
});

test("a status code is never shown as if it were an explanation", () => {
  for (const m of ["HTTP 500", "500", "error", "[object Object]", ""]) {
    const c = describeError(new Error(m));
    assert.equal(/^http \d/i.test(c.detail), false, m);
    assert.ok(c.detail.length > 10, `should say something useful for "${m}"`);
  }
});

test("a real message from the engine is passed through", () => {
  const c = describeError(new Error("could not load league: team not found in league"));
  assert.match(c.detail, /team not found/);
});

test("a plain string is accepted, since that is what the pages used to hold", () => {
  assert.match(describeError("Failed to fetch").title, /cannot reach/i);
  assert.match(describeError("something odd").detail, /something odd/);
});

test("something that is not an error at all still produces copy", () => {
  for (const v of [null, undefined, 42, {}, []]) {
    const c = describeError(v);
    assert.ok(c.title && c.detail, String(v));
  }
});
