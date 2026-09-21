"use client";
/**
 * The scouting board: every player in the league, cut and ordered by the reader.
 *
 * This is the front door to Scouting and it replaced the old name-only search box, which
 * could answer "where is Ja'Marr Chase" and nothing else. Two boxes on one screen would
 * have been the obvious way to keep both and the wrong one: the search here is a filter
 * like every other control, so a name and a position chip narrow the same list rather than
 * running two lists that disagree.
 *
 * **It is free, and it opens nothing.** Every number on a row is that player's own — this
 * week in this league's scoring, the rest of the season, how many managers are adding him.
 * Which of them fits *your* roster, what to bid and who to cut are the wire's, and they
 * stay behind `Locked` further down the page. Nothing here reads an entitlement and
 * nothing here should start: `edge/products.py` is the only source of truth for that, and
 * the API answers 402 for the plan regardless of what this component does.
 *
 * Every row opens the player sheet rather than navigating, because that is now the house
 * rule everywhere a name appears (`components/Players.tsx`): the page rises over the room
 * you are in and the tab you came from stays lit. The *whole row* is the door here, not
 * just the name inside it — `PlayerName` is built for a name sitting inline in a sentence
 * and deliberately refuses the house 44px target, which is right there and wrong on a
 * browse board where tapping the row is the entire gesture. Arrow keys move DOM focus
 * through the rows rather than painting a selection that only looks like focus.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getPlayerBoard } from "@/lib/api";
import {
  AVAILABILITY_LABELS,
  BOARD_AVAILABILITY,
  BOARD_LABELS,
  BOARD_SORTS,
  COLUMN_LABELS,
  PAGE_SIZE,
  SORT_LABELS,
  activeFilterCount,
  addsLabel,
  boardNumber,
  countLine,
  flipOrder,
  hasMore,
  queryKey,
  rowMeta,
  showsOwner,
  toggle,
  withSort,
} from "@/lib/board";
import { NO_NFL_TEAM, SEARCH_DEBOUNCE_MS, SEARCH_LABELS, normalizeQuery, nextIndex } from "@/lib/search";
import type { Connection } from "@/lib/storage";
import type { BoardAvailability, BoardQuery, BoardRow, BoardSort, PlayerBoard as Board } from "@/lib/types";
import { SCOUT } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { usePlayerSheet } from "./player/PlayerSheetProvider";
import { IconChevron } from "./icons";
import { ErrorBox, H2, InjuryTag, SkeletonList, Spinner } from "./ui";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft py-3 pl-4 pr-[4.75rem] text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none [&::-webkit-search-cancel-button]:appearance-none";

const SELECT =
  "min-w-0 flex-1 appearance-none truncate rounded-xl border border-line-2 bg-soft py-2.5 pl-3 pr-8 text-[13px] font-bold text-ink focus:border-ink focus:outline-none";

/** Two strokes; too small a thing to earn a place in the shared icon set. */
function IconX({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" aria-hidden>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

/** The arrow on a `<select>`, drawn rather than left to the platform's own chrome. */
function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative flex min-w-0 flex-1">
      {children}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

/** A filter chip. Pressed state is `aria-pressed`, so it is a fact and not just a colour. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-black uppercase tracking-wide transition-colors ${
        on
          ? "border-ink bg-ink text-paper"
          : "border-line-2 bg-soft text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One row.
 *
 * The two numbers on the right are the point of the board, so they are the only things
 * allowed to be typographically loud, and they are `tnum` so a column of them lines up.
 * `boardNumber` draws the dash for a player we never priced — never a zero, which would be
 * a claim about him rather than a gap in what we know.
 */
function Row({
  row,
  sort,
  avail,
  onKeyDown,
  bind,
}: {
  row: BoardRow;
  sort: string;
  avail: BoardAvailability;
  onKeyDown: (e: React.KeyboardEvent) => void;
  bind: (el: HTMLButtonElement | null) => void;
}) {
  const adds = addsLabel(row);
  const held = row.rostered_by;
  const owner = showsOwner(avail);
  const { open } = usePlayerSheet();
  return (
    <li>
      <button
        ref={bind}
        type="button"
        // A `BoardRow` already is a `PlayerSeed`, so the sheet's header paints from the
        // row the reader tapped rather than waiting on the fetch behind it.
        onClick={() => open(row)}
        onKeyDown={onKeyDown}
        className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border border-line px-3 py-2.5 text-left transition-colors hover:bg-soft focus:border-ink focus:bg-soft focus:outline-none"
      >
        <Avatar name={row.name} photo={row.photo} teamLogo={row.team_logo} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">
            {row.name}
            <InjuryTag status={row.injury_status} />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {rowMeta(row, NO_NFL_TEAM)}
            </span>
            {owner &&
              (held ? (
                <span className="max-w-[9rem] truncate rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wide text-muted ring-1 ring-line-2">
                  {held.is_me ? BOARD_LABELS.mine : held.team_name}
                </span>
              ) : (
                <span className="rounded bg-start-soft px-1.5 py-px text-[10px] font-black uppercase tracking-wide text-start">
                  {SCOUT.free}
                </span>
              ))}
            {/* Only worth ink on the board that is actually ranked by it. */}
            {adds && sort === "trending" && (
              <span className="tnum text-[11px] font-semibold text-muted">{adds}</span>
            )}
          </span>
        </span>
        <span className="tnum shrink-0 text-right">
          <span className="block text-[15px] font-black leading-tight">{boardNumber(row.projected)}</span>
          <span className="mt-0.5 block text-[11px] font-bold leading-tight text-muted">
            {boardNumber(row.ros, 0)} {COLUMN_LABELS.ros}
          </span>
        </span>
        <IconChevron size={16} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

export function PlayerBoard({ c }: { c: Connection }) {
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState<BoardQuery>({ pos: [], nfl_team: [], avail: "all", sort: "projected", order: "desc" });
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

  // The text is debounced into the query; every other control writes it immediately,
  // because a chip is one deliberate press and waiting on it reads as lag.
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === normalizeQuery(raw) ? q : { ...q, q: normalizeQuery(raw) })), SEARCH_DEBOUNCE_MS);
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

  return (
    <section className="min-w-0">
      <H2>{SCOUT.head}</H2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{SCOUT.hint}</p>

      <div className="relative mt-2.5">
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
          className={FIELD}
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

      {/* Who has him. Four short words, so a segmented row beats a menu. */}
      <div role="group" aria-label={BOARD_LABELS.filters} className="mt-3 flex min-w-0 gap-1 rounded-xl border border-line-2 bg-soft p-1">
        {BOARD_AVAILABILITY.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => patch({ avail: a, owner: null })}
            aria-pressed={query.avail === a}
            className={`min-w-0 flex-1 truncate rounded-lg px-1 py-1.5 text-[12px] font-black transition-colors ${
              query.avail === a ? "bg-paper text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink"
            }`}
          >
            {AVAILABILITY_LABELS[a]}
          </button>
        ))}
      </div>

      {/* Positions, from the league's own rows — a league with no kicker gets no K chip. */}
      {facets && facets.positions.length > 1 && (
        <div role="group" aria-label="Position" className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {facets.positions.map((pos) => (
            <Chip key={pos} on={!!query.pos?.includes(pos)} onClick={() => patch({ pos: toggle(query.pos ?? [], pos) })}>
              {pos}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-2 flex min-w-0 items-stretch gap-1.5">
        <SelectWrap>
          <select
            aria-label={BOARD_LABELS.nflTeam}
            value={query.nfl_team?.[0] ?? ""}
            onChange={(e) => patch({ nfl_team: e.target.value ? [e.target.value] : [] })}
            className={SELECT}
          >
            <option value="">{BOARD_LABELS.anyTeam}</option>
            {facets?.nfl_teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </SelectWrap>

        <SelectWrap>
          <select
            aria-label={BOARD_LABELS.sortBy}
            value={query.sort}
            onChange={(e) => setQuery((q) => withSort(q, e.target.value as BoardSort))}
            className={SELECT}
          >
            {BOARD_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s].label}
              </option>
            ))}
          </select>
        </SelectWrap>

        <button
          type="button"
          onClick={() => patch({ order: flipOrder(query.order) })}
          aria-label={BOARD_LABELS.reverse}
          className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-line-2 bg-soft text-muted transition-colors hover:border-ink hover:text-ink focus:border-ink focus:outline-none"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
               className={`transition-transform ${query.order === "asc" ? "rotate-180" : ""}`}>
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <p className="tnum text-[12px] font-bold uppercase tracking-wide text-muted">
          {current ? countLine(rows.length, current.board.total) : " "}
        </p>
        {filters > 0 && (
          <button type="button" onClick={clearFilters} className="shrink-0 text-[12px] font-bold text-lean hover:underline">
            {BOARD_LABELS.clear}
          </button>
        )}
      </div>

      {/* One announcement per settled board. Nothing is said while a request is in flight. */}
      <p role="status" className="sr-only">
        {current ? countLine(rows.length, current.board.total) : ""}
      </p>

      {error ? (
        <div className="mt-3">
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
          {query.q ? SCOUT.empty : SCOUT.noMatch}
        </p>
      ) : (
        <>
          <ul id={listId} aria-busy={busy || undefined} className={`mt-1 grid min-w-0 gap-2 transition-opacity ${busy ? "opacity-60" : ""}`}>
            {rows.map((row, i) => (
              <Row
                key={row.id}
                row={row}
                sort={query.sort ?? "projected"}
                avail={query.avail ?? "all"}
                bind={(el) => {
                  links.current[i] = el;
                }}
                onKeyDown={(e) => onRowKey(e, i)}
              />
            ))}
          </ul>
          {current && hasMore(rows.length, current.board.total) && (
            <button
              type="button"
              onClick={more}
              disabled={paging}
              className="mt-3 w-full rounded-xl border border-line-2 bg-soft py-3 text-[13px] font-black text-ink transition-colors hover:border-ink disabled:opacity-60"
            >
              {paging ? <Spinner size={15} label={SEARCH_LABELS.searching} /> : BOARD_LABELS.more}
            </button>
          )}
        </>
      )}
    </section>
  );
}
