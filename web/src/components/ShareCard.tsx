"use client";
import { useEffect, useRef, useState } from "react";
import type { Player, TradeResult } from "@/lib/types";
import { signed, verdictClass } from "@/lib/format";
import { Avatar } from "./Avatar";

const SIZE = 1080;
const BORDER: Record<string, string> = { Accept: "border-start", Reject: "border-sit", Counter: "border-flip", Fair: "border-lean" };

/**
 * The marketing asset: a 1080x1080 verdict card, rendered at full size and scaled to fit.
 */
export function ShareCard({ result, give, get, leagueName }: { result: TradeResult; give: Player[]; get: Player[]; leagueName: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / SIZE);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fair = Math.round(result.fairness * 100);
  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl border border-line shadow-[var(--shadow-card)]" style={{ height: SIZE * scale }}>
      <div
        className={`absolute left-0 top-0 flex flex-col border-[18px] bg-white text-ink ${BORDER[result.verdict] ?? "border-ink"}`}
        style={{ width: SIZE, height: SIZE, transform: `scale(${scale})`, transformOrigin: "top left", padding: 64 }}
      >
        <div className="flex items-center justify-between" style={{ fontSize: 32 }}>
          <span className="display font-black" style={{ fontSize: 44 }}>
            edge<span className="text-start">.</span>
          </span>
          <span className="truncate text-muted" style={{ maxWidth: 600 }}>
            {leagueName}
          </span>
        </div>

        <div className={`display mt-4 font-black uppercase leading-none tracking-tight ${verdictClass(result.verdict)}`} style={{ fontSize: 168 }}>
          {result.verdict}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8" style={{ fontSize: 40 }}>
          <Side label="You give" players={give} delta={result.graphic.my_delta_ros} />
          <Side label="You get" players={get} delta={result.graphic.their_delta_ros} deltaLabel="Their lineup" />
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline justify-between" style={{ fontSize: 34 }}>
            <span className="font-bold">Fairness {fair}%</span>
            <span className="text-muted">{result.graphic.style ?? ""}</span>
          </div>
          <div className="mt-3 w-full overflow-hidden rounded-full bg-soft" style={{ height: 24 }}>
            <div className={`h-full ${fair >= 90 ? "bg-start" : fair >= 75 ? "bg-flip" : "bg-sit"}`} style={{ width: `${fair}%` }} />
          </div>
          <div className="mt-8 text-muted" style={{ fontSize: 30 }}>
            Your league. This week&rsquo;s moves. · edge
          </div>
        </div>
      </div>
    </div>
  );
}

function Side({ label, players, delta, deltaLabel = "Your lineup" }: { label: string; players: Player[]; delta: number; deltaLabel?: string }) {
  return (
    <div className="rounded-3xl border-4 border-line p-7">
      <div className="font-bold uppercase tracking-widest text-muted" style={{ fontSize: 26 }}>
        {label}
      </div>
      <ul className="mt-4 grid gap-4">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-5">
            <span style={{ transform: "scale(1.9)", transformOrigin: "left center", width: 96, display: "inline-block" }}>
              <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="md" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-extrabold" style={{ fontSize: 44, lineHeight: 1.1 }}>
                {p.name}
              </span>
              <span className="block text-muted" style={{ fontSize: 28 }}>
                {p.position} · {p.nfl_team}
              </span>
            </span>
          </li>
        ))}
        {players.length === 0 && <li className="text-muted">Nothing</li>}
      </ul>
      <div className={`mt-6 font-black tabular-nums ${delta >= 0 ? "text-start" : "text-sit"}`} style={{ fontSize: 40 }}>
        {deltaLabel} {signed(delta, 0)} ROS
      </div>
    </div>
  );
}
