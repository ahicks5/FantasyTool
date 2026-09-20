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
 * - `gate` is a noun phrase that has to read inside "…and {gate} shows up here",
 *   so it carries its own article. "depth chart shows up here" is what you get
 *   when the h1 is reused for prose, and it reads like a dropped word.
 */
export interface Section {
  href: string;
  label: string;
  title: string;
  gate: string;
}

export const SECTIONS = {
  home: { href: "/home", label: "Call sheet", title: "Call sheet", gate: "your call sheet" },
  team: { href: "/team", label: "Depth", title: "Depth chart", gate: "your depth chart" },
  waivers: { href: "/waivers", label: "Scouting", title: "Scouting", gate: "the wire" },
  trade: { href: "/trade", label: "GM's Office", title: "GM's Office", gate: "the trade board" },
  report: { href: "/report", label: "Film", title: "The film", gate: "the film" },
  /** A room off the call sheet, not a tab of its own: it lives under `/home/` so the
   *  call sheet tab stays lit while you are reading the week's opponent. */
  matchup: { href: "/home/matchup", label: "Matchup", title: "Matchup", gate: "this week's matchup" },
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

  /** Crossing the threshold: /login, /connect, the first email subject. */
  threshold: "Welcome to the owner\u2019s box.",
  /** The same move where the line has to be shorter. */
  thresholdShort: "Take the top floor.",

  /** The bundle, as a sentence — it sits above the price on the pricing card. */
  paywallBundle: "The rest of the building.",
  /** The same idea as a control. Buttons are verb first, and a full stop reads badly
   *  next to the price that follows it ("The rest of the building. · $7"). */
  paywallBundleCta: "Take the rest of the building",
  /** Any single pass, as a sentence. */
  paywallPass: "Unlock the floor.",
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
