// Pure helpers (no React, no DOM, no clock read at load) so they can be unit tested
// with node:test. The whole game-day answer is computed here; `GameDay.tsx` only draws it.
//
// The question this module answers is the one people open the Depth tab with: *am I good
// for game day, and did anything just happen?* Three reads, in the order you would ask
// them — how many starters are clear, what news landed in the last two days, and what is
// structurally broken about the lineup right now.
//
// The rule underneath all of it: **never invent a fact about a player.** Every word about
// a player here is either the platform's own (`injury_status`, `injury_body_part`) or a
// statement about the lineup's shape ("no one in this slot", "on bye"). There is no
// inference, no "probably", no guessed return date. Three of the fields this reads are
// optional and may be missing entirely from an older API build, and the absence of a
// field is never evidence of anything: a player with no `news_updated` simply does not
// appear in "Just in", and a roster with none of them still produces all three views.

import type { Lineup, Player } from "./types";

/* ------------------------------------------------------------------- copy ---
   TEMPORARY. Every user-facing string in this feature lives in this block until
   it moves to `web/src/lib/vocab.ts`, which another agent owns. Nothing below
   this block, and nothing in `GameDay.tsx`, may contain a word a user reads —
   when these move, this object is deleted and the import swapped.              */

export const GAMEDAY_COPY = {
  /** The three row titles. */
  checkTitle: "Game day check",
  newsTitle: "Just in",
  problemsTitle: "Slot problems",

  /** The headline, when nobody carries a question. */
  checkClear: (starters: number) => `All ${starters} starters clear`,
  /** The headline, when somebody does. */
  checkMixed: (clear: number, questions: number) =>
    `${clear} clear · ${questions} to check`,
  /** No lineup at all — an empty `slots` array, which is a real API answer. */
  checkEmpty: "No starters to check",
  /**
   * The stamp on a clean bill of health. One word on purpose: at 320px it shares the
   * row with the title, and the call sheet has already shipped a stamp that ate its
   * own heading ("Depth ch..."). Five letterspaced caps leave the title ~150px, which
   * "Game day check" fits with room to spare. The line beside it carries the meaning
   * in full, so the stamp is never the only channel.
   */
  checkStamp: "Clear",

  newsNone: "Nothing new in 48 hours",
  newsSome: (n: number) => `${n} ${n === 1 ? "update" : "updates"} in the last 48 hours`,

  problemsNone: "No holes in the lineup",
  problemsSome: (n: number) => `${n} to fix`,

  /** What a slot with nobody in it is called, and what is wrong with it. */
  emptyName: "Empty",
  emptyDetail: "No one in this slot",
  /** A starter whose bye week is this week. */
  byeDetail: "On bye this week",
  /** The slug beside a player who is not starting. */
  benchSlug: "BN",

  /** Relative time, newest first. Never shown for a player with no timestamp. */
  agoNow: "Just now",
  agoMinutes: (m: number) => `${m}m ago`,
  agoHours: (h: number) => `${h}h ago`,
  agoDays: (d: number) => `${d}d ago`,
} as const;

/* ------------------------------------------------------------- vocabulary ---
   What the platforms actually send, and what the engine does with it.         */

/** News older than this is not "just in". Two days covers a Thursday-to-Sunday week. */
export const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Statuses that mean "healthy", uppercased.
 *
 * Both connectors already normalise a healthy player to `null` (ESPN's `ACTIVE` and
 * `NORMAL` map to `None` in `edge/connectors/espn.py`), so in practice this only
 * defends against an older or hand-rolled payload that spells it out. Anything else —
 * any word at all — is a question, because we do not get to decide that a status the
 * platform bothered to send means nothing.
 */
const CLEAR_STATUSES = new Set(["", "ACTIVE", "NORMAL", "HEALTHY"]);

/**
 * Statuses the engine scores as zero — `ZERO_STATUSES` in `edge/engine/lineup.py`,
 * kept character for character.
 *
 * It is deliberately that set and not a shorter "he is definitely not playing" list:
 * these are the statuses the projection behind the board has already been zeroed for,
 * so a starter carrying one is a hole in the lineup whether or not he technically
 * suits up. `DOUBTFUL` is in it for that reason. If the engine's set moves, move this
 * with it — the two disagreeing is how a lineup shows a real projection beside a
 * "won't play" flag.
 */
const HARD_OUT_STATUSES = new Set(["OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL"]);

const up = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();

/** True when the platform is not flagging anything about this player. */
export function isClear(status: string | null | undefined): boolean {
  return CLEAR_STATUSES.has(up(status));
}

