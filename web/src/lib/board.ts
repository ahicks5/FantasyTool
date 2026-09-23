/**
 * The scouting board, minus React.
 *
 * Same division as `lib/search.ts`, for the same reason: the parts that are easy to get
 * wrong — what a null number reads as, whether the rows on screen still belong to the
 * filters in the controls, how a chip toggles — are pure functions with a `node:test` file
 * beside them. `components/PlayerBoard.tsx` owns the timers, the focus and the fetching;
 * this owns the rules.
 *
 * The words here describe a *field* or a control, which is the split `lib/search.ts`
 * already set: the room's own words — the heading, the placeholder, the empty line — come
 * from `SCOUT` in `lib/vocab.ts` and are never restated here.
 */

import type { BoardAvailability, BoardQuery, BoardRow, BoardSort, Lens, LensFact, LensWeek } from "./types";

/**
 * How many rows a page asks for. Big enough that scrolling is the main gesture rather than
 * pressing a button, small enough that the first paint is not held up by four hundred
 * headshots.
 */
export const PAGE_SIZE = 50;

/**
 * The sort keys, in the order the control offers them, and which way each one means.
 *
 * Mirrors `SORTS` in `edge/api/directory.py`, pinned by
 * `tests/test_cross_language_contracts.py`. A key the server does not know falls back to
 * its own default rather than erroring, but the two lists drifting would mean the control
 * offers an order the board does not apply, which the reader reads as a broken sort.
 */
export const BOARD_SORTS: readonly BoardSort[] = ["projected", "ros", "trending", "season", "name", "position"];

/** Mirrors `AVAILABILITY` in `edge/api/directory.py`. Same pin. */
export const BOARD_AVAILABILITY: readonly BoardAvailability[] = ["all", "free", "rostered", "mine"];

/**
 * What each sort is called, and which direction it opens in.
 *
 * "Descending" is not a sensible default for a name, and "ascending" is not a sensible
 * default for a projection. The reader can still flip either, but the first press should
 * land on the order he meant.
 */
export const SORT_LABELS: Record<BoardSort, { label: string; short: string; desc: boolean }> = {
  projected: { label: "This week", short: "Week", desc: true },
  ros: { label: "Rest of season", short: "ROS", desc: true },
  trending: { label: "Most added", short: "Adds", desc: true },
  season: { label: "Season so far", short: "Pts", desc: true },
  name: { label: "Name", short: "Name", desc: false },
  position: { label: "Position", short: "Pos", desc: false },
};

/**
 * The four ways to read "who has him", as the segmented control says them.
 *
 * One word each, because all four share one row on a 390px phone and "Free agents" was
 * clipped to "Free age…" there — a control that cannot say what it does. Clipped is the
 * house voice anyway, and the row beneath spells "Free agent" out in full on every
 * unrostered player.
 */
export const AVAILABILITY_LABELS: Record<BoardAvailability, string> = {
  all: "All",
  free: "Free",
  rostered: "Taken",
  mine: "Mine",
};

/** Column headings, and the two units that are not obvious from the number alone. */
export const COLUMN_LABELS = {
  projected: "Proj",
  ros: "ROS",
  adds: "adds",
  /** What a number we do not have looks like. Never "0" — see `boardNumber`. */
  unknown: "—",
} as const;

export const BOARD_LABELS = {
  filters: "Filters",
  sortBy: "Sort by",
  nflTeam: "NFL team",
  anyTeam: "Any NFL team",
  reverse: "Reverse the order",
  more: "Show more",
  clear: "Clear filters",
  /** The badge on a row somebody in this league already has, when that somebody is the
   *  reader. His own team name would be true and useless — he knows what he called it. */
  mine: "Yours",
  /** A player nobody in the league holds, on the table's meta line. */
  fa: "FA",
  bye: (w: number) => `Bye ${w}`,
  position: "Position",
  allPositions: "All",
  anyTeamShort: "Team",
  /** The table's column headings. */
  player: "Player",
  proj: "Proj",
  ros: "ROS",
  adds: "Adds",
  season: "Rank",
  /** The view switch over the table, and what each view means in full. */
  views: { outlook: "Projections", market: "Market" },
  viewHint: {
    outlook: "Proj is this week. ROS is the rest of the season. Both in your scoring.",
    market: "Adds across the platform. Rank at his position on points so far.",
  },
  flag: { fa: "FA", mine: "You", taken: "Taken" },
  owner: (team: string) => `On ${team}`,
} as const;

/**
 * Where the board opens: the shortlist, free agents only (Andrew, 2026-09-23: "all
 * players doesn't help"). Everyone is one tap away, on the lens's own "Everyone".
 */
export const DEFAULT_QUERY: BoardQuery = {
  q: "",
  pos: [],
  nfl_team: [],
  avail: "free",
  sort: "projected",
  order: "desc",
  lens: "shortlist",
};

