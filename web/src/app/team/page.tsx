"use client";
import { AppShell } from "@/components/Shell";
import { LineupView } from "@/components/LineupView";
import { BoothOpening, useHeldWait, ErrorBox } from "@/components/ui";
import { getLineup } from "@/lib/api";
import { useCached } from "@/lib/cache";
import type { Connection } from "@/lib/storage";
import type { Lineup } from "@/lib/types";

function TeamBody({ c }: { c: Connection }) {
  const { data, error, instant, reload } = useCached<Lineup>(
    `lineup:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getLineup(c.platform, c.league_id, c.team_id),
  );
  const waiting = useHeldWait(!!data);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !data) return <BoothOpening />;
  return <LineupView lineup={data} animate={!instant} />;
}

export default function TeamPage() {
  return <AppShell section="team">{(s) => <TeamBody c={s.connection!} />}</AppShell>;
}
