"use client";
/**
 * All players: every player in the league, as a table the reader cuts and orders.
 *
 * Rebuilt as a real table (Andrew, 2026-09-23: "make it a table, make it clean, better than
 * ESPN's player search"). The controls sit in one panel, top to bottom in the order a
 * manager narrows: a name, a position (one row of tabs, FLEX included), who holds him and
 * which NFL team, then the scout's lenses, the questions a plain filter cannot ask. Under
 * it the table: a rank, the face, the name with one quiet meta line, and three numbers in
 * fixed columns: this week (with a bar against the best on the board), rest of season,
 * adds. Tap a column heading to sort by it; tap it again to flip it.
 *
 * **It is free, and it opens nothing.** Every number on a row is that player's own — this
 * week in this league's scoring, the rest of the season, how many managers are adding him.
 * Which of them fits *your* roster, what to bid and who to cut are the wire's, and they
 * stay behind `Locked` further down the page. `edge/products.py` is the only source of
 * truth for that, and the API answers 402 for the wire regardless of this component.
 *
 * Every row opens the player sheet: the *whole row* is the door, so the name inside it is
 * not a second button (`names.test.ts` allows this file for that reason). Arrow keys move
 * DOM focus through the rows.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getLensCounts, getPlayerBoard } from "@/lib/api";
import { once } from "@/lib/cache";
import {
  AVAILABILITY_LABELS,
  BOARD_AVAILABILITY,
  BOARD_LABELS,
  DEFAULT_QUERY,
  LENSES,
  PAGE_SIZE,
  activeFilterCount,
  activeTab,
  BOARD_VIEWS,
  VIEW_COLUMNS,
  barPct,
  boardNumber,
  compactCount,
  countLine,
  hasMore,
  posRankLabel,
  positionTabs,
  pressColumn,
  queryKey,
  tabPositions,
  topTags,
  weekTone,
  withLens,
  withText,
  withView,
  type BoardView,
} from "@/lib/board";
import { NO_NFL_TEAM, SEARCH_DEBOUNCE_MS, SEARCH_LABELS, normalizeQuery, nextIndex } from "@/lib/search";
import type { Connection } from "@/lib/storage";
import type { BoardQuery, BoardRow, BoardSort, Lens, LensCounts, LensFact, PlayerBoard as Board, WaiverPick } from "@/lib/types";
import { SCOUT } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { usePlayerSheet } from "./player/PlayerSheetProvider";
import { ErrorBox, H2, InjuryTag, SkeletonList, Spinner } from "./ui";

/** Two strokes; too small a thing to earn a place in the shared icon set. */
function IconX({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" aria-hidden>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** Every sortable heading carries a caret, so the reader can see the columns sort: dim
 *  both ways when it is not the sort, one bright arrow for the direction when it is. */
function SortMark({ on, order }: { on: boolean; order: "asc" | "desc" | undefined }) {
  return (
    <svg width="8" height="11" viewBox="0 0 8 11" aria-hidden className="board-caret">
      <path d="M4 0.5L7.5 4.5H0.5z" className={on && order === "asc" ? "board-caret-on" : on ? "board-caret-off" : ""} />
      <path d="M4 10.5L0.5 6.5H7.5z" className={on && order !== "asc" ? "board-caret-on" : on ? "board-caret-off" : ""} />
    </svg>
  );
}

/**
 * One column heading. A button while the reader owns the order; plain text while a lens
 * does, because the lens *is* the order he asked for.
 */
function Th({ label, sort, query, onSort, className = "" }: { label: string; sort: BoardSort; query: BoardQuery; onSort: ((s: BoardSort) => void) | null; className?: string }) {
  const on = query.sort === sort && !query.lens;
  const body = (
    <>
      {label}
      <SortMark on={on} order={query.order} />
    </>
  );
  if (!onSort) return <span className={`board-th ${className}`}>{label}</span>;
  return (
    <button type="button" onClick={() => onSort(sort)} aria-pressed={on} aria-label={`${BOARD_LABELS.sortBy} ${label}`} className={`board-th board-th-btn ${on ? "board-th-on" : ""} ${className}`}>
      {body}
    </button>
  );
}

/** Who holds him, as the flag down the left of the row: open for pickup, yours, taken. */
function Flag({ row }: { row: BoardRow }) {
  const held = row.rostered_by;
  const kind = !held ? "fa" : held.is_me ? "mine" : "taken";
  return <span className={`board-flag board-flag-${kind}`}>{BOARD_LABELS.flag[kind]}</span>;
}

/**
 * One row of the table.
 *
 * Rank, face, name and a single meta line on the left; three numbers in fixed columns on
 * the right. The projection is the loud one and carries a bar against the best on the
 * board; `boardNumber` draws a dash for a player we never priced, never a zero.
 */
function Row({
  row,
  max,
  view,
  pick,
  onKeyDown,
  bind,
}: {
  row: BoardRow;
  max: number;
  /** His place in the head of scouting's top ten, when he is in it. */
  pick?: number;
  view: BoardView;
  onKeyDown: (e: React.KeyboardEvent) => void;
  bind: (el: HTMLButtonElement | null) => void;
}) {
  const { open } = usePlayerSheet();
  const held = row.rostered_by;
  const mine = !!held?.is_me;
  return (
    <li>
      <button
        ref={bind}
        type="button"
        // A `BoardRow` already is a `PlayerSeed`, so the sheet's header paints from the
        // row the reader tapped rather than waiting on the fetch behind it.
        onClick={() => open(row)}
        onKeyDown={onKeyDown}
        className={`board-row ${mine ? "board-row-mine" : ""} ${pick ? `board-row-pick ${pick <= 3 ? "board-row-top" : ""}` : ""}`}
      >
        {pick ? (
          <span className="board-flag board-flag-pick" aria-label={SCOUT.fact.pickAria(pick)}>
            {SCOUT.fact.pick(pick)}
          </span>
        ) : (
          <Flag row={row} />
        )}
        <Avatar name={row.name} photo={row.photo} teamLogo={row.team_logo} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="board-name block text-[14px] font-bold leading-tight">
            {row.name}
            <InjuryTag status={row.injury_status} />
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
            <span className="board-pos shrink-0 font-bold text-ink-2">{row.position}</span>
            <span className="shrink-0">{row.nfl_team || NO_NFL_TEAM}</span>
            {row.bye_week && <span className="min-w-0 truncate">{BOARD_LABELS.bye(row.bye_week)}</span>}
          </span>
          {/* Somebody else's man: whose, on a line of its own, never squeezed. */}
          {held && !mine && <span className="board-owner">{BOARD_LABELS.owner(held.team_name)}</span>}
          {row.lens && <Fact fact={row.lens} pos={row.position} />}
        </span>
        {view === "outlook" ? (
          <>
            <span className="board-num board-proj tnum">
              {boardNumber(row.projected)}
              <span className="board-bar" aria-hidden>
                <span style={{ width: `${barPct(row.projected, max)}%` }} />
              </span>
            </span>
            <span className="board-num tnum text-ink-2">{boardNumber(row.ros, 0)}</span>
          </>
        ) : (
          <>
            <span className={`board-num tnum ${row.trending_adds ? "board-proj" : "text-muted"}`}>{compactCount(row.trending_adds)}</span>
            <span className={`board-num tnum ${row.pos_rank && row.pos_rank <= 12 ? "text-start" : "text-ink-2"}`}>{posRankLabel(row)}</span>
          </>
        )}
      </button>
    </li>
  );
}

/**
 * The one fact that put a row in its lens: the man he sits behind, a defence's next three
 * games, the bye he covers. Words from `SCOUT.fact`; the facts are the server's.
 */
function Fact({ fact, pos }: { fact: LensFact; pos: string }) {
  const F = SCOUT.fact;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {fact.top &&
        topTags(fact.top).map(({ n, boards }) => (
          <span key={n} className={`lens-fact lens-top ${n === 1 ? "lens-top-1" : ""}`}>
            {F.topLine(n, pos, boards.map((b) => F.top[b]).join(" · "))}
          </span>
        ))}
      {fact.behind && (
        <span className={`lens-fact ${fact.behind.is_mine ? "lens-fact-mine" : ""}`}>
          {fact.behind.is_mine ? F.behindMine(fact.behind.name) : F.behind(fact.behind.name)}
          {fact.behind.injury_status && <span className="ml-1 font-black text-sit">{fact.behind.injury_status.slice(0, 1).toUpperCase()}</span>}
        </span>
      )}
      {fact.opening && <span className="lens-fact lens-fact-open">{F.opening}</span>}
      {fact.outlook?.map((w) => {
        const tone = weekTone(w);
        return (
          <span
            key={w.week}
            className={`lens-week lens-week-${tone}`}
            aria-label={w.opp && w.rank && w.of ? F.softAria(w.opp, w.rank, w.of) : undefined}
          >
            <span className="lens-week-n">{F.week(w.week)}</span>
            {w.opp ? `${w.home ? "" : F.at}${w.opp}` : F.bye}
          </span>
        );
      })}
      {fact.covers?.map((cv) => (
        <span key={cv.id + cv.week} className="lens-fact">
          {F.covers(cv.name, cv.week)}
        </span>
      ))}
    </span>
  );
}

/** A small mark per lens, so the row reads at a glance before the words do. */
const LENS_ICON: Record<Lens, React.ReactNode> = {
  // a star: picked out for you
  shortlist: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  // two linked rings: a cuff
  handcuffs: <><circle cx="8" cy="12" r="4" /><circle cx="16" cy="12" r="4" /></>,
  // a step up the ladder
  backups: <><path d="M12 19V6" /><path d="M7 11l5-5 5 5" /></>,
  // a shield
  defenses: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
  // a calendar
  byes: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  // a line going up
  risers: <><path d="M4 17l6-6 4 4 6-7" /><path d="M15 8h5v5" /></>,
};

function LensIcon({ lens }: { lens: Lens }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {LENS_ICON[lens]}
    </svg>
  );
}

