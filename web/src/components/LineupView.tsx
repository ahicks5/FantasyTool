"use client";
import { useState } from "react";
import type { Lineup, LineupSlot } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { PlayerLine } from "./Players";
import { Scorecard } from "./Scorecard";
import { IconArrowUp, IconCheck } from "./icons";
import { ConfidencePill, ConfidenceStamp, Countdown, Eyebrow, H2, OnAirLive, Stamp, useCountUp, Why } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };

/** Two reads on the same team: this week's board, and how the roster grades out. */
type View = "board" | "scorecard";
const VIEWS: View[] = ["board", "scorecard"];
const VIEW_LABEL: Record<View, string> = { board: "The board", scorecard: "Scorecard" };

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

export function LineupView({
  lineup,
  compact = false,
  animate = true,
}: {
  lineup: Lineup;
  compact?: boolean;
  /** False when this came from the session cache: the board is already on screen. */
  animate?: boolean;
}) {
  const delta = lineup.projected_total - lineup.current_total;
  const projected = useCountUp(lineup.projected_total, 1);
  const set = delta <= 0.05;

  const grades = lineup.grades;
  const [view, setView] = useState<View>("board");
  /* A cached page paints without replaying its opening, but asking for the other
     view is a deliberate arrival, so that one still gets its entry. */
  const [flipped, setFlipped] = useState(false);
  const entry = animate || flipped;
  // No toggle without a scorecard to toggle to, and never inside the report's compact embed.
  const toggle = !compact && !!grades;

  const board = (
    <>
      <section className="hero callsheet">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <OnAirLive className="text-white/70" />
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
              <Stamp ink="text-white" slam={animate}>
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
              <li key={i} className={`card border-start/35 bg-start-soft p-4 ${animate ? `print print-${Math.min(i + 1, 5)}` : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>{c.slot}</Eyebrow>
                  <ConfidenceStamp value={c.confidence} />
                </div>
                {/* The swap, played as a swap: the benched name drops, the starter rises. */}
                <div className="mt-2.5 flex min-w-0 items-center gap-2.5">
                  <span className="min-w-0 flex-1">
                    <span className={`${animate ? "demote" : "opacity-55"} block truncate text-[13px] font-bold text-sit line-through decoration-2`}>
                      {c.out?.name ?? "Empty"}
                    </span>
                    <span className={`${animate ? "promote" : ""} mt-0.5 flex items-center gap-1 text-[15px] font-black text-start`}>
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
    </>
  );

  if (!toggle || !grades) return <div className="grid min-w-0 gap-6">{board}</div>;

  return (
    <div className="grid min-w-0 gap-6">
      {/* Same segmented control as the Trade Lab: one row, two truths about the same team. */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-soft p-1" role="tablist" aria-label="Depth chart view">
        {VIEWS.map((v) => (
          <button
            key={v}
            id={`depth-tab-${v}`}
            role="tab"
            aria-selected={view === v}
            aria-controls={`depth-panel-${v}`}
            onClick={() => {
              setFlipped(true);
              setView(v);
            }}
            className={`rounded-xl px-3 text-[13px] font-bold transition-colors ${
              view === v ? "bg-paper text-ink shadow-[var(--shadow-card)]" : "text-muted"
            }`}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {view === "scorecard" ? (
        <div id="depth-panel-scorecard" role="tabpanel" aria-labelledby="depth-tab-scorecard" className="min-w-0">
          <Scorecard grades={grades} week={lineup.week} animate={entry} />
        </div>
      ) : (
        <div id="depth-panel-board" role="tabpanel" aria-labelledby="depth-tab-board" className="grid min-w-0 gap-6">
          {board}
        </div>
      )}
    </div>
  );
}
