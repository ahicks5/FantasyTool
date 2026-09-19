import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEXABLE_PATHS, NOINDEX_PATHS, normalizeSiteUrl, resolveSiteUrl } from "./site.ts";

test("an explicit site URL wins, because VERCEL_URL is not the domain people visit", () => {
  assert.equal(
    resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://edge.example.com", VERCEL_URL: "edge-abc123.vercel.app" }),
    "https://edge.example.com",
  );
});

test("Vercel's bare hostname gets a scheme", () => {
  assert.equal(resolveSiteUrl({ VERCEL_URL: "edge-abc123.vercel.app" }), "https://edge-abc123.vercel.app");
});

test("the production domain beats the per-deployment one", () => {
  assert.equal(
    resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "edge.example.com", VERCEL_URL: "edge-abc123.vercel.app" }),
    "https://edge.example.com",
  );
});

test("falls back to localhost for next dev", () => {
  assert.equal(resolveSiteUrl({}), "http://localhost:3000");
});

test("trailing slashes are dropped so joined paths do not double up", () => {
  assert.equal(normalizeSiteUrl("https://edge.example.com/"), "https://edge.example.com");
  assert.equal(normalizeSiteUrl("https://edge.example.com///"), "https://edge.example.com");
  assert.equal(new URL("/og.png", resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://e.test/" })).href,
    "https://e.test/og.png");
});

test("blank and whitespace values do not become a scheme on its own", () => {
  assert.equal(normalizeSiteUrl(""), "");
  assert.equal(normalizeSiteUrl("   "), "");
  assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "  " }), "http://localhost:3000");
});

test("http is left alone, so a local build is not claimed to be https", () => {
  assert.equal(normalizeSiteUrl("http://localhost:3000"), "http://localhost:3000");
});

test("the app pages kept out of search do not overlap the ones put in", () => {
  const indexed = new Set<string>(INDEXABLE_PATHS);
  for (const p of NOINDEX_PATHS) assert.equal(indexed.has(p), false, `${p} is in both lists`);
});
