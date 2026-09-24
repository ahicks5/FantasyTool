"use client";
/**
 * The projector: the film's opening (SPEC-FILM F-9).
 *
 * The room goes dark, a film leader counts down 3, 2, 1 with a sweep round the circle, the
 * picture flickers to white, and the week's result comes up on the screen: the stamp, the
 * score, the opponent and the cover line. Then the room gives way to the page. Every beat
 * is `lib/projector.ts`'s; the result is the cover the page already fetched, so nothing
 * here waits on the network.
 *
 * Once per graded week per browser, never over the day's first ride, a tap anywhere skips
 * it, and under reduced motion the countdown and the flicker are left out: the result shows
 * and fades. `?film=1` replays it; `?ride=1` resets it with the other openings.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { advance, dayStamp } from "@/lib/elevator";
import { LAND_MS, countNumber, projectorDue, projectorForced, projectorPhase, sweep, type ProjectorPhase } from "@/lib/projector";
import { filmKey, loadFilmSeen, loadRideDay, saveFilmSeen } from "@/lib/storage";
import type { FilmCover } from "@/lib/types";
import { FILM } from "@/lib/vocab";
import { narratedFloorPassed } from "@/lib/wait";

export function Projector({ cover, leagueId, season, week }: { cover: FilmCover; leagueId: string; season: number; week: number }) {
  const [play, setPlay] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [phase, setPhase] = useState<ProjectorPhase>("count");
  const [n, setN] = useState(3);
  const [turn, setTurn] = useState(0);
  const elapsed = useRef(0);
  const last = useRef<number | null>(null);
  const skippedAt = useRef<number | null>(null);

  // Decided after every layout effect, like the call: a ride claimed by this load keeps the
  // floor and the projector waits for the next visit.
  useEffect(() => {
    const key = filmKey(leagueId, season, week);
    const due =
      narratedFloorPassed() &&
      projectorDue({ seen: loadFilmSeen(key), forced: projectorForced(window.location.search), rideDay: loadRideDay(), today: dayStamp(new Date()) });
    if (!due) return;
    saveFilmSeen(key);
    const r = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* eslint-disable react-hooks/set-state-in-effect -- decided once, on mount, from storage the server cannot read */
    setReduced(r);
    setPhase(r ? "show" : "count");
    setPlay(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [leagueId, season, week]);

  useLayoutEffect(() => {
    if (!play) return;
    let raf = 0;
    const frame = (now: number) => {
      if (last.current !== null) elapsed.current = advance(elapsed.current, now - last.current);
      last.current = now;
      const next = projectorPhase(elapsed.current, reduced, skippedAt.current);
      setPhase((prev) => (prev === next ? prev : next));
      const c = countNumber(elapsed.current);
      setN((prev) => (prev === c ? prev : c));
      setTurn(Math.round(sweep(elapsed.current) * 360));
      if (next === "done") {
        setPlay(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [play, reduced]);

  if (!play) return null;

  function skip() {
    if (skippedAt.current === null) skippedAt.current = elapsed.current;
  }

  const ink = cover.result === "W" ? "proj-win" : cover.result === "L" ? "proj-loss" : "";
  return (
    <div
      className="proj"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label={FILM.projector.aria}
      onClick={skip}
      style={{ ["--proj-land" as string]: `${LAND_MS}ms` }}
    >
      {phase === "count" && (
        <div className="proj-leader" aria-hidden>
          <span className="proj-sweep" style={{ ["--turn" as string]: `${turn}deg` }} />
          <span className="proj-cross" />
          <span className="proj-num">{n}</span>
        </div>
      )}
      {(phase === "show" || phase === "land") && (
        <div className="proj-screen">
          <p className="proj-eyebrow">
            {FILM.eyebrow} · {FILM.week(week)}
          </p>
          {cover.result && <p className={`proj-result ${ink}`}>{FILM.result[cover.result]}</p>}
          <p className="proj-score tnum">{FILM.score(cover.my_points, cover.their_points)}</p>
          <p className="proj-opp">{cover.opponent ? FILM.vs(cover.opponent) : FILM.bye}</p>
          {cover.line && <p className="proj-line">{cover.line}</p>}
        </div>
      )}
      <p className="proj-hint">{FILM.projector.skip}</p>
    </div>
  );
}