/** True when the engine scores this status as zero. */
export function isHardOut(status: string | null | undefined): boolean {
  return HARD_OUT_STATUSES.has(up(status));
}

/**
 * Is this player off this week?
 *
 * `bye_week` is optional and null when the platform did not say. It is never 0 — that
 * is a real week — so a falsy check would be wrong as well as lazy, and a missing bye
 * is never read as "he plays".
 */
export function isOnBye(p: Player | null, week: number): boolean {
  return !!p && typeof p.bye_week === "number" && p.bye_week === week;
}

/**
 * The platform's news timestamp, or null.
 *
 * `news_updated` is optional, nullable, and — on an API built before it landed — simply
 * absent. A non-number is always null here rather than 0, because 0 is a valid epoch and
 * would date every such player to 1970.
 */
export function newsAt(p: Player | null | undefined): number | null {
  const t = p?.news_updated;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

/**
 * Is this news inside the window? Inclusive at the boundary: news exactly 48 hours old
 * is still the last 48 hours. A timestamp in the future is recent, not excluded — see
 * `ago` for why we treat that as a skewed clock rather than as a bad row.
 */
export function isRecentNews(updated: number | null, now: number): updated is number {
  return updated !== null && now - updated <= NEWS_WINDOW_MS;
}

/**
 * "2h ago". Clamped at zero: a timestamp slightly in the future is a clock skewing,
 * not news from the future, and it reads as "Just now" rather than as a negative.
 */
export function ago(updated: number, now: number): string {
  const ms = Math.max(0, now - updated);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return GAMEDAY_COPY.agoNow;
  if (mins < 60) return GAMEDAY_COPY.agoMinutes(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return GAMEDAY_COPY.agoHours(hours);
  return GAMEDAY_COPY.agoDays(Math.floor(hours / 24));
}

/* ------------------------------------------------------------ the answers ---  */

export type QuestionKind = "empty" | "bye" | "injury";

/** One starter who is not simply fine, with the platform's own words for why. */
export interface StarterQuestion {
  key: string;
  slot: string;
  /** Null when the slot is empty — there is no player to name. */
  name: string | null;
  position: string | null;
  nflTeam: string | null;
  kind: QuestionKind;
  /** The platform's status, verbatim. Null for a bye or an empty slot. */
  status: string | null;
  /** The platform's body part, verbatim, when it sent one. */
  bodyPart: string | null;
  /** The whole second line, composed: "Questionable · Hamstring". */
  detail: string;
  /** The engine already scores this man as zero. */
  hardOut: boolean;
  /** When the platform last had news on him, epoch ms, or null when it sent none. */
  newsUpdated: number | null;
}

export interface GameDayCheck {
  starters: number;
  clear: number;
  questions: StarterQuestion[];
  allClear: boolean;
  /** The one line the collapsed row shows. */
  line: string;
}

/** One player the platform has said something about recently. */
export interface NewsRow {
  key: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  /** Current status, verbatim, or null. The timestamp says *when*, never *what*. */
  status: string | null;
  bodyPart: string | null;
  /** The status line, composed, or "" when the platform is flagging nothing. */
  detail: string;
  starting: boolean;
  /** The slot he starts in, or the bench slug. */
  slug: string;
  updated: number;
  ago: string;
}

export interface JustIn {
  rows: NewsRow[];
  line: string;
}

export type ProblemKind = "empty" | "bye" | "out";

/** A structural fault: this slot scores zero as things stand, and a human should know. */
export interface SlotProblem {
  key: string;
  slot: string;
  name: string | null;
  position: string | null;
  nflTeam: string | null;
  kind: ProblemKind;
  status: string | null;
  bodyPart: string | null;
  detail: string;
}

export interface SlotProblems {
  rows: SlotProblem[];
  line: string;
}

export interface GameDay {
  check: GameDayCheck;
  justIn: JustIn;
  problems: SlotProblems;
}

/**
 * Joins the parts that are actually there with the interpunct the app uses everywhere.
 *
 * Punctuation, not copy — which is why it lives here rather than in `vocab.ts`. It also
 * means a missing field costs nothing: no leading separator, no empty tail, no "· null".
 */
export function dotted(...parts: (string | null | undefined)[]): string {
  return parts.map((part) => (part ?? "").trim()).filter(Boolean).join(" · ");
}

/** "WR CIN", or whichever half the platform sent, or "". */
export function playerMeta(position: string | null, nflTeam: string | null): string {
  return [position, nflTeam].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
}

/** "Questionable · Hamstring", or just the status, or "" when there is nothing to say. */
function statusDetail(p: Player | null): string {
  const status = p?.injury_status?.trim();
  if (!status) return "";
  return dotted(status, p?.injury_body_part);
}

/**
 * The headline: how many starters are clear, and who is not.
 *
 * A question is a starter with a status that is not clear, a starter on his bye, or a
 * slot with nobody in it. The three are one count on purpose — the reader is asking one
 * question ("am I good?") and three separate tallies would be three answers to it.
 */
function checkStarters(lineup: Lineup): GameDayCheck {
  const questions: StarterQuestion[] = [];

  lineup.slots.forEach((s, i) => {
    const key = `${s.slot}-${i}`;
    const p = s.player;
    if (!p) {
      questions.push({
        key,
        slot: s.slot,
        name: null,
        position: null,
        nflTeam: null,
        kind: "empty",
        status: null,
        bodyPart: null,
        detail: GAMEDAY_COPY.emptyDetail,
        hardOut: false,
        newsUpdated: null,
      });
      return;
    }
    // A bye outranks a status: he is not on the field at all this week, whatever the
    // injury report says about him.
    if (isOnBye(p, lineup.week)) {
      questions.push({
        key,
        slot: s.slot,
        name: p.name,
        position: p.position ?? null,
        nflTeam: p.nfl_team ?? null,
        kind: "bye",
        status: p.injury_status ?? null,
        bodyPart: p.injury_body_part ?? null,
        detail: GAMEDAY_COPY.byeDetail,
        // Strictly a statement about the status the platform sent, never about the bye:
        // the engine does not zero a player for being off this week, and the two facts
        // stay separate so neither is ever reported as the other.
        hardOut: isHardOut(p.injury_status),
        newsUpdated: newsAt(p),
      });
      return;
    }
    if (!isClear(p.injury_status)) {
      questions.push({
        key,
        slot: s.slot,
        name: p.name,
        position: p.position ?? null,
        nflTeam: p.nfl_team ?? null,
        kind: "injury",
        status: p.injury_status ?? null,
        bodyPart: p.injury_body_part ?? null,
        detail: statusDetail(p),
        hardOut: isHardOut(p.injury_status),
        newsUpdated: newsAt(p),
      });
    }
  });

  const starters = lineup.slots.length;
  const clear = starters - questions.length;
  const allClear = questions.length === 0;
  const line =
    starters === 0
      ? GAMEDAY_COPY.checkEmpty
      : allClear
        ? GAMEDAY_COPY.checkClear(starters)
        : GAMEDAY_COPY.checkMixed(clear, questions.length);

  return { starters, clear, questions, allClear, line };
}

/** Every player on the roster once, with the slot he starts in if he starts. */
function rosterEntries(lineup: Lineup): { player: Player; slug: string; starting: boolean }[] {
  const out: { player: Player; slug: string; starting: boolean }[] = [];
  for (const s of lineup.slots) {
    if (s.player) out.push({ player: s.player, slug: s.slot, starting: true });
  }
  for (const b of lineup.bench) {
    out.push({ player: b.player, slug: GAMEDAY_COPY.benchSlug, starting: false });
  }
  return out;
}

/**
 * What the platform has said in the last 48 hours, newest first.
 *
 * `news_updated` is the whole filter. A player without it does not appear — not as
 * "just now", not as an epoch, not at the bottom. The field is optional and an API
 * built before it landed sends none at all, in which case this view says so and that
 * is a true answer rather than a broken one.
 */
function justIn(lineup: Lineup, now: number): JustIn {
  const rows: NewsRow[] = [];

  rosterEntries(lineup).forEach(({ player: p, slug, starting }, i) => {
    const updated = newsAt(p);
    if (!isRecentNews(updated, now)) return;
    rows.push({
      key: `${p.id}-${i}`,
      name: p.name,
      position: p.position ?? null,
      nflTeam: p.nfl_team ?? null,
      status: p.injury_status ?? null,
      bodyPart: p.injury_body_part ?? null,
      detail: statusDetail(p),
      starting,
      slug,
      updated,
      ago: ago(updated, now),
    });
  });

  // Newest first, and name-ordered inside a tie so the list is stable between renders.
  rows.sort((a, b) => b.updated - a.updated || a.name.localeCompare(b.name));

  return { rows, line: rows.length ? GAMEDAY_COPY.newsSome(rows.length) : GAMEDAY_COPY.newsNone };
}

/**
 * Structural faults in the starting lineup: an empty slot, a starter on his bye, a
 * starter the engine already scores as zero.
 *
 * Unambiguous facts only — nothing here is a projection call, which is what the board
 * underneath is for. Rows come in slot order, one per slot at most: a man who is both on
 * his bye and on the injury report is one hole, not two, and inside a slot `empty`
 * outranks `bye` outranks `out` — the order in which the fault is certain.
 */
function slotProblems(lineup: Lineup): SlotProblems {
  const rows: SlotProblem[] = [];

  lineup.slots.forEach((s, i) => {
    const key = `${s.slot}-${i}`;
    const p = s.player;
    const base = {
      key,
      slot: s.slot,
      name: p?.name ?? null,
      position: p?.position ?? null,
      nflTeam: p?.nfl_team ?? null,
      status: p?.injury_status ?? null,
      bodyPart: p?.injury_body_part ?? null,
    };
    if (!p) {
      rows.push({ ...base, kind: "empty", detail: GAMEDAY_COPY.emptyDetail });
      return;
    }
    if (isOnBye(p, lineup.week)) {
      rows.push({ ...base, kind: "bye", detail: GAMEDAY_COPY.byeDetail });
      return;
    }
    if (isHardOut(p.injury_status)) {
      rows.push({ ...base, kind: "out", detail: statusDetail(p) });
    }
  });

  return { rows, line: rows.length ? GAMEDAY_COPY.problemsSome(rows.length) : GAMEDAY_COPY.problemsNone };
}

/**
 * The whole game-day read on one lineup.
 *
 * `now` is injected rather than read from the clock so that the 48-hour window is
 * testable and so this module holds no hidden state at import time.
 */
export function gameDay(lineup: Lineup, now: number): GameDay {
  return {
    check: checkStarters(lineup),
    justIn: justIn(lineup, now),
    problems: slotProblems(lineup),
  };
}

/* ----------------------------------------------------------------- alarm ---  */

export type AlarmLevel = "critical" | "warning";

/**
 * Something the front page should shout about, or null.
 *
 * One judgement, exported so the call sheet and the Depth tab cannot drift: the players
 * it returns are the same `StarterQuestion` rows the Depth tab draws, built by the same
 * pass over the same lineup. If "important" ever changes, it changes here and both
 * surfaces change with it.
 */
export interface Alarm {
  level: AlarmLevel;
  /** The players at `level`, in slot order. Never empty — no alarm is `null`. */
  players: StarterQuestion[];
}

/**
 * Is anything on this lineup worth interrupting someone for?
 *
 * Most weeks this is `null`, which is the case that matters most: an alert that fires
 * every week is furniture, and furniture gets ignored on the week it is real.
 *
 * **Starters only.** A bench player being ruled out is a roster note, not a front-page
 * event — nothing is lost from your Sunday by an inactive third tight end.
 *
 * `critical` is *certain and costly*: this slot scores zero as things stand. That is an
 * empty slot, a starter on his bye, or a starter whose status is one the engine itself
 * zeroes (`ZERO_STATUSES` in `edge/engine/lineup.py`). No timestamp is required — a
 * starter who will not play is worth shouting about whether the news broke an hour ago
 * or last Tuesday, and stale news is not a reason to be quiet about a hole.
 *
 * `warning` is *soft and fresh*: a starter carrying a status that is not clear and not
 * a hard out — Questionable is the everyday case — **and** news on him inside
 * `NEWS_WINDOW_MS`. The freshness is what makes it an alert rather than a fact: a
 * Questionable tag that has sat there since Wednesday is the Depth tab's business, while
 * one that moved this morning is why someone opens the app. Without `news_updated` we
 * cannot tell those apart, so we do not guess — an API that sends no timestamps raises
 * no warnings at all, and the Depth tab still shows every one of them in full.
 *
 * Only the worse level is returned, with only its own players. The front page has room
 * for one alarm; the tab underneath has the whole picture.
 */
export function alarm(lineup: Lineup, now: number): Alarm | null {
  const { questions } = checkStarters(lineup);

  // Everything that is not merely a soft injury flag: empty, bye, or engine-zeroed.
  const critical = questions.filter((q) => q.kind !== "injury" || q.hardOut);
  if (critical.length > 0) return { level: "critical", players: critical };

  const warning = questions.filter((q) => isRecentNews(q.newsUpdated, now));
  return warning.length > 0 ? { level: "warning", players: warning } : null;
}
