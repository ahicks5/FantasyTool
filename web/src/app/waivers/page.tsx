"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { WaiversView } from "@/components/WaiversView";
import { ErrorBox, SkeletonList } from "@/components/ui";
import { getWaivers, PaywallError } from "@/lib/api";
import type { Connection } from "@/lib/storage";
import type { Waivers } from "@/lib/types";

function WaiversBody({ c, refresh }: { c: Connection; refresh: () => void }) {
  const [data, setData] = useState<Waivers | null>(null);
  const [paywall, setPaywall] = useState<PaywallError | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    getWaivers(c.platform, c.league_id, c.team_id)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && (e instanceof PaywallError ? setPaywall(e) : setError(e.message)));
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, tick]);
  const load = () => {
    setError("");
    setData(null);
    setTick((t) => t + 1);
  };
  if (paywall) return <Locked sku="waivers" what="Waiver Wire Pass" teaser={paywall.teaser} onUnlocked={refresh} />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <SkeletonList rows={5} tall />;
  return <WaiversView waivers={data} />;
}

export default function WaiversPage() {
  return (
    <AppShell title="Waivers">
      {(s) =>
        s.has("waivers") ? (
          <WaiversBody c={s.connection!} refresh={s.refresh} />
        ) : (
          <Locked sku="waivers" what="Waiver Wire Pass" teaser="Edge ranks every free agent by how much he improves your lineup, then tells you what to bid and who to drop." onUnlocked={s.refresh} />
        )
      }
    </AppShell>
  );
}
