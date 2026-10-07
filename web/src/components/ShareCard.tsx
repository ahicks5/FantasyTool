"use client";
/**
 * The marketing asset: a 1080x1080 card rendered at full size and scaled to fit. It is
 * deliberately hard-coded to the dark room rather than following the viewer's theme: it gets
 * posted to Reddit and X, where it has to read the same for everyone. It mirrors
 * `verdict_card_html` in edge/graphics.py, which renders the PNG that actually travels.
 */

import { useEffect, useRef, useState } from "react";
import type { Acceptance, Player, TradeResult } from "@/lib/types";
import { signed } from "@/lib/format";
import { LINES, OFFICE } from "@/lib/vocab";
import { MARK_BOX, MARK_D } from "@/lib/mark";

const SIZE = 1080;
const TONE: Record<string, { ink: string; soft: string }> = {
  Accept: { ink: "#0b7a4b", soft: "#e4f2ea" },
  Reject: { ink: "#c02b23", soft: "#fbe9e7" },
  Counter: { ink: "#b57500", soft: "#fdf1d8" },
  Fair: { ink: "#1e4fd8", soft: "#e6ecfc" },
};
/** "Will they say yes?" in three steps, the same inks `edge/graphics.py` uses (W-033). */
const WILL: Record<Acceptance, { steps: number; ink: string }> = {
  Likely: { steps: 3, ink: "#22a468" },
  Maybe: { steps: 2, ink: "#f0b429" },
  Unlikely: { steps: 1, ink: "#e2554e" },
};

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
  // Each side's OWN printed figure (W-032): the card used to print ours negated as theirs.
  const mine = result.graphic.my_delta_ros;
  const theirs = result.graphic.their_delta_ros;
  const will = WILL[result.graphic.acceptance] ?? null;

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl border border-line shadow-[var(--shadow-card)]" style={{ height: SIZE * scale }}>
      <div
        className="absolute left-0 top-0 flex flex-col"
        style={{
          width: SIZE,
          height: SIZE,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          // The kit's stage, as `STAGE` in edge/graphics.py paints the PNG this previews.
          background:
            "radial-gradient(70% 55% at 50% -6%,rgba(224,160,64,.14),transparent 70%)," +
            "radial-gradient(38% 28% at 10% 2%,rgba(255,245,225,.2),transparent 72%)," +
            "radial-gradient(38% 28% at 90% 2%,rgba(255,245,225,.2),transparent 72%)," +
            "radial-gradient(120% 50% at 50% 112%,rgba(255,255,255,.06),transparent 60%),#050608",
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
          {OFFICE.card.eyebrow}
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
          <Side label={OFFICE.card.youGive} players={give} />
          <Side label={OFFICE.card.youGet} players={get} />
        </div>

        {/* One delta row, each side's own number: the same two figures the verdict box shows. */}
        <div className="flex" style={{ gap: 40, marginTop: 28, fontSize: 32, fontWeight: 900 }}>
          <span style={{ color: mine >= 0 ? "#22a468" : "#e2554e" }}>{OFFICE.card.yourLineup(signed(mine, 0))}</span>
          <span style={{ color: "rgba(247,246,243,0.55)" }}>{OFFICE.card.theirs(signed(theirs, 0))}</span>
        </div>

        <div style={{ marginTop: "auto" }}>
          <div className="flex items-baseline justify-between" style={{ fontSize: 30, fontWeight: 700 }}>
            <span>
              {will && (
                <>
                  {OFFICE.verdict.willThey} <span style={{ color: will.ink }}>{OFFICE.verdict.will[result.graphic.acceptance]}</span>
                </>
              )}
            </span>
            <span style={{ color: "rgba(247,246,243,0.5)", fontWeight: 500 }}>{result.graphic.style ?? ""}</span>
          </div>
          {will && (
            <div className="flex" style={{ marginTop: 14, gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ flex: 1, height: 18, borderRadius: 99, background: i < will.steps ? will.ink : "rgba(255,255,255,0.14)" }} />
              ))}
            </div>
          )}
          {/* The signature. Small, in the corner, where a maker's plate goes. */}
          <div
            className="flex items-center justify-between"
            style={{ marginTop: 34, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.12)" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 28, fontWeight: 800 }}>
              {/* The mark, inlined with its own gradient: a still image posted into a feed
                  cannot depend on the page's chrome token. Soft chrome, as on the kit. */}
              <svg width={Math.round((27 * MARK_BOX.w) / MARK_BOX.h)} height={27} viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.w} ${MARK_BOX.h}`} fill="url(#os-card-chrome)" fillRule="evenodd" aria-hidden>
                <defs>
                  <linearGradient id="os-card-chrome" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="0.34" stopColor="#f1f3f5" />
                    <stop offset="0.6" stopColor="#b9bec6" />
                    <stop offset="0.8" stopColor="#e8ebee" />
                    <stop offset="1" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
                <path d={MARK_D} />
              </svg>
              {/* Nameplate: upright and tracked out. `marginRight` cancels the sidebearing
                  the tracking adds after the final E, or the lamp floats off the word. */}
              <span style={{ letterSpacing: "0.08em", marginRight: "-0.08em", color: "#cdd2d9" }}>OWNER’S SUITE</span>
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 99, background: "#ff4d3a", marginLeft: 3 }} />
            </span>
            <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0.1em", whiteSpace: "nowrap", textTransform: "uppercase", color: "rgba(247,246,243,0.5)" }}>
              {LINES.taglineLong}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Side({ label, players }: { label: string; players: Player[] }) {
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
        {players.length === 0 && <li style={{ color: "rgba(247,246,243,0.5)", fontSize: 32 }}>{OFFICE.card.nothing}</li>}
      </ul>
    </div>
  );
}
