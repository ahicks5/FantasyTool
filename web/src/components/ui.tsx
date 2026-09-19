"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { Confidence, Verdict } from "@/lib/types";
import {
  confidenceClass,
  confidenceInk,
  countdown,
  COUNTDOWN_CH,
  kickoffUrgency,
  nextKickoff,
  reservedWidth,
  URGENCY_LABEL,
  verdictClass,
} from "@/lib/format";
import { claimWait, narratedFloorPassed, releaseWait, subscribeWaits, type WaitPhase } from "@/lib/wait";
import { IconCheck, IconChevron, IconClock, IconCrown, IconMoon, IconSun, IconThumbDown, IconThumbUp } from "./icons";

export function Card({
  children,
  className = "",
  tone = "paper",
  ...rest
}: { children: React.ReactNode; className?: string; tone?: "paper" | "hero" } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`${tone === "hero" ? "hero" : "card"} p-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`display text-[19px] ${className}`}>{children}</h2>;
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

/**
 * PENTHOUSE. The crown, the word cut in chrome and leaning forward, and the ON
 * AIR lamp as the terminal. `lamp={false}` for surfaces where the pulse would be
 * noise — a footer, a print card.
 *
 * Only the letters skew: the crown and the lamp stay square, or the lamp turns
 * into an ellipse. The crown sits beside the word rather than above it the way
 * the app icon stacks them, because stacked marks do not survive a 56px header.
 */
export function Wordmark({
  className = "",
  lamp = true,
  markOnlyOnTiny = false,
}: {
  className?: string;
  lamp?: boolean;
  /**
   * Drop the word below 360px and keep the crown. Only the top bar asks for this:
   * "PENTHOUSE" is half again as wide as the old wordmark, and on a 320px phone it
   * left the league label about 14px — enough to render "The Megalabowl" as "T".
   * The crown alone is still the mark, and the link keeps its aria-label.
   */
  markOnlyOnTiny?: boolean;
}) {
  return (
    <span className={`display inline-flex items-center gap-[0.22em] ${markOnlyOnTiny ? "wordmark-mark-only" : ""} ${className}`} style={{ fontWeight: 900 }}>
      {/* The crown takes the flat `metal` colour: background-clip:text clips to an
          element's own glyphs, and a seven-stop gradient would not read inside a
          20px silhouette anyway. */}
      <IconCrown size="0.92em" className="shrink-0 -translate-y-[0.04em] text-metal" />
      {/* `chrome-type` sits on the span that actually holds the letters. On the
          wrapper it paints nothing — the clip has no glyphs of its own to clip to —
          while the transparent text fill still inherits down, which renders the
          wordmark invisible. */}
      <span className="wordmark-type chrome-type">PENTHOUSE</span>
      {lamp && <span className="lamp ml-[0.1em]" aria-hidden />}
    </span>
  );
}

/** The lamp plus the words. The red never carries meaning on its own. */
export function OnAir({ className = "", label = "On air" }: { className?: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}>
      <span className="lamp" aria-hidden />
      {label}
    </span>
  );
}

/**
 * The ON AIR chip on a live call sheet. Inside the last two hours the lamp beats
 * faster and the words change with it, so the tempo is never the only cue.
 */
export function OnAirLive({ className = "" }: { className?: string }) {
  const band = useKickoffBand();
  const final = band === "final";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}>
      <span className={`lamp ${final ? "lamp-fast" : ""}`} aria-hidden />
      {final ? "Last call" : "On air"}
    </span>
  );
}

/* ----------------------------------------------------------------- stamps ---
   A decision gets stamped. The stamp is the brand's loudest device, so it is
   reserved for a call the user is being asked to make — never for a row in a
   list, which would turn a scannable table into confetti.                     */

const STAMP_SIZE = {
  md: "text-[11px]",
  lg: "stamp-lg",
  /**
   * Display size, for the single verdict a screen exists to deliver. One per screen.
   * `xl` carries no font-size of its own — pass one via `className` (a fixed `text-[34px]`
   * inside a card, something fluid on a full-screen hero). Its rule and padding are in em,
   * so the proportions hold at whatever size you choose.
   */
  xl: "stamp-xl",
} as const;

export function Stamp({
  children,
  ink = "text-ink",
  size = "md",
  slam = false,
  className = "",
}: {
  children: React.ReactNode;
  ink?: string;
  size?: keyof typeof STAMP_SIZE;
  /** Animate it landing. Use once per screen, on the thing that just resolved. */
  slam?: boolean;
  className?: string;
}) {
  return (
    <span className={`stamp ${STAMP_SIZE[size]} ${ink} ${slam ? "slam" : ""} ${className}`}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- status ---
   Confidence is a three-band scale, so it gets a three-segment meter as well as
   a colour and a word. Colour is never the only channel.                      */

const SEGMENTS: Record<Confidence, number> = { Lock: 3, Lean: 2, "Coin flip": 1 };

/**
 * The headline form of a confidence tag: the same three bars, stamped. Shown on
 * the card for a call you have to make. Dense lists keep `ConfidencePill`.
 */
export function ConfidenceStamp({ value, hit, slam = false }: { value: Confidence; hit?: number; slam?: boolean }) {
  const filled = SEGMENTS[value] ?? 1;
  return (
    <Stamp
      ink={confidenceInk(value)}
      slam={slam}
      className={hit !== undefined ? "cursor-help" : ""}
    >
      <span
        className="flex items-center gap-[2px]"
        aria-hidden
        title={hit !== undefined ? `Margins this size were right about ${Math.round(hit * 100)}% of the time last week` : undefined}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-[10px] w-[3px] ${i < filled ? "bg-current" : "bg-current opacity-25"}`} />
        ))}
      </span>
      {value}
    </Stamp>
  );
}

