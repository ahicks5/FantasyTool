"use client";
/**
 * The scout report on one player: who has him, what the counts say, and every week he has
 * on record, scored by the reader's own league.
 *
 * It is the one page in Scouting that is not a recommendation. The wire ranks five adds
 * and prices a bid; this answers "yes, but who *is* he" — so it states facts and stops. No
 * projection, no verdict, no stamp: a stamp is the loudest device the brand has and it is
 * reserved for a decision the reader is being asked to make (`docs/BRAND.md` §8).
 *
 * Free, deliberately. The ranked board and the bid plan are Wire Pass; a profile someone
 * can open, read and send on is the way in, the same way a shared Lock card is.
 *
 * Every number comes through `lib/profile.ts`, which never turns a null into a zero. This
 * file only draws what comes back.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { getPlayerProfile } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { HttpError } from "@/lib/errors";
import {
  NO_VALUE,
  PROFILE_COPY as COPY,
  SPLIT_ROWS_OPEN,
  profileView,
  type ProfileView,
  type SeasonPanel,
  type SplitRow,
} from "@/lib/profile";
import type { Connection } from "@/lib/storage";
import type { PlayerProfile } from "@/lib/types";
import { SCOUT, SECTIONS } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { IconChevron } from "./icons";
import { ProfileGames } from "./ProfileGames";
import { ProfileReads } from "./ProfileReads";
import { AppShell } from "./Shell";
import { ErrorBox, Eyebrow, H2, InjuryTag, Opening, useHeldWait } from "./ui";

/* ------------------------------------------------------------------ frame --- */

/** Back where you came from. The search is always the way in, so it is always the way out. */
function BackToScouting() {
  return (
    <Link
      href={SECTIONS.waivers.href}
      className="flex min-h-11 shrink-0 items-center gap-0.5 text-[13px] font-bold text-lean"
    >
      <IconChevron size={14} strokeWidth={2.8} className="rotate-180" />
      {SCOUT.back}
    </Link>
  );
}

export function Profile({ playerId }: { playerId: string }) {
  return (
    <AppShell section="waivers" needsMe aside={<BackToScouting />}>
      {(s) => <ProfileBody c={s.connection!} playerId={playerId} />}
    </AppShell>
  );
}

function ProfileBody({ c, playerId }: { c: Connection; playerId: string }) {
  // Keyed by league *and* team as well as player: the points are scored by this league's
  // settings and `owner` is answered by this league, so the same id is a different report
  // in a different room.
  const { data, error, cause, reload } = useCached<PlayerProfile>(
    `profile:${c.platform}:${c.league_id}:${c.team_id}:${playerId}`,
    () => getPlayerProfile(c.platform, c.league_id, playerId, c.team_id),
  );
  const waiting = useHeldWait(!!data);
  const view = useMemo(() => (data ? profileView(data, SCOUT.free) : null), [data]);

  // A 404 is the id itself being wrong, and it will still be wrong on a retry, so it gets
  // a way out rather than a "try again".
  if (cause instanceof HttpError && cause.status === 404) return <NotFound />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !view) return <Opening />;
  return <Report view={view} />;
}

