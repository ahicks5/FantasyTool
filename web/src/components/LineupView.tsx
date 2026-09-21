"use client";
/**
 * Lineup: is my starting lineup right for this week? Two piles, then the board.
 *
 * The page answers one question by splitting the week's calls into things nobody should
 * spend a second on (a man who will not play, an empty slot, a swap the projection has
 * settled) and things that need a decision (two men close enough that the projection alone
 * does not pick, with the reads that should tip it). The two are never blurred: the hero
 * states both counts on their own lines, and each pile has its own section.
 *
 * The head coach owns the tab. His notes sit top-left of the hero, and when the tab opens
 * fresh a stamp lands over the page with the two numbers and the faces involved, then
 * lifts so the eye travels up to the hero and down into the detail.
 *
 * Every number and every probability comes from the engine (`engine/lineup.settle`,
 * `engine/decisions.py`). Every word comes from `lib/vocab.ts`. This file draws.
 */

import { useEffect, useState } from "react";
import type { DecisionFactor, Lineup, LineupChange, LineupDecision, LineupHole, LineupSlot, Player } from "@/lib/types";
import { signed } from "@/lib/format";
import { LINEUP, SECTIONS } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { PlayerName, PlayerTarget } from "./Players";
import { IconArrowUp, IconCheck, IconChevron, IconNotes } from "./icons";
import { ConfidenceStamp, Countdown, CountUp, Eyebrow, H2, InjuryTag, LinkButton, OnAirLive, Stamp } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };

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
 * One line on the board: the slot, the man, the call, the number, and the reason for it.
 * The tap goes where a tap on a player should go: his page.
 */
