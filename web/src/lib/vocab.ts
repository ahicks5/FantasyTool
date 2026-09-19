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
