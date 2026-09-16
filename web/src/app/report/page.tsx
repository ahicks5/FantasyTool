"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { LineupView } from "@/components/LineupView";
import { WaiversView } from "@/components/WaiversView";
import { Card, ErrorBox, H2, Spinner, VerdictWord } from "@/components/ui";
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
  if (!data) return <Spinner />;

  const m = data.matchup;
  const favored = m.win_prob >= 0.5;
  return (
    <div className="grid gap-8">
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

      <section>
        <H2>Lineup</H2>
        <div className="mt-2">
          <LineupView lineup={data.lineup} compact />
        </div>
      </section>

      <section>
        <H2>Waivers</H2>
        <div className="mt-2">
          <WaiversView waivers={data.waivers} compact />
        </div>
      </section>

      <section>
        <H2>Trade targets</H2>
        <ul className="mt-2 grid gap-2">
          {data.trade_targets.map((t, i) => (
            <li key={i} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted">Team {t.their_team_id}</span>
                <VerdictWord value={t.verdict} className="text-lg" />
              </div>
              <div className="mt-1 text-sm">
                <span className="font-bold text-sit">Give</span> {t.give.map((p) => p.name).join(" + ")}
                <br />
                <span className="font-bold text-start">Get</span> {t.get.map((p) => p.name).join(" + ")}
              </div>
              <p className="mt-1 text-sm text-muted">{t.why}</p>
              <Link href="/trade" className="mt-2 inline-block text-sm font-bold underline">
                Open in Trade Lab
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
