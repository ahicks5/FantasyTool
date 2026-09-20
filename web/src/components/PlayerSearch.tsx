"use client";
/**
 * The front door to the scout report: any player in the league, by name.
 *
 * It sits at the top of Scouting, *above* the Wire Pass lock, and it is free. The wire
 * is a decision — who to claim, what to bid, who to cut — and decisions are what
 * Penthouse charges for. A profile is a record of what already happened. Handing a
 * visitor the record costs us nothing and gives a locked room something real in it;
 * the ranked board and the bid plan below are untouched and still answer 402.
 *
 * Nothing here reads an entitlement, and nothing here should start: `edge/products.py`
 * is the only source of truth for what is paid.
 *
 * A plain list of links, not a combobox. Every row is a real `<Link>`, so it prefetches,
 * opens in a new tab and works with a screen reader's own link handling; the arrow keys
 * move DOM focus through them rather than painting a fake selection, which is why there
 * is no `aria-activedescendant` and no roving state to keep in sync.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { searchPlayers } from "@/lib/api";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_LABELS,
  SEARCH_SLOW_MS,
  hitMeta,
  isSearchable,
  keepsResults,
  nextIndex,
  normalizeQuery,
  resultCount,
} from "@/lib/search";
import type { Connection } from "@/lib/storage";
import type { PlayerHit } from "@/lib/types";
import { SCOUT } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { IconChevron } from "./icons";
import { ErrorBox, H2, SkeletonList, Spinner } from "./ui";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft py-3 pl-4 pr-[4.75rem] text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none [&::-webkit-search-cancel-button]:appearance-none";

/** Two strokes. Too small a thing to earn a place in the shared icon set. */
function IconX({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" aria-hidden>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

/** One hit: who he is, and whether anyone in this league already has him. */
function Hit({ hit, onKeyDown, bind }: { hit: PlayerHit; onKeyDown: (e: React.KeyboardEvent) => void; bind: (el: HTMLAnchorElement | null) => void }) {
  return (
    <li>
      <Link
        ref={bind}
        href={`/waivers/${encodeURIComponent(hit.id)}`}
        onKeyDown={onKeyDown}
        className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border border-line px-3 py-2.5 transition-colors hover:bg-soft focus:border-ink focus:bg-soft focus:outline-none"
      >
        <Avatar name={hit.name} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">{hit.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{hitMeta(hit)}</span>
            {/* The free agent is the one worth finding, so he is the one that takes ink.
                Status green, never `--color-signal`: the lamp is brand chrome and never
                lands on a player row (docs/BRAND.md). */}
            {hit.rostered ? (
              <span className="rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wide text-muted ring-1 ring-line-2">
                {SEARCH_LABELS.rostered}
              </span>
            ) : (
              <span className="rounded bg-start-soft px-1.5 py-px text-[10px] font-black uppercase tracking-wide text-start">
                {SCOUT.free}
              </span>
            )}
          </span>
        </span>
        <IconChevron size={16} className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}

export function PlayerSearch({ c }: { c: Connection }) {
  const [raw, setRaw] = useState("");
  /** The last list that came back, tagged with the query that asked for it. */
  const [res, setRes] = useState<{ q: string; hits: PlayerHit[] } | null>(null);
  const [failed, setFailed] = useState<{ q: string; error: unknown } | null>(null);
  /** The query whose request has been running long enough to admit it. */
  const [slow, setSlow] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;

  const q = normalizeQuery(raw);
  const ready = isSearchable(q);
  const { platform, league_id, team_id } = c;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    // Debounce: a name is one request, not one per letter. Every state write below
    // happens inside a callback, never in the effect body.
    const debounce = setTimeout(() => {
      slowTimer = setTimeout(() => alive && setSlow(q), SEARCH_SLOW_MS);
      searchPlayers(platform, league_id, q, team_id)
        .then((hits) => {
          if (!alive) return;
          setRes({ q, hits });
          setFailed(null);
        })
        .catch((error) => alive && setFailed({ q, error }))
        .finally(() => {
          clearTimeout(slowTimer);
          // Tagged by query, so a stale request can never leave the box spinning.
          if (alive) setSlow((s) => (s === q ? null : s));
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      // The answer to a query nobody is looking at any more is dropped on arrival,
      // which is also what stops a setState landing after unmount.
      alive = false;
      clearTimeout(debounce);
      clearTimeout(slowTimer);
    };
  }, [q, ready, platform, league_id, team_id, retry]);

  const error = failed && failed.q === q ? failed.error : null;
  // Held while the query is still growing out of the one that fetched them; dropped the
  // moment it becomes a different search.
  const stale = !!res && res.q !== q;
  const hits = ready && res && (!stale || keepsResults(res.q, q)) && !error ? res.hits : null;
  const busy = ready && slow === q;
  const waiting = busy && hits === null && !error;

  function clear() {
    setRaw("");
    inputRef.current?.focus();
  }

  function move(from: number, delta: number) {
    const to = nextIndex(from, hits?.length ?? 0, delta);
    if (to < 0) return;
    rows.current[to]?.focus();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!hits?.length) return;
      e.preventDefault();
      move(-1, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && hits?.length) {
      // There is no form to submit and the results are already live, so Enter takes
      // the top of the list. On a phone that also drops the keyboard off the results.
      e.preventDefault();
      move(-1, 1);
    } else if (e.key === "Escape" && raw) {
      e.preventDefault();
      clear();
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

  return (
    <section className="min-w-0">
      <H2>{SCOUT.head}</H2>

      <div className="relative mt-2.5">
        <input
          ref={inputRef}
          type="search"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onInputKey}
          placeholder={SCOUT.placeholder}
          aria-label={SCOUT.placeholder}
          aria-describedby={ready ? undefined : hintId}
          aria-controls={hits?.length ? listId : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          className={FIELD}
        />
        {busy && (
          <span className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 text-muted">
            <Spinner size={16} label={SEARCH_LABELS.searching} />
          </span>
        )}
        {raw && (
          <button
            type="button"
            onClick={clear}
            aria-label={SEARCH_LABELS.clear}
            className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <IconX />
          </button>
        )}
      </div>

      {!ready && (
        <p id={hintId} className="mt-2.5 text-[13px] leading-relaxed text-muted">
          {SCOUT.hint}
        </p>
      )}

      {/* One announcement per settled search. Nothing is said while a request is in flight. */}
      <p role="status" className="sr-only">
        {ready && hits && !stale ? (hits.length ? resultCount(hits.length) : SCOUT.empty) : ""}
      </p>

      {error ? (
        <div className="mt-3">
          <ErrorBox error={error} onRetry={() => setRetry((n) => n + 1)} />
        </div>
      ) : waiting ? (
        <div className="mt-3">
          <SkeletonList rows={3} quiet />
        </div>
      ) : hits && hits.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line-2 px-4 py-5 text-center text-[14px] text-muted">{SCOUT.empty}</p>
      ) : hits && hits.length > 0 ? (
        <ul
          id={listId}
          aria-busy={stale || undefined}
          className={`mt-3 grid min-w-0 gap-2 transition-opacity ${stale ? "opacity-60" : ""}`}
        >
          {hits.map((hit, i) => (
            <Hit
              key={hit.id}
              hit={hit}
              bind={(el) => {
                rows.current[i] = el;
              }}
              onKeyDown={(e) => onRowKey(e, i)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
