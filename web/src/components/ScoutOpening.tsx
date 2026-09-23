"use client";
/**
 * The scout takes his seat: the first time Scouting opens, you are in the stands.
 *
 * A night game from Section 212: the light towers up, the field below you in perspective,
 * eleven on eleven running a play. The glasses come up and close on one man, a red ring
 * goes round him — marked — and the camera drops to the notepad on your lap, where the
 * head of scouting's three names write themselves in and the first gets its stamp. The pad
 * lifts and the page is underneath.
 *
 * Every number is `lib/scout.ts`'s; the CSS reads the phase off `data-phase` and the
 * durations off custom properties. The names are the wire's, read from the session cache
 * the page is filling underneath, polled in the frame loop; grey rules stand in until they
 * land, and stay for a reader Wire Pass has not opened. Dark in both themes, like the ride.
 *
 * Plays once per browser (`booth.scout`), never over the day's first ride (it waits for the
 * next visit), never under reduced motion. `?scout=1` replays it. A tap lands it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cacheGet } from "@/lib/cache";
import { advance, dayStamp } from "@/lib/elevator";
import {
  DROP_MS,
  FOCUS_MS,
  LAND_AT,
  LAND_MS,
  LINE_MS,
  NOTES_AT,
  STANDS_MS,
  lineDelay,
  scoutDue,
  scoutForced,
  scoutPhase,
  type ScoutPhase,
} from "@/lib/scout";
import { loadRideDay, loadScoutSeen, saveScoutSeen, type Connection } from "@/lib/storage";
import type { Waivers } from "@/lib/types";
import { SCOUT_OPEN, WIRE } from "@/lib/vocab";
import { narratedFloorPassed } from "@/lib/wait";
import { urgency, wireKey } from "@/lib/wire";
import { IconMark } from "./icons";

/** Where each man lines up, as a share of the field plane (x across, y away from you),
 *  and where his route takes him. Offense in white, defense in steel. The target is the
 *  back who slips out of the backfield: the one the glasses find. */
const MEN: { x: number; y: number; dx: number; dy: number; side: "o" | "d"; target?: boolean }[] = [
  // offense: line, QB, back, receivers
  { x: 47, y: 50, dx: 0, dy: -1, side: "o" }, { x: 44, y: 44, dx: 0, dy: -1, side: "o" }, { x: 44, y: 56, dx: 0, dy: 1, side: "o" },
  { x: 44, y: 38, dx: 1, dy: 0, side: "o" }, { x: 44, y: 62, dx: 1, dy: 0, side: "o" },
  { x: 38, y: 50, dx: -4, dy: 0, side: "o" },
  { x: 34, y: 54, dx: 22, dy: 10, side: "o", target: true },
  { x: 44, y: 16, dx: 26, dy: 4, side: "o" }, { x: 44, y: 84, dx: 22, dy: -12, side: "o" }, { x: 43, y: 72, dx: 16, dy: -20, side: "o" },
  { x: 44, y: 28, dx: 12, dy: 18, side: "o" },
  // defense
  { x: 51, y: 42, dx: -4, dy: 2, side: "d" }, { x: 51, y: 50, dx: -5, dy: 0, side: "d" }, { x: 51, y: 58, dx: -4, dy: -2, side: "d" },
  { x: 51, y: 34, dx: -3, dy: 4, side: "d" }, { x: 57, y: 46, dx: 4, dy: 6, side: "d" }, { x: 57, y: 60, dx: 6, dy: 4, side: "d" },
  { x: 56, y: 18, dx: 14, dy: 2, side: "d" }, { x: 56, y: 82, dx: 12, dy: -6, side: "d" }, { x: 66, y: 40, dx: 6, dy: 10, side: "d" },
  { x: 66, y: 64, dx: -2, dy: -4, side: "d" }, { x: 60, y: 70, dx: 4, dy: -14, side: "d" },
];

function Stands({ targetRef, at }: { targetRef: React.RefObject<HTMLSpanElement | null>; at: { x: number; y: number } | null }) {
  return (
    <div className="scout-world" aria-hidden>
      <div className="scout-sky" />
      {[6, 28, 72, 94].map((x, i) => (
        <span key={x} className={`scout-tower scout-tower-${i}`} style={{ left: `${x}%` }}>
          <span className="scout-tower-lamps" />
        </span>
      ))}
      <div className="scout-bowl" />
      <div className="scout-field-wrap">
        <div className="scout-field">
          <span className="scout-los" />
          {MEN.map((m, i) => (
            <span
              key={i}
              ref={m.target ? targetRef : undefined}
              className={`scout-man scout-man-${m.side} ${m.target ? "scout-man-target" : ""}`}
              style={{ left: `${m.x}%`, top: `${m.y}%`, ["--dx" as string]: `${m.dx * 4}px`, ["--dy" as string]: `${m.dy * 4}px` }}
            />
          ))}
        </div>
      </div>
      {/* The mark, drawn in screen space over wherever the back finished his route, so the
          ring is round rather than laid flat on the turf. */}
      {at && (
        <svg className="scout-ring" viewBox="0 0 40 40" style={{ left: at.x, top: at.y }}>
          <circle cx="20" cy="20" r="16" pathLength={100} />
        </svg>
      )}
      <div className="scout-crowd">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="scout-head" style={{ left: `${i * 7.4 - 2}%`, ["--h" as string]: `${38 + ((i * 37) % 22)}px`, ["--b" as string]: `${(i % 4) * 0.35}s` }} />
        ))}
      </div>
    </div>
  );
}