export function ConfidencePill({ value, hit }: { value: Confidence; hit?: number }) {
  const filled = SEGMENTS[value] ?? 1;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-[3px] pl-2 pr-2.5 text-[11px] font-black uppercase tracking-wider ${confidenceClass(value)}`}
      title={hit !== undefined ? `Margins this size were right about ${Math.round(hit * 100)}% of the time last week` : undefined}
    >
      <span className="flex items-center gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-[9px] w-[3px] rounded-[1px] ${i < filled ? "bg-current" : "bg-current opacity-25"}`} />
        ))}
      </span>
      {value}
    </span>
  );
}

export function VerdictWord({ value, className = "" }: { value: Verdict; className?: string }) {
  return <span className={`display uppercase ${verdictClass(value)} ${className}`} style={{ fontWeight: 900 }}>{value}</span>;
}

/* ------------------------------------------------------------------ data ---
   Two thin meters. Both label their own values, so neither relies on colour.  */

/** Head-to-head share of an outcome. Two segments, a 2px surface gap between them. */
export function SplitMeter({
  left,
  right,
  leftLabel,
  rightLabel,
  onHero = false,
}: { left: number; right: number; leftLabel?: string; rightLabel?: string; onHero?: boolean }) {
  const pct = Math.max(2, Math.min(98, Math.round(left * 100)));
  // The gap is a slice of the surface behind the meter, so it has to follow it.
  const gap = onHero ? "bg-[var(--color-hero)]" : "bg-[var(--color-paper)]";
  const track = onHero ? "bg-white/20" : "bg-line-2";
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" role="img"
           aria-label={`${leftLabel ?? "You"} ${pct}%, ${rightLabel ?? "Them"} ${100 - pct}%`}>
        <div className="h-full rounded-l-full bg-start" style={{ width: `${pct}%` }} />
        <div className={`h-full w-[2px] shrink-0 ${gap}`} />
        <div className={`h-full flex-1 rounded-r-full ${track}`} />
      </div>
      {(leftLabel || rightLabel) && (
        <div className={`mt-1.5 flex justify-between text-[11px] font-bold ${onHero ? "text-white/60" : "text-muted"}`}>
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
      <span className="sr-only">{right}</span>
    </div>
  );
}

/** A 0–100% quality reading (trade fairness). Status colour plus the number. */
export function StatusMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const tone = pct >= 90 ? "bg-start" : pct >= 75 ? "bg-flip-fill" : "bg-sit";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="tnum text-sm font-black">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-soft" role="img" aria-label={`${label} ${pct}%`}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "ink",
  size = "lg",
}: { label: string; value: string; sub?: string; tone?: "ink" | "start" | "sit" | "muted" | "hero"; size?: "lg" | "xl" }) {
  const colour = { ink: "text-ink", start: "text-start", sit: "text-sit", muted: "text-muted", hero: "" }[tone];
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className={`display tnum ${size === "xl" ? "text-[42px] leading-[1.05]" : "text-[30px] leading-tight"} ${colour}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ clock ---
   The sheet is only urgent if it says how long you have.                       */

/**
/**
 * `useLayoutEffect`, except it does not warn during server rendering.
 *
 * Anything that reads the reader's own clock, locale or storage has to paint a neutral
 * placeholder on the server and correct it in the browser. Doing that in `useEffect`
 * puts the correction *after* paint, so the placeholder is visible for a frame; doing
 * it in a layout effect puts it before paint, so it never is. React has nothing to
 * flush before paint on the server, where it would just log a warning, so on the server
 * this is the ordinary effect and never runs at all.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Live time to the next Sunday 1pm ET slate, and the room's tension with it.
 * Three days out it is reference; ninety minutes out it is a deadline, and the
 * clock says so in colour while the label says so in words.
 */
export function Countdown({ onHero = false, className = "" }: { onHero?: boolean; className?: string }) {
  // The deadline depends on the reader's clock, which the server does not have, so the
  // server renders a dash and the browser fills it in.
  //
  // It starts null on the client too, deliberately. Resolving it in the state initialiser
  // instead meant the hydration render already held the final string, and this text node
  // carried `suppressHydrationWarning` — which does not mean "patch it quietly", it means
  // React keeps the DOM and throws its own output away. Since the string only changes once
  // a minute whenever kickoff is more than a day out, nothing then repainted and the clock
  // read "—" for up to a full minute. Inside 24h the seconds tick, so it healed in one
  // second and the bug hid from anyone testing near kickoff.
  //
  // Starting null means server and client agree at hydration, so there is no mismatch to
  // suppress, and the first real value arrives in a layout effect — which commits before
  // the browser paints, so the dash is never seen after hydration.
  const [left, setLeft] = useState<number | null>(null);
  useBeforePaint(() => {
    const update = () => setLeft(nextKickoff() - Date.now());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const band = left === null ? "open" : kickoffUrgency(left);
  const muted = onHero ? "text-white/55" : "text-muted";
  // On the dark band the tense colours are the light steps; on paper, the text-safe ones.
  const clock =
    band === "final"
      ? "text-signal"
      : band === "soon"
        ? onHero
          ? "text-flip-fill"
          : "text-flip"
        : onHero
          ? "text-white"
          : "text-ink";
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <IconClock size={13} strokeWidth={2.2} className={band === "final" ? "text-signal" : muted} />
      <span className={`text-[10px] font-black uppercase tracking-[0.14em] ${band === "final" ? "text-signal" : muted}`}>
        {URGENCY_LABEL[band]}
      </span>
      {/* Reserved to the widest clock it can show, so ticking from "1d 11:07" to
          "23:59:58" — or from the dash to either — moves nothing beside it. */}
      <span
        className={`tnum inline-block text-right text-[13px] font-black ${clock}`}
        style={{ minWidth: `${COUNTDOWN_CH}ch` }}
      >
        {left === null ? "—" : countdown(left)}
      </span>
    </span>
  );
}

/** True inside the last two hours before kickoff. Drives the lamp's tempo. */
export function useKickoffBand(): "open" | "soon" | "final" {
  // Same shape as `Countdown`: null through hydration, resolved before the first paint,
  // so the lamp never beats at the wrong tempo for a visible frame.
  const [left, setLeft] = useState<number | null>(null);
  useBeforePaint(() => {
    const update = () => setLeft(nextKickoff() - Date.now());
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);
  return left === null ? "open" : kickoffUrgency(left);
}

/**
 * A number that counts up to its value the first time it lands, then snaps on
 * later changes. Returns a string so callers keep control of formatting.
 * Honours reduced motion by showing the final value immediately.
 */
export function useCountUp(value: number, digits = 1, animate = true, ms = 620): string {
  // Whether this mount counts is decided once, before the first paint, and the state starts
  // at the value it will paint. The earlier version initialised to the final number and then
  // animated up from zero in an effect, so every screen showed the real total, snapped back
  // to nothing and raced up again — which read as the page loading a second time.
  const [count] = useState(
    () => animate && !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!count) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // Ease out: fast start, soft landing, like a scoreboard settling.
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, count]);

  // Not counting means the value is the truth on every render, state bypassed entirely.
  return (count ? shown : value).toFixed(digits);
}

/**
 * A counting number that holds its own width.
 *
 * `useCountUp` eases from zero, so the string grows — `0.0` to `121.4` is three extra
 * characters. On the depth chart that shoved the stamp sitting beside it; on the call
 * sheet the number is inline in a sentence, so the paragraph re-wrapped for the length
 * of the animation. The box is sized from the destination, so it is the same on the
 * first frame as the last, and nothing beside it moves.
 *
 * A number inside prose should pass `animate={false}` instead: reserving the width stops
 * the re-wrap, but a figure that spins up mid-sentence is still hard to read past.
 */
export function CountUp({
  value,
  digits = 1,
  animate = true,
  className = "",
}: {
  value: number;
  digits?: number;
  animate?: boolean;
  className?: string;
}) {
  const shown = useCountUp(value, digits, animate);
  return (
    <span
      className={`tnum inline-block text-right ${className}`}
      style={{ minWidth: `${reservedWidth(value, digits)}ch` }}
    >
      {shown}
    </span>
  );
}

/* ------------------------------------------------------------- pre-snap ---- */

/**
 * Keep a wait on screen until it has earned its exit.
 *
 * `ready` is the page's own "my data has landed". A warm API can answer while the
 * narrated checklist is still on its second line, and a sequence that appears and
 * vanishes inside 300ms reads as a glitch rather than as an opening — so once the
 * narration has started it gets its floor. A quiet skeleton owes nothing and this
 * returns `false` the instant the data is there, which is what keeps a cached tab
 * painting on the first frame.
 */
export function useHeldWait(ready: boolean): boolean {
  // Read through the store rather than off the clock: the snapshot has to be the same
  // value on every render until the floor actually lifts, and a `Date.now()` subtraction
  // in render is neither stable nor pure. Nothing narrated means this is already true,
  // so a cached tab is never held for even a frame.
  const passed = useSyncExternalStore(subscribeWaits, narratedFloorPassed, () => true);
  return !ready || !passed;
}

const OPENING = [
  "Reading your league",
  "Pulling this week's projections",
  "Re-scoring to your settings",
  "Writing the call sheet",
];

/**
 * The room coming on while the feed loads. These are the real phases the API
 * goes through; the ticks advance on a timer rather than on measured progress,
 * the way a loading sequence normally does.
 *
 * It only narrates once. The staged sequence is a good first impression and an
 * irritation the fourth time, so every later wait is a quiet skeleton — the
 * room is already on, it is just fetching.
 */
export function Opening() {
  // The phase is decided once, when this wait takes the screen, and released when it
  // leaves — so a loader cannot mount beside another and downgrade it mid-wait, which
  // is what made a cold start play the checklist, drop it, and show a skeleton instead.
  //
  // Claimed in a layout effect rather than a state initialiser: an initialiser can be
  // double-invoked in Strict Mode and would burn the session's one narrated opening on
  // a render React then throws away.
  const [phase, setPhase] = useState<WaitPhase | null>(null);
  const [step, setStep] = useState(0);
  useBeforePaint(() => {
    setPhase(claimWait());
    return releaseWait;
  }, []);
  useEffect(() => {
    if (phase !== "narrated") return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, OPENING.length)), 420);
    return () => clearInterval(id);
  }, [phase]);

  // Until the claim lands, show the quiet shape. It is the geometry of the page either
  // way, so resolving to the narrated version replaces text inside the same box.
  if (phase !== "narrated") return <QuietWait />;

  return (
    <div aria-busy="true" aria-label="Opening the Penthouse">
      <WaitHero>
        <div className="display text-[30px] leading-[1.08] text-white">Opening the Penthouse</div>
        <ul className="mt-4 grid gap-2.5">
          {OPENING.map((line, i) => {
            const done = i < step;
            return (
              <li key={line} className={`flex items-center gap-2.5 text-[14px] ${done ? "text-white" : "text-white/40"}`}>
                <span
                  aria-hidden
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                    done ? "border-start bg-start text-white" : "border-white/25"
                  }`}
                >
                  {done && <IconCheck size={10} strokeWidth={3.5} />}
                </span>
                {line}
              </li>
            );
          })}
        </ul>
      </WaitHero>
    </div>
  );
}

