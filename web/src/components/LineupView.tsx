import type { Lineup } from "@/lib/types";
import { signed } from "@/lib/format";
import { Card, ConfidencePill, H2 } from "./ui";
import { PlayerLine } from "./Players";

/** Shared by /team and /report. */
export function LineupView({ lineup, compact = false }: { lineup: Lineup; compact?: boolean }) {
  const delta = lineup.projected_total - lineup.current_total;
  return (
    <div className="grid gap-4">
      <Card className="flex items-end justify-between">
        <div>
          <div className="text-xs font-bold uppercase text-muted">Projected · week {lineup.week}</div>
          <div className="text-4xl font-black tabular-nums">{lineup.projected_total.toFixed(1)}</div>
        </div>
        <div className="text-right text-sm text-muted">
          {delta > 0 ? (
            <>
              <span className="font-bold text-start">{signed(delta)}</span> vs current
              <br />({lineup.current_total.toFixed(1)})
            </>
          ) : (
            "Lineup already optimal"
          )}
        </div>
      </Card>

      <section>
        <H2>Changes</H2>
        {lineup.changes.length === 0 ? (
          <p className="mt-1 text-muted">No swaps this week. Your starters are your best guys.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {lineup.changes.map((c, i) => (
              <li key={i} className="rounded-xl border-2 border-start bg-start-soft p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-muted">{c.slot}</span>
                  <ConfidencePill value={c.confidence} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-base">
                  <span className="font-bold text-sit line-through decoration-2">{c.out.name}</span>
                  <span aria-hidden>→</span>
                  <span className="font-bold text-start">{c.in.name}</span>
                  <span className="ml-auto font-black tabular-nums text-start">{signed(c.gain)}</span>
                </div>
                {!compact && <p className="mt-1 text-sm">{c.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <H2>Starters</H2>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {lineup.slots.map((s, i) => (
            <li key={i} className={`p-3 ${s.change ? "bg-start-soft" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs font-black uppercase text-muted">{s.slot}</span>
                <PlayerLine p={s.player} />
                <span className="ml-auto shrink-0 text-right">
                  <span className="block text-lg font-black tabular-nums">{s.player.projected.toFixed(1)}</span>
                  <ConfidencePill value={s.confidence} />
                </span>
              </div>
              {!compact && <p className="mt-1 pl-13 text-sm text-muted">{s.reason}</p>}
            </li>
          ))}
        </ul>
      </section>

      {!compact && (
        <section>
          <H2>Bench</H2>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {lineup.bench.map((b, i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                <PlayerLine p={b.player} />
                <span className="ml-auto shrink-0 text-right">
                  <span className="block text-lg font-bold tabular-nums text-muted">{b.player.projected.toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
          <ul className="mt-2 grid gap-1 text-sm text-muted">
            {lineup.bench.map((b, i) => (
              <li key={i}>
                <span className="font-bold text-ink">{b.player.name}:</span> {b.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