/** The pad on your lap. Three lines, written one after the other. */
function Pad({ waivers, week }: { waivers: Waivers | undefined; week: number | null }) {
  const picks = waivers?.picks.slice(0, 3) ?? [];
  return (
    <div className="scout-pad" aria-hidden>
      <div className="scout-pad-rings" />
      <div className="scout-pad-head">
        <IconMark size={12} className="scout-pad-mark" />
        <span>{SCOUT_OPEN.pad}</span>
        {week != null && <span className="scout-pad-week">{SCOUT_OPEN.week(week)}</span>}
      </div>
      <ol className="scout-pad-lines">
        {[0, 1, 2].map((i) => {
          const p = picks[i];
          const u = p ? urgency(p, i + 1) : null;
          return (
            <li key={i} className="scout-line" style={{ ["--d" as string]: `${lineDelay(i)}ms` }}>
              <span className="scout-line-n">{i + 1}.</span>
              {p ? (
                <span className="scout-line-ink">
                  <span className="scout-line-name">{p.player.name}</span>
                  <span className="scout-line-pos">
                    {p.player.position} · {p.player.nfl_team ?? "FA"}
                  </span>
                  {u === "must" && (
                    <span className="scout-line-must">
                      {WIRE.urgency.must}
                      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                        <ellipse cx="50" cy="20" rx="47" ry="16" pathLength={100} />
                      </svg>
                    </span>
                  )}
                </span>
              ) : (
                <span className="scout-line-ink scout-line-rule" />
              )}
            </li>
          );
        })}
      </ol>
      <span className="scout-pen" />
    </div>
  );
}

export function ScoutOpening({ c }: { c: Connection }) {
  const [play, setPlay] = useState(false);
  const [phase, setPhase] = useState<ScoutPhase>("stands");
  const key = wireKey(c.platform, c.league_id, c.team_id);
  const [waivers, setWaivers] = useState<Waivers | undefined>(() => cacheGet<Waivers>(key));
  const elapsed = useRef(0);
  const last = useRef<number | null>(null);
  const skipped = useRef(false);
  const targetRef = useRef<HTMLSpanElement | null>(null);
  // Where the marked back finished his route, in screen pixels: the glasses centre on it.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  // Decided after every layout effect has run, so a ride claimed by this same page (the
  // day's first open landing here) has already started its floor, and the scout yields.
  useEffect(() => {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const forced = scoutForced(window.location.search);
    const riding = !narratedFloorPassed();
    const due = !riding && scoutDue({ seen: loadScoutSeen(), forced, rideDay: loadRideDay(), today: dayStamp(new Date()), reduced });
    if (!due) return;
    saveScoutSeen();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided once, on mount, from storage the server cannot read
    setPlay(true);
  }, []);

  useLayoutEffect(() => {
    if (!play) return;
    let raf = 0;
    const frame = (now: number) => {
      if (last.current !== null) elapsed.current = advance(elapsed.current, now - last.current);
      last.current = now;
      const next = scoutPhase(elapsed.current, skipped.current);
      setPhase((prev) => (prev === next ? prev : next));
      if (next !== "stands" && targetRef.current) {
        const r = targetRef.current.getBoundingClientRect();
        const point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        setAt((prev) => prev ?? point);
      }
      setWaivers((prev) => prev ?? cacheGet<Waivers>(key));
      if (next === "done") {
        setPlay(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [play, key]);

  if (!play) return null;

  function skip() {
    if (skipped.current) return;
    skipped.current = true;
    elapsed.current = Math.max(elapsed.current, LAND_AT);
  }

  return (
    <div
      className="scout"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label={SCOUT_OPEN.aria}
      onClick={skip}
      style={{
        ["--scout-stands" as string]: `${STANDS_MS}ms`,
        ["--scout-focus" as string]: `${FOCUS_MS}ms`,
        ["--scout-drop" as string]: `${DROP_MS}ms`,
        ["--scout-land" as string]: `${LAND_MS}ms`,
        ["--scout-line" as string]: `${LINE_MS}ms`,
        ["--scout-notes-at" as string]: `${NOTES_AT}ms`,
        ["--tx" as string]: at ? `${at.x}px` : "50%",
        ["--ty" as string]: at ? `${at.y}px` : "60%",
      }}
    >
      <Stands targetRef={targetRef} at={at} />
      <div className="scout-glass" aria-hidden />
      <Pad waivers={waivers} week={waivers?.week ?? null} />
      <div className="scout-hud">
        <span className="scout-hud-eyebrow">{SCOUT_OPEN.eyebrow}</span>
        <span className="scout-hud-seat">{SCOUT_OPEN.seat}</span>
      </div>
      <button type="button" className="scout-skip" onClick={skip}>
        {SCOUT_OPEN.skip}
      </button>
    </div>
  );
}
