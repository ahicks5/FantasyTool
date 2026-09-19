"use client";
import type { Lineup, LineupSlot } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { PlayerLine } from "./Players";
import { IconArrowUp, IconCheck } from "./icons";
import { ConfidencePill, ConfidenceStamp, Countdown, Eyebrow, H2, OnAir, Stamp, useCountUp, Why } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };

/** One tile on the board: slot in the margin, player on the tile, number on the right. */
function SlotRow({ s, hit }: { s: LineupSlot; hit?: number }) {
  return (
    <li className={`min-w-0 px-4 py-3 ${s.change ? "bg-start-soft" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="slug w-[34px] shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted">{s.slot}</span>
        {s.player ? (
          <PlayerLine p={s.player} avatar="md" ring={RING[s.confidence]} />
        ) : (
          <span className="flex flex-1 items-center gap-3">
            <Avatar name="?" size="md" />
            <span className="text-sm text-muted">Empty</span>
          </span>
        )}
        {/* Only the number sits beside the name. The confidence tag is wide, so it moves to
            its own row rather than eating the name column down to an ellipsis. */}
        <span className="display tnum shrink-0 text-[22px] leading-none">{(s.player?.projected ?? 0).toFixed(1)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 pl-[46px]">
        {/* Dense list: a pill, not a stamp. Stamps are for calls you have to make. */}
        <ConfidencePill value={s.confidence} hit={hit} />
        <Why
          lines={[
            s.reason,
            hit !== undefined
              ? `${s.confidence}: margins this size were right about ${Math.round(hit * 100)}% of the time last week.`
              : "",
          ].filter(Boolean)}
          label="Why?"
        />
      </div>
    </li>
  );
}

export function LineupView({ lineup, compact = false }: { lineup: Lineup; compact?: boolean }) {
  const delta = lineup.projected_total - lineup.current_total;
  const projected = useCountUp(lineup.projected_total, 1);
  const set = delta <= 0.05;

  return (
    <div className="grid min-w-0 gap-6">
      <section className="hero callsheet">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <OnAir className="text-white/70" />
          <Countdown onHero />
        </div>
        <div className="flex items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <Eyebrow>Projected · Week {lineup.week}</Eyebrow>
            <div className="display tnum mt-1 text-[42px] leading-none text-white">{projected}</div>
          </div>
          <div className="shrink-0 text-right">
            {set ? (
              // Inked white: the hero is dark in both themes, where status green would vanish.
              <Stamp ink="text-white" slam>
                <IconCheck size={12} strokeWidth={3.4} />
                Board&rsquo;s set
              </Stamp>
            ) : (
              <>
                <div className="tnum display text-[19px] text-start">{signed(delta)}</div>
                <div className="text-[11px] text-white/55">
                  vs current <span className="tnum">{lineup.current_total.toFixed(1)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {lineup.changes.length > 0 && (
        <section className="min-w-0">
          <H2>Move these tiles</H2>
          <p className="mt-1 text-[13px] text-muted">
            {lineup.changes.length === 1 ? "One change" : `${lineup.changes.length} changes`} the staff wants on the board.
          </p>
          <ul className="mt-2.5 grid gap-2.5">
            {lineup.changes.map((c, i) => (
              <li key={i} className={`card border-start/35 bg-start-soft p-4 print print-${Math.min(i + 1, 5)}`}>
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>{c.slot}</Eyebrow>
                  <ConfidenceStamp value={c.confidence} />
                </div>
                {/* The swap, played as a swap: the benched name drops, the starter rises. */}
                <div className="mt-2.5 flex min-w-0 items-center gap-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="demote block truncate text-[13px] font-bold text-sit line-through decoration-2">
                      {c.out?.name ?? "Empty"}
                    </span>
                    <span className="promote mt-0.5 flex items-center gap-1 text-[15px] font-black text-start">
                      <IconArrowUp size={14} strokeWidth={3} />
                      <span className="truncate">{c.in.name}</span>
                    </span>
                  </span>
                  <span className="display tnum shrink-0 text-[21px] text-start">{signed(c.gain)}</span>
                </div>
                {!compact && <p className="mt-2 text-[13px] leading-snug text-ink-2">{c.reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0">
        <H2>On the field</H2>
        <ul className="card mt-2.5 min-w-0 divide-y divide-line overflow-hidden p-0">
          {lineup.slots.map((s, i) => (
            <SlotRow key={i} s={s} hit={lineup.confidence_hit_rate?.[s.confidence]} />
          ))}
        </ul>
      </section>

      {!compact && (
        <section className="min-w-0">
          <H2>On the bench</H2>
          <ul className="card mt-2.5 min-w-0 divide-y divide-line overflow-hidden p-0">
            {lineup.bench.map((b, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PlayerLine p={b.player} avatar="md" />
                  <span className="display tnum shrink-0 text-[19px] text-muted">{b.player.projected.toFixed(1)}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-muted">{b.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
