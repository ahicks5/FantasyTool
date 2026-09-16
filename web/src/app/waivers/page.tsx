"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { WaiversView } from "@/components/WaiversView";
import { ErrorBox, Spinner } from "@/components/ui";
import { getWaivers } from "@/lib/api";
import type { Connection } from "@/lib/storage";
import type { Waivers } from "@/lib/types";

function WaiversBody({ c }: { c: Connection }) {
  const [data, setData] = useState<Waivers | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getWaivers(c.platform, c.league_id, c.team_id).then(setData).catch((e: Error) => setError(e.message));
  }, [c.platform, c.league_id, c.team_id]);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  return <WaiversView waivers={data} />;
}

export default function WaiversPage() {
  return (
    <AppShell title="Waivers">
      {(s) => (s.has("waivers") ? <WaiversBody c={s.connection!} /> : <Locked sku="waivers" what="Waiver Wire Pass" onUnlocked={s.refresh} />)}
    </AppShell>
  );
}
