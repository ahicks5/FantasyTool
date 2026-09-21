import { test } from "node:test";
import assert from "node:assert/strict";
import { FORM_MIN_GAMES, STANDING_MIN_GAMES, assertWordsOnly, form, group, vibesView } from "./vibes.ts";
import { PLAYER } from "../vocab.ts";
import type { PlayerProfile, ScoutGame, ScoutRead, ScoutSplit } from "../types.ts";

/**
 * The thresholds are this module's opinion, so they are the thing worth pinning. Each test
 * below is a sentence someone could disagree with, and disagreeing means changing a number
 * in one table and watching exactly one test go red.
 */

const split = (over: Partial<ScoutSplit> = {}): ScoutSplit => ({
  season: 2026,
  games: 5,
  points: 60,
  ppg: 12,
  snap_pct: 0.8,
  targets: 40,
  target_share: 0.26,
  carries: null,
  rush_share: null,
  rz_touches: 5,
  yards: 400,
  attempts: null,
  rush_yards: null,
  rec_yards: 400,
  tds: 3,
  pos_rank: 8,
  pos_total: 64,
  best: 22,
  worst: 5,
  ...over,
});

const read = (key: string, tone: ScoutRead["tone"]): ScoutRead => ({ key, head: "x", line: "y", tone });

const game = (week: number, points: number, played = true): ScoutGame => ({
  week,
  opponent: "KC",
  played,
  points,
  snap_pct: 0.8,
  targets: 8,
  carries: null,
  rz_touches: 1,
  yards: 80,
  tds: 0,
});

const profile = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  player: {
    id: "1",
    name: "A Player",
    position: "WR",
    nfl_team: "CIN",
    photo: null,
    years_exp: 4,
    injury_status: null,
    bye_week: null,
  },
  owner: null,
  this_season: split(),
  last_season: null,
  games: [],
  reads: [],
  algo_version: "test",
  ...over,
});

const word = (rows: { key: string; word: string }[], key: string) => rows.find((r) => r.key === key)?.word;

/* ------------------------------------------------------------------- base --- */

test("snap share answers the structural question first", () => {
  const at = (snap_pct: number | null) => vibesView(profile({ this_season: split({ snap_pct }) })).base;
  assert.equal(word(at(0.92), "snaps"), PLAYER.vibes.snaps.every);
  assert.equal(word(at(0.6), "snaps"), PLAYER.vibes.snaps.starter);
  assert.equal(word(at(0.4), "snaps"), PLAYER.vibes.snaps.rotation);
  assert.equal(word(at(0.05), "snaps"), PLAYER.vibes.snaps.sub);
});

test("unlogged snaps are not zero snaps", () => {
  // The platform declining to answer is not the same as a man who never went on, and a
  // page that prints "Barely on" over a starter because a feed is thin is worse than a
  // page with one fewer row.
  const rows = vibesView(profile({ this_season: split({ snap_pct: null }) })).base;
  assert.equal(word(rows, "snaps"), undefined);
});

test("a back and a receiver are judged on different work", () => {
  const back = profile({
    player: { ...profile().player, position: "RB" },
    this_season: split({ rush_share: 0.6, target_share: null }),
  });
  assert.equal(word(vibesView(back).base, "work"), PLAYER.vibes.work.feature);

  // The same fraction is a different sentence for a receiver: 0.6 of a backfield is a
  // feature back, 0.26 of a passing game is already the first read.
  const wr = profile({ this_season: split({ target_share: 0.26 }) });
  assert.equal(word(vibesView(wr).base, "work"), PLAYER.vibes.work.first);
});

test("a quarterback is not asked whether the ball is his", () => {
  const qb = profile({ player: { ...profile().player, position: "QB" }, this_season: split({ target_share: 0.4 }) });
  assert.equal(word(vibesView(qb).base, "work"), undefined);
  // His snaps already answered it.
  assert.ok(word(vibesView(qb).base, "snaps"));
});

test("a rank is a standing only once there are weeks behind it", () => {
  const early = split({ games: STANDING_MIN_GAMES - 1, pos_rank: 1, pos_total: 64 });
  assert.equal(word(vibesView(profile({ this_season: early })).base, "standing"), undefined);

  // WR8 is a man you build around; WR40 is a bench stash.
  const late = split({ games: STANDING_MIN_GAMES, pos_rank: 8 });
  assert.equal(word(vibesView(profile({ this_season: late })).base, "standing"), PLAYER.vibes.standing.elite);
  const mid = split({ games: 6, pos_rank: 40 });
  assert.equal(word(vibesView(profile({ this_season: mid })).base, "standing"), PLAYER.vibes.standing.flex);
});