/**
 * A number as the board prints it, or a dash.
 *
 * **Null and zero are different facts and this is the one place that stays true.** A zero
 * is a real projection — a bye week, a fifth receiver — and belongs on screen as `0.0`. A
 * null means we never priced him, which is what a name search reaching past the league
 * into the platform dump hands back, and printing that as `0.0` would state something
 * about the player that we do not know.
 */
export function boardNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return COLUMN_LABELS.unknown;
  return value.toFixed(digits);
}

/** An add count, or nothing at all. Zero adds is not news, so it earns no ink. */
export function addsLabel(row: BoardRow): string | null {
  return row.trending_adds > 0 ? `${row.trending_adds.toLocaleString()} ${COLUMN_LABELS.adds}` : null;
}

/**
 * The line under a name: what he plays, who for, and the week he is off.
 *
 * The bye only appears when we know it, because "Bye —" is noise and "Bye 0" is a lie.
 */
export function rowMeta(row: BoardRow, noTeam = "FA"): string {
  const parts = [row.position, row.nfl_team || noTeam];
  if (row.bye_week) parts.push(`Bye ${row.bye_week}`);
  return parts.join(" · ");
}

/**
 * Is the "who has him" badge worth the ink on this row?
 *
 * Only when it could say something the controls have not already said. Filtered to free
 * agents, every row is a free agent and stamping each one "FREE AGENT" is noise — and
 * worse than noise on a phone, where the badge wraps under the meta line on some rows and
 * not others and leaves the list visibly ragged. Filtered to "Mine", the same. Filtered to
 * "Rostered" the badge still earns its place, because *which* team has him is the one
 * thing that row does not otherwise say.
 */
export function showsOwner(avail: BoardAvailability = "all"): boolean {
  return avail !== "free" && avail !== "mine";
}

