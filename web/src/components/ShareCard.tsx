"use client";
import { useEffect, useRef, useState } from "react";
import type { Player, TradeResult } from "@/lib/types";
import { signed } from "@/lib/format";
import { LINES } from "@/lib/vocab";

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
  // The card is always dark, so the stamp takes the light step of the verdict colour.
  const stampInk = tone.ink === "#0e1116" ? "#ffffff" : tone.soft;
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
          background: "radial-gradient(120% 78% at 50% 0%,#23272f 0%,#08090b 62%)",
          color: "#f7f6f3",
          padding: 72,
          fontFamily: "var(--font-archivo), system-ui, sans-serif",
        }}
      >
        {/* The band: the lamp and the league, the same two things the call sheet puts at
            its top. The lockup used to open the card at 44px, which made the most-shared
            thing we own an advert for ourselves — it is a signature at the foot now. */}
        <div className="flex items-center justify-between" style={{ fontSize: 27 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontWeight: 900, letterSpacing: "0.18em", color: "rgba(247,246,243,0.62)" }}>
            {/* The lamp, drawn rather than animated: this is a still image. It never
                carries meaning alone, so the words ride beside it. */}
            <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 99, background: "#ff4d3a", boxShadow: "0 0 28px 5px rgba(255,77,58,0.5)" }} />
            ON AIR
          </span>
          <span style={{ color: "rgba(247,246,243,0.55)", fontWeight: 700, maxWidth: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {leagueName}
          </span>
        </div>

        <div style={{ marginTop: 44, fontSize: 26, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(247,246,243,0.45)", fontWeight: 700 }}>
          Penthouse&rsquo;s verdict
        </div>
        {/* The signature: the verdict is stamped, not typeset. Same device as the app. */}
        <div style={{ marginTop: 18, paddingLeft: 10 }}>
          <span
            style={{
              display: "inline-block",
              transform: "rotate(-3.5deg)",
              border: `11px solid ${stampInk}`,
              borderRadius: 22,
              padding: "14px 34px 20px",
              color: stampInk,
              fontSize: 132,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              opacity: 0.93,
              WebkitMaskImage: "repeating-linear-gradient(58deg, #000 0 38px, rgba(0,0,0,0.88) 38px 44px)",
              maskImage: "repeating-linear-gradient(58deg, #000 0 38px, rgba(0,0,0,0.88) 38px 44px)",
            }}
          >
            {result.verdict.toUpperCase()}
          </span>
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
          {/* The signature. Small, in the corner, where a maker's plate goes. */}
          <div
            className="flex items-center justify-between"
            style={{ marginTop: 34, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.12)" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 30, fontWeight: 800 }}>
              {/* The mark, inlined. A still image posted into a feed cannot depend on the
                  page's chrome gradient, so the silver is spelled out here. Same path as
                  `icon.svg`, `IconMark` and `MARK_PATH` in edge/graphics.py. */}
              <svg width={35} height={35} viewBox="0 0 24 24" fill="url(#ph-card-chrome)" fillRule="evenodd" aria-hidden>
                <defs>
                  <linearGradient id="ph-card-chrome" x1="0" y1="0" x2="0.08" y2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="0.38" stopColor="#9aa1ac" />
                    <stop offset="0.52" stopColor="#f2f4f7" />
                    <stop offset="0.7" stopColor="#7d858f" />
                    <stop offset="1" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
                <path d="M12 2.2C16.6 6.4 17.8 9.5 17.8 12c0 2.5-1.2 5.6-5.8 9.8C7.4 17.6 6.2 14.5 6.2 12c0-2.5 1.2-5.6 5.8-9.8ZM8.2 7.6h7.6v1.8H8.2Zm2 0h.8v1.8h-.8Zm2.8 0h.8v1.8H13Z" />
              </svg>
              {/* Nameplate: upright and tracked out. `marginRight` cancels the sidebearing
                  the tracking adds after the final E, or the lamp floats off the word. */}
              <span style={{ letterSpacing: "0.08em", marginRight: "-0.08em", color: "#cdd2d9" }}>PENTHOUSE</span>
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 99, background: "#ff4d3a", marginLeft: 3 }} />
            </span>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(247,246,243,0.45)" }}>
              {LINES.tagline}
            </span>
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
