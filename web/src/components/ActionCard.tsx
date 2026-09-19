"use client";
import Link from "next/link";
import type { Action } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconCheck, IconChevron, IconGreaseCheck, IconLock } from "./icons";
import { ConfidenceStamp, Eyebrow, Feedback, Why } from "./ui";

const LABEL: Record<Action["type"], string> = { start: "Start", waiver: "Claim", trade: "Trade", hold: "Hold" };
// A call sheet numbers its plays in the margin and colours the rule beside them.
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
  n,
  called = false,
  animate = true,
  onCall,
  onFeedback,
  delay = 0,
}: {
  a: Action;
  /** Position on the sheet, printed in the margin. */
  n: number;
  called?: boolean;
  /** False when this card came from the session cache: it is already "on screen". */
  animate?: boolean;
  onCall?: () => void;
  onFeedback: (verdict: "helpful" | "wrong", reason?: string) => void | Promise<void>;
  delay?: number;
}) {
  const [primary, secondary] = a.players;
  // A hold is not a call you make, and a locked teaser is not one you can make.
  const callable = !a.locked && a.type !== "hold" && !!onCall;
  return (
    <article
      className={`card relative min-w-0 overflow-hidden ${animate ? `print print-${Math.min(delay, 5)}` : ""} ${
        a.locked ? "border-dashed" : ""
      } ${called ? "opacity-80" : ""}`}
    >
      <div className="flex min-w-0">
        {/* The margin: play number over a rule in the action's colour. */}
        <div className="flex w-[40px] shrink-0 flex-col items-center border-r border-line bg-soft pt-5">
          {called ? (
            // Crossed off by hand: the stroke draws itself across the margin.
            <span className="grease text-start" aria-hidden>
              <IconGreaseCheck size={19} />
            </span>
          ) : (
            <span className="slug text-[14px] leading-none text-muted">{String(n).padStart(2, "0")}</span>
          )}
          <span aria-hidden className={`mt-2.5 w-[3px] flex-1 ${called ? "bg-start opacity-45" : RAIL[a.type]}`} />
        </div>

        <div className="min-w-0 flex-1 p-5">
          <div className="flex items-start justify-between gap-2">
            <span className={`rounded-md px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] ${CHIP[a.type]}`}>
              {LABEL[a.type]}
            </span>
            {a.confidence ? (
              <ConfidenceStamp value={a.confidence} />
            ) : !a.locked && a.type === "hold" ? null : (
              <Eyebrow>#{a.priority}</Eyebrow>
            )}
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
              {/* A hold has no gain to shout about; its benefit is a quiet note, not a headline. */}
              <p
                className={`tnum mt-2 ${
                  a.type === "hold"
                    ? "text-[13px] font-semibold text-muted"
                    : `text-[15px] font-black ${a.locked ? "text-muted" : "text-start"}`
                }`}
              >
                {a.benefit}
              </p>
            </div>
          </div>

          <p className={`mt-3.5 text-[14px] leading-relaxed ${a.locked ? "text-muted" : "text-ink-2"}`}>{a.reason}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {callable &&
              // Keyed so React mounts a fresh node on each flip — that is what lets
              // the stamp land, rather than silently swapping a className.
              (called ? (
                <button
                  key="called"
                  onClick={onCall}
                  aria-pressed
                  aria-label="Called — tap to undo"
                  className="stamp slam min-h-0 cursor-pointer text-[11px] text-start"
                >
                  <span className="grease" aria-hidden>
                    <IconGreaseCheck size={13} />
                  </span>
                  Called
                </button>
              ) : (
                <button
                  key="call"
                  onClick={onCall}
                  aria-pressed={false}
                  className="btn inline-flex min-h-0 items-center rounded-xl bg-ink px-3.5 py-2 text-[13px] font-bold text-paper hover:opacity-90"
                >
                  Make the call
                </button>
              ))}
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
      </div>
    </article>
  );
}