/** Add it if it is missing, take it out if it is there. How every chip on the board works. */
export function toggle(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * How many filters are actually narrowing the board.
 *
 * The search text is not one of them: it has its own box, in plain sight, and counting it
 * as a hidden filter would put a badge on the control when nothing is hidden.
 */
export function activeFilterCount(q: BoardQuery): number {
  return (q.pos?.length ?? 0) + (q.nfl_team?.length ?? 0) + (q.avail && q.avail !== "all" ? 1 : 0) + (q.owner ? 1 : 0);
}

/**
 * One string that changes exactly when the board would have to be fetched again.
 *
 * Used as the identity of a request: rows are kept while it holds and dropped the moment
 * it does not, so a slow answer to an old set of filters can never paint under new ones.
 * `offset` is deliberately absent — paging appends to the same board rather than replacing
 * it, so it is not part of what makes a board a different board.
 */
export function queryKey(q: BoardQuery): string {
  return JSON.stringify([
    q.q ?? "",
    [...(q.pos ?? [])].sort(),
    [...(q.nfl_team ?? [])].sort(),
    q.avail ?? "all",
    q.owner ?? "",
    q.sort ?? "projected",
    q.order ?? "desc",
    q.lens ?? "",
    q.season ? 1 : 0,
  ]);
}

/** The lenses, in the order the chips offer them. Mirrors `LENSES` in `edge/api/lenses.py`. */
export const LENSES: readonly Lens[] = ["shortlist", "handcuffs", "backups", "defenses", "byes", "risers"];

/**
 * The shortlist's reasons as tags, one per rank: #1 on this week and the rest of the season
 * is one tag, "#1 QB proj · ROS", not two. Best rank first.
 */
export function topTags(top: NonNullable<LensFact["top"]>): { n: number; boards: ("proj" | "ros" | "adds")[] }[] {
  const by = new Map<number, ("proj" | "ros" | "adds")[]>();
  for (const b of ["proj", "ros", "adds"] as const) {
    const n = top[b];
    if (n) by.set(n, [...(by.get(n) ?? []), b]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([n, boards]) => ({ n, boards }));
}

/**
 * A name typed over the shortlist is a search for that man wherever he is, so the shortlist
 * steps aside for it. Every other lens is a question the reader chose and holds.
 */
export function withText(q: BoardQuery, text: string): BoardQuery {
  if (q.q === text) return q;
  return text && q.lens === "shortlist" ? { ...withLens(q, null), q: text } : { ...q, q: text };
}

/**
 * Turning a lens on. Each one opens on the availability its question means: a handcuff is
 * worth knowing about wherever he is rostered, every other lens is a question about who
 * you can actually add. The reader can still widen it; the first press lands on the answer.
 * Pressing the lens already on turns it off.
 */
export function withLens(q: BoardQuery, lens: Lens | null): BoardQuery {
  // Off the shortlist is "everyone": the shortlist brought free-only with it, so it takes it away.
  if (!lens || q.lens === lens) return { ...q, lens: null, avail: q.lens === "shortlist" ? "all" : q.avail };
  return { ...q, lens, avail: lens === "handcuffs" ? "all" : "free", owner: null };
}

/**
 * How a defence's week reads: soft (an offence in the bottom third for points), tough (the
 * top third), even, a bye, or unknown before a game has been played.
 */
export function weekTone(w: LensWeek): "soft" | "tough" | "even" | "bye" | "unknown" {
  if (!w.opp) return "bye";
  if (w.rank == null || w.of == null) return "unknown";
  if (w.rank <= w.of / 3) return "soft";
  if (w.rank > (2 * w.of) / 3) return "tough";
  return "even";
}

/** Whether there is another page behind the rows already in hand. */
export function hasMore(loaded: number, total: number): boolean {
  return loaded < total;
}

/**
 * The count line over the board: what is on screen, out of what was found.
 *
 * The total is always said, even when every row is showing, because the number a reader
 * wants from a filter is how many there are — not how many fitted on the page.
 */
export function countLine(shown: number, total: number): string {
  const players = `player${total === 1 ? "" : "s"}`;
  if (total === 0) return `No ${players}`;
  if (shown >= total) return `${total} ${players}`;
  return `${shown} of ${total} ${players}`;
}

/** Flipping the order. Its own function only so the component never writes the ternary. */
export function flipOrder(order: "asc" | "desc" | undefined): "asc" | "desc" {
  return order === "asc" ? "desc" : "asc";
}

/**
 * Picking a sort key from the control.
 *
 * Choosing a *new* key takes that key's own natural direction; choosing the one already
 * selected leaves the direction the reader chose alone. Resetting it would silently undo
 * his last press.
 */
export function withSort(q: BoardQuery, sort: BoardSort): BoardQuery {
  if (q.sort === sort) return q;
  return { ...q, sort, order: SORT_LABELS[sort].desc ? "desc" : "asc" };
}

/* ------------------------------------------------------------------ the table ---
   The board as a table (Andrew, 2026-09-23: "better than ESPN's player search"). One
   row of position tabs, sortable column headers, and three numbers a row. */

/** FLEX is a tab of its own: the three positions a flex slot takes, in one press. */
export const FLEX_POSITIONS = ["RB", "WR", "TE"] as const;

/** The tabs this league can offer: All, its positions in roster order, and FLEX when it
 *  has all three flex positions. Built from `facets.positions`, never a constant. */
export function positionTabs(positions: readonly string[]): string[] {
  const tabs = ["ALL", ...positions];
  if (FLEX_POSITIONS.every((p) => positions.includes(p))) tabs.splice(tabs.indexOf("TE") + 1, 0, "FLEX");
  return tabs;
}

/** Which tab the current position filter is. A mix no tab names reads as none. */
export function activeTab(pos: readonly string[] | undefined): string | null {
  const p = [...(pos ?? [])].sort();
  if (p.length === 0) return "ALL";
  if (p.length === 1) return p[0];
  if (p.join(",") === [...FLEX_POSITIONS].sort().join(",")) return "FLEX";
  return null;
}

/** Pressing a tab: the positions it stands for. */
export function tabPositions(tab: string): string[] {
  if (tab === "ALL") return [];
  if (tab === "FLEX") return [...FLEX_POSITIONS];
  return [tab];
}

/**
 * Pressing a column heading. A new column opens in its natural direction (`withSort`);
 * the column already sorted flips, which is what every table on earth does.
 */
export function pressColumn(q: BoardQuery, sort: BoardSort): BoardQuery {
  if (q.sort === sort) return { ...q, order: flipOrder(q.order) };
  return withSort(q, sort);
}

/** An add count the width of a table cell: 940, 12.3k, 41k. Zero is a dash. */
export function compactCount(n: number): string {
  if (!n) return COLUMN_LABELS.unknown;
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

/**
 * The two ways to read the table (Andrew, 2026-09-23): the outlook (this week and the rest
 * of the season, projected) or the market (how many managers are adding him, and where he
 * ranks at his position on what he has actually scored so far). Two numbers a row either
 * way, so the name keeps its room.
 */
export type BoardView = "outlook" | "market";
export const BOARD_VIEWS: readonly BoardView[] = ["outlook", "market"];

/** The columns a view draws, left to right, each with the sort it applies. */
export const VIEW_COLUMNS: Record<BoardView, readonly BoardSort[]> = {
  outlook: ["projected", "ros"],
  market: ["trending", "season"],
};

/** Switching views: the sort follows to the new view's first column unless the reader
 *  had already sorted by something that view still shows (or by name). */
export function withView(q: BoardQuery, view: BoardView): BoardQuery {
  const keep = q.sort === "name" || VIEW_COLUMNS[view].includes(q.sort ?? "projected");
  return keep ? q : withSort(q, VIEW_COLUMNS[view][0]);
}

/** A position rank as the market column prints it: "WR14", or a dash. */
export function posRankLabel(row: { position: string; pos_rank?: number | null }): string {
  return row.pos_rank ? `${row.position}${row.pos_rank}` : COLUMN_LABELS.unknown;
}

/** How full the projection bar under a number is: its share of the best on the board. */
export function barPct(value: number | null | undefined, max: number): number {
  if (value == null || !Number.isFinite(value) || max <= 0 || value <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((value / max) * 100)));
}
