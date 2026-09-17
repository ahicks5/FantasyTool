"use client";
import Link from "next/link";
import type { Action } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconCheck, IconChevron, IconLock } from "./icons";
import { ConfidencePill, Eyebrow, Feedback, Why } from "./ui";

const LABEL: Record<Action["type"], string> = { start: "Start", waiver: "Waiver", trade: "Trade", hold: "Hold" };
// A left rail carries the action type without spending a whole coloured chip on it.
const RAIL: Record<Action["type"], string> = {
  start: "bg-start",
  waiver: "bg-lean",
  trade: "bg-ink",
  hold: "bg-line-2",
};
const CHIP: Record<Action["type"], string> = {
  start: "bg-start-soft text-start",
  waiver: "bg-lean-soft text-lean",
  trade: "bg-soft text-ink",
  hold: "bg-soft text-muted",
};

export function ActionCard({
  a,
  onFeedback,
  delay = 0,
}: {
  a: Action;
  onFeedback: (verdict: "helpful" | "wrong", reason?: string) => void | Promise<void>;
  delay?: number;
}) {
  const [primary, secondary] = a.players;
  return (
    <article className={`card relative min-w-0 overflow-hidden rise rise-${Math.min(delay, 5)} ${a.locked ? "border-dashed" : ""}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${RAIL[a.type]}`} />

      <div className="p-5 pl-6">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-md px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] ${CHIP[a.type]}`}>
            {LABEL[a.type]}
          </span>
          {a.confidence ? <ConfidencePill value={a.confidence} /> : !a.locked && a.type === "hold" ? null : <Eyebrow>#{a.priority}</Eyebrow>}
        </div>

        <div className="mt-4 flex items-start gap-3.5">
          {a.locked ? (
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-soft text-muted" aria-hidden>
              <IconLock size={22} />
            </span>
          ) : a.type === "hold" ? (
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-start-soft text-start" aria-hidden>
              <IconCheck size={24} strokeWidth={2.6} />
            </span>
          ) : primary ? (
            <span className="relative shrink-0 pr-3">
              <Avatar name={primary.name} photo={primary.photo} teamLogo={primary.team_logo} size="lg" ring={a.type === "start" ? "start" : undefined} />
              {secondary && (
                <span className="absolute -bottom-1 right-0 rounded-full ring-2 ring-[var(--color-paper)]">
                  <Avatar name={secondary.name} photo={secondary.photo} size="sm" className="opacity-75 grayscale" />
                </span>
              )}
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <h3 className="display text-[19px] leading-[1.2]">{a.title}</h3>
            <p className="mt-1 text-[13px] leading-snug text-muted">{a.subtitle}</p>
            <p className={`tnum mt-2 text-[15px] font-black ${a.locked || a.type === "hold" ? "text-muted" : "text-start"}`}>{a.benefit}</p>
          </div>
        </div>

        <p className={`mt-3.5 text-[14px] leading-relaxed ${a.locked ? "text-muted" : "text-ink-2"}`}>{a.reason}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Link
            href={a.cta.href}
            className={`btn inline-flex min-h-0 items-center gap-1 rounded-xl px-3.5 py-2 text-[13px] font-bold ${
              a.locked ? "bg-ink text-paper" : "bg-soft text-ink hover:bg-line"
            }`}
          >
            {a.cta.label}
            <IconChevron size={13} strokeWidth={2.8} />
          </Link>
          {!a.locked && <Why lines={a.why} />}
        </div>

        {!a.locked && a.type !== "hold" && <Feedback onSend={onFeedback} />}
      </div>
    </article>
  );
}
