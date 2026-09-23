/**
 * Every section name the app says out loud, in one place.
 *
 * Coach vocabulary, and it survives the rebrand on purpose: the penthouse is where the
 * sheet is *read*, not a reason to rename the sheet. The nav names a room (call sheet,
 * depth chart, scouting, the GM's Office, the film) while what you *buy* keeps its
 * product name (Wire Pass, Trade Lab, The Penthouse) — those live in `edge/products.py`,
 * not here.
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

  /**
   * The h1 on /connect. It is the one page in the app that is a task rather than a
   * welcome: somebody who has already tapped "Open the Penthouse" knows where they
   * are and needs to be told what to do next, and a second welcome in a row reads as
   * a lobby with two receptionists. `threshold` still does the welcoming on /login,
   * where there is nothing to do but arrive.
   */
  connect: "Connect your league.",

  /** The bundle, as a sentence — it sits above the price on the pricing card. */
  paywallBundle: "The rest of the building.",
  /** The same idea as a control. Buttons are verb first, and a full stop reads badly
   *  next to the price that follows it ("The rest of the building. · $7"). */
  paywallBundleCta: "Take the rest of the building",
  /** Any single pass, as a sentence. */
  paywallPass: "Unlock the floor.",
} as const;

/**
 * The ride up. The opening is an elevator to the top floor (`components/Elevator.tsx`),
 * and these are the few words on the car: the plate above the doors, the display on
 * the wall, and the one control. The staff lines that tick on the way up live in
 * `lib/elevator.ts`, because the ride's timing is derived from their count.
 */
export const RIDE = {
  /** What a screen reader is told the overlay is. */
  aria: "Riding up to the Penthouse",
  /** Above the doors while the car climbs. */
  goingUp: "Going up",
  /** Above the doors once it has stopped. */
  topFloor: "Top floor",
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
  letterhead: "PH",
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
     * your lineup this week.
     */
    tag: {
      own: (pos: string, starter: boolean) => `Your ${pos} \u00b7 ${starter ? "starting" : "bench"}`,
      qb: (pos: string, last: string) => `QB1 for your ${pos} ${last}`,
      target: (pos: string, last: string) => `Ahead of your ${pos} ${last}`,
      backfield: (pos: string, last: string) => `RB1 ahead of your ${last}`,
      line: (pos: string, last: string) => `Blocks for your ${pos} ${last}`,
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
  lenses: {
    eyebrow: "Lenses",
    /** The chip that turns the lens off. */
    off: "Everyone",
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
  },
  /** A lens with nobody in it says why, in its own terms. */
  lensEmpty: {
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
   * The four rooms, in the order a week actually goes: set the lineup, work the wire,
   * make a call, then read how it went. `key` pairs each card with its icon and its
   * tone in the page; the words stay here. The eyebrow is read off `SECTIONS` rather
   * than typed again, so an advert for a room cannot survive that room being renamed.
   */
  features: [
    {
      key: "team",
      room: SECTIONS.team.title,
      title: "Start/sit, graded",
      tag: "Free",
      body: "Every starter checked against your bench, with a confidence stamp and one line of why.",
    },
    {
      key: "waivers",
      room: SECTIONS.waivers.title,
      title: "Waivers, priced",
      tag: "$3",
      body: "Every free agent ranked by how much he actually moves your lineup. With a bid and the name to drop.",
    },
    {
      key: "trade",
      room: SECTIONS.trade.title,
      title: "Trades, with a counter",
      tag: "$5",
      body: "A verdict on any trade, plus a counter tuned to how that manager has actually traded before.",
    },
    {
      key: "report",
      room: SECTIONS.report.title,
      title: "Your standing",
      tag: "Free",
      body: "Record, points rank, and a letter grade for every position, against your league.",
    },
  ],

  /**
   * The worked example's headline. It is the product's own headline, word for word
   * (`edge/engine/actions.py`), because an advert that says something the app does not
   * say is an advert for a different app.
   */
  exampleHead: "3 moves to make",

  /** What we promise about our own accuracy: the practice, never a number. */
  score: {
    head: "We keep score",
    body: "Every stamp is graded against what actually happened, and we publish the result. We only move the thresholds when the data says to. When a call is too close to matter, we tell you to leave it alone.",
  },
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
    /** Beside a candidate's number: P(pick outscores him), rendered from the engine. */
    odds: "the pick outscores him",
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