/** The five questions, as chips with a count of the free agents inside each. */
function LensBar({ on, counts, pick }: { on: Lens | null | undefined; counts: LensCounts | null; pick: (l: Lens | null) => void }) {
  const L = SCOUT.lenses;
  return (
    <div className="board-tools-row">
      <div className="flex items-center gap-2">
        <span className="board-label">{L.eyebrow}</span>
        <div role="group" aria-label={L.eyebrow} className="-my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LENSES.map((l) => {
            const n = counts?.counts[l];
            return (
              <button key={l} type="button" aria-pressed={on === l} onClick={() => pick(l)} className={`lens-chip ${on === l ? "lens-chip-on" : ""}`}>
                <LensIcon lens={l} />
                <span>{L[l].label}</span>
                {typeof n === "number" && n > 0 && <span className="lens-chip-n tnum">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {on && (
        <p className="mt-2 flex items-start justify-between gap-3 text-[12px] leading-snug text-ink-2">
          <span>{L[on].blurb}</span>
          <button type="button" onClick={() => pick(null)} className="min-h-0 shrink-0 font-bold text-lean hover:underline">
            {L.off}
          </button>
        </p>
      )}
    </div>
  );
}

export function PlayerBoard({ c, picks = [] }: { c: Connection; picks?: readonly WaiverPick[] }) {
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState<BoardQuery>(DEFAULT_QUERY);
  /**
   * The last board that came back, tagged with the filters that asked for it, and every
   * page fetched for them.
   *
   * Tagged rather than tracked by a `busy` flag, because a flag has to be *set* in the
   * effect body and this project forbids that (`react-hooks/set-state-in-effect`, and it
   * is right: it costs a cascading render every keystroke). Everything the board needs to
   * know about its own state falls out of comparing this tag to the current filters, so
   * the only state writes left are inside callbacks.
   */
  const [res, setRes] = useState<{ key: string; board: Board; rows: BoardRow[] } | null>(null);
  const [failed, setFailed] = useState<{ key: string; error: unknown } | null>(null);
  const [paging, setPaging] = useState(false);
  const [retry, setRetry] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const links = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const listId = `${id}-list`;

  const { platform, league_id, team_id } = c;

  const [counts, setCounts] = useState<LensCounts | null>(null);
  useEffect(() => {
    let alive = true;
    once(`lenses:${platform}:${league_id}:${team_id}`, () => getLensCounts(platform, league_id, team_id))
      .then((n) => alive && setCounts(n))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [platform, league_id, team_id]);

  // The text is debounced into the query; every other control writes it immediately,
  // because a chip is one deliberate press and waiting on it reads as lag.
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => withText(q, normalizeQuery(raw))), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [raw]);

  const key = queryKey(query);

  // One effect, keyed by the filters. Paging is a separate call below that appends, so a
  // new page never re-runs this and a new filter always throws the old pages away.
  useEffect(() => {
    let alive = true;
    getPlayerBoard(platform, league_id, { ...query, limit: PAGE_SIZE, offset: 0 }, team_id)
      .then((board) => {
        if (!alive) return;
        setRes({ key, board, rows: board.rows });
        setFailed(null);
      })
      .catch((error) => alive && setFailed({ key, error }));
    return () => {
      // The answer to filters nobody is looking at any more is dropped on arrival, which
      // is also what stops a setState landing after unmount.
      alive = false;
    };
    // `key` is the identity of these filters; `query` itself is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, platform, league_id, team_id, retry]);

  /** The board on screen, or null while the one being fetched has not landed yet. */
  const current = res && res.key === key ? res : null;
  const error = failed && failed.key === key ? failed.error : null;
  // Rows and facets are held over from the last board while the next one loads, so a chip
  // press dims the list rather than blanking the page. The *count* is not: a total from
  // the previous filters, printed under the new ones, is simply a wrong number.
  const rows = current?.rows ?? res?.rows ?? [];
  const facets = (current ?? res)?.board.facets;
  const busy = !current && !error;
  /** Nothing has ever landed, so there is nothing to hold over. */
  const firstLoad = busy && !res;

  const more = useCallback(() => {
    if (!current || paging) return;
    setPaging(true);
    const at = current.rows.length;
    getPlayerBoard(platform, league_id, { ...query, limit: PAGE_SIZE, offset: at }, team_id)
      .then((board) => {
        // A page belongs to the filters that asked for it. Appending it to a board the
        // reader has since changed would splice two different lists together.
        setRes((prev) =>
          prev && prev.key === key && prev.rows.length === at
            ? { key, board, rows: [...prev.rows, ...board.rows] }
            : prev,
        );
      })
      .catch((error) => setFailed({ key, error }))
      .finally(() => setPaging(false));
  }, [current, paging, platform, league_id, team_id, query, key]);

  function patch(next: Partial<BoardQuery>) {
    setQuery((q) => ({ ...q, ...next }));
  }

  function clearFilters() {
    setQuery((q) => ({ ...q, pos: [], nfl_team: [], avail: "all", owner: null }));
  }

  function clearText() {
    setRaw("");
    inputRef.current?.focus();
  }

  function move(from: number, delta: number) {
    const to = nextIndex(from, rows.length, delta);
    if (to < 0) return;
    links.current[to]?.focus();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length) {
      e.preventDefault();
      move(-1, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && rows.length) {
      // There is no form to submit and the board is already live, so Enter takes the top
      // of the list. On a phone that also drops the keyboard off the results.
      e.preventDefault();
      move(-1, 1);
    } else if (e.key === "Escape" && raw) {
      e.preventDefault();
      clearText();
    }
  }

  function onRowKey(e: React.KeyboardEvent, i: number) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(i, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }

  const filters = activeFilterCount(query);
  const tab = activeTab(query.pos);
  const tabs = facets ? positionTabs(facets.positions) : [];
  const onSort = query.lens ? null : (s: BoardSort) => setQuery((q) => pressColumn(q, s));
  // The bar under each projection is against the best on the board, so it reads as "how
  // close to the top" rather than as an absolute scale nobody can hold in their head.
  const max = rows.reduce((m, r) => Math.max(m, r.projected ?? 0), 0);
  // The wire's own ten, by id: those rows wear the pick's colours down here too.
  const pickRank = new Map(picks.map((p, i) => [p.player.id, i + 1]));
  const view: BoardView = query.season ? "market" : "outlook";
  const setView = (v: BoardView) => setQuery((q) => ({ ...withView(q, v), season: v === "market" }));
  const HEAD: Record<BoardSort, string> = {
    projected: BOARD_LABELS.proj, ros: BOARD_LABELS.ros, trending: BOARD_LABELS.adds, season: BOARD_LABELS.season,
    name: BOARD_LABELS.player, position: BOARD_LABELS.position,
  };

  return (
    <section className="min-w-0">
      <H2>{SCOUT.research}</H2>

      <div className="board-tools mt-2.5">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={SCOUT.placeholder}
            aria-label={SCOUT.placeholder}
            aria-controls={rows.length ? listId : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            className="board-search"
          />
          {busy && !firstLoad && (
            <span className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 text-muted">
              <Spinner size={16} label={SEARCH_LABELS.searching} />
            </span>
          )}
          {raw && (
            <button
              type="button"
              onClick={clearText}
              aria-label={SEARCH_LABELS.clear}
              className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <IconX />
            </button>
          )}
        </div>

        {/* Positions: one row of tabs, the league's own, FLEX when it has all three. */}
        {tabs.length > 2 && (
          <div role="group" aria-label={BOARD_LABELS.position} className="board-tabs">
            {tabs.map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => patch({ pos: tabPositions(t) })} className={`board-tab ${tab === t ? "board-tab-on" : ""}`}>
                {t === "ALL" ? BOARD_LABELS.allPositions : t}
              </button>
            ))}
          </div>
        )}

        {/* Who has him, and which NFL team: one row, a segmented control and a menu. */}
        <div className="board-tools-row flex min-w-0 items-center gap-2">
          <div role="group" aria-label={BOARD_LABELS.filters} className="board-seg">
            {BOARD_AVAILABILITY.map((a) => (
              <button key={a} type="button" onClick={() => patch({ avail: a, owner: null })} aria-pressed={query.avail === a} className={`board-seg-btn ${query.avail === a ? "board-seg-on" : ""}`}>
                {AVAILABILITY_LABELS[a]}
              </button>
            ))}
          </div>
          <span className="relative flex w-[86px] shrink-0">
            <select
              aria-label={BOARD_LABELS.nflTeam}
              value={query.nfl_team?.[0] ?? ""}
              onChange={(e) => patch({ nfl_team: e.target.value ? [e.target.value] : [] })}
              className="board-select"
            >
              <option value="">{BOARD_LABELS.anyTeamShort}</option>
              {facets?.nfl_teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>

        <LensBar on={query.lens} counts={counts} pick={(l) => setQuery((q) => withLens(q, l))} />
      </div>

      {/* Over the table: the count, the way out of the filters, and the view switch. */}
      <div className="mt-3 flex min-w-0 items-center justify-between gap-3 px-1">
        <p className="min-w-0 truncate tnum text-[12px] font-bold text-muted">
          {current ? countLine(rows.length, current.board.total) : " "}
          {filters > 0 && (
            <button type="button" onClick={clearFilters} className="ml-2 min-h-0 font-bold text-lean hover:underline">
              {BOARD_LABELS.clear}
            </button>
          )}
        </p>
        <div role="group" aria-label={BOARD_LABELS.views.outlook + " / " + BOARD_LABELS.views.market} className="board-view">
          {BOARD_VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`board-view-btn ${view === v ? "board-view-on" : ""}`}>
              {BOARD_LABELS.views[v]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 px-1 text-[11px] leading-snug text-muted">{BOARD_LABELS.viewHint[view]}</p>

      {/* One announcement per settled board. Nothing is said while a request is in flight. */}
      <p role="status" className="sr-only">
        {current ? countLine(rows.length, current.board.total) : ""}
      </p>

      {error ? (
        <div className="mt-2">
          <ErrorBox error={error} onRetry={() => setRetry((n) => n + 1)} />
        </div>
      ) : firstLoad ? (
        <div className="mt-1">
          <SkeletonList rows={6} quiet />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-dashed border-line-2 px-4 py-6 text-center text-[14px] text-muted">
          {/* A name that matched nobody is a different answer from a cut that is too
              narrow, and the reader can only act on the second one. */}
          {query.q ? SCOUT.empty : query.lens && activeFilterCount(query) <= 1 ? SCOUT.lensEmpty[query.lens] : SCOUT.noMatch}
        </p>
      ) : (
        <div className="board-table mt-1.5">
          <div className="board-head">
            <Th label={BOARD_LABELS.player} sort="name" query={query} onSort={onSort} className="board-th-player" />
            {VIEW_COLUMNS[view].map((col) => (
              <Th key={col} label={HEAD[col]} sort={col} query={query} onSort={onSort} className="board-num" />
            ))}
          </div>
          <ul id={listId} aria-busy={busy || undefined} className={`transition-opacity ${busy ? "opacity-60" : ""}`}>
            {rows.map((row, i) => (
              <Row
                key={row.id}
                row={row}
                max={max}
                view={view}
                pick={pickRank.get(row.id)}
                bind={(el) => {
                  links.current[i] = el;
                }}
                onKeyDown={(e) => onRowKey(e, i)}
              />
            ))}
          </ul>
          {current && hasMore(rows.length, current.board.total) && (
            <button type="button" onClick={more} disabled={paging} className="board-more">
              {paging ? <Spinner size={15} label={SEARCH_LABELS.searching} /> : BOARD_LABELS.more}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
