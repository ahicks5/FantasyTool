"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { LineupView } from "@/components/LineupView";
import { ErrorBox, SkeletonList } from "@/components/ui";
import { getLineup } from "@/lib/api";
import type { Connection } from "@/lib/storage";
import type { Lineup } from "@/lib/types";

function TeamBody({ c }: { c: Connection }) {
  const [data, setData] = useState<Lineup | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    getLineup(c.platform, c.league_id, c.team_id)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, tick]);
  const load = () => {
    setError("");
    setData(null);
    setTick((t) => t + 1);
  };
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <SkeletonList rows={6} />;
  return <LineupView lineup={data} share={{ leagueName: c.league_name, week: data.week }} />;
}

export default function TeamPage() {
  return <AppShell title="My Team">{(s) => <TeamBody c={s.connection!} />}</AppShell>;
}
