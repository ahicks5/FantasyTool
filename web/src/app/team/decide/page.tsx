"use client";
/** One lineup role, the whole question: `/team/decide?role=RB2`. Reads the lineup the tab already fetched. Free tier. */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/Shell";
import { DecisionView } from "@/components/DecisionView";
import { ErrorBox, Opening, useHeldWait } from "@/components/ui";
import { getLineup } from "@/lib/api";
import { useCached } from "@/lib/cache";
import type { Connection } from "@/lib/storage";
import type { Lineup } from "@/lib/types";

function DecideBody({ c }: { c: Connection }) {
  const params = useSearchParams();
  const label = params.get("role") ?? "";
  const { data, error, instant, reload } = useCached<Lineup>(
    `lineup:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getLineup(c.platform, c.league_id, c.team_id),
  );
  const waiting = useHeldWait(!!data);
  void instant;

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !data) return <Opening />;
  return <DecisionView lineup={data} label={label} />;
}

export default function DecidePage() {
  return (
    <AppShell section="team">
      {(s) => (
        <Suspense fallback={<Opening />}>
          <DecideBody c={s.connection!} />
        </Suspense>
      )}
    </AppShell>
  );
}
