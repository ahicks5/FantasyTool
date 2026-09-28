import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// yahooAuth reads window.localStorage, window.sessionStorage and window.addEventListener.
const local = new Map<string, string>();
const session = new Map<string, string>();
const fake = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, v),
  removeItem: (k: string) => void m.delete(k),
});
(globalThis as unknown as { window: unknown }).window = {
  localStorage: fake(local),
  sessionStorage: fake(session),
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { clearYahooAuth, loadYahooAuth, newYahooState, saveYahooAuth, takeYahooState, yahooAuthHeaders } = await import(
  "./yahooAuth.ts"
);

beforeEach(() => {
  local.clear();
  session.clear();
  clearYahooAuth();
});

test("no sign-in, no header", () => {
  assert.deepEqual(yahooAuthHeaders(), {});
});

test("a saved sign-in rides as the one header, and expires a minute early", () => {
  const before = Date.now();
  saveYahooAuth({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
  assert.deepEqual(yahooAuthHeaders(), { "X-Yahoo-Token": "acc" });
  const t = loadYahooAuth()!;
  assert.equal(t.refresh_token, "ref");
  assert.ok(t.expires_at >= before + 3540_000 && t.expires_at <= Date.now() + 3540_000);
});

test("a refresh replaces the whole pair, since Yahoo revokes the old refresh token", () => {
  saveYahooAuth({ access_token: "a1", refresh_token: "r1", expires_in: 3600 });
  saveYahooAuth({ access_token: "a2", refresh_token: "r2", expires_in: 3600 });
  assert.equal(loadYahooAuth()!.refresh_token, "r2");
});

test("forgetting it clears it", () => {
  saveYahooAuth({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
  clearYahooAuth();
  assert.equal(loadYahooAuth(), null);
  assert.deepEqual(yahooAuthHeaders(), {});
});

test("the sign-in state is accepted once, and only the one this tab sent", () => {
  const s = newYahooState();
  assert.match(s, /^[0-9a-f]{48}$/);
  assert.equal(takeYahooState("forged"), false, "a forged callback is refused");
  const s2 = newYahooState();
  assert.equal(takeYahooState(s2), true);
  assert.equal(takeYahooState(s2), false, "a replayed callback is refused");
  assert.equal(takeYahooState(null), false);
});
