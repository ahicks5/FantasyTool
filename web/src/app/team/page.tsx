"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { LineupView } from "@/components/LineupView";
import { ErrorBox, Spinner } from "@/components/ui";
import { getLineup } from "@/lib/api";
import type { Connection } from "@/lib/storage";
import type { Lineup } from "@/lib/types";

function TeamBody({ c }: { c: Connection }) {
  const [data, setData] = useState<Lineup | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getLineup(c.platform, c.league_id, c.team_id).then(setData).catch((e: Error) => setError(e.message));
  }, [c.platform, c.league_id, c.team_id]);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  return <LineupView lineup={data} />;
}

export default function TeamPage() {
  return <AppShell title="My Team">{(s) => <TeamBody c={s.connection!} />}</AppShell>;
}
