"use client";
import { useEffect, useRef, useState } from "react";
import type { Confidence, LockCall, Player, TradeResult } from "@/lib/types";

const SIZE = 1080;

/* These mirror edge/graphics.py. The card is posted to Reddit, X and Discord, so it is fixed
   to one look for everyone regardless of their theme — and because it is rendered server-side
   for the real PNG, the two have to agree pixel for pixel. Change one, change both. */
const FLARE = "#d6f94a";
const VERDICT_COLORS: Record<string, string> = {
  Accept: "#22a468",
  Reject: "#e2554e",
  Counter: "#f0b429",
  Fair: "#5b8def",
};
const CONFIDENCE_COLORS: Record<Confidence, string> = {
  Lock: "#22a468",
  Lean: "#5b8def",
  "Coin flip": "#f0b429",
};
const CONFIDENCE_BARS: Record<Confidence, number> = { Lock: 3, Lean: 2, "Coin flip": 1 };
const DIM = "rgba(247,246,243,0.45)";

function firstSentence(text: string, limit = 96): string {
  const t = (text ?? "").trim();
  if (t.length <= limit) return t;
  let out = "";
  for (const part of t.split(/(?<=[.!?])\s+/)) {
    if (out.length + part.length + 1 > limit) break;
    out = `${out} ${part}`.trim();
  }
  return out || `${t.slice(0, limit - 1).replace(/\s\S*$/, "")}…`;
}

const minus = (s: string) => s.replace("-", "−");

/** The wordmark, with the meter that replaced the dot. */
function Mark({ filled = 3 }: { filled?: number }) {
  return (
    <span style={{ fontWeight: 900, fontSize: 44, letterSpacing: "-0.045em", display: "inline-flex", alignItems: "flex-end", gap: 8 }}>
      edge
      <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 4, paddingBottom: 9 }} aria-hidden>
        {[12, 19, 26].map((h, i) => (
          <span key={h} style={{ width: 7, height: h, borderRadius: 2, background: FLARE, opacity: i < filled ? 1 : 0.28 }} />
        ))}
      </span>
    </span>
  );
}

function Face({ photo, size = 56 }: { photo?: string | null; size?: number }) {
  const base = { width: size, height: size, borderRadius: 99, background: "rgba(255,255,255,0.1)", flexShrink: 0 } as const;
  // eslint-disable-next-line @next/next/no-img-element
  return photo ? <img src={photo} alt="" style={{ ...base, objectFit: "cover", objectPosition: "top" }} /> : <span style={base} />;
}

/**
 * The 1080x1080 chassis: rendered at full size and scaled to fit its column, with the flare
 * strip along the bottom. The strip is the only place the accent is allowed — it is what
 * makes a card recognisable as ours in a feed at 400px wide.
 */
function CardFrame({ children, strip }: { children: React.ReactNode; strip: string }) {
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
          fontFamily: "var(--font-archivo), system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div style={{ flex: "1 1 auto", minHeight: 0, padding: "76px 76px 0", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
        <div
          style={{
            height: 112,
            flex: "0 0 auto",
            background: FLARE,
            color: "#0e1116",
            display: "flex",
            alignItems: "center",
            gap: 30,
            padding: "0 76px",
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        >
          {strip}
        </div>
      </div>
    </div>
  );
}

function Context({ text, filled }: { text: string; filled?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Mark filled={filled} />
      <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DIM }}>{text}</span>
    </div>
  );
}

function context(leagueName: string, week?: number, suffix?: string): string {
  return [leagueName, week ? `Week ${week}` : "", suffix ?? ""].filter(Boolean).join(" · ");
}

/**
 * The trade verdict: one word, one number, and the deal in a line. Both roster boxes, the
 * second delta and the explanation paragraph moved to the /s/ page the card links to — seven
 * competing elements is unreadable at the size anyone actually sees this.
 */
