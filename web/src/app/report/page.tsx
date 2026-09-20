"use client";
/** The film: the season looked back on, week by week, against what we had at the time. */
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { Film } from "@/components/Film";
import { ErrorBox, Opening, useHeldWait } from "@/components/ui";
import { getRecap } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { RECAP_COPY } from "@/lib/recap";
import type { Connection } from "@/lib/storage";
import type { SeasonRecap } from "@/lib/types";

/**
 * The film is the one tab that looks backwards.
 *
 * It used to re-render the lineup, the wire and the trade board in one column, which is
 * the other four tabs read a second time. Nothing here is this week's advice: it is the
 * weeks that have already happened, the calls we made, and what actually came in.
 */
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
      {(s) =>
        s.has("full_report") ? (
          <FilmBody c={s.connection!} />
        ) : (
          <Locked signedIn={s.signedIn} sku="full_report" what={RECAP_COPY.product} onUnlocked={s.refresh} />
        )
      }
    </AppShell>
  );
}
