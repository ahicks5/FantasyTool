/**
 * Every section name the app says out loud, in one place.
 *
 * Coach vocabulary, and it survives the rebrand on purpose: the owner's suite is where the
 * sheet is *read*, not a reason to rename the sheet. The nav names a room (call sheet,
 * depth chart, scouting, the GM's Office, the film) while what you *buy* is named by what it
 * is (the week pass, the season pass, a league slot). Prices live in `edge/products.py`;
 * the names a user reads for them are `PRICING.names`, here.
 *
 * It is one module rather than strings scattered across five pages and a tab bar
 * because renaming a section otherwise means a sweep through the app and its tests,
 * and a sweep is how a rename ends up half-applied.
 *
 * - `label` is the tab, which has about nine characters before it wraps on a phone.
 * - `title` is the page's h1.
 * - There is no blurb under the h1 any more (Andrew, 2026-09-21: "get rid of it"). The
 *   right of the title band carries the league nameplate instead (`Shell.tsx`).
 * - `gate` is a noun phrase that has to read inside "…and {gate} shows up here",
 *   so it carries its own article. "depth chart shows up here" is what you get
 *   when the h1 is reused for prose, and it reads like a dropped word.
 */
import type { Confidence } from "./types";
import { ordinal } from "./format.ts";

export interface Section {
  href: string;
  label: string;
  title: string;
  gate: string;
}

export const SECTIONS = {
  // The front page is the owner's desk: what landed overnight, this week's matchup, and
  // the staff's notebooks. The ranked call sheet it used to open on is gone (Andrew,
  // 2026-09-21): the notebooks are the rooms, and the desk only says which to open.
  home: {
    href: "/home",
    label: "Desk",
    title: "The desk",
    gate: "your desk",
  },
  /** One story off the desk and what to do about it. A room off the desk, under `/home/`
   *  so the desk tab stays lit; the story is named in the query string, never in the path,
   *  because the static demo export cannot pre-render a path it has not seen. */
  plan: {
    href: "/home/plan",
    label: "Plan",
    title: "Action plan",
    gate: "the action plan",
  },
  // "Lineup", everywhere: the tab, the page, the notebook on the desk. It used to be five
  // different things ("Depth chart", "Start / sit", "/team"...), and Andrew picked the word
  // people arrive with. "Depth chart" now means only an NFL team's depth chart, which is
  // how the action plan already uses it. The URL stays `/team` so links do not break.
  team: {
    href: "/team",
    label: "Lineup",
    title: "Lineup",
    gate: "your lineup",
  },
  waivers: {
    href: "/waivers",
    label: "Scouting",
    title: "Scouting",
    gate: "the wire",
  },
  trade: {
    href: "/trade",
    label: "GM's Office",
    title: "GM's Office",
    gate: "the trade board",
  },
  report: {
    href: "/report",
    label: "Film",
    title: "The film",
    gate: "the film",
  },
  /** Position Battle: two men, one spot. Under `/team/` so the Lineup tab stays lit; the
   *  two men are named in the query string, which the static export can serve. */
  battle: {
    href: "/team/battle",
    label: "Battle",
    title: "Position Battle",
    gate: "the battle",
  },
  /** A room off the call sheet, not a tab of its own: it lives under `/home/` so the
   *  call sheet tab stays lit while you are reading the week's opponent. */
  matchup: {
    href: "/home/matchup",
    label: "Matchup",
    title: "Matchup",
    gate: "this week\u2019s matchup",
  },
} as const satisfies Record<string, Section>;

export type SectionKey = keyof typeof SECTIONS;

/**
 * Tab order, left to right. The call sheet is first because it is the whole product.
 *
 * Not every section is a tab — `matchup` is a room off the call sheet — so `TabKey` is
 * narrower than `SectionKey`, and anything keyed by tab (the icon map) has to be
 * exhaustive over the tabs only. Typing it the other way round meant adding a
 * non-tab section demanded an icon for a tab that does not exist.
 */
export const TAB_ORDER = ["home", "team", "waivers", "trade", "report"] as const;

export type TabKey = (typeof TAB_ORDER)[number];

/** The tab row's name for a screen reader, on the top bar at tablet width and up. */
export const TABS_ARIA = "Sections";

/**
 * The lines the brand says out loud, in one place for the same reason the section
 * names are: a copy change that lands on three of four surfaces is worse than one
 * that lands nowhere.
 *
 * One tagline, and every other line has exactly one job. They are not
 * interchangeable — `hero` does competitive work, `threshold` does welcoming work,
 * and swapping them makes the landing page sound like a lobby.
 *
 * Voice: verb first, plural, no hedge, no exclamation marks. See docs/BRAND.md §3.
 */
export const LINES = {
  /** Under the wordmark, on the unfurl card, at the foot of the email. Locked. */
  tagline: "Own the week.",

  /** The marketing h1. Its whole job is the contrast with an encyclopedia. */
  hero: "Three moves before kickoff.",
  /** The second beat, where the contrast is said out loud. */
  heroSub: "Everyone else hands you a database. We hand you a call sheet.",

  /** Crossing the threshold: /login, and the first email subject. */
  threshold: "Welcome to the owner\u2019s box.",
  /** The same move where the line has to be shorter. */
  thresholdShort: "Take the top floor.",
  /** The wordmark is a link: the call sheet signed in, the landing page signed out. */
  homeAria: "Owner's Suite home",

  /**
   * The h1 on /connect. It is the one page in the app that is a task rather than a
   * welcome: somebody who has already tapped "Open the Owner's Suite" knows where they
   * are and needs to be told what to do next, and a second welcome in a row reads as
   * a lobby with two receptionists. `threshold` still does the welcoming on /login,
   * where there is nothing to do but arrive.
   */
  connect: "Connect your league.",

  /** The season pass, as a sentence — it sits above the price on the pricing card. */
  paywallBundle: "The rest of the building.",
  /** The season as a control. Buttons are verb first, and a full stop reads badly
   *  next to the price that follows it ("Take the season · $29.99"). */
  paywallBundleCta: "Take the season",
  /** The week pass as a control: the low step in, next to the season. */
  paywallWeekCta: "Try a week",
  /** The one button on the haze (Andrew, 2026-09-28): it opens the payment sheet, which offers both passes. */
  paywallGo: "Go premium",
  /** Under the teaser on the haze: the cheapest way in, read off the catalog. */
  paywallFrom: (price: string) => `As low as ${price}`,
} as const;

/**
 * The ride up. The opening is an elevator to the top floor (`components/Elevator.tsx`),
 * and these are the few words on the car: the plate above the doors, the display on
 * the wall, and the one control. The staff lines that tick on the way up live in
 * `lib/elevator.ts`, because the ride's timing is derived from their count.
 */
export const RIDE = {
  /** What a screen reader is told the overlay is. */
  aria: "Riding up to the Owner's Suite",
  /** Above the doors while the car climbs. */
  goingUp: "Going up",
  /** Above the doors once it has stopped. */
  topFloor: "Top floor",
  /** The top floor's button and the plate's last stop: the suite itself (W-014, no "PH"). */
  topButton: "OS",
  /** The eyebrow on the car's display: whose office this is. */
  owner: "Owner",
  /** The one control. A ride is a first impression, not a toll. */
  skip: "Tap to skip",
} as const;

/**
 * The call sheet's three benches, and what each one says when it has nothing to call.
 *
 * The sheet used to be one flat ranked list of cards, which answers "what is the single
 * biggest move" and nothing else. Grouped under the tab that owns each call, it answers
 * the question people actually arrive with — is my lineup set, is anything on the wire,
 * is there a deal — and it answers it *even when the answer is no*, which a list of cards
 * structurally cannot: a settled lineup contributes no card, so a quiet week used to read
 * as a broken screen.
 *
 * `clear` is a status, not a boast. `lineup.advise` holds any swap inside the 1.5-point
 * noise band (`NOISE_MARGIN`), so "set" has to mean *nothing worth calling* and never
 * "provably optimal" — see the confidence section of CLAUDE.md for why that distinction
 * is the difference between a true claim and a false one.
 *
 * Keyed by `TabKey` so the group and the tab its arrow points at can never drift apart;
 * `report` and `home` have no calls of their own, which is why this is a subset.
 */
/**
 * The owner's desk: the front page. A paper for what just happened, a paper for who is
 * next, the call sheet's own line, and one binder per member of staff. The staff speak
 * here: the head coach owns start/sit, the head of scouting owns the wire, the GM owns
 * the trade board. Counts come from the engine; these are only the words around them.
 */