export function ShareCard({
  result,
  give,
  get,
  leagueName,
  week,
}: {
  result: TradeResult;
  give: Player[];
  get: Player[];
  leagueName: string;
  week?: number;
}) {
  const colour = VERDICT_COLORS[result.verdict] ?? "#ffffff";
  const mine = result.graphic.my_delta_ros ?? 0;
  const mineColour = mine >= 0 ? VERDICT_COLORS.Accept : VERDICT_COLORS.Reject;
  const fair = Math.round(result.fairness * 100);
  const foot = [`Fairness ${fair}%`, result.graphic.style ?? ""].filter(Boolean).join(" · ");
  const more = (list: Player[]) => (list.length > 1 ? ` +${list.length - 1}` : "");

  return (
    <CardFrame strip="We grade every call. Win or lose.">
      <Context text={context(leagueName, week)} />

      <div style={{ marginTop: 58, fontSize: 27, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: DIM }}>
        Trade verdict
      </div>
      <div style={{ fontSize: 250, fontWeight: 900, letterSpacing: "-0.045em", lineHeight: 0.82, marginTop: 10, color: colour }}>
        {result.verdict.toUpperCase()}
      </div>

      {/* line-height .82 clips the box, not the glyphs: a descender needs real room under it. */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 26, marginTop: 66 }}>
        <span style={{ fontSize: 166, fontWeight: 900, letterSpacing: "-0.055em", lineHeight: 0.8, color: mineColour }}>
          {minus(`${mine >= 0 ? "+" : ""}${mine.toFixed(0)}`)}
        </span>
        <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(247,246,243,0.5)", lineHeight: 1.3, paddingBottom: 12 }}>
          Points of lineup
          <br />
          value, rest of season
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 46, fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em" }}>
        <Face photo={give[0]?.photo} />
        <span>
          {give[0]?.name ?? result.graphic.give[0] ?? ""}
          {more(give)}
        </span>
        <span style={{ color: FLARE, fontSize: 42 }}>&rarr;</span>
        <Face photo={get[0]?.photo} />
        <span style={{ color: "rgba(247,246,243,0.6)" }}>
          {get[0]?.name ?? result.graphic.get[0] ?? ""}
          {more(get)}
        </span>
      </div>

      <div style={{ marginTop: 30, fontSize: 30, lineHeight: 1.38, color: "rgba(247,246,243,0.78)" }}>
        {firstSentence(result.explanation)}
      </div>

      <div style={{ marginTop: "auto", paddingBottom: 42, fontSize: 27, color: DIM }}>{foot}</div>
    </CardFrame>
  );
}

/**
 * The start/sit card. Free to share, which is the entire point of it: a paying user posts a
 * handful of trade verdicts a season, and every user has one or three of these every week.
 */
export function LockShareCard({ call, leagueName, week }: { call: LockCall; leagueName: string; week?: number }) {
  const colour = CONFIDENCE_COLORS[call.confidence] ?? VERDICT_COLORS.Accept;
  const filled = CONFIDENCE_BARS[call.confidence] ?? 3;

  return (
    <CardFrame strip="Free. One league, every week.">
      <Context text={context(leagueName, week, "Start / sit")} filled={filled} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, marginTop: 50 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 9 }} aria-hidden>
            {[44, 68, 92].map((h, i) => (
              <span key={h} style={{ width: 26, height: h, borderRadius: 4, background: colour, opacity: i < filled ? 1 : 0.28 }} />
            ))}
          </span>
          <span style={{ fontSize: 112, fontWeight: 900, letterSpacing: "-0.045em", lineHeight: 0.82, color: colour }}>
            {call.confidence.toUpperCase()}
          </span>
        </span>
        {/* The face is the whole reason anyone stops on this in a feed. */}
        <Face photo={call.start.photo} size={152} />
      </div>

      <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: "-0.045em", lineHeight: 0.96, marginTop: 42 }}>
        Start
        <br />
        {call.start.name}
      </div>
      {call.bench && (
        <div style={{ fontSize: 42, fontWeight: 700, color: "rgba(247,246,243,0.55)", marginTop: 24, letterSpacing: "-0.02em" }}>
          over {call.bench.name}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 26, marginTop: 44 }}>
        <span style={{ fontSize: 126, fontWeight: 900, letterSpacing: "-0.055em", lineHeight: 0.8 }}>
          {minus(`${call.gain >= 0 ? "+" : ""}${call.gain.toFixed(1)}`)}
        </span>
        <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(247,246,243,0.5)", lineHeight: 1.3, paddingBottom: 12 }}>
          Projected points,
          <br />
          your scoring
        </span>
      </div>

      <div style={{ marginTop: "auto", paddingBottom: 42, fontSize: 27, color: DIM, lineHeight: 1.4 }}>{call.note}</div>
    </CardFrame>
  );
}