test("a rank means different things at a deep position and a shallow one", () => {
  // The whole reason there are two tables. QB12 starts in every league in the world; WR12
  // is a first-round pick. One table calls them the same thing and is wrong twice.
  const at = (position: string) =>
    word(
      vibesView(
        profile({
          player: { ...profile().player, position },
          this_season: split({ games: 6, pos_rank: 12 }),
        }),
      ).base,
      "standing",
    );
  assert.equal(at("QB"), PLAYER.vibes.standing.starter);
  assert.equal(at("TE"), PLAYER.vibes.standing.starter);
  assert.equal(at("WR"), PLAYER.vibes.standing.elite);
  assert.equal(at("RB"), PLAYER.vibes.standing.elite);
});

test("a rank the feed did not send is left out, not guessed at", () => {
  const rows = vibesView(profile({ this_season: split({ games: 6, pos_rank: null }) })).base;
  assert.equal(word(rows, "standing"), undefined);
});

/* ------------------------------------------------------------------ trend --- */

test("a trend row takes the engine's own direction, and its colour follows", () => {
  const p = profile({ reads: [read("volume", "up"), read("chances", "down"), read("efficiency", "flat")] });
  const { trend } = vibesView(p);
  assert.deepEqual(
    trend.map((r) => [r.key, r.word, r.verdict]),
    [
      ["volume", PLAYER.vibes.dir.up, "good"],
      ["chances", PLAYER.vibes.dir.down, "bad"],
      ["efficiency", PLAYER.vibes.dir.level, "flat"],
    ],
  );
});

test("form is him against himself, not against his position", () => {
  // Season average 12. Three recent weeks at 20 is hot; at 6 is cold.
  const hot = [game(1, 4), game(2, 4), game(3, 20), game(4, 20), game(5, 20)];
  assert.equal(form(hot, 12)?.word, PLAYER.vibes.form.hot);
  const cold = [game(1, 20), game(2, 20), game(3, 6), game(4, 6), game(5, 6)];
  assert.equal(form(cold, 12)?.word, PLAYER.vibes.form.cold);
  assert.equal(form([game(1, 12), game(2, 12), game(3, 12)], 12)?.word, PLAYER.vibes.form.level);
});

test("two weeks is not form", () => {
  const games = Array.from({ length: FORM_MIN_GAMES - 1 }, (_, i) => game(i + 1, 30));
  assert.equal(form(games, 12), null);
});

test("a bye in the window does not read as the floor falling out", () => {
  // An unplayed week scores zero and would drag the recent mean down by a third.
  const games = [game(1, 12), game(2, 12), game(3, 12), game(4, 0, false)];
  assert.equal(form(games, 12)?.word, PLAYER.vibes.form.level);
});

/* --------------------------------------------------------------- the view --- */

test("the headline is built from what he is, never from a good week", () => {
  const backup = profile({
    player: { ...profile().player, position: "RB" },
    this_season: split({ snap_pct: 0.2, rush_share: 0.05, target_share: null }),
    reads: [read("volume", "up")],
  });
  const { headline } = vibesView(backup);
  // It names him a backup first and only then mentions the climb.
  assert.ok(headline.startsWith(PLAYER.vibes.work.backup), `headline led with the trend: ${headline}`);
  assert.match(headline, /climbing/);
});

test("nothing moving is said as steady, not left blank", () => {
  const p = profile({ reads: [read("volume", "flat")] });
  assert.equal(vibesView(p).headline, PLAYER.vibes.headline.still(PLAYER.vibes.work.first));
});

test("a player with nothing on record says so instead of guessing", () => {
  const bare = profile({ this_season: null, reads: [], games: [] });
  const view = vibesView(bare);
  assert.equal(view.empty, true);
  assert.deepEqual(view.base, []);
  assert.deepEqual(view.trend, []);
});

test("not one digit reaches the page, and a leak throws rather than hides", () => {
  const full = profile({
    reads: [read("volume", "up"), read("chances", "down"), read("efficiency", "up")],
    games: [game(1, 10), game(2, 14), game(3, 18)],
  });
  const view = vibesView(full);
  for (const s of [view.headline, ...[...view.base, ...view.trend].flatMap((r) => [r.label, r.word])]) {
    assert.ok(!/\d/.test(s), `Vibes printed a number: ${s}`);
  }
  // The guard is the point: a label someone adds later with a number in it must stop the
  // page, not quietly render. Vibes is the one surface where a digit is a bug.
  assert.throws(
    () => assertWordsOnly({ ...view, headline: "Targets up 3 a game." }),
    /words only/,
  );
});

test("position groups fall back rather than throw on an unknown one", () => {
  assert.equal(group("QB"), "QB");
  assert.equal(group("HB"), "RB");
  assert.equal(group("TE"), "WR");
  assert.equal(group(null), "WR");
});
