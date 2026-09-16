"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Confidence, Verdict } from "@/lib/types";
import { confidenceClass, verdictClass } from "@/lib/format";

export function Card({ children, className = "", ...rest }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-lg font-extrabold tracking-tight ${className}`}>{children}</h2>;
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-bold uppercase tracking-[0.12em] text-muted ${className}`}>{children}</div>;
}

export function ConfidencePill({ value, hit }: { value: Confidence; hit?: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${confidenceClass(value)}`}>
      {value}
      {hit !== undefined && <span className="font-bold opacity-80">· {Math.round(hit * 100)}%</span>}
    </span>
  );
}

export function VerdictWord({ value, className = "" }: { value: Verdict; className?: string }) {
  return <span className={`display font-black uppercase tracking-tight ${verdictClass(value)} ${className}`}>{value}</span>;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display font-black tracking-tight ${className}`}>
      edge<span className="text-start">.</span>
    </span>
  );
}

type BtnProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "start";
  size?: "md" | "sm";
  className?: string;
};

const BTN = "btn inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100";
const SIZE = { md: "px-5 py-3 text-base", sm: "px-3 py-2 text-sm min-h-0" };
const VARIANTS = {
  primary: "bg-ink text-white hover:bg-black shadow-[var(--shadow-card)]",
  secondary: "bg-paper text-ink border-2 border-ink hover:bg-soft",
  ghost: "bg-transparent text-ink hover:bg-soft",
  danger: "bg-sit text-white",
  start: "bg-start text-white hover:brightness-95 shadow-[var(--shadow-card)]",
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

/** Skeleton loading: rows that look like the content they replace. */
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
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <SkeletonList rows={3} />;
  void label;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-sit bg-sit-soft p-4 text-sit">
      <div className="font-bold">Something went wrong</div>
      <div className="mt-0.5 text-sm">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-sm font-bold underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function InjuryTag({ status }: { status: string | null }) {
  if (!status) return null;
  const short = status === "Questionable" ? "Q" : status === "Doubtful" ? "D" : status;
  return <span className="ml-1 rounded bg-sit-soft px-1 text-[11px] font-bold text-sit">{short}</span>;
}

/** "Why?" disclosure: evidence lines, collapsed by default. */
export function Why({ lines, label = "Why?" }: { lines: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-0 text-sm font-bold text-lean">
        {open ? "Hide" : label}
      </button>
      {open && (
        <ul className="mt-1 grid gap-1 rounded-lg bg-soft p-3 text-sm">
          {lines.map((l) => (
            <li key={l} className="flex gap-2">
              <span aria-hidden className="text-muted">
                ·
              </span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WRONG_REASONS = ["Player unavailable", "Injury / news changed", "Projection feels wrong", "I disagree", "Other"];

/** Tiny feedback control. `onSend` receives verdict + optional reason; stored server-side. */
export function Feedback({ onSend }: { onSend: (verdict: "helpful" | "wrong", reason?: string) => Promise<void> | void }) {
  const [state, setState] = useState<"idle" | "wrong" | "done">("idle");
  if (state === "done") return <div className="mt-2 text-xs font-bold text-muted">Thanks — noted.</div>;
  if (state === "wrong")
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {WRONG_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => {
              void onSend("wrong", r);
              setState("done");
            }}
            className="min-h-0 rounded-full border border-line px-2.5 py-1 text-xs font-bold hover:bg-soft"
          >
            {r}
          </button>
        ))}
      </div>
    );
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted">
      <span>Was this useful?</span>
      <button
        onClick={() => {
          void onSend("helpful");
          setState("done");
        }}
        className="min-h-0 rounded-full border border-line px-2.5 py-1 font-bold text-ink hover:bg-soft"
      >
        Helpful
      </button>
      <button onClick={() => setState("wrong")} className="min-h-0 rounded-full border border-line px-2.5 py-1 font-bold text-ink hover:bg-soft">
        Wrong
      </button>
    </div>
  );
}

/** Bottom sheet for pickers on mobile. */
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
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 min-h-0 bg-black/40" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-3xl bg-paper shadow-[var(--shadow-float)] rise">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          <button onClick={onClose} className="min-h-0 rounded-full px-3 py-1 text-sm font-bold hover:bg-soft">
            Done
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, tone = "ink", sub }: { label: string; value: string; tone?: "ink" | "start" | "sit" | "muted"; sub?: string }) {
  const color = { ink: "text-ink", start: "text-start", sit: "text-sit", muted: "text-muted" }[tone];
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className={`display text-3xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
