"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Confidence, Verdict } from "@/lib/types";
import { confidenceClass, verdictClass } from "@/lib/format";
import { describeError, isOnline } from "@/lib/errors";
import { IconCheck, IconChevron, IconMoon, IconSun } from "./icons";

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

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display inline-flex items-baseline ${className}`} style={{ fontWeight: 900, letterSpacing: "-0.045em" }}>
      edge
      <span className="ml-[3px] inline-block h-[0.26em] w-[0.26em] rounded-full bg-start" aria-hidden />
    </span>
  );
}

/* ---------------------------------------------------------------- status ---
   Confidence is a three-band scale, so it gets a three-segment meter as well as
   a colour and a word. Colour is never the only channel.                      */

const SEGMENTS: Record<Confidence, number> = { Lock: 3, Lean: 2, "Coin flip": 1 };

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

export function Button({ children, variant = "primary", size = "md", className = "", ...rest }: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${BTN} ${SIZE[size]} ${VARIANTS[variant]} ${className}`} {...rest}>
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
function currentTheme(): "light" | "dark" {
  if (document.documentElement.dataset.theme === "dark") return "dark";
  if (document.documentElement.dataset.theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as const);
  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("edge.theme", next);
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

export function SkeletonList({ rows = 4, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
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

export function Spinner({ label = "Loading…" }: { label?: string }) {
  void label;
  return <SkeletonList rows={3} />;
}

export function ErrorBox({ error, message, onRetry }: { error?: unknown; message?: string; onRetry?: () => void }) {
  // navigator.onLine is read at render: a dropped connection explains every other
  // symptom, and "you are offline" beats "Edge is having a problem" when it is a tunnel.
  const copy = describeError(error ?? message, { online: isOnline() });
  return (
    <div role="alert" className="rounded-[var(--radius-card)] border border-sit bg-sit-soft p-4 text-sit">
      <div className="font-bold">{copy.title}</div>
      <div className="mt-0.5 text-sm">{copy.detail}</div>
      {onRetry && copy.canRetry && (
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
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-0 items-center gap-1 text-[13px] font-bold text-lean"
      >
        {open ? "Hide" : label}
        <IconChevron size={13} strokeWidth={2.6} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <ul className="mt-2 grid gap-1.5 rounded-xl bg-soft p-3 text-[13px] leading-relaxed">
          {lines.map((l) => (
            <li key={l} className="flex gap-2">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WRONG_REASONS = ["Player unavailable", "Injury / news changed", "Projection feels wrong", "I disagree", "Other"];

export function Feedback({ onSend }: { onSend: (verdict: "helpful" | "wrong", reason?: string) => Promise<void> | void }) {
  const [state, setState] = useState<"idle" | "wrong" | "done">("idle");
  if (state === "done")
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-start">
        <IconCheck size={13} strokeWidth={3} /> Thanks — noted.
      </div>
    );
  if (state === "wrong")
    return (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {WRONG_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => {
              void onSend("wrong", r);
              setState("done");
            }}
            className="min-h-0 rounded-full border border-line-2 px-2.5 py-1 text-xs font-bold hover:bg-soft"
          >
            {r}
          </button>
        ))}
      </div>
    );
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted">
      <span>Useful?</span>
      <button
        onClick={() => {
          void onSend("helpful");
          setState("done");
        }}
        className="min-h-0 rounded-full border border-line-2 px-2.5 py-1 font-bold text-ink hover:bg-soft"
      >
        Yes
      </button>
      <button onClick={() => setState("wrong")} className="min-h-0 rounded-full border border-line-2 px-2.5 py-1 font-bold text-ink hover:bg-soft">
        No
      </button>
    </div>
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
