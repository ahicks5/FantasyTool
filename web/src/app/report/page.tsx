"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { LineupView } from "@/components/LineupView";
import { WaiversView } from "@/components/WaiversView";
import { WaiverPlanView } from "@/components/WaiverPlanView";
import { TradeFinderView } from "@/components/TradeFinderView";
import { Card, ErrorBox, H2, SkeletonList, VerdictWord } from "@/components/ui";
import { getReport } from "@/lib/api";
import { pct } from "@/lib/format";
import type { Connection } from "@/lib/storage";
import type { Report } from "@/lib/types";

function ReportBody({ c }: { c: Connection }) {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getReport(c.platform, c.league_id, c.team_id).then(setData).catch((e: Error) => setError(e.message));
  }, [c.platform, c.league_id, c.team_id]);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <SkeletonList rows={6} tall />;

  const m = data.matchup;
  const favored = (m?.win_prob ?? 0) >= 0.5;
  return (
    <div className="grid gap-8">
      {m && m.opponent && m.win_prob !== null && m.their_proj !== null && (
        <section>
          <H2>Matchup outlook</H2>
          <Card className="mt-2">
            <div className="text-sm text-muted">vs {m.opponent}</div>
            <div className="mt-1 flex items-end justify-between">
              <div>
                <span className="text-3xl font-black tabular-nums">{m.my_proj.toFixed(1)}</span>
                <span className="text-muted"> – </span>
                <span className="text-3xl font-black tabular-nums text-muted">{m.their_proj.toFixed(1)}</span>
              </div>
              <div className={`text-2xl font-black ${favored ? "text-start" : "text-sit"}`}>{pct(m.win_prob)} win</div>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-sit-soft">
              <div className="h-full bg-start" style={{ width: pct(m.win_prob) }} />
            </div>
          </Card>
        </section>
      )}

      <section>
        <H2>Lineup</H2>
        <div className="mt-2">
          <LineupView lineup={data.lineup} compact />
        </div>
      </section>

      <section>
        <H2>Waivers</H2>
        <div className="mt-2">
          {data.waiver_plan ? <WaiverPlanView plan={data.waiver_plan} compact /> : <WaiversView waivers={data.waivers} compact />}
        </div>
      </section>

      {data.trade_finder && data.trade_finder.partners.length > 0 && (
        <section>
          <H2>Trade finder</H2>
          <div className="mt-2">
            <TradeFinderView found={data.trade_finder} />
          </div>
        </section>
      )}

      <section className={data.trade_finder?.partners.length ? "hidden" : ""}>
        <H2>Trade targets</H2>
        <ul className="mt-2 grid gap-2">
          {data.trade_targets.length === 0 && <li className="text-sm text-muted">No clean 1-for-1 upgrades this week.</li>}
          {data.trade_targets.map((t, i) => (
            <li key={i} className="card p-4">
              <div className="flex items-center justify-between">
                <span className="truncate text-xs font-bold uppercase text-muted">{t.their_team_name}</span>
                <VerdictWord value={t.verdict} className="text-lg" />
              </div>
              <div className="mt-1 text-sm">
                <span className="font-bold text-sit">Give</span> {t.give_names.join(" + ")}
                <br />
                <span className="font-bold text-start">Get</span> {t.get_names.join(" + ")}
              </div>
              <p className="mt-1 text-sm text-muted">{t.why}</p>
              <Link href={`/trade?their=${t.their_team_id}&give=${t.give.join(",")}&get=${t.get.join(",")}`} className="mt-2 inline-block rounded-lg bg-soft px-3 py-1.5 text-sm font-bold">
                Open in Trade Lab →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function ReportPage() {
  return (
    <AppShell title="Full Report">
      {(s) => (s.has("full_report") ? <ReportBody c={s.connection!} /> : <Locked sku="full_report" what="Full Report" onUnlocked={s.refresh} />)}
    </AppShell>
  );
}
