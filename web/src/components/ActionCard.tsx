"use client";
import Link from "next/link";
import type { Action } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ConfidencePill, Eyebrow, Feedback, Why } from "./ui";

const TYPE_LABEL: Record<Action["type"], string> = { start: "Start", waiver: "Waiver", trade: "Trade", hold: "Hold" };
const TYPE_TONE: Record<Action["type"], string> = {
  start: "bg-start text-white",
  waiver: "bg-lean text-white",
  trade: "bg-ink text-white",
  hold: "bg-soft text-muted",
};

export function ActionCard({ a, onFeedback, delay = 0 }: { a: Action; onFeedback: (verdict: "helpful" | "wrong", reason?: string) => void | Promise<void>; delay?: number }) {
  const [primary, secondary] = a.players;
  return (
    <article className={`card relative min-w-0 overflow-hidden p-4 rise rise-${Math.min(delay, 5)} ${a.locked ? "border-dashed" : ""}`}>
      <div className="flex items-center justify-between">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${TYPE_TONE[a.type]}`}>{TYPE_LABEL[a.type]}</span>
        {a.confidence ? <ConfidencePill value={a.confidence} /> : <Eyebrow>Priority #{a.priority}</Eyebrow>}
      </div>

      <div className="mt-3 flex items-start gap-3">
        {a.locked ? (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-soft text-2xl" aria-hidden>
            🔒
          </span>
        ) : primary ? (
          <span className="relative shrink-0">
            <Avatar name={primary.name} photo={primary.photo} teamLogo={primary.team_logo} size="lg" ring={a.type === "start" ? "start" : undefined} />
            {secondary && (
              <span className="absolute -bottom-1 -left-2">
                <Avatar name={secondary.name} photo={secondary.photo} size="sm" className="grayscale opacity-80" />
              </span>
            )}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="display text-lg font-extrabold leading-tight">{a.title}</h3>
          <p className="mt-0.5 text-sm text-muted">{a.subtitle}</p>
          <p className={`mt-1.5 font-black tabular-nums ${a.locked ? "text-muted" : "text-start"}`}>{a.benefit}</p>
        </div>
      </div>

      {!a.locked && <p className="mt-3 text-sm leading-relaxed">{a.reason}</p>}
      {a.locked && <p className="mt-3 text-sm text-muted">{a.reason}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <Link href={a.cta.href} className={`btn inline-flex min-h-0 items-center rounded-lg px-3 py-2 text-sm font-bold ${a.locked ? "bg-ink text-white" : "bg-soft text-ink hover:bg-line"}`}>
          {a.cta.label}
        </Link>
        {!a.locked && <Why lines={a.why} />}
      </div>
      {!a.locked && <Feedback onSend={onFeedback} />}
    </article>
  );
}