function NotFound() {
  return (
    <div className="card p-5">
      <H2>{COPY.notFoundHead}</H2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{COPY.notFoundLine}</p>
      <div className="mt-3">
        <BackToScouting />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- report --- */

function Report({ view }: { view: ProfileView }) {
  return (
    <div className="grid grid-cols-1 gap-7">
      <Identity view={view} />
      <ProfileReads reads={view.reads} />
      <Splits view={view} />
      <ProfileGames games={view.games} chart={view.chart} />
      {/* The one honest caveat, said once: these are counts, in your scoring, not a forecast. */}
      <p className="text-[12px] leading-relaxed text-muted">{SCOUT.footnote}</p>
    </div>
  );
}

/**
 * Who he is, and who holds him.
 *
 * The lit panel, because ownership is the most actionable fact on the page: a manager
 * reading a profile is deciding whether to go and get him, and "nobody has him" is the
 * whole answer. Everything on the hero is stated as white at an opacity — it is dark in
 * both themes, so a status colour would vanish in one of them.
 */
function Identity({ view }: { view: ProfileView }) {
  return (
    <section className="hero p-5">
      <div className="flex items-start gap-3.5">
        <Avatar name={view.name} photo={view.photo} teamLogo={view.teamLogo} size="lg" />
        <div className="min-w-0 flex-1">
          {/* `break-words`, not `truncate`: a long name is the normal case here
              ("Amon-Ra St. Brown" is 17 characters) and the name is what the page is. */}
          <h2 className="display text-[22px] leading-[1.1] text-white break-words">{view.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] font-bold text-white/75">
            <span className="uppercase tracking-wide">{view.positionLine}</span>
            {view.injuryStatus && <InjuryTag status={view.injuryStatus} />}
            {view.injuryBodyPart && <span className="text-white/55">{view.injuryBodyPart}</span>}
          </p>
          {view.meta && <p className="mt-0.5 text-[12px] text-white/55">{view.meta}</p>}
        </div>
      </div>

      <Owner view={view} />
      <Season panel={view.panel} />
    </section>
  );
}

/**
 * The ownership plate.
 *
 * A free agent is escalated with fill rather than with colour: a solid plate in the page's
 * own near-black on a white ground, which reads at a glance in both themes and costs the
 * brand nothing. `--color-signal` is chrome only and would be wrong here twice over — this
 * is a player row, and the lamp never carries meaning on its own.
 *
 * The ink on that plate is `--color-hero`, not `--color-plane`: the hero is the one surface
 * that is dark in *both* themes, so its token is the only one guaranteed to stay dark
 * against white. The page's own background is near-white in light mode, and using it here
 * painted white on white.
 */
function Owner({ view }: { view: ProfileView }) {
  const { label, value, free, mine } = view.ownership;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3.5">
      <Eyebrow>{label}</Eyebrow>
      {free ? (
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-black uppercase tracking-wide text-[var(--color-hero)]">
          {value}
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[14px] font-bold text-white">{value}</span>
          {mine && (
            <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              {COPY.ownerMine}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The season, in three numbers.
 *
 * In week 1 there is no season yet, so the panel shows last year and says "Last season"
 * over it. A panel that silently shows a year-old number is worse than no panel.
 */
function Season({ panel }: { panel: SeasonPanel | null }) {
  if (!panel) {
    return <p className="mt-4 border-t border-white/10 pt-3.5 text-[13px] text-white/60">{COPY.nothingAtAll}</p>;
  }
  return (
    <div className="mt-4 border-t border-white/10 pt-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Eyebrow>{panel.head}</Eyebrow>
        <span className="text-[11px] font-bold text-white/55">{panel.sub}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {panel.stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className="display tnum text-[24px] leading-none text-white">
              {s.missing ? (
                <>
                  <span aria-hidden>{s.value}</span>
                  <span className="sr-only">{COPY.notRecorded}</span>
                </>
              ) : (
                s.value
              )}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide leading-tight text-white/60">{s.label}</div>
            {s.sub && <div className="text-[10px] font-bold text-white/40">{s.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ two seasons --- */

/**
 * This season against last, row by row.
 *
 * A row neither season has never reaches the page (`splitRows`), so a quarterback is not
 * handed two dashes under "Targets". The rest opens on the eight rows a manager scans for
 * and keeps the tail one tap away: the owner's stated preference is a dense tab with the
 * detail collapsed, not a column you scroll past.
 */
function Splits({ view }: { view: ProfileView }) {
  const [all, setAll] = useState(false);
  if (view.splits.length === 0) return null;

  const rows = all ? view.splits : view.splits.slice(0, SPLIT_ROWS_OPEN);
  const more = view.splits.length > SPLIT_ROWS_OPEN;
  const nowHead = view.seasons.now === null ? COPY.colThis : String(view.seasons.now);
  const prevHead = view.seasons.prev === null ? COPY.colLast : String(view.seasons.prev);

  return (
    <section>
      <H2>{COPY.splitsHead}</H2>
      <div className="card mt-2 px-4 pb-3 pt-3.5">
        <table className="w-full table-fixed text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th scope="col" className="pb-1.5 text-left font-bold">
                <span className="sr-only">{COPY.splitsHead}</span>
              </th>
              <th scope="col" className="tnum w-[58px] pb-1.5 text-right font-bold">{nowHead}</th>
              <th scope="col" className="tnum w-[58px] pb-1.5 text-right font-bold">{prevHead}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.key} row={r} />
            ))}
          </tbody>
        </table>
        {more && (
          <button onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-1 text-[13px] font-bold text-lean">
            {all ? COPY.showLess : COPY.showAll}
          </button>
        )}
      </div>
    </section>
  );
}

function Cell({ value, missing }: { value: string; missing: boolean }) {
  return (
    <td className={`tnum py-2 text-right align-top ${missing ? "text-muted" : "font-bold"}`}>
      {missing ? (
        <>
          <span aria-hidden>{NO_VALUE}</span>
          <span className="sr-only">{COPY.notRecorded}</span>
        </>
      ) : (
        value
      )}
    </td>
  );
}

function Row({ row }: { row: SplitRow }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="overflow-hidden py-2 pr-2 text-left align-top text-[12px] font-semibold leading-tight text-ink-2">
        {row.label}
      </th>
      <Cell value={row.now} missing={row.nowMissing} />
      <Cell value={row.prev} missing={row.prevMissing} />
    </tr>
  );
}