/**
 * The call sheet's hero, empty and waiting.
 *
 * Both loaders render through this, and its geometry is the real hero's: the same
 * ON AIR band at the same height with the same live clock in it, then the same `p-6`
 * body. The loaders used to be a different shape from the page — a `p-6` box with a
 * 26px line where the real thing has a band, a 30px headline and a pip row — so the
 * page reflowed twice on a cold start, once between the two loaders and once when
 * content landed. Sharing the frame means the only thing that ever changes inside it
 * is the text.
 */
function WaitHero({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero callsheet sweep relative overflow-hidden">
      {/* The ring, not the lamp: the room is not on air yet, and a wait that is not
          visibly turning is indistinguishable from one that has stalled. Same row,
          same height and the same live clock as the real band, so nothing moves when
          the lamp replaces it. */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <span className="flex items-center gap-2 text-white/70">
          <Spinner size={15} label={null} />
          <span className="text-[10px] font-black uppercase tracking-[0.18em]">Coming up</span>
        </span>
        <Countdown onHero />
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/**
 * Every wait after the first: the shape of the page, no narration. The ring is
 * the point — a skeleton on its own is ambiguous between "loading" and "broken",
 * and something that is turning is never mistaken for something that has stalled.
 */
function QuietWait() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <WaitHero>
        <Skeleton className="h-[14px] w-28 opacity-20" />
        <Skeleton className="mt-2 h-[33px] w-56 opacity-25" />
        <Skeleton className="mt-2.5 h-[17px] w-40 opacity-20" />
        {/* The pip row, at its real height, so the swap to content does not nudge. */}
        <div className="mt-5">
          <Skeleton className="h-[26px] w-28 opacity-20" />
          <div className="mt-2 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full bg-white/15" />
            ))}
          </div>
        </div>
      </WaitHero>
      <SkeletonList rows={2} tall quiet />
    </div>
  );
}

