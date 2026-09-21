/**
 * Every section name the app says out loud, in one place.
 *
 * Coach vocabulary. The nav names a room (the debrief, the depth chart, scouting, the
 * GM's Office, the film) while what you *buy* keeps its product name (Wire Pass, Trade
 * Lab, The Penthouse) — those live in `edge/products.py`, not here.
 *
 * It is one module rather than strings scattered across five pages and a tab bar
 * because renaming a section otherwise means a sweep through the app and its tests,
 * and a sweep is how a rename ends up half-applied.
 *
 * - `label` is the tab, which has about nine characters before it wraps on a phone.
 * - `title` is the page's h1.
 * - `blurb` is the one line under the h1 that says what the room is for. Nobody was
 *   ever told what "Scouting" or "GM's Office" meant, and a coach word you have to
 *   guess at is worse than a plain one: the blurb is the translation, printed on
 *   every tab on every visit rather than once in an onboarding nobody reads. Verb
 *   first, one line, and it has to hold on one line at 320px inside the title band's
 *   fixed height — about 36 characters. It describes the room, never your team.
 * - `gate` is a noun phrase that has to read inside "…and {gate} shows up here",
 *   so it carries its own article. "depth chart shows up here" is what you get
 *   when the h1 is reused for prose, and it reads like a dropped word.
 */
export interface Section {
  href: string;
  label: string;
  title: string;
  blurb: string;
  gate: string;
}

export const SECTIONS = {
  home: {
    href: "/home",
    label: "Debrief",
    title: "Debrief",
    blurb: "What your staff needs you to see.",
    gate: "your debrief",
  },
  // The tab says "Lineup" and the page says "Depth chart". "Depth" on its own is the
  // half of the phrase that carries none of the meaning — it reads as bench depth, which
  // is a thing this tab also shows and is not what the tab is for. "Lineup" is six
  // characters, inside the nine the bar allows, and it is the word people arrive with.
  team: {
    href: "/team",
    label: "Lineup",
    title: "Depth chart",
    blurb: "Who starts, and why.",
    gate: "your depth chart",
  },
  waivers: {
    href: "/waivers",
    label: "Scouting",
    title: "Scouting",
    blurb: "Who to pick up, and what to bid.",
    gate: "the wire",
  },
  trade: {
    href: "/trade",
    label: "GM's Office",
    title: "GM's Office",
    blurb: "Who to call, and what to offer.",
    gate: "the trade board",
  },
  report: {
    href: "/report",
    label: "Film",
    title: "The film",
    blurb: "How your season is going.",
    gate: "the film",
  },
  /** A room off the Debrief, not a tab of its own: it lives under `/home/` so the
   *  Debrief tab stays lit while you are reading the week's opponent. */
  matchup: {
    href: "/home/matchup",
    label: "Matchup",
    title: "Matchup",
    blurb: "This week\u2019s opponent, slot by slot.",
    gate: "this week\u2019s matchup",
  },
} as const satisfies Record<string, Section>;

export type SectionKey = keyof typeof SECTIONS;

/**
 * Tab order, left to right. The Debrief is first because it is the whole product.
 *
 * Not every section is a tab — `matchup` is a room off the Debrief — so `TabKey` is
 * narrower than `SectionKey`, and anything keyed by tab (the icon map) has to be
 * exhaustive over the tabs only. Typing it the other way round meant adding a
 * non-tab section demanded an icon for a tab that does not exist.
 */
export const TAB_ORDER = ["home", "team", "waivers", "trade", "report"] as const;

export type TabKey = (typeof TAB_ORDER)[number];

/**
 * Who is talking, on each memo of the Debrief.
 *
 * The Debrief is the secretary's one-page summary of what every department needs the
 * owner to see this week, so each card is signed by the department rather than titled
 * with the tab it opens. "From the head coach" says a person looked at your lineup;
 * "Depth chart" says a screen exists. The door underneath still names the room, so the
 * eyebrow never has to carry the navigation as well.
 *
 * Keyed by `TabKey` for the same reason `GROUPS` is: the memo and the tab its door
 * points at cannot drift apart. `home` is absent because the Debrief is the page these
 * memos are printed on, not a department that reports to it.
 *
 * Length is load-bearing. The eyebrow shares one line at 320px with the memo's status
 * (a count, a deadline note or a stamp), which leaves it about 26 characters before it
 * truncates — "From the head of scouting" is 25 and is the longest the room allows.
 */
export const DEPARTMENTS = {
  team: "From the head coach",
  waivers: "From the head of scouting",
  trade: "From the GM\u2019s Office",
  report: "From the film room",
} as const satisfies Partial<Record<TabKey, string>>;

export type DepartmentKey = keyof typeof DEPARTMENTS;

/** Tab order, minus the Debrief itself: the memos print in the order of the bar. */
export const DEPARTMENT_ORDER = ["team", "waivers", "trade", "report"] as const satisfies readonly DepartmentKey[];

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
  heroSub: "Everyone else hands you a database. We hand you a debrief.",

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
 * The Debrief's three working departments, and what each says when it has nothing to call.
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
   * The back link out of a profile. It names the *search*, not the tab, because the tab's
   * own title is already on screen — `AppShell` draws "Scouting" as the page heading, and
   * a back link reading the same word directly under it looks like a mistake.
   */
  back: "All players",
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
  Lock: "Margins this size were right about 3 times in 4 across last season.",
  Lean: "Margins this size were right about 3 times in 5 across last season.",
  "Coin flip": "Margins this size were a coin flip across last season.",
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
  label: "Send me the debrief every Thursday",
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
