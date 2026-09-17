import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// espnAuth reads window.localStorage and window.addEventListener; give it just enough of both.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { clearEspnAuth, espnAuthHeaders, loadEspnAuth, normalizeSwid, saveEspnAuth } = await import("./espnAuth.ts");

beforeEach(() => {
  store.clear();
  clearEspnAuth();
});

test("SWID gets its braces back however it was pasted", () => {
  assert.equal(normalizeSwid("DEAD-BEEF"), "{DEAD-BEEF}");
  assert.equal(normalizeSwid("{DEAD-BEEF}"), "{DEAD-BEEF}");
  assert.equal(normalizeSwid("  DEAD-BEEF  "), "{DEAD-BEEF}");
  assert.equal(normalizeSwid(""), "");
});

test("saved credentials come back normalized and trimmed", () => {
  saveEspnAuth("  s2value  ", "DEAD-BEEF");
  assert.deepEqual(loadEspnAuth(), { s2: "s2value", swid: "{DEAD-BEEF}" });
});

test("headers are sent only when we have a whole credential", () => {
  assert.deepEqual(espnAuthHeaders(), {});
  saveEspnAuth("s2value", "DEAD-BEEF");
  assert.deepEqual(espnAuthHeaders(), { "X-ESPN-S2": "s2value", "X-ESPN-SWID": "{DEAD-BEEF}" });
  saveEspnAuth("s2value", "");
  assert.deepEqual(espnAuthHeaders(), {}, "half a credential is no credential");
});

test("forgetting really forgets", () => {
  saveEspnAuth("s2value", "DEAD-BEEF");
  clearEspnAuth();
  assert.equal(loadEspnAuth(), null);
  assert.deepEqual(espnAuthHeaders(), {});
  assert.equal(JSON.stringify([...store.entries()]).includes("s2value"), false);
});

test("corrupt storage is ignored rather than thrown", () => {
  store.set("edge.espn.auth", "{not json");
  assert.equal(loadEspnAuth(), null);
});

test("blocked storage does not break the page", () => {
  const win = (globalThis as unknown as { window: { localStorage: unknown } }).window;
  const real = win.localStorage;
  win.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => saveEspnAuth("s2value", "DEAD-BEEF"));
  assert.equal(loadEspnAuth(), null);
  assert.deepEqual(espnAuthHeaders(), {});
  win.localStorage = real;
});
