"use client";
/** The film: the replay of your week first, then the standings for everyone, then the season week by week. */
import { useState } from "react";
import { AppShell } from "@/components/Shell";
import { Cover, Story, WeekPicker } from "@/components/film/Replay";
import { League } from "@/components/film/League";
import { Projector } from "@/components/film/Projector";
import { Locked } from "@/components/Locked";
import { Film } from "@/components/Film";
import { Standings } from "@/components/Standings";
import { ErrorBox, Opening, SkeletonList, useHeldWait } from "@/components/ui";
import { getFilm, getLeagueFilm, getRecap, getStandings, type FilmRead } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { standingsView } from "@/lib/recap";
import type { Connection } from "@/lib/storage";
import type { LeagueFilm, SeasonRecap, Standings as StandingsPayload } from "@/lib/types";
import { FILM } from "@/lib/vocab";

/**
 * The film is the one tab that looks backwards, in three parts, one scroll (SPEC-FILM §9).
 *
 * **The replay leads.** Your newest finished week, told as a story (`film/Replay.tsx`). Its
 * cover is free: the result, the score and one true line, drawn for everyone. The story
 * under it is part of the Full Report; a free reader gets the cover over the paywall, and
 * the paywall's teaser is that cover line.
 *
 * **The table is free.** Every team's record, points and roster strength, and the reason to
 * open the app on a Tuesday.
 *
 * **The season is paid.** Week by week, every starter and what came in (`Film.tsx`).
 *
 * The three fetch separately on purpose: a history that fails upstream must not take the
 * table down with it, and a free reader never asks for the season at all.
 */
function ReportBody({ c, paid, signedIn, refresh }: {
  c: Connection;
  paid: boolean;
  signedIn: boolean;
  refresh: () => void;
}) {
  const { data, error, reload } = useCached<StandingsPayload>(
    `standings:${c.platform}:${c.league_id}`,
    () => getStandings(c.platform, c.league_id),
  );

  return (
    <div className="grid min-w-0 gap-7">
      <nav className="film-parts" aria-label={FILM.partsAria}>
        <a href="#replay">{FILM.parts.replay}</a>
        <a href="#league">{FILM.parts.league}</a>
        {paid && <a href="#season">{FILM.parts.season}</a>}
      </nav>

      <div id="replay" className="film-anchor min-w-0">
        <ReplaySection
          c={c}
          paid={paid}
          signedIn={signedIn}
          refresh={refresh}
          // Null only while the table is still loading or failed, and `Locked` falls back
          // to the product blurb for that.
          fallbackTeaser={data ? standingsView(data, c.team_id).teaser : null}
        />
      </div>

      <section id="league" className="film-anchor grid min-w-0 gap-5">
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : data ? (
          <Standings standings={data} teamId={c.team_id} />
        ) : (
          <SkeletonList rows={6} />
        )}
        {paid && <LeagueSection c={c} />}
      </section>

      {paid && (
        <div id="season" className="film-anchor min-w-0">
          <FilmBody c={c} />
        </div>
      )}
    </div>
  );
}

function LeagueSection({ c }: { c: Connection }) {
  const { data, error, reload } = useCached<{ locked: boolean; film: LeagueFilm | null }>(
    `film-league:${c.platform}:${c.league_id}`,
    () => getLeagueFilm(c.platform, c.league_id),
  );
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <SkeletonList rows={4} />;
  if (!data.film) return null;
  return <League f={data.film} me={c.team_id} />;
}

function ReplaySection({ c, paid, signedIn, refresh, fallbackTeaser }: {
  c: Connection;
  paid: boolean;
  signedIn: boolean;
  refresh: () => void;
  fallbackTeaser: string | null;
}) {
  const { data, error, reload } = useCached<FilmRead>(
    `film:${c.platform}:${c.league_id}:${c.team_id}:${paid ? "paid" : "free"}`,
    () => getFilm(c.platform, c.league_id, c.team_id),
  );
  const [pick, setPick] = useState<number | null>(null);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <SkeletonList rows={3} />;

  if (!paid || data.locked) {
    return (
      <div className="grid min-w-0 gap-3">
        {data.cover && <Cover cover={data.cover} week={data.cover.week ?? 0} />}
        <Locked
          signedIn={signedIn}
          sku="full_report"
          what={FILM.product}
          teaser={data.cover?.line ?? fallbackTeaser}
          onUnlocked={refresh}
        />
      </div>
    );
  }

  // Nothing over yet: the season below says so, once.
  const weeks = data.film?.weeks ?? [];
  if (weeks.length === 0) return null;
  const w = weeks.find((x) => x.week === pick) ?? weeks[0];
  return (
    <div className="grid min-w-0 gap-3">
      {/* The newest week gets the showing, whichever week the picker is on. */}
      <Projector cover={weeks[0].cover} leagueId={c.league_id} season={data.film!.season} week={weeks[0].week} />
      <WeekPicker weeks={weeks.map((x) => x.week)} value={w.week} onPick={setPick} />
      <Cover cover={w.cover} week={w.week} />
      <Story key={w.week} w={w} />
    </div>
  );
}

function FilmBody({ c }: { c: Connection }) {
  const { data, error, reload } = useCached<SeasonRecap>(
    `recap:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getRecap(c.platform, c.league_id, c.team_id),
  );
  const waiting = useHeldWait(!!data);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !data) return <Opening />;
  return <Film recap={data} archive={false} />;
}

export default function ReportPage() {
  return (
    <AppShell section="report" needsMe>
      {(s) => (
        <ReportBody
          c={s.connection!}
          paid={s.has("full_report")}
          signedIn={s.signedIn}
          refresh={s.refresh}
        />
      )}
    </AppShell>
  );
}
