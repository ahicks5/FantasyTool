import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backOf,
  chargeDate,
  cleanCode,
  codeComplete,
  dayLabel,
  firstStep,
  formatPhoneAsTyped,
  leagueHome,
  markWalkReturn,
  clearWalkReturn,
  phoneReady,
  progress,
  walkExit,
  PATHS,
} from "./onboarding.ts";
import type { Me } from "./types.ts";

function me(over: Partial<Me> & { name?: string; email?: string; phone?: string | null; tier?: "free" | "premium" } = {}): Me {
  const { name = "Ann", email = "ann@x.com", phone = null, tier = "free", ...rest } = over;
  return {
    email,
    signed_in: true,
    entitlements: ["my_team"],
    leagues_allowed: 3,
    leagues: [],
    trial_eligible: true,
    onboarding: {},
    account: {
      email,
      name,
      role: "user",
      is_admin: false,
      plan: { tier, name: tier === "premium" ? "Week pass" : "Free", skus: [] },
      league_slots: 0,
      phone,
    },
    ...rest,
  };
}

const LEAGUE = { platform: "sleeper" as const, league_id: "1", name: "L", team_id: "5" };

test("a stranger starts at the door they picked", () => {
  assert.equal(firstStep(null, { path: "phone" }), "phone");
  assert.equal(firstStep(null, { path: "email" }), "email");
  assert.equal(firstStep({ ...me(), signed_in: false, account: null }, { path: "phone" }), "phone");
});

test("a signed-in account resumes at its first gap, in order", () => {
  const L = { path: "phone" as const };
  assert.equal(firstStep(me({ name: "" }), L), "name");
  assert.equal(firstStep(me({ name: "", onboarding: { skipped: { name: 1 } } }), L), "league", "a skipped name is finished");
  assert.equal(firstStep(me({ email: "", phone: "+15552345678" }), L), "mailbox");
  assert.equal(firstStep(me({ email: "", phone: "+15552345678", onboarding: { skipped: { email: 1 } } }), L), "league");
  assert.equal(firstStep(me(), L), "league");
  assert.equal(firstStep(me(), { ...L, noLeague: true }), "offer", "no league: the reveal has nothing to show");
  assert.equal(firstStep(me({ leagues: [LEAGUE] }), L), "reveal");
  assert.equal(firstStep(me({ leagues: [LEAGUE], onboarding: { reached: { reveal: 1 } } }), L), "offer");
  assert.equal(firstStep(me({ leagues: [LEAGUE] }), { ...L, revealSeen: true }), "offer");
  assert.equal(firstStep(me({ leagues: [LEAGUE], onboarding: { reached: { reveal: 1 }, skipped: { offer: 1 } } }), L), "done");
  assert.equal(firstStep(me({ leagues: [LEAGUE], trial_eligible: false }), { ...L, revealSeen: true }), "done");
  assert.equal(firstStep(me({ leagues: [LEAGUE], tier: "premium" }), { ...L, revealSeen: true }), "done");
});

test("the bar is never empty and ends full", () => {
  for (const path of ["phone", "email"] as const) {
    assert.ok(progress(PATHS[path][0], path) > 0);
    assert.equal(progress("done", path), 1);
    let last = 0;
    for (const s of PATHS[path]) {
      assert.ok(progress(s, path) > last, `${s} moves the bar forward`);
      last = progress(s, path);
    }
  }
});

test("back only walks through screens that can be undone", () => {
  assert.equal(backOf("code", "phone", false), "phone");
  assert.equal(backOf("password", "email", false), "email");
  assert.equal(backOf("name", "email", false), "password");
  assert.equal(backOf("mailbox", "phone", false), "name");
  assert.equal(backOf("name", "phone", false), null, "the code is spent");
  assert.equal(backOf("mailbox", "phone", true), null, "the account exists");
  assert.equal(backOf("league", "phone", true), null);
  assert.equal(backOf("offer", "phone", true), "reveal");
});

test("a number formats as it is typed and is ready at ten digits", () => {
  assert.equal(formatPhoneAsTyped("5"), "(5");
  assert.equal(formatPhoneAsTyped("5552"), "(555) 2");
  assert.equal(formatPhoneAsTyped("5552345678"), "(555) 234-5678");
  assert.equal(formatPhoneAsTyped("1 555 234 5678"), "(555) 234-5678");
  assert.equal(formatPhoneAsTyped("(555) 234-56789"), "(555) 234-5678");
  assert.equal(formatPhoneAsTyped(""), "");
  assert.equal(formatPhoneAsTyped("+44 7700 900123"), "+44 7700 900123");
  assert.ok(!phoneReady("(555) 234-567"));
  assert.ok(phoneReady("(555) 234-5678"));
  assert.ok(phoneReady("+15552345678"));
});

test("a code is six digits and nothing else", () => {
  assert.equal(cleanCode("12 34-56 7"), "123456");
  assert.ok(codeComplete("123456"));
  assert.ok(!codeComplete("12345"));
});

test("the first charge is a week out, and reads as a short date", () => {
  const d = chargeDate(new Date("2026-10-05T15:00:00Z"), 7);
  assert.equal(d.toISOString(), "2026-10-12T15:00:00.000Z");
  assert.equal(dayLabel(d, "America/New_York"), "Oct 12");
});

test("the walk ends where it was asked to, never back on the league form", () => {
  assert.equal(walkExit(null), "/home");
  assert.equal(walkExit("/connect"), "/home");
  assert.equal(walkExit("/trade"), "/trade");
  assert.equal(walkExit("//evil.example"), "/home");
  assert.equal(walkExit("https://evil.example"), "/home");
});

test("a trip to ESPN or Yahoo comes back to the walk for an hour, then to /connect", () => {
  const box = new Map<string, string>();
  const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v), removeItem: (k: string) => void box.delete(k) };
  assert.equal(leagueHome(store), "/connect");
  markWalkReturn(store, 1_000);
  assert.equal(leagueHome(store, 1_000 + 59 * 60_000), "/register");
  assert.equal(leagueHome(store, 1_000 + 61 * 60_000), "/connect");
  clearWalkReturn(store);
  assert.equal(leagueHome(store, 2_000), "/connect");
  assert.equal(leagueHome(null), "/connect");
});