export const DESK = {
  aria: "The owner\u2019s desk",
  owner: "Owner",
  /** The letterhead in the corner of every paper: the mark and two letters. */
  letterhead: "OS",
  /** Three numbers on the nameplate. */
  standing: {
    record: "Record",
    rank: "Place",
    ppg: "Pts / game",
    place: (rank: number, teams: number) => `${rank} of ${teams}`,
    /** Before a game has been played there is no average, and a dash is not a zero. */
    none: "\u2014",
  },
  /** "Week 2", under the team name on the nameplate. */
  week: (w: number) => `Week ${w}`,
  news: {
    eyebrow: "Just in",
    /** How many the paper shows before "more". Andrew: three stories. */
    shown: 3,
    /** The window the desk reads back over. */
    window: (hours: number) => `${hours}h`,
    quiet: "Quiet. Nothing on your roster moved.",
    /**
     * How hard a story lands, the engine's `severity` 0..4 as a word (`engine/newsdesk.py`
     * has the table). Four is a starter of yours ruled out and wears the mark; zero is a
     * line to read past. Colour never carries it alone: the word is printed too.
     */
    severity: ["FYI", "Note", "Watch", "Serious", "Urgent"] as const,
    /** The mark on the face of a story that lands hard. */
    mark: "!",
    /** A role opening for a player of yours: the meter goes green and says so, and the face
     *  wears a check instead of the mark. Andrew: "some type of green 'yes'". */
    upside: "Upside",
    markUp: "\u2713",
    /** The arrow on the right of a story, above the clock: a plan has been thought out and
     *  is waiting. Andrew: "Plan B" and an arrow -- the fallback is drawn up, go see it. */
    plan: "Plan B",
    planAria: (who: string) => `Action plan: ${who}`,
    more: (n: number) => `${n} more`,
    less: "Fewer",
    also: (n: number) => `+${n} of yours`,
    ago: (h: number) => (h < 1 ? "now" : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`),
    /**
     * Why this story is on your desk, in a few words beside the level: the player of
     * yours it lands on and how. `pos` and `last` are his; `starter` is whether he is in
     * your lineup this week. Short on purpose: the slot beside the meter is narrow at 375px,
     * and a cut-off "Ahead of your W…" lost the point (W-016). The name carries it.
     */
    tag: {
      own: (pos: string, starter: boolean) => `Your ${pos} \u00b7 ${starter ? "starting" : "bench"}`,
      // `pos` stays in the signature for a wider slot; the short line does not need it.
      qb: (_pos: string, last: string) => `${last}\u2019s QB1`,
      target: (_pos: string, last: string) => `Opens up for ${last}`,
      backfield: (_pos: string, last: string) => `Opens up for ${last}`,
      line: (_pos: string, last: string) => `Blocks for ${last}`,
    },
  },
  /** The matchup card, where the call sheet's stack used to sit: who, the projected
   *  score, the odds, their record, and the arrow into the full read. */
  matchup: {
    eyebrow: "This week",
    from: "From the scouting staff",
    you: "You",
    them: "Them",
    vs: "vs",
    /** "61% to win", the engine's own probability. */
    odds: (p: number) => `${Math.round(p * 100)}% to win`,
    /** Their record and place, under their name. */
    standing: (record: string, rank: number, teams: number) => `${record} \u00b7 ${rank} of ${teams}`,
    go: "Full matchup",
    none: "No game this week",
    /** The games are on: the platform's points lead, the projection sits under them. */
    live: "On the board",
    proj: (n: string) => `proj ${n}`,
  },
  /** The spiral notebooks. Each says what it is and who it is from. */
  notebooks: {
    /** The thin header over the four: whose desk these came from. */
    eyebrow: "From the front office",
    team: { title: "Lineup", from: "From the head coach" },
    waivers: { title: "The wire", from: "From the head of scouting" },
    trade: { title: "Trade board", from: "From the general manager" },
    report: { title: "The film", from: "Last week, graded" },
    locked: "Locked",
    /** What the pulse on a lit notebook means to a screen reader. */
    lit: (n: number) => `${n} to look at`,
    /** The cover line on a locked notebook: the best move's gain, name withheld. */
    best: (benefit: string) => `Best move ${benefit}`,
    /** The cover line when the binder has nothing inside. */
    quiet: "Nothing to do here",
    /** The film's cover line: "W 128–101 · 2 of 3 calls hit". Never a rate. */
    film: (result: string | null, score: number, opp: number | null, hits: number, total: number) => {
      const line = result !== null && opp !== null ? `${result} ${score.toFixed(0)}–${opp.toFixed(0)} · ` : "";
      return `${line}${hits} of ${total} call${total === 1 ? "" : "s"} hit`;
    },
    /** The film's cover line from the replay, for a week with no recorded call. */
    filmCover: (result: string | null, score: number, opp: number | null, line: string | null) => {
      const head = result !== null && opp !== null ? `${result} ${score.toFixed(0)}–${opp.toFixed(0)}` : "";
      return [head, line].filter(Boolean).join(" · ");
    },
    /** The film's cover line before a week has been graded. */
    filmNone: "No week graded yet",
  },
} as const;

/* -------------------------------------------------------------- the plan ---
   One story off the desk and every door out of it (`/home/plan`, `engine/plan.py`). The
   engine hands down a posture code and lists of facts; these are the words on them. The
   voice is the staff in your ear: what to do, then why, and nothing hedged that the
   platform has already ruled on.                                                        */

export const PLAN = {
  title: "Action plan",
  aria: "Action plan",
  back: "Back to the desk",
  /** The story aged off the desk, or the link was wrong. */
  gone: "That story has left the desk.",
  /** The call, by the engine's posture code. Head first, then the reasoning. */
  posture: {
    monitor: {
      head: "Monitor.",
      body: "In doubt, not ruled out. Nothing to do before the next report. Check back before kickoff, and know who is behind him.",
    },
    replace: {
      head: "Fill the slot.",
      body: "He will not play. Your bench first, then the wire, then a deal if the hole outlasts the week.",
    },
    watch: {
      head: "Expect less.",
      body: "He still plays; the man who feeds him does not. Hold him unless your bench projects higher.",
    },
    opening: {
      head: "Weigh the start.",
      body: "The role ahead of him came open. Set him against your lowest starter at the spot; the depth chart stamps the call.",
    },
  },
  status: (status: string | null, part: string | null) => `${status ?? "Cleared"}${part ? ` \u00b7 ${part}` : ""}`,
  practice: (p: string) => `Practice: ${p.toLowerCase()}`,
  /** The depth chart behind the man in the story. */
  nextUp: {
    title: "Next man up",
    from: "His team\u2019s depth chart",
    depth: (n: number) => `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"} string`,
    where: {
      yours: "On your roster",
      wire: "On the wire",
      rostered: (owner: string) => `With ${owner}`,
      unknown: "Not in this league",
    },
    none: "No depth chart listed behind him.",
  },
  /** Your own players at the spot who are not in your lineup. */
  bench: {
    title: "On your bench",
    from: "Your roster, at the spot",
    none: "Nobody on your bench plays the spot.",
    projected: "proj",
  },
  /** For a role opening: him against your lowest starter at the position. */
  swap: {
    title: "Against your lowest starter",
    from: "As the head coach sets it today",
    him: "Him",
    starter: "Your starter",
  },
  wire: {
    title: "On the wire",
    from: "From the head of scouting",
    /** Without a Wire Pass: the count, and the door. */
    locked: (n: number) => (n === 1 ? "1 pickup ranked at the spot" : `${n} pickups ranked at the spot`),
    unlock: "Open the wire",
    none: "Nothing at the spot worth a claim.",
    bid: (amount: number) => `Bid $${amount}`,
    priority: "Claim",
  },
  trade: {
    title: "Trade angle",
    from: "From the general manager",
    locked: (n: number) => (n === 1 ? "1 manager deep at the spot" : `${n} managers deep at the spot`),
    unlock: "Open the GM\u2019s Office",
    none: "Nobody in the league is deep at the spot.",
    surplus: "Surplus at the spot",
  },
} as const;

export type BinderKey = "team" | "waivers" | "trade";

/** The league nameplate on the right of the title band, on every tab. */
export const NAMEPLATE = {
  aria: (league: string, team: string, week: number) => `${league}, ${team}, week ${week}. Change league`,
  connect: "Connect a league",
  week: (w: number) => `Wk ${w}`,
} as const;

/**
 * The age line under the title band: how old the numbers on screen are, and the Refresh.
 * A reload paints the last answer this browser kept (`lib/saved.ts`) and refreshes
 * underneath; this line is what keeps that honest.
 */
export const FRESH = {
  updated: (ago: string) => `Updated ${ago}`,
  refreshing: "Refreshing\u2026",
  failed: (ago: string) => `Couldn\u2019t refresh \u00b7 ${ago}`,
  refresh: "Refresh",
  aria: "Refresh the numbers on this screen",
  ago: (ms: number) => {
    const m = Math.floor(Math.max(0, ms) / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? "1 day ago" : `${d} days ago`;
  },
} as const;

/** The ticker along the bottom of every screen: the desk's news, one line, running. */
/* ------------------------------------------------------------- the loader ---
   Any wait that is not the ride: the mark in the middle of the page, a ring turning
   around it, and a line under it that changes while the staff work. The lines name
   things the engine actually does (`docs/DATA.md`); none promises a number.           */
export const LOADING = {
  aria: "Loading",
  lines: [
    "Reading the depth charts",
    "Checking the injury reports",
    "Setting the lineup",
    "Pricing the wire",
    "Running trade simulations",
    "Grading last week's calls",
    "Scouting for insights",
  ],
  /** How long each line holds before the next. */
  stepMs: 1400,
} as const;

export const TICKER = {
  aria: "News ticker. Open the desk",
  /** The plate on the left of the strip. */
  plate: "Just in",
  /** The strip runs in segments the way a sports network's does: a heading flashes, then
   *  its items pass. */
  segment: {
    injuries: "Injuries",
    live: "Live scores",
    proj: "Projected scores",
  },
  quiet: "Quiet. Nothing on your roster moved.",
  loading: "Checking the wire\u2026",
  /** A game on the strip after the news: "Gaainzzz 131.0 – Eppsy13 118.3". */
  score: (a: string, ap: number, b: string, bp: number) => `${a} ${ap.toFixed(1)} \u2013 ${b} ${bp.toFixed(1)}`,
  /** Before kickoff the numbers are the engine's projections, and the strip says so. */
  proj: "Proj",
} as const;

export const GROUPS = {
  team: { clear: "Lineup's set", stamp: "All set" },
  // "Standing pat" was the better phrase and did not survive the layout. The stamp sits
  // top-right of the row now, sharing ~204px at 320px with the section title, and twelve
  // letterspaced caps wanted 133 of them on their own -- which truncated "Scouting" to
  // "S..". A stamp is a verdict and has to be readable at the narrowest width we support,
  // so it is the word that gives, not the title.
  waivers: { clear: "Nothing worth a bid", stamp: "Holding" },
  trade: { clear: "No deal worth making", stamp: "Quiet" },
} as const satisfies Partial<Record<TabKey, { clear: string; stamp: string }>>;

export type GroupKey = keyof typeof GROUPS;

/** Left to right on the sheet: lineup first, because it expires at kickoff. */
export const GROUP_ORDER = ["team", "waivers", "trade"] as const satisfies readonly GroupKey[];

/**
 * Rooms you read rather than benches you work.
 *
 * The call sheet is the front door to the building, not just this week's chores: a row
 * per destination means the whole app is visible from the home screen, and a room with
 * nothing to decide still earns its row because the point is the map, not the workload.
 *
 * A room takes no stamp and no count. A stamp is a verdict on a bench — "nothing here
 * worth calling" — and the film is never clear or busy, it is simply written. `line` is
 * what the row says under its title, and it is a description of the room, never a claim
 * about your team: nothing on the feed measures the film, so nothing here may imply it.
 */
export const ROOMS = {
  report: { line: "The full week, written out" },
} as const satisfies Partial<Record<TabKey, { line: string }>>;

export type RoomKey = keyof typeof ROOMS;

/** Under the benches: you work the sheet first, then go read about it. */
export const ROOM_ORDER = ["report"] as const satisfies readonly RoomKey[];

/**
 * The one line that interrupts you on the call sheet.
 *
 * Voice rules bend here and only here. The house style is clipped and unhurried because
 * the staff are never rattled — but a starter who will not play is the one moment the
 * room should sound rattled, and a line that stays cool while your flex is inactive is
 * not poise, it is the app failing to tell you.
 *
 * `critical` states the consequence, not the diagnosis: "won't play" is what it costs
 * you, where "Out" is a tag you then have to translate. `warning` says "in doubt" rather
 * than naming a status, because the statuses differ by platform and the doubt does not.
 *
 * Counted rather than named. Two names fit, four do not, and a headline that truncates
 * a player's name mid-word on the one week it fires is worse than a number you can act
 * on — the names are one tap away on the depth chart, which is where the fix happens.
 */
export const ALARM = {
  critical: (n: number) => `${n} starter${n === 1 ? "" : "s"} won\u2019t play`,
  warning: (n: number) => `${n} starter${n === 1 ? "" : "s"} in doubt`,
  /** Verb first, and it names the room rather than the tab, like every other way in. */
  cta: "Fix the lineup",
} as const;

/**
 * What the hero says once every call on the sheet is ticked.
 *
 * The sheet's whole promise is that it ends. Before this the page just went grey and sat
 * there, which reads as "nothing loaded" rather than "you are done" — so the closed state
 * says the work is finished and hands back the one thing still worth knowing: when to look
 * again. `back` is completed by a time the browser computes, because the deadline is on
 * the reader's clock and the server does not have it.
 */
export const CLOSED = {
  /** Replaces `feed.summary` in the hero. Same length budget: 18 characters. */
  head: "Sheet's clean.",
  /** Prefixes the computed time: "Check back Sunday, 11:55 AM". */
  back: "Check back",
} as const;

/**
 * The scout report: searching every player in the league, and reading one.
 *
 * It lives in Scouting because that is the room where you look outward — the wire ranks
 * the players worth adding, this answers "yes, but who *is* he". Room names and the words
 * around the search box live here; the words that describe a *number* live with the
 * formatter that produces it (`lib/profile.ts`), which is where every other
 * formatter-owned string in the app already sits.
 */
export const SCOUT = {
  /** The heading over the search box, on a tab whose own title is "Scouting". */
  head: "Look anyone up",
  placeholder: "Search any NFL player",
  /** Shown under the box before a single key is pressed. */
  hint: "Every player in the league, scored by your rules.",
  empty: "Nobody by that name.",
  /** The one honest caveat, shown on the profile: these are counts, not a forecast. */
  footnote: "Every number here is what happened, scored by your league's settings.",
  /** A player nobody in the league holds. The whole reason to be reading this page. */
  free: "Free agent",
  /**
   * The board came back empty.
   *
   * Deliberately not `empty`: that one answers a name somebody typed and the honest reply
   * is that nobody is called that. This one answers a set of filters, where everybody
   * exists and the cut is simply too narrow — so it points at the filters, which are the
   * thing the reader can actually change.
   */
  noMatch: "Nobody fits those filters.",
  /**
   * The back link out of a profile. It names the *search*, not the tab, because the tab's
   * own title is already on screen — `AppShell` draws "Scouting" as the page heading, and
   * a back link reading the same word directly under it looks like a mistake.
   */
  back: "All players",
  /** The research half of the tab: who is out there, through a lens a filter cannot be. */
  research: "All players",
  /** A free account's board: the top three, then the rest behind a pass (Andrew, 2026-09-28). */
  boardLock: {
    eyebrow: "The full board",
    line: (n: number) => `${n.toLocaleString("en-US")} more player${n === 1 ? "" : "s"} on the board.`,
    cta: "Unlock the full board",
  },
  lenses: {
    eyebrow: "Lenses",
    /** The chip that turns the lens off. */
    off: "Everyone",
    shortlist: { label: "For you", blurb: "Free agents in the top five at their position this week, rest of season or adds." },
    handcuffs: { label: "My handcuffs", blurb: "The back directly behind each of yours, wherever he is rostered." },
    backups: { label: "Next man up", blurb: "Second on the depth chart at RB, WR and TE. A starter in doubt leads." },
    defenses: { label: "Defense runs", blurb: "Each defense’s next three games, softest schedule first. Green is an offense that has struggled." },
    byes: { label: "Bye cover", blurb: "Players at a spot where one of yours is off in the next three weeks." },
    risers: { label: "Risers", blurb: "Who the rest of the platform is adding, most first." },
  },
  /** The one fact on a row that put him in the lens. */
  fact: {
    behindMine: (name: string) => `Behind your ${name}`,
    behind: (name: string) => `Behind ${name}`,
    opening: "Job may be open",
    covers: (name: string, week: number) => `Covers ${name} · Wk ${week}`,
    bye: "Bye",
    at: "@",
    week: (w: number) => `Wk ${w}`,
    softAria: (opp: string, rank: number, of: number) => `${opp}: offense ranks ${rank} of ${of} for fewest points`,
    /** The shortlist's reason, only for a #1: "#1 QB · proj · ROS" (W-030). */
    top: { proj: "proj", ros: "ROS", adds: "adds" } as const,
    topLine: (n: number, pos: string, board: string) => `#${n} ${pos} \u00b7 ${board}`,
    /** A row the head of scouting put at the top of the tab. */
    pick: (n: number) => `Pick ${n}`,
    pickAria: (n: number) => `Top pickup number ${n}`,
  },
  /** A lens with nobody in it says why, in its own terms. */
  lensEmpty: {
    shortlist: "Nobody on the wire makes a top five this week.",
    handcuffs: "None of your backs has a listed backup we can find.",
    backups: "No depth charts to read right now.",
    defenses: "No defenses on the board.",
    byes: "None of yours is off in the next three weeks.",
    risers: "Nobody is being added this week.",
  },
} as const;

/**
 * The top of Scouting: the head of scouting's three names, each a panel with a face, the
 * stamp that says how hard to go after him, and an arrow into his full read.
 *
 * **The one exclamation mark in the house.** Andrew's call (2026-09-23): a must-add is an
 * event and the stamp shouts. It is on the `must` stamp only; every other line keeps the
 * voice rule, and `vocab.test.ts` pins that it stays the only one.
 */
export const WIRE = {
  title: "Top pickups",
  /** The eyebrow on the wire's lock card: the room, now that no pass is named for it. */
  lockEyebrow: "The wire",
  urgency: {
    must: "Must add!",
    claim: "Put in a claim",
    stash: "Worth a stash",
    depth: "Depth only",
  },
  week: "wk",
  ros: "ROS",
  cut: "Cut",
  open: "Open spot",
  bid: "Bid",
  priority: "Priority",
  more: (n: number) => `See ${n} more`,
  less: "Show fewer",
  goAria: (name: string) => `The full read on ${name}`,
  none: "Nothing on the wire beats your bench this week. Hold.",
  mystery: "Locked",
  lockedLine: "Three names worth a claim this week, with the drop and the bid. Unlock them below the board.",
  /** The pickup's own page, `/waivers/pickup?id=`. */
  page: {
    title: "The full read",
    back: "Back to Scouting",
    rank: (n: number) => `Pickup ${n} of the week`,
    why: "The case",
    cut: "Who goes",
    cutNone: "Nobody. You have an open spot.",
    bid: "What to bid",
    budget: "of your budget",
    priorityLine: "No money here. Claims run in order.",
    numbers: "The numbers",
    thisWeek: "This week",
    restOfSeason: "Rest of season",
    fit: "Fit",
    adds: "Adds",
    report: "Open his scout report",
    how: "How is this ranked?",
    howLines: [
      "Fit is 40 parts this week’s lineup gain, 60 parts rest-of-season gain per week, plus depth.",
      "The bid scales with fit, weeks left, this league’s bid history and how many managers are adding him.",
    ],
    gone: "He is off the board. The wire moved since you opened it.",
    others: "Also on the board",
  },
} as const;

/** The scout's opening on Scouting: a seat in the stands, a man marked, the notes. */
export const SCOUT_OPEN = {
  aria: "Taking your seat in the scouts’ section",
  seat: "Section 212 · Row F",
  eyebrow: "Scouting",
  pad: "Scouting report",
  week: (w: number) => `Week ${w}`,
  skip: "Tap to skip",
} as const;

/**
 * The words on /connect that are not the h1.
 *
 * The button changes with the state of the form, and its last state is the one that
 * matters: "Take me upstairs" named the destination, which is a nice line and tells
 * you nothing about what happens when you press it. The page's whole promise is the
 * sheet on the other side of it, so the button says what it hands you. Verb first.
 */
export const CONNECT = {
  /** Before a team is picked: the control is live, so it says what is missing. */
  pick: "Pick your team",
  /** Once a team is picked. */
  submit: "Show my moves",
  /** While the connection is being written. */
  busy: "Wiring you in\u2026",
} as const;

/**
 * The ESPN key: a private ESPN league, linked from a phone (Andrew, 2026-09-28).
 *
 * ESPN has no sign-in door for other apps, so a private league is read with two values
 * ESPN's own site keeps in the browser. Every guide says "on a computer, open DevTools".
 * The ceiling Andrew set is a bookmark that runs a script, so the page walks that: copy the
 * key, save it as a bookmark, open ESPN, tap it, and it brings you back here with the key
 * saved. Everything a person reads on that walk, in the form and in the bookmark's own two
 * messages, is here. Voice: the staff walking you through it. Short, one instruction a line.
 */
export const ESPN_KEY = {
  eyebrow: "ESPN",
  title: "Link your ESPN league.",
  /** The whole plan in one breath, so every step under it makes sense (Andrew's words, 2026-09-28). */
  lead: "We add a bookmark that grabs your league info. Then come back here and paste it. Two minutes.",
  handAria: "Your device",
  hand: { iphone: "iPhone", android: "Android", computer: "Computer" },
  step: (n: number) => `Step ${n}`,
  /** Step 1: a placeholder bookmark, any page. */
  place: {
    title: "Make a placeholder bookmark",
    iphone: "Tap Share, then Add Bookmark, then Save.",
    android: "Tap the three dots, then the star.",
    computer: "Press Ctrl+D (Cmd+D on a Mac), then Save.",
  },
  /** Step 2: the code goes over the placeholder's address. */
  prime: {
    title: "Prime it with this code",
    button: "Copy the code",
    copied: "Copied.",
    failed: "Copy did not take. Press and hold the code below, Select All, then Copy.",
    show: "Show the code",
    hide: "Hide the code",
    keyAria: "The code, as text",
    iphone: "Bookmarks, Edit, tap the new bookmark, paste over the address, Done.",
    android: "Three dots, Bookmarks, three dots on the new one, Edit. Paste over the address and name it Owner's Suite key.",
    computer: "Right-click the new bookmark, Edit, paste over the address, Save.",
  },
  /** Step 3: on ESPN. */
  go: {
    title: "Log in to ESPN and tap the bookmark",
    button: "Open ESPN",
    iphone: "Log in, open your team, then Bookmarks and tap it. It says copied.",
    android: "Log in, open your team, then type Owner's Suite key in the address bar and tap it. It says copied.",
    computer: "Log in, open your team, then click the bookmark. It says copied.",
  },
  /** Step 4: back here. */
  paste: {
    title: "Come back and paste",
    body: "Switch back to this tab and paste what it copied.",
    placeholder: "Paste here",
    button: "Done",
    bad: "That is not the code. Copy it again from the bookmark\u2019s message.",
  },
  /** The bookmark's own messages, shown by ESPN's page. It never shows the values. */
  bookmark: {
    wrongSite: "Open fantasy.espn.com and log in, then tap this bookmark.",
    noKey: "Not logged in on this browser yet. Log in to ESPN here, then tap this bookmark again.",
    noLeague: "Open your league on ESPN first, then tap this bookmark.",
    saved: "Copied. Go back to the Owner's Suite tab and paste.",
  },
  privacy: "Your info stays on this device. Our server never sees it.",
  back: "Back to connect",
  saved: { eyebrow: "ESPN \u00b7 saved", title: "Got it.", loading: "Loading your league.", noLeague: "Head back and load your league." },
  /** The door on /connect: one button, the ID box behind a small link. */
  entry: {
    title: "One bookmark links it. Two minutes.",
    button: "Link from ESPN",
    haveId: "I have a league ID",
    or: "Paste a league ID",
  },
  /** The form on /connect, which now leads with the phone. */
  form: {
    title: "Private league only",
    sub: "A public league needs nothing here.",
    needed: "That league is private. One bookmark links it. Two minutes.",
    expired: "Your key stopped working. ESPN rotates them now and then. Get a fresh one.",
    get: "Get my key",
    stored: "Key saved on this device.",
    forget: "Forget it",
    /** The two folded doors under the button. */
    pasteOpen: "Paste the two values instead",
    pasteClose: "Hide the fields",
    s2: "espn_s2",
    swid: "SWID",
    swidHint: "Braces or no braces. We tidy it either way.",
    save: "Save these",
    checking: "Checking with ESPN\u2026",
    handling: "These stay in this browser and the server never writes them down. They are a read session for your whole ESPN account, not just this league.",
  },
} as const;

/**
 * Yahoo on the connect page and its sign-in return. Yahoo opens a league only to its
 * members, so unlike Sleeper and ESPN there is no ID to paste: the owner signs in with Yahoo
 * and picks from their own list. `attribution` is Yahoo's required credit line, word for
 * word, and must not be reworded.
 */
export const YAHOO = {
  label: "Yahoo",
  soon: "Soon",
  signIn: "Sign in with Yahoo",
  why: "Yahoo opens a league only to its members. Sign in, pick yours. We read, never write.",
  expired: "Your Yahoo sign-in ran out. Sign in again.",
  pick: "Pick your Yahoo league",
  none: "No Yahoo football leagues on this account this season.",
  saved: "Yahoo sign-in saved on this device.",
  forget: "Forget it",
  returning: "Signing you in with Yahoo\u2026",
  badState: "That Yahoo sign-in did not start here. Start it again.",
  back: "Back to connect",
  attribution: "Fantasy data provided by Yahoo Fantasy",
} as const;

/**
 * The phone door's words, said once: the sign-in form and the sign-up walk both read these,
 * so the two phone screens cannot drift apart again (walkthrough W-008, 2026-10-05).
 */
const PHONE_DOOR = {
  send: "Text me the code",
  useEmail: "No phone? Use email.",
  trust: "One text now. Nothing else unless you ask for it.",
} as const;

/**
 * The account: register, sign in, the plan flag, the leagues on file, the upgrade sheet,
 * the reset, and the owner's admin desk. Every word on those screens and in the two
 * popups is here, so the sheet and the page can never disagree.
 *
 * Voice: the staff at the door. Short, verb first, no apology. Sign-in is first-party
 * (an email and a password), so nothing here promises a magic link.
 */
export const ACCOUNT = {
  title: "Your account",
  /** The door while it asks the API who this browser is: never a blank screen. */
  checking: "Checking you in.",
  checkingSlow: "Still checking. The building is waking up, a few more seconds.",
  /** The door once you are in (Andrew, 2026-10-05): a short menu, not the settings page. */
  whereTo: {
    eyebrow: "You\u2019re in",
    title: "Where to?",
    hello: (name: string) => `Welcome back, ${name}.`,
    leagues: "Your leagues",
    openAria: (name: string) => `Open ${name}`,
    add: "Add a league",
    addLead: "Sleeper or ESPN.",
    settings: "Account & settings",
    settingsLead: "Your plan, your sign-in, your leagues on file.",
  },
  eyebrow: "Owner",
  /** The two tabs on the sheet and the two controls everywhere else. */
  signIn: "Sign in",
  register: "Create account",
  signOut: "Sign out",
  /** Fields. */
  email: "Email",
  password: "Password",
  newPassword: "New password",
  name: "Name",
  nameHint: "Optional. What the staff should call you.",
  passwordHint: "At least 8 characters.",
  /** Swapping between the two. */
  haveAccount: "Already have an account?",
  noAccount: "New here?",
  /** Under the sign-in form, the way to the sign-up walk (walkthrough W-009). */
  getStarted: "Get started",
  forgot: "Forgot your password?",
  busySignIn: "Signing in\u2026",
  busyRegister: "Setting up\u2026",
  /** The door on /connect for a visitor with no account: the account comes first, the league second. */
  gate: {
    eyebrow: "Step 1 of 2 · Your account",
    title: "Your account first.",
    body: "Create an account, then link a league. It stays on file, so you never enter it twice.",
    register: "Create account",
    signIn: "I have one, sign me in",
  },
  /** The first thing a new account sees: it is set, and one thing is left. */
  welcome: {
    eyebrow: "Step 2 of 2 · Your league",
    title: (name: string) => (name ? `You\u2019re in, ${name}.` : "You\u2019re in."),
    body: "Your account is set. Link a league and the staff gets to work on this week.",
    cta: "Link a league",
  },
  /** The empty room on every tab, for an account with nothing on file and for a stranger. */
  room: {
    signedOut: "Create an account, hook up a Sleeper or ESPN league, and",
    signedIn: "Hook up a Sleeper or ESPN league and",
    tail: "shows up here.",
    register: "Create an account",
    link: "Link a league",
  },
  /** The one line at the top of the popup saying why it opened. */
  reason: {
    connect: "Sign in to link a league. It stays on your account, on every device.",
    upgrade: "Sign in so the pass follows you.",
    account: "Sign in to open your account.",
  },
  /** The plan flag. */
  plan: {
    eyebrow: "Plan",
    free: "Free",
    premium: "Premium",
    admin: "Admin",
    upgrade: "Upgrade to full premium",
    /** A week-pass holder's button: the season, with the week they paid for counted. */
    upgradeWeek: "Upgrade to the season pass",
    current: "Your plan",
    freeLine: "Start/sit calls, the desk, the standings and the board. Every week.",
    premiumLine: "Every room open for the rest of the season.",
    /** A week-pass holder: when the paid week runs out, and that it renews. */
    weekLine: (date: string) => `Every room open. Paid through ${date}, and it renews weekly until you cancel.`,
    /** The free first week (docs/SPEC-ONBOARDING.md): what is charged, when, or that nothing will be. */
    trialLine: (price: string, date: string) => `Free week. Every room open. ${price} on ${date} unless you cancel.`,
    trialCancelled: (date: string) => `Free week, cancelled. Every room open until ${date}, and nothing is charged.`,
    trialOpen: (date: string) => `Free week. Every room open until ${date}.`,
    /** Stripe's customer portal, for the week pass. */
    manage: "Manage or cancel",
  },
  /** Leagues on file. */
  leagues: {
    eyebrow: "Leagues on file",
    add: "Link a league",
    addSlot: "Add a league slot",
    full: "Every slot is taken this season.",
    /** Under the list: forgetting is not a refund on the slot (Andrew, 2026-09-27). */
    keeps: "Forgetting a league does not give its slot back this season.",
    forget: "Forget",
    forgetAria: (name: string) => `Forget ${name}`,
    open: "Open",
    openAria: (name: string) => `Open ${name}`,
    reading: "Reading now",
    none: "No league on file yet.",
    slot: "slot",
  },
  /** The check before a new league takes a slot (Andrew, 2026-09-27). */
  confirmLink: {
    title: "Just confirming",
    body: (allowed: number, used: number) =>
      `Each account gets ${allowed} league${allowed === 1 ? "" : "s"} this season, and you have used ${used}. Once linked, forgetting it does not give the slot back.`,
    more: (price: string) => `Any more are ${price} each.`,
    yes: "Link it",
    no: "Not yet",
  },
  /** The upgrade sheet. */
  upgrade: {
    title: "Upgrade",
    lead: "Try a week, cancel anytime. Or take the season in one payment.",
    /** The pass sheet: the season is the headline, the week is the way out. */
    passTitle: "Go full premium",
    seasonHead: "The season pass",
    seasonSub: "Every room, every week, the rest of the season. One payment.",
    save: (amount: string) => `Save ${amount}`,
    vsWeekly: (n: number, price: string) => `${n} more weeks of the week pass is ${price}`,
    takeSeason: "Take the season",
    or: "or",
    weekHead: "Just a week",
    weekSub: "Renews weekly. Cancel anytime.",
    takeWeek: "Try a week",
    /** A week-pass holder taking the season: the week in hand counts toward it (Andrew, 2026-09-28). */
    weekCounts: "Your week counts",
    weekCountsLine: "The week you already paid for comes off the season. Your weekly billing stops when it lands.",
    /** The promo-code field under the season offer. */
    promo: {
      open: "Have a code?",
      label: "Promo code",
      placeholder: "Enter code",
      apply: "Apply",
      checking: "Checking\u2026",
      bad: "That code doesn\u2019t work on the season pass.",
      badge: (code: string) => code,
      line: (code: string, saved: string) => `${code} takes ${saved} off the season pass.`,
      remove: "Remove",
    },
    /** Shown while the API has no Stripe key: the grant is written on the spot. */
    comp: "Launch week: no card, no charge. Tap it and the floor is yours.",
    get: (name: string) => `Get ${name}`,
    done: "Done. The floor is open.",
    slotLead: "One more league on your account.",
    busy: "Opening\u2026",
    close: "Close",
    /** Why this sheet is up, when a locked room asked for it. */
    for: (what: string) => `Unlock ${what}`,
    limit: "Your leagues are full",
    /** Under the offers: how the money moves. */
    stripe: "Paid through Stripe. The week renews until you cancel. The season is one payment.",
    noCharge: "Nothing is charged today.",
    /** On the locked card, under the two buttons. */
    terms: "The week renews until you cancel. The season is one payment, and nothing renews.",
    signInNote: "You will sign in at checkout so your purchase follows you.",
    unlock: (name: string) => `Unlock ${name}`,
    /** The receipt when a return from Stripe lands. */
    unlocked: (name: string) => `${name} is on your account. Every room is open.`,
  },
  /** Forgot and reset. */
  reset: {
    title: "Reset your password",
    lead: "Tell us the address on the account.",
    cta: "Send a reset link",
    sent: "If that address has an account, a link is on its way.",
    /** No email provider is wired yet, and a screen that says a link is coming when it is not is a lie. */
    notSent: "Email is not wired up yet, so nothing was sent. Ask the owner for a reset link.",
    newTitle: "Set a new password",
    save: "Save and sign in",
    missing: "This link is missing its token. Ask for a new one.",
    back: "Back to sign in",
    /** Your sign-in name is your email; there is no separate username to forget. */
    whichEmail: "This is for email accounts. Signed up with your phone? Go back and sign in with your number: no password needed. Not sure which email? Try each: this form never says which address has an account.",
    support: (email: string) => `Still locked out? Email ${email} from the address you think it is, and we\u2019ll send a link by hand.`,
    expired: "That link has expired or was already used. Ask for a new one below.",
  },
  /** What a sign-in form says when it fails. The generic error box talks about sessions and league platforms; these talk about the door. */
  errors: {
    wrong: "Wrong email or password",
    wrongDetail: "Check both and try again, or reset your password.",
    taken: "That email already has an account",
    takenDetail: "Sign in instead, or reset the password if you have lost it.",
    slow: "Too many tries",
    slowDetail: "Wait 15 minutes, or reset your password now.",
    bad: "That did not work",
    sms: "The text did not go out",
  },
  /** Phone sign-in: the number, the texted code, then the name and an optional email. */
  phone: {
    label: "Mobile number",
    hint: PHONE_DOOR.trust,
    send: PHONE_DOOR.send,
    busySend: "Texting\u2026",
    codeLabel: "Code",
    codeLead: (to: string) => `Code sent to ${to}.`,
    verify: "Continue",
    busyVerify: "Checking\u2026",
    resend: "Text a new code",
    resent: "New code sent.",
    change: "Change number",
    devCode: (code: string) => `Dev API, nothing texted. Code: ${code}`,
    /** Phone is the way in; email is the fallback for someone without a mobile. */
    useEmail: PHONE_DOOR.useEmail,
    usePhone: "Use your phone number",
    emailFallback: "Phone is the fastest way in. Email works if you don\u2019t have a mobile.",
    profileTitle: "Last thing.",
    emailOptional: "Email (optional)",
    emailOptionalHint: "For receipts, and a backup way in if you change numbers.",
    finish: "Finish",
    busyFinish: "Setting up\u2026",
    /*
     * The marketing-text box (Andrew signed off, 2026-09-28). Consent is to these words:
     * change them and bump SMS_CONSENT_VERSION in edge/api/app.py. Never pre-ticked, and
     * never a condition of signing up or buying.
     */
    smsOptIn: "Text me the call sheet on game days",
    smsTerms:
      "Up to 4 texts a week from Owner's Suite: your calls and offers. Msg & data rates may apply. Reply STOP to end, HELP for help. Not required to sign up or buy.",
    onFile: "Phone",
    none: "No phone on file.",
    add: "Add a phone",
    replace: "Change phone",
    added: "Phone saved. You can sign in with it now.",
  },
  /** Adding or changing the email on file. */
  emailOnFile: {
    label: "Email",
    none: "No email on file. Add one for receipts and a second way in.",
    add: "Add an email",
    change: "Change email",
    save: "Save email",
    saved: "Email saved.",
    needPassword: "Current password",
  },
  /** The security block on the account page. */
  security: {
    eyebrow: "Sign-in and security",
    line: "Change your password, or sign out every other phone and laptop. This one stays in.",
    current: "Current password",
    change: "Change password",
    save: "Save new password",
    changed: "Password changed. Every other device is signed out.",
    others: "Sign out other devices",
    othersDone: (n: number) => (n === 0 ? "No other device was signed in." : `Signed out ${n} other device${n === 1 ? "" : "s"}.`),
    cancel: "Cancel",
  },
  /** The owner's desk. */
  admin: {
    title: "Front office",
    eyebrow: "Admin",
    lead: "Every account, its plan and its leagues. The levers are yours.",
    count: (n: number) => `${n} account${n === 1 ? "" : "s"}`,
    search: "Find an account",
    none: "No accounts yet.",
    notYou: "This desk is the owner\u2019s.",
    grant: "Grant",
    revoke: "Revoke",
    slot: "+1 league",
    promote: "Make admin",
    demote: "Remove admin",
    resetLink: "Reset link",
    copied: "Copied. Hand it over yourself; it lasts two hours.",
    joined: "Joined",
    lastSeen: "Last seen",
    never: "never",
    leagues: (n: number, allowed: number) => `${n} of ${allowed} leagues`,
    you: "you",
    source: "Came from",
    lifetime: "Paid",
    smsYes: "Texts: yes",
    timeline: "Timeline",
    timelineHide: "Hide timeline",
    timelineEmpty: "Nothing logged yet.",
    /** The numbers (docs/SPEC-ADMIN-METRICS.md). */
    metrics: {
      tabs: {
        today: "Today",
        funnel: "Funnel",
        channels: "Channels",
        revenue: "Revenue",
        retention: "Retention",
        loop: "The loop",
        accounts: "Accounts",
      },
      ranges: { week: "This week", last: "Last week", season: "Season" },
      rangeLabel: (from: string, to: string) => `${from} to ${to}, Eastern`,
      reload: "Refresh",
      tiles: {
        revenue: "Revenue",
        paying: "Paying now",
        buyers: "New buyers",
        signups: "Sign-ups",
        linked: "Leagues linked",
        cac: "Cost per buyer",
      },
      cacHint: (target: string) => `Target ${target} or less.`,
      noSpend: "No spend entered.",
      lastHour: "Last hour",
      lastHourLine: (s: number, c: number, p: number) =>
        `${s} sign-up${s === 1 ? "" : "s"} · ${c} checkout${c === 1 ? "" : "s"} · ${p} payment${p === 1 ? "" : "s"}`,
      steps: {
        landing_signup: "Arrived → signed up",
        signup_linked: "Signed up → linked a league",
        linked_paid_7d: "Linked → paid within 7 days",
        week_retained: "Week pass → second week or season",
      },
      stepTarget: (healthy: string, leak: string) => `Healthy ${healthy} · leak under ${leak}`,
      /** The sign-up walk (docs/SPEC-ONBOARDING.md): this range's sign-ups, screen by screen. */
      walkTitle: "The sign-up walk",
      walkCohort: (n: number) => `${n} sign-up${n === 1 ? "" : "s"} this range, and how far each got.`,
      walkSkipped: (n: number) => `${n} said not now to the free week.`,
      walkNone: "No sign-ups in this range.",
      toDate: "to date",
      status: { healthy: "Healthy", watch: "Watch", leak: "Leak", none: "No data" },
      /** Which landing button people press (`cta_click`), and which one each sign-up came through. */
      doorsTitle: "Landing buttons",
      doorsLead: "Presses this range. A sign-up counts for the last button that browser pressed before signing up.",
      doorsNone: "Nobody pressed a landing button in this range.",
      doorCols: { door: "Button", clicks: "Presses", people: "People", signups: "Sign-ups", rate: "Rate" },
      doorNames: {
        header: "Header",
        hero: "Hero",
        sheet: "Sheet",
        steps: "Steps",
        desk: "Desk",
        staff: "Staff",
        film: "Film",
        close: "Close",
        bar: "Bar",
      } as Record<string, string>,
      paywallTitle: "Where they hit the wall",
      paywallNone: "Nobody signed in hit a paywall in this range.",
      checkoutTitle: "Checkout",
      checkoutLine: (started: number, finished: number, abandoned: number) =>
        `${started} started · ${finished} paid · ${abandoned} expired unpaid`,
      channelCols: { source: "Source", visitors: "Visits", signups: "Sign-ups", buyers: "Buyers", revenue: "Revenue", spend: "Spend", cac: "Per buyer" },
      verdict: { scale: "Scale", watch: "Watch", kill: "Kill", organic: "Organic" },
      rules: (target: string, kill: string) =>
        `Scale at ${target} a buyer or less. Kill at ${kill} spent with no buyer. Decide on Tuesdays.`,
      noChannels: "No visits or sign-ups in this range yet.",
      campaigns: "By campaign · hook",
      spendTitle: "Ad spend",
      spendLead: "One row per channel per day. Use the same word as the ads' utm_source.",
      spendDay: "Day",
      spendChannel: "Channel",
      spendDollars: "Dollars",
      spendCampaign: "Campaign (optional)",
      spendClicks: "Clicks (optional)",
      spendAdd: "Add spend",
      spendRemove: "Remove",
      spendNone: "No spend entered yet.",
      gross: "Gross",
      refunds: "Refunds",
      net: "Net",
      netAfterFees: "After Stripe",
      byDay: "By day",
      subs: "Week-pass subscriptions",
      subsLine: (s: { started: number; renewals: number; cancelled: number; upgraded: number }) =>
        `${s.started} started · ${s.renewals} renewed · ${s.upgraded} upgraded · ${s.cancelled} cancelled`,
      skuNames: { week_pass: "Week", full_report: "Season", league_slot: "Slot" } as Record<string, string>,
      retentionLead: "Share of each week's sign-ups who used the app in each week after. Week 0 is the week they joined.",
      retentionAll: "Everyone",
      retentionPaying: "Paid at least once",
      cohortCol: "Joined week of",
      sizeCol: "Size",
      weekCol: (k: number) => `W${k}`,
      noCohorts: "No sign-ups yet.",
      loopCreated: "Cards made",
      loopOpens: "Opens",
      loopPerCard: "Opens per card",
      loopSignups: "Sign-ups from a card",
      loopBuyers: "Buyers from a card",
      topCards: "Most-opened cards (all time)",
      noCards: "No cards shared yet.",
    },
  },
  /** The way out of the account, back to the league. */
  back: "Back to my office",
  /** From /connect, where the owner came from their account. */
  backAccount: "Back to my account",
  adminLink: "See admin dashboard",
  /** The light switch lives here and nowhere else (Andrew, 2026-09-27). */
  appearance: {
    eyebrow: "Appearance",
    dark: "Dark",
    light: "Light",
  },
  /** The top bar. */
  topbar: {
    signIn: "Sign in",
    account: (email: string) => `Account ${email}`,
  },
  /** The account page's data controls. */
  data: {
    erase: "Delete my account",
    eraseConfirm: "This erases your leagues and any pass you bought. Type delete to confirm.",
    erased: "Deleted. The door is behind you.",
  },
} as const;

/**
 * The landing page, which is the only surface a cold visitor reads.
 *
 * Two rules hold every line here.
 *
 * **A feature card is a benefit with the room as its eyebrow.** The rooms are coach
 * vocabulary and they are the right names inside the app, but "GM's Office" on a page
 * read by somebody who has never seen the app is a door with no sign on it. The
 * eyebrow keeps the room's name, the title says what you get, and by the time they are
 * inside they have been taught the word.
 *
 * **No accuracy number appears here.** We advertised Lock at about 80%; it measures
 * 75.1% over 2025 weeks 1-17, and `CLAUDE.md` forbids a public decision-accuracy claim
 * until `scripts/score_runs.py` exists, which it does not. What is true and worth
 * saying is the *practice*: every stamp is graded and the result is published. The
 * measured per-margin figures belong on the depth chart, where they are a property of
 * the margin in front of you rather than a billboard. See docs/CALIBRATION.md.
 */
export const LANDING = {
  /**
   * The front page, rewritten with Andrew (2026-09-27). It sells the room, not the price:
   * you walk into your own front office, the staff has the week's answers on your desk,
   * and you make the calls. No price, no refund line and no "free" hedge above the fold;
   * the price is met at the upgrade, after the product has made its case. Every line here
   * obeys the voice rules (`vocab.test.ts` sweeps them) and none of them states a rate:
   * decision accuracy stays off the page until `scripts/score_runs.py` exists.
   */

  /** Line one: everyone is welcome, and the platforms we read. */
  eyebrow: "All owners welcome · Sleeper · ESPN · Yahoo soon",
  /** The same line on a phone, where the welcome does not fit beside the platforms. */
  eyebrowShort: "Sleeper · ESPN · Yahoo soon",
  /** The headline: you are walking into your office to make the calls. */
  headline: "Step into your front office.",
  /** Status: this is where the owners who win sit. */
  avatar: "For fantasy football owners who expect to win their league, not just play in it.",
  /** The staff, in one sentence. */
  staff: "Your GM works the trades, your head of scouting finds the pickups, and your head coach sets the lineup.",
  /**
   * What it does, for a phone, where the staff sentence is hidden. Without it a cold
   * reader on a phone met a headline and a status line and had to work out from the
   * example sheet what the product is.
   */
  staffShort: "Start/sit, waiver bids and trade offers, called for your league every week.",
  /**
   * The ask names what you walk away with, not the building you walk into: a reader who
   * has never seen the app does not know what an Owner's Suite holds, but they know they
   * want this week's moves. The product's own word for them (`exampleHead`).
   */
  cta: "Get this week\u2019s moves",
  /** Under the button: what the click costs in effort. True while phone sign-in is on (`GET /api/health`). */
  effort: "30 seconds. A phone number and a code.",
  login: "Log in",
  loginLead: "Already have an office?",

  /**
   * Three reasons to believe it, each one a thing the product does that a reader can check
   * for themselves once inside. No rate, no user count, nothing that is not built.
   */
  proof: [
    { head: "Scored your way.", body: "Every projection re-scored to your league\u2019s settings." },
    { head: "Linked in a minute.", body: "Sleeper or ESPN, public or private." },
    { head: "Graded every week.", body: "The film checks every call against the box score." },
  ],

  /** The example sheet is a door: its last row, on every width. */
  sheetCta: "Get your league\u2019s sheet",
  /** The desk cards are doors too; this is the line each one ends on. */
  deskCta: "Ask about your team",

  /**
   * The desk: the four questions every owner asks in a week, each answered the way the
   * app answers it. The example figures are illustrative and carry no rate.
   */
  desk: {
    eyebrow: "On your desk",
    title: "Answers to your biggest questions, right on your desk.",
    /** The week the example was drawn from (Sleeper projections, 2026). */
    week: "Week 5 · The Megalabowl",
    coach: {
      from: "Head coach",
      tag: "Start",
      q: "Who do I start?",
      call: "Start Rhamondre Stevenson",
      over: "over Alvin Kamara",
      vs: "vs",
      gain: "+4.2",
      unit: "projected points",
      stamp: "Lock",
    },
    scout: {
      from: "Head of scouting",
      tag: "Claim",
      q: "Who is worth a claim?",
      call: "Add Emanuel Wilson",
      bid: "Bid $18 to $32",
      gain: "+5.4",
      unit: "this week",
      ros: "+41 rest of season",
      stamp: "Lean",
    },
    gm: {
      from: "General manager",
      tag: "Trade",
      q: "Who takes my trade?",
      offer: (give: string, get: string) => `Offer ${give} for ${get}`,
      give: "You give",
      get: "You get",
      giveName: "Courtland Sutton",
      getName: "David Montgomery",
      gain: "+38",
      unit: "rest-of-season lineup points",
      why: "Their WR room is thin. They say yes.",
    },
    film: {
      from: "The film",
      q: "Where am I losing?",
      grades: [
        { pos: "QB", grade: "A" },
        { pos: "RB", grade: "B+" },
        { pos: "WR", grade: "C-" },
        { pos: "TE", grade: "B" },
      ],
      line: "WR is costing you. Here is the fix.",
    },
    foot: "Everything else on your roster is fine. Go enjoy your Sunday.",
  },

  /**
   * The worked example's headline. It is the product's own headline, word for word
   * (`edge/engine/actions.py`), because an advert that says something the app does not
   * say is an advert for a different app.
   */
  exampleHead: "3 moves to make",

  /** Who it is for, and who it is not. Sending the wrong reader away is what makes the right one believe the rest. */
  fit: {
    head: "Who it’s for",
    yes: [
      "Owners dedicated to winning.",
      "Owners who put in the extra time midweek to win more matchups.",
      "Owners who want to know why others win and they lose.",
      "Owners who want the quick call, with the detail there when they ask.",
    ],
    noHead: "Who it isn’t for",
    no: [
      "Those who draft once and never open the app again.",
      "Those who think fantasy football is luck.",
      "Those happy finishing in the middle.",
    ],
  },

  /**
   * The rooms, coolest first, each one a member of the front office you work with. `key`
   * pairs each card with its icon and tone in the page; the eyebrow is read off `SECTIONS`
   * rather than typed again, so an advert for a room cannot survive that room being renamed.
   */
  roomsHead: "Your front office",
  roomsLead: "A full staff, working your league around the clock.",
  features: [
    {
      key: "trade",
      room: SECTIONS.trade.title,
      title: "Work with your general manager",
      body: "See the best trade opportunities in your league, and a counter tuned to the manager across the table.",
    },
    {
      key: "waivers",
      room: SECTIONS.waivers.title,
      title: "Work with your head of scouting",
      body: "Find the hidden gems on the wire before anyone else does, with the bid and the drop already worked out.",
    },
    {
      key: "team",
      room: SECTIONS.team.title,
      title: "Work with your head coach",
      body: "Every starter checked against your bench, with a confidence stamp and one line of why.",
    },
  ],

  /** The film room: the depth behind the calls, sold on its own. */
  film: {
    room: SECTIONS.report.title,
    title: "Study the film",
    body: "Every week, the film breaks last week down in detail: a grade at every position, which calls landed, and where the points went. Learn from it, fix what keeps costing you, and adjust your strategy before your league catches on.",
    points: ["A grade at every position", "Every call, checked against the box score", "The patterns that keep costing you"],
  },

  /** Three steps, each with the time it takes: quick is the point. */
  steps: {
    head: "How it works",
    title: "Two minutes to your first call.",
    items: [
      { title: "Open your Owner's Suite", when: "30 seconds", body: "Your phone number and a code. No forms." },
      { title: "Link your league", when: "About a minute", body: "A Sleeper username or an ESPN league ID." },
      { title: "Make the calls", when: "Every week", body: "Your staff has the week’s moves waiting on your desk." },
    ],
    /** The ask that follows "it is quick", while the reader still believes it. */
    cta: "Start step 1",
  },

  /** The objections, in the reader's words, answered in ours. */
  faq: {
    head: "Straight answers",
    items: [
      {
        q: "Does it work with my league?",
        a: "Sleeper and ESPN, public or private, any size, any scoring. Yahoo is coming.",
      },
      {
        q: "My league’s scoring is weird.",
        a: "Good. Every projection is re-scored to your settings. We never assume PPR.",
      },
      {
        q: "ESPN private league?",
        a: "Yes. One bookmark on your phone fetches your key, once. It stays in your browser, never on our side. A public league needs the ID only.",
      },
      {
        q: "Why my phone number?",
        a: "It is how you sign in: we text a code, so there is no password to forget. Other texts only if you tick the box.",
      },
      {
        q: "How long does it take?",
        a: "About a minute to link a league. The sheet is written by the time you land.",
      },
    ],
  },

  /** The last ask. */
  close: {
    /** The clock beside it prints its own word (Kickoff, Soon, Last call), so this one does not. */
    eyebrow: "The clock is running",
    title: "Your office is ready.",
    body: "Link a league and your staff has the week’s calls on your desk in about a minute.",
    cta: "Get this week\u2019s moves",
  },

  /** The bar that follows the reader down the page once the first button has scrolled away. */
  bar: {
    cta: "Get this week\u2019s moves",
    /** Days from kickoff a clock is not urgent, so the bar says how quick the door is instead. */
    effort: "30 seconds to get in",
  },
} as const;

/**
 * The offer: free, a week, or the season (Andrew, 2026-09-27). The season is anchored against
 * paying week to week for the rest of the way. The figures are never typed here:
 * `lib/offer.ts` works them out from the API's own catalog, so a price change in
 * `edge/products.py` cannot leave this page quoting the old one.
 */
export const PRICING = {
  eyebrow: "Pricing",
  /** The price is the headline, and it comes from the catalog. */
  title: (price: string) => `${price}. The season.`,
  lead: "Start free. Try a week when you want every room, or take the season in one payment.",
  /** What a user reads for each sku. The catalog's names are the API's; these are the page's. */
  names: {
    free: "Free",
    week_pass: "Week pass",
    full_report: "Season pass",
    league_slot: "League slot",
    waivers: "Wire Pass",
    trade_lab: "Trade Lab",
  },
  /** After a recurring price: "$4.99/week". */
  per: { week: "/week" },
  /** The one line under each tier's price. */
  term: {
    free: "Every week, no card.",
    week_pass: "Renews weekly. Cancel anytime.",
    full_report: "One payment. Rest of the season.",
  },
  /** What each entitlement actually buys, in the user's words rather than the API's. */
  unlocks: {
    my_team: "Start/sit calls, stamped with confidence",
    waivers: "The wire: claims, the bid, and the drop",
    trade_lab: "Trade verdicts and counters",
    full_report: "The full weekly film",
    battle: "Position Battle: any two men, one spot, four verdicts",
  },
  badge: { best: "Best value", flex: "No commitment" },
  leagues: (n: number) => `${n} league${n === 1 ? "" : "s"}`,
  /** The anchor on the season card: the rest of the way week to week, against the season. */
  stack: {
    head: "Week to week, or the season",
    weekly: (n: number) => `Week pass, ${n} more week${n === 1 ? "" : "s"}`,
    season: "Season pass, once",
    even: (n: number) => `The season is about ${n} weeks of the week pass. The rest of the way is on the house.`,
  },
  /** The guarantee sits under the price. It is the one in the terms, said plainly. */
  guarantee: {
    head: "The guarantee",
    body: (days: number) => `Not useful? Ask within ${days} days and it is refunded in full. No reasoning required.`,
  },
  /** Shown only while the API reports no card reader: the same grant the upgrade sheet makes. */
  launch: {
    head: "Launch week",
    body: "Every floor is open and there is no card to enter. Take it while the register is closed.",
  },
  cta: "Take me upstairs",
  under: "Start free. Pay only when you want the rest.",
} as const;

/**
 * The lineup tab. One question -- is my starting lineup right for this week? -- answered
 * as two piles that are never blurred: what has to change (a man who will not play, an
 * empty slot, a swap the projection has settled) and what has to be decided (two men close
 * enough that the projection alone does not pick). The head coach owns it, and his voice
 * is here: the notes in the corner, the stamp that lands when the tab opens, the reads
 * under each close call. Counts and probabilities come from the engine; only the words
 * live here.
 */
export const LINEUP = {
  /** The hero's top line: the head coach's notes, the personality of the page. */
  coach: {
    from: "From the head coach",
    aria: "Your head coach has notes for you",
    notes: "Coach\u2019s notes",
    /** The engine's pick for a role. Follow it blind, or open the role and decide. */
    call: "Head coach\u2019s call",
  },
  projected: (week: number) => `Projected \u00b7 Week ${week}`,
  /** The week in progress (Andrew, 2026-09-28: Sunday night the page still said "projected"
   *  over a week that was mostly played). The hero shows what is on the board. */
  live: {
    scored: (week: number) => `On the board \u00b7 Week ${week}`,
    /** Beside the score: where the week ends up if the rest hit their projections. */
    projectsLabel: "Projects",
    /** The count under the number. */
    count: (played: number, on: number, toPlay: number) => {
      const parts: string[] = [];
      if (played) parts.push(`${played} played`);
      if (on) parts.push(`${on} on the field`);
      if (toPlay) parts.push(`${toPlay} to play`);
      return parts.join(" \u00b7 ");
    },
    /** The mark on a roster row: his game is over, or on. */
    final: "Final",
    on: "Live",
    /** The last row of the table once the games are on. */
    total: "So far",
  },
  /** Beside the number: where the projection ranks in the league this week, as an eyebrow
   *  and a figure. Not a margin against your own lineup, which a tipped coin flip can
   *  legitimately move down. */
  standingLabel: "Weekly rank",
  standing: (rank: number, of: number) => `${ordinal(rank)} of ${of}`,
  /** The split, stated plainly under the number: two chips on one row. */
  required: (n: number) => `${n} required change${n === 1 ? "" : "s"}`,
  decisions: (n: number) => `${n} decision${n === 1 ? "" : "s"} to make`,
  /** Both piles empty: the coach has nothing for you. */
  clear: "Lineup\u2019s set",
  /** The stamp that lands when the tab opens. It stays until dismissed. */
  stamp: {
    /** Something to fix or decide. No numbers: the chips under the hero carry those. */
    urgent: "Urgent",
    clear: "All set",
    aria: "The head coach\u2019s summary",
    then: "Mandatory review required",
    close: "Show me",
    closeAria: "Dismiss the head coach\u2019s summary",
  },
  /** The hero's link down to the roster, which sits below both piles. */
  jump: "Go to roster",
  /** The last row of the starters table. */
  total: "Total",
  section: {
    required: "Required changes",
    decisions: "Decisions to make",
    field: "On the field",
    bench: "On the bench",
    reserve: "Injured reserve",
  },
  /** The icons on a roster row, read out. */
  mark: {
    lock: "Lock",
    flag: (label: string) => `Decision at ${label}`,
    out: "Must leave the lineup",
  },
  /** Nothing forced: a solid stamp, not an apology. */
  requiredClear: "Handled",
  requiredClearLine: "Nobody hurt, nobody on a bye, every slot filled.",
  decisionsQuiet: "Every role is a Lock. Nothing to weigh.",
  /** Roles marked handled this week, folded away under the list. */
  handled: (n: number) => `${n} handled`,
  showHandled: "Show",
  /** One required change. */
  change: {
    empty: "Empty slot",
    /** A man who will not play, or a slot with nobody in it: not a call, a fix. */
    forced: "Must fix",
    /** The projection has settled it. */
    settled: "Settled",
    /** Over the gain on a required change: the swap is worth this many points. */
    saves: "Swap saves",
    /** The out man's face, read out. */
    outAria: (name: string) => `${name} comes out`,
    inAria: (name: string) => `${name} goes in`,
    /** A slot the roster cannot fill. */
    hole: "Nobody to start",
    wire: "Hit the wire",
  },
  /** One role that needs the owner. */
  role: {
    /** The row's question, and the page's heading. */
    question: (label: string) => `Who\u2019s your ${label}?`,
    aria: (label: string) => `Open the ${label} decision`,
    /** The pick was on your bench. */
    change: "Change",
    keep: "As you set it",
    tipped: "The reads tip it",
    considered: "Also in the frame",
    /** The other men, in a list on the role's page. */
    others: "The other options",
    /** A chance, always with both names: never "the pick" or "him", which read both ways. */
    odds: (pct: number, a: string, b: string) => `${pct}% chance ${a} outscores ${b}`,
    /** The top of the page: the call, in two words. */
    start: (name: string) => `Start ${name}`,
    /** The grid, every option side by side. */
    grid: "Side by side",
    gridAria: (label: string) => `Every option for ${label}, side by side`,
    band: "The call",
    rows: {
      proj: "Projected",
      rank: "Rank",
      chance: (pick: string) => `Beats ${pick}`,
      edge: "Head to head",
    },
    /** The last row: the reads between him and the pick, counted. */
    edge: {
      pick: (n: number) => `Pick +${n}`,
      him: (n: number) => `Him +${n}`,
      even: "Even",
    },
    /** When another man projects ahead of the pick, say so before anyone asks. */
    flag: (him: string, pct: number, pick: string) => `The projection has ${him} ahead: ${pct}% chance he outscores ${pick}.`,
    tips: (pick: string, reads: string) => `What tips it to ${pick}: ${reads}.`,
    legend: { good: "Helps this week", bad: "Hurts this week", edge: "Wins the head to head" },
    empty: "\u2014",
    /** The pairwise sentences, folded under the grid. */
    full: "Read every note",
    fullHide: "Hide the notes",
    vs: (a: string, b: string) => `${a} vs ${b}`,
    reads: "What separates them",
    none: "Nothing else separates them this week.",
    game: "Your game",
    proj: "Proj",
    /** Mark it handled: it leaves the list until next week. The line under the button says so. */
    handle: "Mark handled",
    handleLine: (label: string) => `Takes ${label} off your decisions list until next week.`,
    handled: "Handled",
    handledLine: (label: string) => `${label} is off your decisions list until next week.`,
    unhandle: "Put it back",
    back: "Back to the lineup",
    missing: "That role is not on this lineup.",
  },
  /** The seven reads, as labels. Keys mirror `engine/decisions.KEYS`. */
  factor: {
    variance: "Swing",
    stack: "Stack",
    opponent: "Matchup",
    health: "Health",
    rest: "Rest",
    form: "Form",
    role: "Role",
  } as const satisfies Record<string, string>,
} as const;

/**
 * The tag a reader sees for each confidence band. The engine's value is the key and never
 * changes ("Coin flip" is what the grading, the film and the share graphics carry); the
 * word on screen is the owner's box's: a coin flip is a call only the owner can make.
 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  Lock: "Lock",
  Lean: "Lean",
  "Coin flip": "Owner\u2019s call",
};

/**
 * What a confidence stamp is worth, in words. ONE definition for three surfaces.
 *
 * The depth chart's "why" list, the call-sheet card's "why" list and the stamp's tooltip
 * were three copies of the same three sentences. That is exactly how one of them ended up
 * rendering "right about 75% of the time last week" the moment the measured rates landed:
 * it built the number at runtime, so a grep for "80%" could never have found it.
 *
 * The engine holds the matching copy in `edge/engine/actions.py::HIT_LINE`, because that
 * card's list is built server-side. The two must keep saying the same thing.
 *
 * No percentage, and never "last week": these are a full-season measurement
 * (`docs/CALIBRATION.md`, 2025 weeks 1-17), not a property of any single week.
 */
export const CONFIDENCE_HIT_LINE: Record<string, string> = {
  Lock: "Calls this sure were right about 4 times in 5 across last season.",
  Lean: "Calls this sure were right about 2 times in 3 across last season.",
  "Coin flip": "Calls this close were a coin flip across last season.",
};

/** The standing line under the call sheet's hero. Everything printed on it is data. */
export const STANDING = {
  /** Spoken only. The printed line is three fragments of data and no words at all. */
  go: "Go to",
} as const;

/** "Last week: W 127.8-101.4 · 2 of 3 calls hit", under the standing line. */
export const LAST_WEEK = {
  lead: "Last week:",
  /** Printed. One character, because the scoreline beside it says which way it went. */
  mark: { W: "W", L: "L", T: "T" } as const,
  /** Spoken. "W 127.8-101.4" is a scoreline to the eye and alphabet soup to a reader. */
  said: { W: "won", L: "lost", T: "tied" } as const,
  /**
   * The only sentence this surface is allowed to say about how we did.
   *
   * Two counts, this reader's own week, stated flat. Not a rate: "we are right 67% of the
   * time" is a claim about the product, and CLAUDE.md bars it until `scripts/score_runs.py`
   * has graded real weeks. The engine hands over `hits` and `total` as integers precisely
   * so that this is the only sentence available (`edge/engine/recap.py::last_week`).
   */
  calls: (hits: number, total: number) => `${hits} of ${total} call${total === 1 ? "" : "s"} hit`,
  /** Spoken only. */
  go: "Go to",
} as const;

/** The trade board, free and paid. */
export const TRADE = {
  eyebrow: "Trade lab",
  previewEyebrow: "GM's Office",
  lead: "Best fit first. Tap a team for its offers.",
  previewLead: "Best fit first.",
  /** The one line that ends every free partner card. Says where the move is, does not beg. */
  previewOffers: "Offers are in Trade Lab.",
  bestFit: "Best fit",
  worthACall: "Worth a call",
  /** Under the free board. Concrete about what the money buys, and it never names a player. */
  lockTeaser: "We build the offer, grade the one you send back, and write the counter.",
} as const;

/**
 * The GM's Office, rebuilt like Scouting (Andrew, 2026-09-23): the few deals worth a call
 * at the top, every GM in one line each under them, one page per partner, and the offer
 * builder at the bottom for when you have your own idea.
 */
export const OFFICE = {
  title: "Calls to return",
  seeAll: (n: number) => `Every GM (${n})`,
  heat: { hot: "Hot line", call: "Worth a call", long: "Long shot" },
  youGet: "You get",
  forWord: "for",
  ros: "ROS",
  /** "Will they say yes?" on a deal row, in place of the old "% fair" (W-033). */
  yes: "yes?",
  /** Your roster, one tile per position. */
  shape: "Your roster",
  shapeWord: { spare: "Spare", short: "Short", set: "Set", mixed: "Mixed" },
  shapeHint: "Spare is bench that would start elsewhere. Short is starters below the league's average.",
  shapeAria: (pos: string, word: string) => `${pos}: ${word}`,
  /** The jump down to the builder, like the lineup's jump to the roster. */
  jump: "Skip to trade room",
  youGive: "You give",
  youGetShort: "You get",
  none: "Nobody in the league has what you need for what you can spare. Quiet week.",
  locked: "Locked",
  lockedLine: "Your best fit is named. The deal itself is Trade Lab's.",
  /** Over the haze where the other GMs would be (Andrew, 2026-09-28: one GM, blur the rest). */
  hiddenLine: (n: number) => (n === 1 ? "One more GM worth a call, with the deal for each." : `${n} more GMs worth a call, with the deal for each.`),
  hiddenNone: "Every GM in the league, the deal for each, and the trade room.",
  goAria: (team: string) => `The deal with ${team}`,
  partners: "Every GM",
  partnersHint: "Best fit first. What they have, what they need, the best deal.",
  has: "Has",
  needs: "Needs",
  offers: (n: number) => `${n} offer${n === 1 ? "" : "s"}`,
  build: "Trade room",
  buildHint: "Size up a manager's roster, or put an offer on the table and we grade it.",
  /**
   * The two doors into the trade room (W-037). "Open the table" opened one long panel with
   * an opponent already picked and a grade button over an empty table; each door now opens
   * empty, on a "Pick a manager" control, and loads nothing until you pick.
   */
  doors: {
    compare: "Compare teams",
    compareHint: "Strong, short and spare, side by side.",
    build: "Build a trade",
    buildHint: "Your players, theirs, and the grade.",
    close: "Close",
    pick: "Pick a manager",
    pickLabel: "Across the table",
    pickFirst: "Pick a manager to load their roster.",
    loading: "Loading their roster…",
    toBuild: (team: string) => `Build a trade with ${team}`,
    toCompare: "See how your teams compare",
  },
  /** The two halves of the table in Build a trade. */
  table: {
    send: "You send",
    get: (team: string) => `You get from ${team}`,
    add: "+ Add",
    sendEmpty: "Tap Add to put someone on the table.",
    getEmpty: "Tap Add to name what you want back.",
    /** The bar between the halves: name value only. The lineup is what the grade reads. */
    value: "Name value on the table",
    valueLive: (net: string) => `Name value ${net} · grade it for the lineup`,
    grade: (give: number, get: number) => `Grade ${give}-for-${get}`,
    grading: "Grading it…",
  },
  /**
   * The verdict (W-033): one lead number (what the trade does to your starting lineup rest
   * of season), name value as a secondary line that cannot read as a loss, and "Will they
   * say yes?" in three steps where "Fairness 90%" used to sit.
   */
  verdict: {
    eyebrow: "The verdict",
    lead: "Your lineup",
    leadUnit: "rest of season",
    scored: (give: number, get: number, team: string) => `Your ${give}-for-${get} with ${team}, scored on both rosters.`,
    willThey: "Will they say yes?",
    will: { Likely: "Likely", Maybe: "Maybe", Unlikely: "Unlikely as is" },
    theirLine: (delta: number) =>
      delta > 0 ? `Their lineup gains ${delta}.` : delta < 0 ? `Their lineup drops ${-delta}.` : "Their lineup holds.",
    /** Name value, worded so it never reads as a loss when the lineup gets better. */
    nameValue: (lineup: number, net: number) =>
      net < 0 && lineup > 0
        ? `You give up more name value (${net}), but your lineup gets better.`
        : net < 0
          ? `You give up more name value (${net}).`
          : net > 0
            ? `You get more name value (+${net}).`
            : "Even on name value.",
    you: "You",
    them: "Them",
    noRead: "\u2013",
    scoredBoth: "Scored on both rosters.",
    weekLabel: "this week",
    valueLabel: "name value",
    out: "out",
    in: "in",
    how: "How is this scored?",
    howLines: (out: number, inn: number) => [
      "The lead number is your starting lineup, rest of season, with the trade against without it.",
      `Name value is rest-of-season projected points, rescored to this league's settings. You send ${out} and receive ${inn}.`,
      "Lineup impact counts free agents, so an emptied slot costs the gap to the best waiver option, not the whole player.",
      "Will they say yes reads their lineup change and how this manager has traded.",
    ],
  },
  /** The share card. Still dark and still English whatever the reader's theme. */
  card: {
    eyebrow: "Owner\u2019s Suite verdict",
    youGive: "You give",
    youGet: "You get",
    nothing: "Nothing",
    yourLineup: (n: string) => `Your lineup ${n} ROS`,
    theirs: (n: string) => `Theirs ${n}`,
  },
  /** One partner's page, `/trade/deal?team=`. */
  deal: {
    back: "Back to the office",
    rank: (n: number) => `Call ${n} of the week`,
    offers: "The offers",
    theirShape: "Their roster",
    build: (team: string) => `Build your own with ${team}`,
    gone: "That GM is off the board. The league moved since you opened it.",
    grade: "Grade it",
    why: "Why?",
  },
} as const;

/** The call that opens the GM's Office the first time. */
export const CALL = {
  aria: "A GM is calling",
  incoming: "Incoming call",
  connected: "On the line",
  /** Your own GM on the line, never another manager (Andrew, 2026-09-23). */
  title: "General Manager",
  staff: "Front office",
  answer: "Answer",
  decline: "Decline",
  slide: "slide to answer",
  hello: "Got a minute?",
  /** "3 / X": the deals he leads with, out of every offer on the board. */
  deals: (top: number, total: number) =>
    total <= top
      ? top === 1 ? "I've got one trade worth a look." : `I've got ${top} trades worth a look.`
      : `I've got ${top} of ${total} potential trades to consider.`,
  preview: "I've got names for you. Pull up the board.",
  quiet: "Quiet week. Nobody has what you need yet.",
  skip: "Tap to skip",
} as const;

/** The weekly-email opt-in on /login. */
export const EMAIL = {
  eyebrow: "Thursday email",
  label: "Send me the call sheet every Thursday",
  note: "This week's moves, in your inbox before kickoff. Untick it any time.",
  /*
   * Andrew's call. There is no Resend key and no verified sending domain yet (D5), so the
   * line above promises a Thursday email that cannot arrive. We still want the list, so the
   * box stays and this says plainly where it stands. DELETE THIS LINE the day the first
   * send goes out: a stale "not sending yet" is worse than no line at all.
   */
  pending: "Not sending yet. We'll email you when the first one goes out.",
  saving: "Saving…",
  savedOn: "Saved. You're on the list.",
  savedOff: "Saved. You're off the list.",
  failed: "That didn't save. Tick it again.",
  unavailable: "Your settings aren't loading. Reload the page to try again.",
} as const;

/**
 * The player page: the sheet that rises when you tap any name.
 *
 * One block at the end of the file, appended rather than threaded through the sections
 * above, because the page cuts across every room — it opens over the call sheet, the depth
 * chart, the wire and the film alike, and belongs to none of them.
 *
 * **Nothing here carries a digit.** The Vibes side of the page is words only, and the words
 * it is built from start here, so the rule is easiest to keep where the strings live
 * (`src/lib/player/vocab.test.ts` is the guard).
 */
export const PLAYER = {
  /** Spoken, for the dialog. The player's own name is read out in front of it. */
  sheet: "player page",
  /**
   * The two sides, and the word each one puts on the header and the footer.
   *
   * The word is not decoration: the mode flips the colour of the whole frame, and colour
   * never carries meaning on its own (`docs/BRAND.md`), so the word is the meaning and
   * the brass and the chrome are the reinforcement.
   */
  modes: {
    vibes: { label: "Vibes", said: "The read, in words" },
    stats: { label: "Stats", said: "Every number he has" },
  },
  /** Spoken name of the toggle itself. */
  modeGroup: "Which side of his page",
  /** The three doors along the bottom. Mixed case: uppercase does not fit three-up at 320px. */
  footer: {
    battle: "Position Battle",
    office: "GM's Office",
    chat: "Chat",
  },
  /** On a door that is not built yet. States it, does not apologise for it. */
  soon: "Soon",
  /** Under the drag handle. The sheet has no close button, so it says how to leave. */
  swipe: "Swipe down to leave",
  /** Spoken, on the handle and the backdrop. Both close it. */
  close: "Close his page",
  /** The wait. */
  opening: "Opening",
  /** A player id that answers nothing. It will still answer nothing on a retry. */
  notFoundHead: "No page for him",
  notFoundLine: "Nobody by that id is in this league's player pool.",
  /**
   * The Vibes side: what he is, then which way he is going.
   *
   * Two tiers, because they answer different questions. The base moves over months and is
   * what you own; the trend moves week to week and is what you act on. Every word here is
   * a band in `lib/player/vibes.ts` -- the thresholds are there, the words are here.
   *
   * Nothing in this block may carry a digit. That is the Vibes rule and it is enforced
   * twice: by `lib/player/vocab.test.ts` over these strings, and by `assertWordsOnly` over
   * the sentence the headline composes out of them at runtime.
   */
  vibes: {
    /** The two tier headings. */
    baseHead: "What he is",
    baseSub: "Slow to change. This is what you own.",
    trendHead: "Which way he is going",
    trendSub: "Week to week. This is what you act on.",
    /** No counts on record at all: week one, or a man who has not taken a snap. */
    empty: "Nothing on him yet this season. Check the numbers next door.",
    /** The base is there but nothing in it is worth a sentence. */
    fallback: "Not enough on record to call him yet.",
    /** What each row is measuring. Left column, both tiers. */
    labels: {
      snaps: "On the field",
      work: "The ball",
      standing: "At his position",
      role: "His role",
      usage: "Usage",
      chances: "Red-zone work",
      efficiency: "Every touch",
      form: "Form",
    },
    /** Snap share, richest first. */
    snaps: {
      every: "Every down",
      starter: "Starts",
      rotation: "In the rotation",
      sub: "Barely on",
    },
    /** His share of the position's work. Backs and receivers keep separate words. */
    work: {
      feature: "Feature back",
      lead: "Leads the committee",
      committee: "Split backfield",
      backup: "Behind someone",
      first: "First read",
      inPlan: "In the plan",
      complementary: "Complementary",
      afterthought: "Rarely looked at",
    },
    /** Where he sits among the men who play his position. */
    standing: {
      elite: "Top of it",
      starter: "Starter grade",
      flex: "Flex grade",
      bench: "Bench grade",
    },
    /** His last few weeks against his own season. Form, not talent. */
    form: {
      hot: "Hot",
      warming: "Warming",
      level: "Level",
      cooling: "Cooling",
      cold: "Cold",
    },
    /** A trend row's answer. */
    dir: { up: "Up", down: "Down", level: "Level" },
    /**
     * The one line at the top, composed from the base and the loudest trend.
     *
     * Lower case on the trailing clause on purpose: the base word is a title
     * ("Feature back") and the rest of the sentence runs on from it.
     */
    headline: {
      still: (what: string) => `${what}, and steady with it.`,
      rising: (what: string, moving: string) => `${what}, and ${moving.toLowerCase()} is climbing.`,
      slipping: (what: string, moving: string) => `${what}, but ${moving.toLowerCase()} is slipping.`,
    },
  },
  /** The Stats side. */
  stats: {
    empty: "No numbers on him yet this season.",
  },
} as const;

/**
 * The film, as the replay (SPEC-FILM F-4): your week told as a story, card by card.
 *
 * The engine writes the sentences about a player and the swing (`edge/engine/film.py`),
 * because they are built from his numbers. Everything around them lives here. The voice is
 * the staff's, reading the tape back to you: plain, kind in order, never kind in fact.
 */
export const FILM = {
  eyebrow: "The replay",
  week: (n: number) => `Week ${n}`,
  vs: (opp: string) => `vs ${opp}`,
  score: (mine: number, theirs: number | null) =>
    theirs === null ? mine.toFixed(1) : `${mine.toFixed(1)}–${theirs.toFixed(1)}`,
  result: { W: "Win", L: "Loss", T: "Tie" } as Record<"W" | "L" | "T", string>,
  bye: "No opponent this week",
  margin: (result: "W" | "L" | "T", by: number) =>
    result === "T" ? "A tie" : `${result === "W" ? "Won" : "Lost"} by ${by.toFixed(1)}`,
  weeks: "Pick a week",
  weekChip: (n: number) => `Wk ${n}`,
  story: "The story",
  railAria: (i: number, n: number) => `Card ${i} of ${n}`,
  card: {
    game: "The game",
    swing: "What decided it",
    lineup: "Your lineup",
    standout: "The one who carried you",
    dud: "The one who let you down",
    injuries: "The injuries",
    starters: "Every starter",
    takeaway: "Before Thursday",
  },
  control: { outside: "Out of your hands", decision: "Your call" },
  lineup: {
    scored: "You scored",
    best: "Best you had",
    perfect: "You started the best lineup you had.",
    left: (pts: number) => `${pts.toFixed(1)} points sat on your bench.`,
  },
  verdict: {
    went_off: "Went off",
    flopped: "Flopped",
    as_expected: "As expected",
    hurt_pregame: "Hurt before kickoff",
    hurt_in_game: "Left early",
    did_not_play: "Did not play",
  },
  had: "Had",
  went: "Went",
  noHad: "No number",
  delta: (d: number) => `${d > 0 ? "+" : ""}${d.toFixed(1)}`,
  source: {
    freeze: "Frozen Thursday",
    runs: "What we showed you",
    platform: "As Sleeper has it now",
  },
  platformMark: "Projection as Sleeper has it now",
  sourceNote: "A marked projection is as Sleeper has it now. It may have moved after the games.",
  why: "Why",
  whyAria: (name: string) => `Why ${name} scored what he did`,
  quiet: "Nothing unusual for him. A normal week.",
  history: {
    since: (season: number, week: number) => `His best game since week ${week} of ${season}`,
    earliest: (season: number) => `His best game since ${season}, as far back as we have`,
    rank: (rank: number, weeks: number) => `His ${ordinal(rank)} best of ${weeks} games this season`,
  },
  next: { start: "Start him", move_on: "Move on", hold: "Hold" },
  go: "Go",
  takeawayNone: "Nothing to change off this week. Keep the lineup honest and go.",
  noSwing: "No single play decided it.",
  noInjuries: "Nobody got hurt.",
  none: "No finished week yet. The replay opens the Tuesday after your first game.",
  noneHead: "Nothing on tape",
  lineByLine: "This platform sends the scoreline but not who scored it, so the line-by-line is not here yet.",
  product: "The replay: every week, told",
  /** Over the haze on the free film: what the paid replay holds (Andrew, 2026-09-28: show it, then blur it). */
  moreLine: "The play that decided it, who carried you, who let you down, and what to do before Thursday.",
  season: "Week by week",
  /** Sharing the cover: free, like a Lock card (SPEC-FILM D2). */
  share: {
    button: "Share this week",
    busy: "Making the link",
    copy: "Copy",
    copied: "Copied",
    copyFail: "Could not copy. Select the link and copy it by hand.",
    carried: "Carried the week",
    pitch: "Somebody watched their week back on Owner's Suite: the result, why it went that way, and what to do before Thursday.",
    title: (team: string, result: string, score: string) => `${team}: ${result} ${score}`,
  },
  /** The projector: the film's opening, once per graded week. */
  projector: { aria: "The film is rolling", skip: "Tap to skip" },
  /** The jump bar under the title: the three parts of the one scroll. */
  parts: { replay: "Replay", league: "League", season: "Season" },
  partsAria: "Jump to a part of the film",
  /** The league half (SPEC-FILM F-5 to F-7). */
  league: {
    head: "The league",
    locked: "Superlatives, the trade ledger and the playoff line",
    supers: (week: number) => `Superlatives, week ${week}`,
    title: {
      top_score: "Top score",
      unluckiest: "Unluckiest",
      luckiest: "Luckiest",
      blowout: "Blowout",
      best_manager: "Best manager",
      most_left: "Most left on the bench",
      best_claim: "Best pickup",
    },
    you: "You",
    groups: "Who's strong where",
    groupsHint: "Rest-of-season grade at each position. Darker is a better room.",
    team: "Team",
    expect: "Above or below the projection",
    expectHint: (weeks: number) => `Points against the starters' projections, over the ${weeks === 1 ? "one week" : `${weeks} weeks`} with a number for every starter.`,
    above: "Above",
    below: "Below",
    gauntlet: "The gauntlet",
    gauntletHint: "Points faced so far. The longest bar has had the hardest schedule.",
    perGame: (pts: number) => `${pts.toFixed(1)} a game`,
    ledger: "The ledger, so far",
    ledgerHint: (week: number) => `Every trade and pickup, on the points each side has scored for its new team through week ${week}. So far, not final.`,
    net: "Net so far",
    moves: (n: number) => (n === 1 ? "1 move" : `${n} moves`),
    trades: "Trades",
    noTrades: "No trades yet.",
    tradeWeek: (w: number) => `Week ${w}`,
    tooNew: "Too new to judge",
    tooEarly: "Too early to judge any move. The ledger ranks a trade or a pickup once it is two weeks old.",
    got: "Got",
    picks: (n: number) => (n === 1 ? "a pick" : `${n} picks`),
    pts: (n: number) => `${n.toFixed(1)} pts`,
    fromHere: (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)} from here (projection)`,
    bestClaims: "Best pickups",
    worstClaims: "Pickups that cost",
    cut: (names: string) => `cut ${names}`,
    claimLine: (got: number, gave: number) => `${got.toFixed(1)} for you, ${gave.toFixed(1)} for the man you cut`,
    playoffs: "The playoff picture",
    playoffsHint: "If the season ended today. Record first, then points for.",
    weeksLeft: (n: number) => (n === 1 ? "1 week left" : `${n} weeks left`),
    line: "The line",
    clear: (g: number) => (g === 0 ? "Level" : `${g} clear`),
    back: (g: number) => (g === 0 ? "Level" : `${g} back`),
    record: (w: number, l: number, t: number) => (t ? `${w}-${l}-${t}` : `${w}-${l}`),
    empty: "The league half fills in after the first finished week.",
  },
} as const;

/**
 * The sign-up walk (docs/SPEC-ONBOARDING.md): one question a screen, in the staff's voice.
 * Prices and dates are never typed here; the screens pass in what the API computed.
 */
export const ONBOARD = {
  /** Read by a screen reader with the bar; the bar itself is the progress. */
  progressAria: (n: number, of: number) => `Step ${n} of ${of}`,
  back: "Back",
  phone: {
    eyebrow: "Your badge",
    title: "Your number.",
    line: "A text gets you through the door. No password to remember.",
    label: "Mobile number",
    placeholder: "(555) 234-5678",
    send: PHONE_DOOR.send,
    busy: "Texting…",
    trust: PHONE_DOOR.trust,
    useEmail: PHONE_DOOR.useEmail,
    haveAccount: "Already in the building?",
    signIn: "Sign in",
  },
  code: {
    eyebrow: "Your badge",
    title: "The code we texted.",
    line: (to: string) => `Sent to ${to}.`,
    label: "Six-digit code",
    verify: "Check it",
    busy: "Checking…",
    resend: "Text a new code",
    resendIn: (s: number) => `New code in ${s}s`,
    resent: "New code sent.",
    change: "Change number",
    dev: (code: string) => `Dev API, nothing texted. Code: ${code}`,
  },
  name: {
    eyebrow: "Your office",
    title: "What goes on the nameplate?",
    line: "The staff will use it.",
    label: "Your name",
    placeholder: "First name is plenty",
    cta: "That’s me",
    skip: "Leave it blank",
  },
  mailbox: {
    eyebrow: "Your mailbox",
    title: "Where do the receipts go?",
    line: "Your receipts and the Thursday call sheet. Nothing else.",
    label: "Email",
    cta: "Use this",
    skip: "No email, thanks",
    busy: "Setting up…",
    taken: "That address already has an office. Sign in with it, then add this phone from your account.",
    signIn: "Sign in with that email",
  },
  email: {
    eyebrow: "Your badge",
    title: "Your email.",
    line: "It is how you get back in from any device.",
    label: "Email",
    cta: "Next",
    usePhone: "Use my phone instead",
  },
  password: {
    eyebrow: "Your badge",
    title: "A password for the door.",
    line: "Eight characters or more.",
    label: "Password",
    show: "Show",
    hide: "Hide",
    cta: "Next",
  },
  verify: {
    eyebrow: "Your mailbox",
    title: "Check your inbox.",
    line: (email: string) => `We sent a link to ${email}. Tap it and the address is confirmed.`,
    notSent: "Confirm mail is not switched on yet. Nothing was sent, and nothing is held up.",
    dev: "Dev API, nothing mailed. The link:",
    cta: "On to the league",
    later: "I’ll do it later",
  },
  league: {
    eyebrow: "Your team",
    title: "Which league are we running?",
    line: "Link one now. The staff starts on this week the moment it lands.",
    none: "I don’t have a league yet",
  },
  reveal: {
    eyebrow: "Your first call sheet",
    title: (team: string, week: number) => `${team}. Week ${week}.`,
    loading: "The staff is reading your roster.",
    call: "The call",
    clear: "Your lineup is set. Nothing to change this week.",
    upstairs: "Waiting upstairs",
    rooms: { waivers: "Scouting", trade_lab: "GM’s Office", full_report: "The film" } as Record<string, string>,
    quiet: "The rest of the staff works this week once you are in.",
    /** Drawn blurred where a paid move's names would be: a shape, never read. */
    haze: "Two names held for the owner",
    cta: "Open the building",
    error: "The roster would not load just now. The building is still yours.",
  },
  offer: {
    eyebrow: "The first week is on the house",
    title: (date: string) => `Own the week. Free until ${date}.`,
    applied: (code: string) => `${code} applied`,
    remove: "Remove",
    otherCode: "Have a different code?",
    pickAria: "Pick a pass",
    week: {
      name: "Week pass",
      line: (price: string, date: string) => `$0 today · ${price} on ${date} · cancel anytime`,
      now: (price: string) => `${price} today · then weekly · cancel anytime`,
    },
    season: {
      name: "Season pass",
      line: (price: string, date: string) => `$0 today · ${price} on ${date} · one payment`,
      now: (price: string) => `${price} today · one payment · the rest of the season`,
      save: (amount: string) => `Save ${amount}`,
    },
    titleNoTrial: "Own the week.",
    codeLabel: "Promo code",
    codeApply: "Apply",
    codeBad: "That code does not work here.",
    takeWeek: "Take the week",
    takeSeason: "Take the season",
    stripe: "Nothing is charged today. Stripe holds the card.",
    reminder: "Stripe emails you before the first charge.",
    cta: "Put the card on file",
    ctaComp: "Open the free week",
    busy: "Opening Stripe…",
    comp: "Launch week: no card, no charge. The free week opens on the spot.",
    skip: "Not now. Keep the free lineup calls.",
    canceled: "No card taken. The free week is still here.",
  },
  done: {
    eyebrow: "You’re in",
    paidTitle: "You own the week.",
    weekLine: (price: string, date: string) => `$0 today. ${price} on ${date}. Cancel from your account anytime.`,
    seasonLine: (price: string, date: string) => `$0 today. ${price} on ${date}, once. Cancel before then and nothing is charged.`,
    compLine: (date: string) => `Every room is open until ${date}.`,
    waiting: "Stripe is handing over the keys.",
    slow: "Stripe is taking its time. The week opens the moment it lands; the elevator works either way.",
    freeTitle: "You’re in.",
    freeLine: "The lineup calls are yours. The rest of the building opens with a pass, whenever you like.",
    cta: "Take the elevator up",
  },
  /** The confirm-your-address page (`/verify?token=`). */
  confirm: {
    eyebrow: "Your mailbox",
    working: "Confirming your address…",
    done: "Address confirmed.",
    doneLine: "Receipts and the call sheet go there from now on.",
    bad: "That link has expired or was already used. Send a fresh one from your account.",
    cta: "Back to the office",
    account: "Your account",
  },
  /** The address line on /account, until it is confirmed. */
  unverified: "Not confirmed",
  verified: "Confirmed",
  sendLink: "Send the confirm link",
  linkSent: "Link sent. Check your inbox.",
  linkNotSent: "Confirm mail is not switched on yet. Nothing was sent.",
};

/**
 * Position Battle (Andrew, 2026-10-05): two men, one spot, the tale of the tape.
 *
 * Boxing's corners, because that is what it is: the man in the spot is the **blue corner**,
 * the challenger the **red corner**. The colours are reinforcement only; every verdict
 * names its man (`docs/BRAND.md` section 7). Row labels are keyed by the engine's row keys
 * (`edge/engine/battle.py tape`), so a row the engine adds without a label here is caught by
 * `lib/battle.test.ts`.
 */
export const BATTLE = {
  title: "Position Battle",
  /** The red button on every player page. */
  button: "Position Battle",
  buttonSub: "Pick a fight",
  /** Spoken, on the button. */
  buttonAria: (name: string) => `Start a Position Battle with ${name}`,
  eyebrow: (spot: string) => `Position Battle · ${spot}`,
  corners: { a: "Blue corner", b: "Red corner" },
  /** Under each fighter's name: where he stands. */
  holds: (label: string) => `Holds ${label}`,
  where: {
    starter: (label: string) => `Your ${label}`,
    bench: "Your bench",
    wire: "Free agent",
    trade: (team: string) => `Trade · ${team}`,
  },
  vs: "VS",
  /** The empty red corner, before a challenger is picked. */
  pickHead: "Who wants his spot?",
  pickLine: "Pick a challenger: one of yours, one off the wire, or a trade target.",
  tabs: { roster: "Your roster", wire: "Wire", trade: "Trade" },
  tabAria: "Where the challenger comes from",
  search: "Find a challenger",
  searchAria: "Search the challengers by name",
  allPositions: "All",
  noneHere: "Nobody here can fight for this spot.",
  noMatch: (q: string) => `Nobody called "${q}" in this corner.`,
  rowProj: "Wk",
  rowRos: "ROS",
  pickAria: (name: string) => `Battle ${name}`,
  /** The clash. */
  clash: {
    skip: "Skip",
    intro: "In the blue corner",
    challenger: "And the challenger",
    fight: "Fight",
    sealed: "Verdict sealed",
    waiting: "The judges are scoring it",
  },
  /** The headline, after the clash. */
  headline: {
    sweep: (name: string) => `${name} sweeps`,
    split: "Split decision",
    draw: "Dead even",
    splitLine: (now: string, later: string) => `${now} wins now. ${later} wins the stretch.`,
    sweepLine: (n: number) => `All ${n} horizons, one way.`,
    tally: (a: number, b: number, rows: number) => `Tape: ${a} to ${b} across ${rows} rows`,
  },
  horizons: {
    week: "This week",
    next5: "Next 5",
    ros: "Rest of season",
    playoffs: "Playoffs",
  },
  /** The weeks under a horizon's name. */
  span: (first: number, last: number) => (first === last ? `Wk ${first}` : `Wk ${first}–${last}`),
  assumed: "Your league did not set its playoffs. Read as weeks 15 to 17.",
  strength: {
    clear: "Clear edge",
    edge: "Slight edge",
    even: "Dead even",
  },
  /** This week's strength carries the calibrated chance. */
  chance: (p: number) => `${p}% to outscore`,
  tipped: "The reads tipped it",
  tippedLater: "The schedule tipped it",
  held: "Too close to move. He keeps the spot.",
  noWinner: "Neither scores",
  pts: (n: number) => `${n.toFixed(1)}`,
  games: (n: number | null) => (n == null ? "" : n === 1 ? "1 game" : `${n} games`),
  /** The tale of the tape. */
  tape: "Tale of the tape",
  tapeSub: "Every row says who it favours, or neither. A count, never a weighted score.",
  familyTally: (a: number, b: number) => `${a}–${b}`,
  families: {
    outlook: "The projection",
    season: "The season so far",
    usage: "Usage",
    risk: "Floor, ceiling and health",
    schedule: "The schedule",
    situation: "The situation around him",
    depth: "Who is behind him",
  },
  rows: {
    proj_week: "Projected this week",
    rank_week: "Rank this week",
    proj_next5: "Projected, next 5",
    proj_ros: "Projected, rest of season",
    proj_playoffs: "Projected, playoffs",
    rank_ros: "Rank, rest of season",
    rate_ros: "Points a game from here",
    rank_season: "Rank so far",
    ppg: "Points a game",
    points: "Points so far",
    last_game: "Last game",
    form: "Form, last 3",
    last_season: "Last season, a game",
    snap: "Snap share",
    target_share: "Target share",
    rush_share: "Carry share",
    touches: "Touches a game",
    red_zone: "Red-zone touches a game",
    snap_trend: "Snaps, last game vs season",
    depth: "NFL depth chart",
    style: "Boom or steady",
    floor: "Floor (worst game)",
    ceiling: "Ceiling (best game)",
    spread: "Week-to-week swing (sd)",
    start_weeks: "Startable weeks",
    boom_weeks: "Elite weeks",
    availability: "Games played",
    health: "Health",
    matchup: "This week's matchup",
    sos_next5: "Schedule, next 5",
    sos_ros: "Schedule, rest of season",
    sos_playoffs: "Schedule, playoffs",
    bye: "Bye week",
    rest: "Rest before kickoff",
    offense: "His offence, points a game",
    qb: "His quarterback",
    sacks: "Sacks his line allows a game",
    run_game: "His team's yards a carry",
    line_hurt: "Linemen hurt",
    around: "Injuries around him",
    team_change: "Team",
    experience: "Experience",
    handcuff: "Next man up behind him",
    ahead: "Man ahead of him",
    buzz: "Adds in the last day",
  } as Record<string, string>,
  /** What the strip of weeks is. */
  road: "The road to week 17",
  roadSub: "Every opponent graded by what it allows his position, in your scoring.",
  roadKey: { soft: "Soft", average: "Average", tough: "Tough", bye: "Bye", playoffs: "Playoffs" },
  /** This week's reads, folded under the verdict. */
  whyWeek: "What tips this week",
  /** Things the tape cannot read yet, said rather than faked. */
  notRead: "Not read yet: coaching changes, scheme, and line grades. Sacks allowed and yards a carry stand in for the line.",
  /** The paywall. */
  lockedWhat: "Position Battle",
  /** Doors at the bottom. */
  share: "Share this battle",
  sharing: "Making the link…",
  copy: "Copy",
  copied: "Copied",
  rematch: "New challenger",
  openPage: (name: string) => `${name}'s page`,
  /** The public card. */
  sharedPitch: "Two men, one spot. Every number that separates them.",
  sharedCta: "Run your own battle",
} as const;

/**
 * The iPhone app's own words (`mobile/`, docs/IOS.md). The app is the same rooms in a native
 * frame, so it only ever says what the frame itself has to: the screen when the feed drops,
 * the ESPN sign-in it opens in place of the bookmark walk, the kickoff reminders, and the
 * share sheet's subject line. The app imports this object from here, so the rule that every
 * word a user reads lives in this file holds on the phone too.
 */
export const NATIVE = {
  offline: {
    title: "Lost the feed.",
    body: "Owner's Suite needs a connection. Check yours, then try again.",
    retry: "Try again",
  },
  espn: {
    title: "Link from ESPN",
    lead: "Log in to ESPN and open your team. We take it from there.",
    cancel: "Cancel",
    found: "Got it. Loading your league.",
    /** Logged in, but the key never showed: the paste fields on /connect are the way through. */
    noKey: "ESPN kept the key from us. Cancel, then use Paste the two values instead.",
    privacy: "Your info stays on this phone. Our server never sees it.",
  },
  /** Local notifications, scheduled on the phone. Never a number, never a name. */
  reminders: {
    sunday: { title: "One hour to kickoff.", body: "The 1:00 slate locks at 1:00 ET. Make your calls." },
    thursday: { title: "Thursday night locks soon.", body: "Starting anyone tonight? Check them before 8:15 ET." },
  },
  share: { subject: "A call from Owner's Suite" },
} as const;
