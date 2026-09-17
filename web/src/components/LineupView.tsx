"use client";
import type { Lineup, LineupSlot } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { PlayerLine } from "./Players";
import { ConfidencePill, Eyebrow, H2, Stat, Why } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };

function SlotRow({ s, hit }: { s: LineupSlot; hit?: number }) {
  return (
    <li className={`min-w-0 p-3 ${s.change ? "bg-start-soft" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-9 shrink-0 text-[11px] font-black uppercase tracking-wider text-muted">{s.slot}</span>
        {s.player ? (
          <PlayerLine p={s.player} avatar="md" ring={RING[s.confidence]} />
        ) : (
          <span className="flex items-center gap-3">
            <Avatar name="?" size="md" />
            <span className="text-muted">Empty</span>
          </span>
        )}
        <span className="ml-auto shrink-0 text-right">
          <span className="display block text-xl font-black tabular-nums">{(s.player?.projected ?? 0).toFixed(1)}</span>
          {/* The hit rate lives in Why? — repeating it here squeezes the name into an ellipsis. */}
          <ConfidencePill value={s.confidence} />
        </span>
      </div>
      <Why
        lines={[s.reason, hit !== undefined
          ? `${s.confidence}: margins this size were right about ${Math.round(hit * 100)}% of the time last week.`
          : ""].filter(Boolean)}
        label="Why?"
      />
    </li>
  );
}

export function LineupView({ lineup, compact = false }: { lineup: Lineup; compact?: boolean }) {
  const delta = lineup.projected_total - lineup.current_total;
  return (
    <div className="grid min-w-0 gap-6">
      <div className="card flex min-w-0 items-end justify-between gap-3 p-4">
        <Stat label={`Projected · Week ${lineup.week}`} value={lineup.projected_total.toFixed(1)} />
        <div className="text-right">
          {delta > 0.05 ? (
            <>
              <div className="font-black tabular-nums text-start">{signed(delta)}</div>
              <div className="text-xs text-muted">vs current ({lineup.current_total.toFixed(1)})</div>
            </>
          ) : (
            <div className="text-sm font-bold text-start">Lineup is set ✓</div>
          )}
        </div>
      </div>

      {lineup.changes.length > 0 && (
        <section className="min-w-0">
          <H2>Make these swaps</H2>
          <ul className="mt-2 grid gap-2">
            {lineup.changes.map((c, i) => (
              <li key={i} className={`card border-start/40 bg-start-soft p-4 rise rise-${Math.min(i + 1, 5)}`}>
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>{c.slot}</Eyebrow>
                  <ConfidencePill value={c.confidence} />
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base">
                  <span className="min-w-0 truncate font-bold text-sit line-through decoration-2">{c.out?.name ?? "Empty"}</span>
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                  <span className="min-w-0 truncate font-extrabold text-start">{c.in.name}</span>
                  <span className="display ml-auto text-xl font-black tabular-nums text-start">{signed(c.gain)}</span>
                </div>
                {!compact && <p className="mt-1 text-sm text-muted">{c.reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0">
        <H2>Starters</H2>
        <ul className="card mt-2 min-w-0 divide-y divide-line overflow-hidden p-0">
          {lineup.slots.map((s, i) => (
            <SlotRow key={i} s={s} hit={lineup.confidence_hit_rate?.[s.confidence]} />
          ))}
        </ul>
      </section>

      {!compact && (
        <section className="min-w-0">
          <H2>Bench</H2>
          <ul className="card mt-2 min-w-0 divide-y divide-line overflow-hidden p-0">
            {lineup.bench.map((b, i) => (
              <li key={i} className="p-3">
                <div className="flex items-center gap-3">
                  <PlayerLine p={b.player} avatar="md" />
                  <span className="display ml-auto shrink-0 text-xl font-bold tabular-nums text-muted">{b.player.projected.toFixed(1)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{b.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