/* --------------------------------------------------------------- controls --- */

type BtnProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "start" | "onHero";
  size?: "md" | "sm";
  className?: string;
};

const BTN =
  "btn inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.985] disabled:opacity-50 disabled:active:scale-100";
const SIZE = { md: "px-5 py-3 text-[15px]", sm: "px-3 py-2 text-sm min-h-0" };
const VARIANTS = {
  primary: "bg-ink text-paper hover:opacity-90 shadow-[var(--shadow-card)]",
  secondary: "bg-paper text-ink border border-line-2 hover:bg-soft",
  ghost: "bg-transparent text-ink hover:bg-soft",
  start: "bg-start text-white hover:brightness-110 shadow-[var(--shadow-card)]",
  // `text-ink` flips to near-white in dark mode, so a white button would vanish. The hero
  // surface colour is dark in both modes, which is exactly what this needs.
  onHero: "bg-white text-hero hover:opacity-90",
};

/**
 * `busy` is the whole reason this wrapper exists: every async control in the app
 * gets the same spinner and the same disabled-while-working behaviour, instead of
 * each call site inventing its own "…" suffix and hoping the user waits.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  busy = false,
  disabled,
  ...rest
}: BtnProps & { busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BTN} ${SIZE[size]} ${VARIANTS[variant]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <Spinner size={15} label={null} />}
      {children}
    </button>
  );
}

export function LinkButton({ children, href, variant = "primary", size = "md", className = "" }: BtnProps & { href: string }) {
  return (
    <Link href={href} className={`${BTN} ${SIZE[size]} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/* The theme lives on <html data-theme>, set before paint by a boot script, so the toggle
   reads the DOM rather than keeping a second copy of the truth in React state. */