function SlotRow({ s }: { s: LineupSlot }) {
  const body = (
    <>
      <span className="slug w-[26px] shrink-0 text-[10px] uppercase tracking-[0.06em] text-muted">{s.slot}</span>
      {s.player ? (
        <Avatar name={s.player.name} photo={s.player.photo} teamLogo={s.player.team_logo} size="sm" ring={RING[s.confidence]} />
      ) : (
        <Avatar name="?" size="sm" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold leading-tight">
          {s.player?.name ?? LINEUP.change.empty}
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
      {s.player && <IconChevron size={12} strokeWidth={2.6} className="shrink-0 text-muted" />}
    </>
  );
  return (
    <li className={`min-w-0 ${s.change ? "bg-start-soft" : ""}`}>
      {s.player ? (
        <PlayerTarget p={s.player} className="flex w-full min-w-0 items-center gap-2.5 px-4 py-2 text-left" face={false}>
          {body}
        </PlayerTarget>
      ) : (
        <span className="flex w-full min-w-0 items-center gap-2.5 px-4 py-2 text-left">{body}</span>
      )}
      {s.reason && <p className="line-clamp-2 px-4 pb-2 pl-[74px] text-[12px] leading-snug text-muted">{s.reason}</p>}
    </li>
  );
}

/** A required change: the benched name drops, the starter rises, and the tag says why nobody has to think. */
function Change({ c, animate, i }: { c: LineupChange; animate: boolean; i: number }) {
  return (
    <li className={`card border-sit/35 p-4 ${animate ? `print print-${Math.min(i + 1, 5)}` : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{c.slot}</Eyebrow>
        {c.forced ? (
          <Stamp ink="text-sit" size="md">{LINEUP.change.forced}</Stamp>
        ) : (
          <ConfidenceStamp value={c.confidence} />
        )}
      </div>
      <div className="mt-2.5 flex min-w-0 items-center gap-2.5">
        <span className="min-w-0 flex-1">
          <span className={`${animate ? "demote" : "opacity-55"} block truncate text-[13px] font-bold text-sit line-through decoration-2`}>
            {c.out ? <PlayerName p={c.out} /> : LINEUP.change.empty}
          </span>
          <span className={`${animate ? "promote" : ""} mt-0.5 flex items-center gap-1 text-[15px] font-black text-start`}>
            <IconArrowUp size={14} strokeWidth={3} />
            <PlayerName p={c.in} className="truncate" />
          </span>
        </span>
        <span className="display tnum shrink-0 text-[21px] text-start">{signed(c.gain)}</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">{c.reason}</p>
    </li>
  );
}

/** A slot the roster cannot fill: not a swap, a trip to the wire. */
function Hole({ h, animate, i }: { h: LineupHole; animate: boolean; i: number }) {
  return (
    <li className={`card border-sit/35 p-4 ${animate ? `print print-${Math.min(i + 1, 5)}` : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{h.slot}</Eyebrow>
        <Stamp ink="text-sit" size="md">{LINEUP.change.hole}</Stamp>
      </div>
      <div className="mt-2.5 text-[15px] font-black text-sit">{h.player ? <PlayerName p={h.player} /> : LINEUP.change.empty}</div>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">{h.reason}</p>
      <LinkButton href={SECTIONS.waivers.href} variant="secondary" size="sm" className="mt-3">
        {LINEUP.change.wire}
      </LinkButton>
    </li>
  );
}

function Man({ p, verb, side }: { p: Player; verb: string; side: "start" | "sit" }) {
  return (
    <div className={`decision-man decision-${side}`}>
      <span className="decision-verb">{verb}</span>
      <PlayerTarget p={p} face>
        <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="md" ring={side === "start" ? "start" : undefined} />
      </PlayerTarget>
      <span className="decision-man-name">
        <PlayerName p={p} className="truncate" />
        <InjuryTag status={p.injury_status} />
      </span>
      <span className="decision-man-meta tnum">
        {p.position} {p.nfl_team ?? ""} · {p.projected.toFixed(1)}
      </span>
    </div>
  );
}

function Factor({ f }: { f: DecisionFactor }) {
  const side = f.favors === "start" ? "factor-start" : f.favors === "sit" ? "factor-sit" : "";
  return (
    <li className={`factor ${side}`}>
      <span className="factor-dot" aria-hidden />
      <span className="factor-key">{LINEUP.factor[f.key]}</span>
      <span className="factor-line">{f.line}</span>
    </li>
  );
}

/** One close call: the two men, the engine's call, and the reads under it. */
function Decision({ d, animate, i }: { d: LineupDecision; animate: boolean; i: number }) {
  const status = d.change ? (d.tipped ? LINEUP.decision.tipped : LINEUP.decision.change) : LINEUP.decision.keep;
  return (
    <li className={`card decision ${d.change ? "border-start/35" : ""} ${animate ? `print print-${Math.min(i + 1, 5)}` : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{d.slot}</Eyebrow>
        <ConfidenceStamp value={d.confidence} />
      </div>
      <div className="decision-vs mt-3">
        <Man p={d.start} verb={LINEUP.decision.start} side="start" />
        <div className="decision-p tnum">
          {Math.round(d.p * 100)}%
          <small>{LINEUP.decision.odds}</small>
        </div>
        <Man p={d.sit} verb={LINEUP.decision.sit} side="sit" />
      </div>
      <p className="mt-3 text-[13px] leading-snug text-ink-2">{d.reason}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-wide">
        <span className={d.change ? "text-start" : "text-muted"}>{status}</span>
        <span className="text-muted">{LINEUP.decision.tilt(d.tilt)}</span>
      </div>
      <div className="mt-3 border-t border-line pt-2">
        <Eyebrow>{LINEUP.decision.reads}</Eyebrow>
        {d.game && <p className="decision-game mt-1">{d.game.line}</p>}
        {d.factors.length > 0 ? (
          <ul className="mt-1">
            {d.factors.map((f, j) => (
              <Factor key={j} f={f} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-muted">{LINEUP.decision.none}</p>
        )}
      </div>
    </li>
  );
}

/**
 * The stamp that lands when the tab opens: the two numbers and the faces, then it lifts.
 * Tap to dismiss early; it goes on its own after the CSS has run. Never under reduced
 * motion, where the CSS hides it and the timer clears it straight away.
 */
function Boom({ required, decisions, faces, onDone }: { required: number; decisions: number; faces: Player[]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  const words = required + decisions === 0 ? [LINEUP.stamp.clear] : [required > 0 && LINEUP.stamp.fix(required), decisions > 0 && LINEUP.stamp.decide(decisions)].filter(Boolean);
  return (
    <div className="boom" role="status" aria-label={LINEUP.stamp.aria} onClick={onDone} style={{ pointerEvents: "auto" }}>
      <div className="boom-card">
        <span className="coach-notes text-muted">
          <span className="coach-notes-pad">
            <IconNotes size={18} strokeWidth={2.2} />
          </span>
          {LINEUP.coach.notes}
        </span>
        <Stamp size="xl" ink={required > 0 ? "text-sit" : decisions > 0 ? "text-flip" : "text-start"} slam className="text-[30px]">
          {words.join(" · ")}
        </Stamp>
        {faces.length > 0 && (
          <>
            <span className="boom-then">{LINEUP.stamp.then}</span>
            <span className="boom-faces">
              {faces.map((p) => (
                <Avatar key={p.id} name={p.name} photo={p.photo} teamLogo={p.team_logo} size="md" />
              ))}
            </span>
          </>
        )}
      </div>
    </div>
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
  const required = lineup.required ?? [];
  const holes = lineup.holes ?? [];
  const decisions = lineup.decisions ?? [];
  const nRequired = lineup.summary?.required ?? required.length + holes.length;
  const nDecisions = lineup.summary?.decisions ?? decisions.length;
  const delta = lineup.projected_total - lineup.current_total;
  const set = nRequired + nDecisions === 0;

  // The stamp plays once, on a fresh arrival, and never in the report's compact embed.
  const [boom, setBoom] = useState(animate && !compact);
  const faces = [...required.map((c) => c.in), ...decisions.map((d) => d.start)]
    .filter((p): p is Player => !!p && "projected" in p)
    .slice(0, 6);

  return (
    <div className="grid min-w-0 gap-6">
      {boom && <Boom required={nRequired} decisions={nDecisions} faces={faces} onDone={() => setBoom(false)} />}

      <section className="hero callsheet">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <OnAirLive className="text-white/70" />
          <Countdown onHero />
        </div>
        <div className="p-5">
          {/* Top-left: the head coach's notes. The personality of the page, and who it is from. */}
          <span className="coach-notes" aria-label={LINEUP.coach.aria} role="img">
            <span className="coach-notes-pad" aria-hidden>
              <IconNotes size={18} strokeWidth={2.2} />
            </span>
            {LINEUP.coach.from}
          </span>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow>{LINEUP.projected(lineup.week)}</Eyebrow>
              <CountUp value={lineup.projected_total} animate={animate} className="display mt-1 text-[42px] leading-none text-white" />
            </div>
            <div className="shrink-0 text-right">
              {set ? (
                // Inked white: the hero is dark in both themes, where status green would vanish.
                <Stamp ink="text-white" slam={animate}>
                  <IconCheck size={12} strokeWidth={3.4} />
                  {LINEUP.clear}
                </Stamp>
              ) : (
                <>
                  <div className={`tnum display text-[19px] ${delta >= 0 ? "text-start" : "text-flip"}`}>{signed(delta)}</div>
                  <div className="text-[11px] text-white/55">
                    {LINEUP.vsCurrent} <span className="tnum">{lineup.current_total.toFixed(1)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          {/* The split, stated plainly. Two lines, two colours, two words: never one number. */}
          {!set && (
            <div className="lineup-split mt-4 text-white">
              <span className="lineup-split-line">
                <span className="lineup-split-dot bg-sit" aria-hidden />
                {LINEUP.required(nRequired)}
              </span>
              <span className="lineup-split-line">
                <span className="lineup-split-dot bg-flip" aria-hidden />
                {LINEUP.decisions(nDecisions)}
              </span>
            </div>
          )}
        </div>
      </section>

      {!compact && (
        <section className="min-w-0">
          <H2>{LINEUP.section.required}</H2>
          {nRequired === 0 ? (
            <p className="mt-2 text-[13px] text-muted">{LINEUP.requiredQuiet}</p>
          ) : (
            <ul className="mt-2.5 grid gap-2.5">
              {required.map((c, i) => (
                <Change key={`c${i}`} c={c} animate={animate} i={i} />
              ))}
              {holes.map((h, i) => (
                <Hole key={`h${i}`} h={h} animate={animate} i={required.length + i} />
              ))}
            </ul>
          )}
        </section>
      )}

      {!compact && (
        <section className="min-w-0">
          <H2>{LINEUP.section.decisions}</H2>
          {decisions.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">{LINEUP.decisionsQuiet}</p>
          ) : (
            <ul className="mt-2.5 grid gap-2.5">
              {decisions.map((d, i) => (
                <Decision key={`${d.start.id}:${d.sit.id}`} d={d} animate={animate} i={i} />
              ))}
            </ul>
          )}
        </section>
      )}

      {compact && lineup.changes.length > 0 && (
        <section className="min-w-0">
          <H2>{LINEUP.section.required}</H2>
          <ul className="mt-2.5 grid gap-2.5">
            {lineup.changes.map((c, i) => (
              <Change key={i} c={c} animate={animate} i={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0">
        <H2>{LINEUP.section.field}</H2>
        <ul className="card mt-2.5 min-w-0 divide-y divide-line overflow-hidden p-0">
          {lineup.slots.map((s, i) => (
            <SlotRow key={i} s={s} />
          ))}
        </ul>
      </section>

      {!compact && (
        <section className="min-w-0">
          <H2>{LINEUP.section.bench}</H2>
          <ul className="card mt-2.5 min-w-0 divide-y divide-line overflow-hidden p-0">
            {lineup.bench.map((b, i) => (
              <li key={i} className="flex min-w-0 items-center gap-2.5 px-4 py-2" title={b.reason}>
                <Avatar name={b.player.name} photo={b.player.photo} teamLogo={b.player.team_logo} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold leading-tight">
                    <PlayerName p={b.player} />
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
    </div>
  );
}
