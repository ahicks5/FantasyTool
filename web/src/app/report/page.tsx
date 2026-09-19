"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { LineupView } from "@/components/LineupView";
import { WaiversView } from "@/components/WaiversView";
import { WaiverPlanView } from "@/components/WaiverPlanView";
import { TradeFinderView } from "@/components/TradeFinderView";
import { BoothOpening, ErrorBox, Eyebrow, H2, SplitMeter, VerdictWord } from "@/components/ui";
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
  if (!data) return <BoothOpening />;

  const m = data.matchup;
  return (
    <div className="grid gap-8">
      {m && m.opponent && m.win_prob !== null && m.their_proj !== null && (
        <section className="hero p-5">
          <Eyebrow>Matchup outlook</Eyebrow>
          <div className="mt-1 truncate text-[13px] font-bold text-white/85">vs {m.opponent}</div>
          <div className="display tnum mt-1.5 text-[34px] leading-none text-white">
            {m.my_proj.toFixed(1)}
            <span className="mx-1.5 text-white/35">–</span>
            <span className="text-white/55">{m.their_proj.toFixed(1)}</span>
          </div>
          <div className="mt-3.5">
            <SplitMeter left={m.win_prob} right={1 - m.win_prob} leftLabel={`${pct(m.win_prob)} to win`} rightLabel={pct(1 - m.win_prob)} onHero />
          </div>
        </section>
      )}

      <section>
        <H2>The board</H2>
        <div className="mt-2">
          <LineupView lineup={data.lineup} compact />
        </div>
      </section>

      <section>
        <H2>The wire</H2>
        <div className="mt-2">
          {data.waiver_plan ? <WaiverPlanView plan={data.waiver_plan} compact /> : <WaiversView waivers={data.waivers} compact />}
        </div>
      </section>

      {data.trade_finder && data.trade_finder.partners.length > 0 && (
        <section>
          <H2>Trades worth calling</H2>
          <div className="mt-2">
            <TradeFinderView found={data.trade_finder} />
          </div>
        </section>
      )}

      <section className={data.trade_finder?.partners.length ? "hidden" : ""}>
        <H2>Trade targets</H2>
        <ul className="mt-2 grid gap-2">
          {data.trade_targets.length === 0 && <li className="text-sm text-muted">Nothing clean on the board this week.</li>}
          {data.trade_targets.map((t, i) => (
            <li key={i} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <Eyebrow className="truncate">{t.their_team_name}</Eyebrow>
                <VerdictWord value={t.verdict} className="text-[17px]" />
              </div>
              <div className="mt-1.5 text-[14px] leading-relaxed">
                <span className="font-black text-sit">Give</span> {t.give_names.join(" + ")}
                <br />
                <span className="font-black text-start">Get</span> {t.get_names.join(" + ")}
              </div>
              <p className="mt-1.5 text-[13px] leading-snug text-muted">{t.why}</p>
              <Link
                href={`/trade?their=${t.their_team_id}&give=${t.give.join(",")}&get=${t.get.join(",")}`}
                className="mt-2.5 inline-block rounded-xl bg-soft px-3.5 py-2 text-[13px] font-bold"
              >
                Take it to the lab
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
    <AppShell title="The film">
      {(s) => (s.has("full_report") ? <ReportBody c={s.connection!} /> : <Locked signedIn={s.signedIn} sku="full_report" what="Full Report" onUnlocked={s.refresh} />)}
    </AppShell>
  );
}