const themeListeners = new Set<() => void>();
function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => themeListeners.delete(cb);
}
/* Dark is the room, not a preference we read off the OS — see the note in
   globals.css. So the only thing that makes this app light is the user throwing
   the switch, and the answer here is whatever `data-theme` says. */
function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark" as const);
  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    // The status bar on a phone is painted from <meta name="theme-color">, which is
    // static HTML and cannot know about a toggle. Without this the bar stays black
    // over a warm page.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#08090b" : "#f6f5f2");
    try {
      localStorage.setItem("booth.theme", next);
    } catch {
      /* private mode */
    }
    themeListeners.forEach((l) => l());
  }
  return (
    <button
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 min-h-0 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink"
    >
      {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}

/* ------------------------------------------------------------- feedback ---- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function SkeletonList({ rows = 4, tall = false, quiet = false }: { rows?: number; tall?: boolean; quiet?: boolean }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      {!quiet && (
        <div className="flex items-center gap-2 text-muted">
          <Spinner size={14} label={null} />
          <span className="text-[10px] font-black uppercase tracking-[0.18em]">Loading</span>
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
            {tall && <Skeleton className="mt-3 h-3 w-full" />}
          </div>
          <Skeleton className="h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

/**
 * A turning ring. This used to render a skeleton list and ignore its own label,
 * which meant nothing in the app ever actually showed that work was in flight —
 * a page waiting on a request just looked stalled.
 *
 * `label` is announced to screen readers; pass null inside a control that already
 * says what it is doing, so it is not read out twice.
 */
export function Spinner({ size = 16, label = "Loading…", className = "" }: { size?: number; label?: string | null; className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} role={label ? "status" : undefined}>
      <span className="spinner" style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 8)) }} aria-hidden />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/** An indeterminate bar. For a wait that belongs to a whole surface, not one control. */
