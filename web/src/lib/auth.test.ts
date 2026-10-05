import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// auth.ts reads window.localStorage and listens for the cross-tab `storage` event.
const local = new Map<string, string>();
const handlers: Record<string, ((e: unknown) => void)[]> = {};
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
    removeItem: (k: string) => void local.delete(k),
  },
  addEventListener: (type: string, cb: (e: unknown) => void) => void (handlers[type] ??= []).push(cb),
  removeEventListener: () => {},
};
const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));

const { KEY, clearToken, hasToken, loadToken, onAuthChange, saveToken } = await import("./auth.ts");

let calls = 0;
const off = onAuthChange(() => {
  calls += 1;
});

beforeEach(() => {
  local.clear();
  calls = 0;
});

test("saving and clearing the token tells the listeners", () => {
  saveToken("t1");
  assert.equal(loadToken(), "t1");
  assert.equal(hasToken(), true);
  clearToken();
  assert.equal(hasToken(), false);
  assert.equal(calls, 2);
});

test("a sign-in or sign-out in another tab reaches this one", () => {
  fire("storage", { key: KEY });
  assert.equal(calls, 1, "the token changed elsewhere");
  fire("storage", { key: null });
  assert.equal(calls, 2, "all storage cleared elsewhere");
  fire("storage", { key: "booth.theme" });
  assert.equal(calls, 2, "an unrelated key is not a sign-in");
});

test("the storage listener is wired once, however many listen", () => {
  const more = onAuthChange(() => {});
  assert.equal(handlers.storage.length, 1);
  more();
});

test("an unsubscribed listener hears nothing", () => {
  off();
  saveToken("t2");
  assert.equal(calls, 0);
});
