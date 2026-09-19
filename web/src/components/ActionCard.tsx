"use client";
/** One call on the call sheet: the move, the reason, the stamp, and the tick that crosses it off. */
import Link from "next/link";
import type { Action, LockCall, Player, SharedPlayer } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconCheck, IconChevron, IconGreaseCheck, IconLock } from "./icons";
import { ShareLock } from "./ShareLock";
import { ConfidenceStamp, Eyebrow, Feedback, Why } from "./ui";

/** The display fields a share card prints. Ids and projections never travel. */
function shared(p: Player): SharedPlayer {
  return {
    name: p.name,
    position: p.position ?? "",
    nfl_team: p.nfl_team ?? "",
    photo: p.photo ?? null,
    team_logo: p.team_logo ?? null,
  };
}

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
  leagueName = "",
  week = 0,
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
  /** Printed on the shared card. Without them a Lock still shares, just unlabelled. */
  leagueName?: string;
  week?: number;
  delay?: number;
}) {
  const [primary, secondary] = a.players;
  // A hold is not a call you make, and a locked teaser is not one you can make.
  const callable = !a.locked && a.type !== "hold" && !!onCall;
  // Which is also why only these two wear the sheet's open/ticked dressing: a hold and a
  // locked teaser stay neutral, so green on this page only ever means "you, now".
  const outstanding = callable && !called;
  const done = callable && called;
  // Every start/sit call is shareable by anyone, paid or not — that is the loop. Built as
  // a value rather than a boolean so `confidence` narrows here instead of needing a `!`.
  const lockCall: LockCall | null =
    !a.locked && a.type === "start" && a.confidence && primary
      ? {
          start: shared(primary),
          bench: secondary ? shared(secondary) : null,
          gain: a.benefit_value,
          confidence: a.confidence,
          slot: "",
          note: a.reason,
        }
      : null;
  return (
    <article
      className={`card relative min-w-0 overflow-hidden ${animate ? `print print-${Math.min(delay, 5)}` : ""} ${
        a.locked ? "border-dashed" : ""
      } ${outstanding ? "card-open" : ""} ${done ? "card-done" : ""}`}
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
          {/* The rule is the third channel, after the border and the tick: an open call runs
              a wider, full-strength rail down the margin, a ticked one a thin grey one. It
              is inside the fixed 40px margin, so the extra pixel costs the card nothing. */}
          <span
            aria-hidden
            className={`mt-2.5 flex-1 ${done ? "w-[3px] bg-line-2" : `${outstanding ? "w-[4px]" : "w-[3px]"} ${RAIL[a.type]}`}`}
          />
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

          <div className="mt-3 flex items-start gap-3">
            {a.locked ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft text-muted" aria-hidden>
                <IconLock size={18} />
              </span>
            ) : a.type === "hold" ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-start-soft text-start" aria-hidden>
                <IconCheck size={19} strokeWidth={2.6} />
              </span>
            ) : primary ? (
              <span className="relative shrink-0 pr-2.5">
                <Avatar name={primary.name} photo={primary.photo} teamLogo={primary.team_logo} size="md" ring={a.type === "start" ? "start" : undefined} />
                {secondary && (
                  <span className="absolute -bottom-1 right-0 rounded-full ring-2 ring-[var(--color-paper)]">
                    <Avatar name={secondary.name} photo={secondary.photo} size="sm" className="opacity-75 grayscale" />
                  </span>
                )}
              </span>
            ) : null}

            <div className="min-w-0 flex-1">
              {/* Two lines of title, hard stop. "Offer Alec Pierce for Travis Kelce" ran to six
                  lines at 320px and the card with it. */}
              <h3 className="display line-clamp-2 text-[19px] leading-[1.2]">{a.title}</h3>
              {/* The benefit pairs with the subtitle rather than the title: it used to be a
                  third stacked line of its own, and putting it beside the title meant a
                  wrapping title and a wrapping number interleaving — "Vikings" and "ROS" on
                  the same line. The number never wraps and the subtitle yields to it, because
                  the number is the thing you are being sold and the subtitle repeats detail
                  the reason line already carries. */}
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
                {/* The subtitle keeps at least half the line, so it never gets crushed to a
                    single letter by a wide number — "B" was what "Bid $6–10 · Drop Dontayvion
                    Wicks" became at 320px. If the number then does not fit beside it, it wraps
                    to its own line and sits right; it does not shrink and it does not truncate,
                    because a half-printed number is worse than a second line. */}
                <p className="min-w-0 flex-1 basis-[55%] truncate text-[13px] leading-snug text-muted">{a.subtitle}</p>
                <span
                  className={`tnum ml-auto shrink-0 whitespace-nowrap ${
                    a.type === "hold"
                      ? "text-[12px] font-semibold text-muted"
                      : `text-[14px] font-black ${a.locked ? "text-muted" : "text-start"}`
                  }`}
                >
                  {a.benefit}
                </span>
              </div>
            </div>
          </div>

          {/* Two lines, then stop. The full text is already the first thing behind Why?, which
              is where someone who wants the argument goes looking. */}
          <p className={`mt-3 line-clamp-2 text-[14px] leading-relaxed ${a.locked ? "text-muted" : "text-ink-2"}`}>
            {a.reason}
          </p>

          {/* The two things you might actually do share the first line — each takes half the
              card, so they pair up at 320px instead of stacking. Why? and the verdict marks
              follow on the next line; they are what you reach for after the decision, not
              before it. Four controls will not fit one 211px line at any readable size. */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {callable &&
              // Keyed so React mounts a fresh node on each flip — that is what lets
              // the stamp land, rather than silently swapping a className.
              (called ? (
                <button
                  key="called"
                  onClick={onCall}
                  aria-pressed
                  aria-label="Called. Tap to undo"
                  className="stamp slam min-h-[36px] flex-1 basis-[40%] cursor-pointer justify-center text-[11px] text-start"
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
                  className="btn inline-flex min-h-[36px] flex-1 basis-[40%] items-center justify-center rounded-xl bg-ink px-3 py-2 text-[13px] font-bold text-paper hover:opacity-90"
                >
                  Make the call
                </button>
              ))}
            <Link
              href={a.cta.href}
              className={`btn inline-flex min-h-[36px] flex-1 basis-[40%] items-center justify-center gap-1 rounded-xl px-3 py-2 text-[13px] font-bold ${
                a.locked ? "bg-ink text-paper" : "bg-soft text-ink hover:bg-line"
              }`}
            >
              {a.cta.label}
              <IconChevron size={13} strokeWidth={2.8} />
            </Link>
            {!a.locked && <Why lines={a.why} />}
            {/* One row: make the call, go deeper, ask why, say if it was wrong. The feedback
                pushes itself to the right end rather than claiming a line of its own. */}
            {!a.locked && a.type !== "hold" && <Feedback onSend={onFeedback} />}
          </div>

          {lockCall && <ShareLock call={lockCall} leagueName={leagueName} week={week} />}
        </div>
      </div>
    </article>
  );
}
