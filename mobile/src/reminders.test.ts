import { test } from "node:test";
import assert from "node:assert/strict";
import { SEASON_LAST_DAY, upcomingReminders } from "./reminders.ts";

const et = (iso: string) => new Date(iso).getTime();

test("a week ahead: Thursday 7 PM and Sunday noon, Eastern, soonest first", () => {
  // Monday 5 October 2026, 9 AM ET (EDT, UTC-4).
  const now = et("2026-10-05T13:00:00Z");
  const r = upcomingReminders(now, 7);
  assert.deepEqual(
    r.map((x) => [x.kind, new Date(x.at).toISOString()]),
    [
      ["thursday", "2026-10-08T23:00:00.000Z"],
      ["sunday", "2026-10-11T16:00:00.000Z"],
    ],
  );
  assert.ok(r.every((x) => x.path === "/team"), "every reminder opens the lineup");
});

test("the November clock change moves the instant, not the wall time", () => {
  // Sunday 1 November 2026 is the change; noon ET is 17:00 UTC from then on.
  const r = upcomingReminders(et("2026-10-30T12:00:00Z"), 10).filter((x) => x.kind === "sunday");
  assert.deepEqual(r.map((x) => new Date(x.at).toISOString()), ["2026-11-01T17:00:00.000Z", "2026-11-08T17:00:00.000Z"]);
});

test("a reminder already past is never scheduled", () => {
  // Sunday 11 October 2026, 12:30 PM ET: noon has gone, next is Thursday.
  const r = upcomingReminders(et("2026-10-11T16:30:00Z"), 7);
  assert.equal(r[0].kind, "thursday");
  assert.ok(r.every((x) => x.at > et("2026-10-11T16:30:00Z")));
});

test("nothing after the season's last Sunday", () => {
  const r = upcomingReminders(et("2027-01-01T12:00:00Z"), 28);
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => x.at <= SEASON_LAST_DAY));
  assert.deepEqual(upcomingReminders(et("2027-01-11T12:00:00Z"), 28), []);
});

test("four weeks is eight reminders, well under iOS's 64 pending", () => {
  assert.equal(upcomingReminders(et("2026-10-05T13:00:00Z"), 28).length, 8);
});