export function LoadingBar({ className = "" }: { className?: string }) {
  return (
    <span className={`block h-[2px] w-full overflow-hidden bg-line ${className}`} role="status" aria-label="Loading">
      <span className="crawl block h-full w-1/3 bg-start" />
    </span>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-sit bg-sit-soft p-4 text-sit">
      <div className="font-bold">Something went wrong</div>
      <div className="mt-0.5 text-sm">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 min-h-0 text-sm font-bold underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function InjuryTag({ status }: { status: string | null }) {
  if (!status) return null;
  const short = status === "Questionable" ? "Q" : status === "Doubtful" ? "D" : status;
  return <span className="ml-1.5 rounded bg-sit-soft px-1 py-px text-[10px] font-black uppercase text-sit">{short}</span>;
}

/** Evidence, collapsed. Every recommendation can show its working. */
export function Why({ lines, label = "Why?" }: { lines: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-[32px] items-center gap-1 text-[13px] font-bold text-lean"
      >
        {open ? "Hide" : label}
        <IconChevron size={13} strokeWidth={2.6} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {/* `basis-full` so inside the card's wrapping action row the panel takes a line of
          its own underneath, rather than squeezing in beside the buttons. */}
      {open && (
        <ul className="mt-2 grid basis-full gap-1.5 rounded-xl bg-soft p-3 text-[13px] leading-relaxed">
          {lines.map((l) => (
            <li key={l} className="flex gap-2">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const WRONG_REASONS = ["Player unavailable", "Injury / news changed", "Projection feels wrong", "I disagree", "Other"];

export function Feedback({ onSend }: { onSend: (verdict: "helpful" | "wrong", reason?: string) => Promise<void> | void }) {
  const [state, setState] = useState<"idle" | "wrong" | "done">("idle");
  if (state === "done")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-start">
        <IconCheck size={13} strokeWidth={3} /> Noted
      </span>
    );
  if (state === "wrong")
    return (
      <div className="flex basis-full flex-wrap gap-1.5">
        {WRONG_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => {
              void onSend("wrong", r);
              setState("done");
            }}
            className="min-h-[32px] rounded-full border border-line-2 px-2.5 py-1 text-xs font-bold hover:bg-soft"
          >
            {r}
          </button>
        ))}
      </div>
    );
  // Two marks, no label. "Useful?" plus Yes and No was three elements and a line of its
  // own on a card that has to fit a phone; the question is carried by the aria-label and
  // by the fact that a thumb is a thumb. 32px of hit area inside a 28px mark.
  return (
    <span className="ml-auto inline-flex items-center gap-0.5 text-muted">
      <button
        onClick={() => {
          void onSend("helpful");
          setState("done");
        }}
        aria-label="This call was useful"
        title="This call was useful"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-soft hover:text-start"
      >
        <IconThumbUp size={16} />
      </button>
      <button
        onClick={() => setState("wrong")}
        aria-label="This call was wrong"
        title="This call was wrong"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-soft hover:text-sit"
      >
        <IconThumbDown size={16} />
      </button>
    </span>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 min-h-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[86vh] w-full max-w-lg overflow-hidden rounded-t-[28px] bg-paper shadow-[var(--shadow-lift)] rise">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-2" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="display text-[19px]">{title}</h2>
          <button onClick={onClose} className="min-h-0 rounded-full px-3 py-1.5 text-sm font-bold text-lean hover:bg-soft">
            Done
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">{children}</div>
      </div>
    </div>
  );
}
