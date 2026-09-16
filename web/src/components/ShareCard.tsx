"use client";
import { useEffect, useRef, useState } from "react";
import type { Player, TradeResult } from "@/lib/types";
import { verdictClass } from "@/lib/format";

const SIZE = 1080;

/**
 * The marketing asset: a 1080x1080 square verdict card, rendered at full size
 * and scaled down with a CSS transform to fit its container.
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
    <div ref={wrap} className="relative w-full overflow-hidden rounded-xl border border-line" style={{ height: SIZE * scale }}>
      <div
        className="absolute left-0 top-0 flex flex-col bg-white text-ink"
        style={{ width: SIZE, height: SIZE, transform: `scale(${scale})`, transformOrigin: "top left", padding: 72 }}
      >
        <div className="flex items-center justify-between" style={{ fontSize: 34 }}>
          <span className="font-bold uppercase tracking-widest text-muted">Trade verdict</span>
          <span className="truncate text-muted" style={{ maxWidth: 600 }}>
            {leagueName}
          </span>
        </div>

        <div className={`mt-6 font-black uppercase leading-none tracking-tight ${verdictClass(result.verdict)}`} style={{ fontSize: 200 }}>
          {result.verdict}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8" style={{ fontSize: 40 }}>
          <Side label="Give" players={give} value={result.me.value_out} color="text-sit" />
          <Side label="Get" players={get} value={result.me.value_in} color="text-start" />
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline justify-between" style={{ fontSize: 36 }}>
            <span className="font-bold">Fairness {fair}%</span>
            <span className="text-muted">{result.graphic.lines[3] ?? ""}</span>
          </div>
          <div className="mt-3 w-full overflow-hidden rounded-full bg-soft" style={{ height: 28 }}>
            <div className="h-full bg-start" style={{ width: `${fair}%` }} />
          </div>
          <div className="mt-10 flex items-end justify-between">
            <span className="font-black tracking-tight" style={{ fontSize: 96, lineHeight: 1 }}>
              edge<span className="text-start">.</span>
            </span>
            <span className="text-muted" style={{ fontSize: 32 }}>
              Your league. This week&rsquo;s moves.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Side({ label, players, value, color }: { label: string; players: Player[]; value: number; color: string }) {
  return (
    <div className="rounded-3xl border-4 border-line p-8">
      <div className={`font-black uppercase ${color}`} style={{ fontSize: 32 }}>
        {label}
      </div>
      <ul className="mt-3 grid gap-2">
        {players.map((p) => (
          <li key={p.id} style={{ lineHeight: 1.1 }}>
            <span className="block truncate font-bold" style={{ fontSize: 42 }}>
              {p.name}
            </span>
            <span className="block text-muted" style={{ fontSize: 28 }}>
              {p.position} · {p.nfl_team}
            </span>
          </li>
        ))}
        {players.length === 0 && <li className="text-muted">Nothing</li>}
      </ul>
      <div className="mt-4 font-black tabular-nums" style={{ fontSize: 56 }}>
        {value.toFixed(1)}
        <span className="ml-2 font-normal text-muted" style={{ fontSize: 28 }}>
          ROS value
        </span>
      </div>
    </div>
  );
}
