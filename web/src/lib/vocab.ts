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
} as const satisfies Record<string, Section>;

export type SectionKey = keyof typeof SECTIONS;

/** Tab order, left to right. The call sheet is first because it is the whole product. */
export const TAB_ORDER: SectionKey[] = ["home", "team", "waivers", "trade", "report"];

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
