"use client";
/** Two reads on the same team: this week's board, and how the roster grades out. */

import { useState } from "react";
import type { Lineup, LineupSlot } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { GameDay } from "./GameDay";
import { Scorecard } from "./Scorecard";
import { IconArrowUp, IconCheck, IconChevron } from "./icons";
import { ConfidenceStamp, Countdown, CountUp, Eyebrow, H2, InjuryTag, OnAirLive, Stamp } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };

type View = "board" | "scorecard";
const VIEWS: View[] = ["board", "scorecard"];
const VIEW_LABEL: Record<View, string> = { board: "The board", scorecard: "Scorecard" };

/** Short enough to sit inline beside a name. "Coin flip" is two words and never fitted. */
const SHORT: Record<string, string> = { Lock: "Lock", Lean: "Lean", "Coin flip": "Flip" };
const INK: Record<string, string> = { Lock: "text-start", Lean: "text-lean", "Coin flip": "text-flip" };

/** The three-bar meter at row scale. Always shipped with its word — never bars alone. */
function Bars({ value }: { value: string }) {
  const filled = value === "Lock" ? 3 : value === "Lean" ? 2 : 1;
  return (
    <span className="flex items-center gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-[8px] w-[2px] rounded-[1px] ${i < filled ? "bg-current" : "bg-current opacity-25"}`} />
      ))}
    </span>
  );
}

/**
 * One line on the board. It used to take two: the player on top, then the confidence tag and
 * a "Why?" link underneath, which made a nine-man lineup scroll like a document. Now the row
 * is a single line and tapping it opens the reasoning — tight to scan, evidence on demand.
 */
function SlotRow({ s, hit }: { s: LineupSlot; hit?: number }) {
  const [open, setOpen] = useState(false);
  const why = [
    s.reason,
    hit !== undefined ? `${s.confidence}: margins this size were right about ${Math.round(hit * 100)}% of the time last week.` : "",
  ].filter(Boolean);

  return (
    <li className={`min-w-0 ${s.change ? "bg-start-soft" : ""}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2.5 px-4 py-2 text-left"
      >
        <span className="slug w-[26px] shrink-0 text-[10px] uppercase tracking-[0.06em] text-muted">{s.slot}</span>
        {s.player ? (
          <Avatar name={s.player.name} photo={s.player.photo} teamLogo={s.player.team_logo} size="sm" ring={RING[s.confidence]} />
        ) : (
          <Avatar name="?" size="sm" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold leading-tight">
            {s.player?.name ?? "Empty"}
            <InjuryTag status={s.player?.injury_status ?? null} />
          </span>
          <span className={`mt-px flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${INK[s.confidence]}`}>
            <Bars value={s.confidence} />
            {SHORT[s.confidence] ?? s.confidence}
            <span className="text-muted">
              · {s.player?.position ?? "—"} {s.player?.nfl_team ?? ""}
            </span>
          </span>
        </span>
        <span className="display tnum shrink-0 text-[19px] leading-none">{(s.player?.projected ?? 0).toFixed(1)}</span>
        <IconChevron size={12} strokeWidth={2.6} className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && why.length > 0 && (
        <ul className="grid gap-1 px-4 pb-2.5 pl-[74px] text-[12px] leading-relaxed text-ink-2">
          {why.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
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
  const set = delta <= 0.05;

  const grades = lineup.grades;
  const [view, setView] = useState<View>("board");
  /* A cached page paints without replaying its opening, but asking for a view you have
     not seen yet is a deliberate arrival, so that one still gets its entry.

     Seen once, and only once: `flipped` used to latch true on the first tap and stay
     true, so every later return to a panel replayed its whole entry animation — the
     scorecard re-dealt its tiles each time you glanced at the board and came back. */
  const [seen, setSeen] = useState<View[]>(() => (animate ? [] : ["board"]));
  const entry = (v: View) => (animate && v === "board") || !seen.includes(v);
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
            <CountUp
              value={lineup.projected_total}
              animate={animate}
              className="display mt-1 text-[42px] leading-none text-white"
            />
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
          <H2>{lineup.changes.length === 1 ? "One swap" : `${lineup.changes.length} swaps`}</H2>
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
              <li key={i} className="flex min-w-0 items-center gap-2.5 px-4 py-2" title={b.reason}>
                <Avatar name={b.player.name} photo={b.player.photo} teamLogo={b.player.team_logo} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold leading-tight">
                    {b.player.name}
                    <InjuryTag status={b.player.injury_status} />
                  </span>
                  <span className="mt-px block truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {b.player.position} {b.player.nfl_team ?? ""}
                  </span>
                </span>
                <span className="display tnum shrink-0 text-[17px] text-muted">{b.player.projected.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  /* The game-day read sits above everything, including the view toggle: "am I good for
     Sunday, did anyone just get hurt" is the question the tab is opened with, and it is
     true of the scorecard view as much as of the board. It is suppressed in the report's
     compact embed on the same terms as the toggle — the film is a written summary and
     has no business growing three collapsible controls inside it. */
  const gameDayRows = !compact && <GameDay lineup={lineup} animate={animate} />;

  if (!toggle || !grades) {
    return (
      <div className="grid min-w-0 gap-6">
        {gameDayRows}
        {board}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-6">
      {gameDayRows}
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
              setSeen((prev) => (prev.includes(view) ? prev : [...prev, view]));
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
          <Scorecard grades={grades} week={lineup.week} animate={entry("scorecard")} />
        </div>
      ) : (
        <div id="depth-panel-board" role="tabpanel" aria-labelledby="depth-tab-board" className="grid min-w-0 gap-6">
          {board}
        </div>
      )}
    </div>
  );
}
