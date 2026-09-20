"use client";
/** The film: the standings for everyone, then the season looked back on week by week. */
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { Film } from "@/components/Film";
import { Standings } from "@/components/Standings";
import { ErrorBox, Opening, SkeletonList, useHeldWait } from "@/components/ui";
import { getRecap, getStandings } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { RECAP_COPY, standingsView } from "@/lib/recap";
import type { Connection } from "@/lib/storage";
import type { SeasonRecap, Standings as StandingsPayload } from "@/lib/types";

/**
 * The film is the one tab that looks backwards, and now it has two halves.
 *
 * **The top half is free.** The table is the "how am I doing" screen — every team's record,
 * points and roster strength — and it is the reason to open the app on a Tuesday. A reader
 * who has never paid gets the whole of it.
 *
 * **The bottom half is the film itself, and it is paid.** Week by week, every call we made
 * and what actually came in. For a free reader it is a `Locked` whose teaser is built out of
 * the free row directly above it: his own record against his own scoring rank, which gives
 * nothing away because it is already on screen, and which beats any sentence about a product.
 *
 * The two halves fetch separately on purpose. A season history that fails upstream must not
 * take the table down with it, and a free reader never asks for the recap at all.
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
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data ? (
        <Standings standings={data} teamId={c.team_id} />
      ) : (
        <SkeletonList rows={6} />
      )}

      {paid ? (
        <FilmBody c={c} />
      ) : (
        <Locked
          signedIn={signedIn}
          sku="full_report"
          what={RECAP_COPY.product}
          // Null only while the table is still loading or failed, and `Locked` falls back
          // to the product blurb for that. It is never the blurb when we have the numbers.
          teaser={data ? standingsView(data, c.team_id).teaser : null}
          onUnlocked={refresh}
        />
      )}
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
  return <Film recap={data} />;
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
