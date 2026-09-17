"use client";
import { useEffect, useRef, useState } from "react";
import type { Player, TradeResult } from "@/lib/types";
import { signed } from "@/lib/format";

const SIZE = 1080;
const TONE: Record<string, { ink: string; soft: string }> = {
  Accept: { ink: "#0b7a4b", soft: "#e4f2ea" },
  Reject: { ink: "#c02b23", soft: "#fbe9e7" },
  Counter: { ink: "#b57500", soft: "#fdf1d8" },
  Fair: { ink: "#1e4fd8", soft: "#e6ecfc" },
};

/**
 * The marketing asset: a 1080x1080 card rendered at full size and scaled to fit. It is
 * deliberately hard-coded to the light palette — it gets posted to Reddit and X, where it has
 * to read the same for everyone regardless of their theme.
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

  const tone = TONE[result.verdict] ?? { ink: "#0e1116", soft: "#f1efea" };
  const fair = Math.round(result.fairness * 100);

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl border border-line shadow-[var(--shadow-card)]" style={{ height: SIZE * scale }}>
      <div
        className="absolute left-0 top-0 flex flex-col"
        style={{
          width: SIZE,
          height: SIZE,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: "#0e1116",
          color: "#f7f6f3",
          padding: 72,
          fontFamily: "var(--font-archivo), system-ui, sans-serif",
        }}
      >
        <div className="flex items-center justify-between" style={{ fontSize: 30 }}>
          <span style={{ fontWeight: 900, fontSize: 46, letterSpacing: "-0.045em" }}>
            edge
            <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 99, background: "#22a468", marginLeft: 4 }} />
          </span>
          <span style={{ color: "rgba(247,246,243,0.5)", maxWidth: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {leagueName}
          </span>
        </div>

        <div style={{ marginTop: 44, fontSize: 26, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(247,246,243,0.45)", fontWeight: 700 }}>
          Trade verdict
        </div>
        <div style={{ fontSize: 176, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 0.92, color: tone.ink === "#0e1116" ? "#ffffff" : tone.soft, marginTop: 6 }}>
          {result.verdict.toUpperCase()}
        </div>

        <div className="grid grid-cols-2" style={{ gap: 28, marginTop: 44 }}>
          <Side label="Gives up" players={give} delta={result.graphic.my_delta_ros} deltaLabel="Their lineup" flip />
          <Side label="Gets back" players={get} delta={result.graphic.my_delta_ros} deltaLabel="Your lineup" />
        </div>

        <div style={{ marginTop: "auto" }}>
          <div className="flex items-baseline justify-between" style={{ fontSize: 30, fontWeight: 700 }}>
            <span>Fairness {fair}%</span>
            <span style={{ color: "rgba(247,246,243,0.5)", fontWeight: 500 }}>{result.graphic.style ?? ""}</span>
          </div>
          <div style={{ marginTop: 14, height: 18, borderRadius: 99, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
            <div style={{ width: `${fair}%`, height: "100%", borderRadius: 99, background: fair >= 90 ? "#22a468" : fair >= 75 ? "#f0b429" : "#e2554e" }} />
          </div>
          <div style={{ marginTop: 34, fontSize: 28, color: "rgba(247,246,243,0.45)" }}>
            Your league. This week&rsquo;s moves.
          </div>
        </div>
      </div>
    </div>
  );
}

function Side({ label, players, delta, deltaLabel, flip = false }: { label: string; players: Player[]; delta: number; deltaLabel: string; flip?: boolean }) {
  const shown = flip ? -delta : delta;
  return (
    <div style={{ borderRadius: 28, background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.1)", padding: 28 }}>
      <div style={{ fontSize: 24, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(247,246,243,0.45)", fontWeight: 700 }}>{label}</div>
      <ul style={{ marginTop: 18, display: "grid", gap: 18 }}>
        {players.map((p) => (
          <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {p.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo} alt="" width={84} height={84} style={{ borderRadius: 99, objectFit: "cover", objectPosition: "top", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            ) : (
              <span style={{ width: 84, height: 84, borderRadius: 99, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            )}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 40, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{p.name}</span>
              <span style={{ display: "block", fontSize: 25, color: "rgba(247,246,243,0.5)", marginTop: 2 }}>
                {p.position} · {p.nfl_team}
              </span>
            </span>
          </li>
        ))}
        {players.length === 0 && <li style={{ color: "rgba(247,246,243,0.5)", fontSize: 32 }}>Nothing</li>}
      </ul>
      <div style={{ marginTop: 24, fontSize: 32, fontWeight: 900, color: shown >= 0 ? "#22a468" : "#e2554e" }}>
        {deltaLabel} {signed(shown, 0)} ROS
      </div>
    </div>
  );
}
