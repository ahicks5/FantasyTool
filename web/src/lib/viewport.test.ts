import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TABLET_REM, TABLET_UP, isTabletUp } from "./viewport.ts";

test("script's tablet breakpoint is the stylesheet's", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const m = css.match(/--breakpoint-tablet:\s*([\d.]+)rem/);
  assert.ok(m, "globals.css defines --breakpoint-tablet in rem");
  assert.equal(Number(m[1]), TABLET_REM);
  assert.equal(TABLET_UP, "(min-width: 44rem)");
});

test("on the server nothing is a tablet", () => {
  assert.equal(isTabletUp(), false);
});
