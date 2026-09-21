"use client";
/** One department's memo on the Debrief: who is talking, the one thing they want, and the door. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Action, LockCall, Player, SharedPlayer } from "@/lib/types";
import type { DeadlineNote } from "@/lib/deadline.ts";
import { CALL_LABEL, DEPARTMENTS, GROUPS, SECTIONS, type DepartmentKey } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { IconArrowUp, IconCheck, IconClock, IconGreaseCheck, IconLock } from "./icons";
import { ShareLock } from "./ShareLock";
import { ConfidenceStamp, Feedback, Stamp } from "./ui";

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

const CHIP: Record<Action["type"], string> = {
  start: "bg-start-soft text-start",
  waiver: "bg-lean-soft text-lean",
  trade: "bg-soft text-ink",
  hold: "bg-soft text-muted",
};

/**
 * The same three bands the kickoff clock uses, escalating by fill rather than by hue.
 *
 * Carried over from the bench row this memo replaces, comment and all, because the two
 * reds it is deliberately *not* are each ruled out by a different rule.
 * `--color-signal` is the brand's lamp and BRAND.md confines it to chrome — the
 * wordmark, the dark plate, the ON AIR chip, the share card's corner. The starters
 * plate above may run red because it is that one dark surface; a memo is a card, which
 * is not chrome. `--color-sit` is status red, the app's word for "bench this player",
 * and spending it on a clock would read as a claim about the names underneath.
 *
 * Fill also survives the dark theme, which a brighter amber would not: `--color-flip`
 * and `--color-flip-fill` resolve to the same value on black, so `soon` and `final`
 * would be indistinguishable in the default theme.
 */
const NOTE_INK: Record<DeadlineNote["urgency"], string> = {
  open: "text-muted",
  soon: "text-flip",
  final: "text-flip bg-flip-soft rounded-[4px] px-1.5 py-0.5 -mx-0.5",
};

function NoteLine({ note }: { note: DeadlineNote }) {
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${NOTE_INK[note.urgency]}`}>
      <IconClock size={11} strokeWidth={2.4} className="shrink-0" />
      <span
        className={`tnum block truncate text-[11px] leading-tight ${
          note.urgency === "final" ? "font-black" : "font-semibold"
        }`}
      >
        {note.text}
      </span>
    </span>
  );
}

/**
 * The one thing the memo's header says on the right, and only one thing fits.
 *
 * At 320px the eyebrow takes 19 to 25 characters of a line that is about 256px wide
 * inside the card's padding, so the status has roughly 100px. The order below is a
 * ranking of four facts against that budget.
 *
 * A **tense deadline wins**, and that is the one place this departs from the plan's
 * reading order. The rest of the app already holds that the room tightens toward a
 * deadline (`kickoffUrgency`, and the bench row's own note before it), and a waiver
 * night about to run is the single most expensive thing on the scouting memo — miss it
 * and you lose the player, where missing "2 more" costs you a scroll. A calm deadline
 * is reference and yields to the count.
 *
 * Then the **count**, because it is the only fact on this line about the card you are
 * actually looking at. Then the calm note. Then, only when there is nothing left to
 * show, the department's **stamp** — which is a verdict and is therefore never printed
 * beside an item, exactly as a clear bench's stamp never sat beside a card.
 */
function MemoStatus({ dept, more, note }: { dept: DepartmentKey; more: number; note: DeadlineNote | null }) {
  if (note && note.urgency !== "open") return <NoteLine note={note} />;
  if (more > 0) {
    return <span className="tnum shrink-0 text-[11px] font-bold text-muted">{more} more</span>;
  }
  if (note) return <NoteLine note={note} />;
  // `report` has no bench and so no stamp: nothing on the feed measures the film, and a
  // verdict invented to fill this corner would be a claim we cannot make.
  if (dept === "report") return null;
  return (
    <Stamp ink="text-start" className="shrink-0">
      {GROUPS[dept].stamp}
    </Stamp>
  );
}

/**
 * The card every memo is printed on.
 *
 * Header, body, door — in that order and always all three, so four departments read as
 * one stack of memos rather than four bespoke cards. The door is the only control that
 * is always present: a department with nothing to report still has a room you can walk
 * into, which is the whole reason the Debrief prints the quiet ones at all.
 */
function MemoCard({
  dept,
  status,
  door,
  animate,
  delay,
  children,
}: {
  dept: DepartmentKey;
  status: ReactNode;
  door: { label: string; href: string };
  animate: boolean;
  delay: number;
  children: ReactNode;
}) {
  return (
    <section className={`card min-w-0 overflow-hidden ${animate ? `rise rise-${Math.min(delay, 5)}` : ""}`}>
      {/* The eyebrow is the signature on the memo, so it sits on its own ruled band the
          way a letterhead does, rather than floating above the first line of the body. */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-soft px-4 py-2">
        <span className="eyebrow min-w-0 truncate">{DEPARTMENTS[dept]}</span>
        {status}
      </div>
      <div className="p-4">{children}</div>
      <Link
        href={door.href}
        className="flex min-h-[44px] items-center justify-between gap-2 border-t border-line px-4 py-3 text-[13px] font-bold text-ink hover:bg-soft"
      >
        {door.label}
        <IconArrowUp size={15} strokeWidth={2.4} className="rotate-90 text-muted" />
      </Link>
    </section>
  );
}

/**
 * A department with nothing left to hand you.
 *
 * Either it sent nothing this week, or everything it sent has been thumbed off the
 * Debrief (D5). Both print `GROUPS[dept].clear`, and the wording is doing careful work:
 * `lineup.advise` holds any swap inside the 1.5-point noise band, so "Lineup's set" has
 * to mean *nothing worth calling* and never "provably optimal" — the confidence section
 * of CLAUDE.md is why that distinction is the difference between a true claim and a
 * false one. The door underneath still opens the full tab.
 */
function ClearLine({ dept }: { dept: Exclude<DepartmentKey, "report"> }) {
  return <p className="py-1 text-[14px] font-semibold text-muted">{GROUPS[dept].clear}</p>;
}

/**
 * The memo's item: one call, printed short.
 *
 * It is the same fields the old action card printed, minus its second half. `Why?` and
 * the pair of CTAs moved to the tabs: the argument for a call belongs where the call is
 * worked, and the Debrief's job is to say what and hand you the door.
 */
function Item({
  a,
  called,
  onCall,
  onFeedback,
  leagueName,
  week,
}: {
  a: Action;
  called: boolean;
  onCall?: () => void;
  onFeedback: (verdict: "helpful" | "wrong", reason?: string) => void | Promise<void>;
  leagueName: string;
  week: number;
}) {
  const [primary, secondary] = a.players;
  // A hold is not a call you make, and a locked teaser is not one you can make. Which is
  // also why only these two ever wear a tick: green on this page means "you, now".
  const callable = !a.locked && a.type !== "hold" && !!onCall;
  // Every start/sit call is shareable by anyone, paid or not — that is the growth loop,
  // and it rides on the head coach's memo now that the card it lived on is gone. Built
  // as a value rather than a boolean so `confidence` narrows here instead of needing a `!`.
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
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-md px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] ${CHIP[a.type]}`}>
          {CALL_LABEL[a.type]}
        </span>
        {a.confidence ? <ConfidenceStamp value={a.confidence} /> : null}
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
            <Avatar
              name={primary.name}
              photo={primary.photo}
              teamLogo={primary.team_logo}
              size="md"
              ring={a.type === "start" ? "start" : undefined}
            />
            {secondary && (
              <span className="absolute -bottom-1 right-0 rounded-full ring-2 ring-[var(--color-paper)]">
                <Avatar name={secondary.name} photo={secondary.photo} size="sm" className="opacity-75 grayscale" />
              </span>
            )}
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          {/* Two lines of title, hard stop. "Offer Alec Pierce for Travis Kelce" ran to
              six lines at 320px and took the card with it. */}
          <h3 className="display line-clamp-2 text-[19px] leading-[1.2]">{a.title}</h3>
          {/* The subtitle keeps at least half the line so a wide number cannot crush it to
              a single letter, and the number never wraps and never truncates: a
              half-printed number is worse than a second line. */}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
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

      {/* Two lines, then stop. The full argument is on the tab the door opens. */}
      <p className={`mt-3 line-clamp-2 text-[14px] leading-relaxed ${a.locked ? "text-muted" : "text-ink-2"}`}>
        {a.reason}
      </p>

      {/* The tick and the thumbs share one line: the tick takes the width it needs to be
          a real target and the marks push themselves to the right end, so at 320px this
          is one row rather than two. A locked teaser and a hold get neither, so their
          memo simply ends at the reason. */}
      {(callable || (!a.locked && a.type !== "hold")) && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {callable &&
            // Keyed so React mounts a fresh node on each flip — that is what lets the
            // stamp land, rather than silently swapping a className.
            (called ? (
              <button
                key="called"
                onClick={onCall}
                aria-pressed
                aria-label="Called. Tap to undo"
                className="stamp slam min-h-[36px] cursor-pointer justify-center px-3 text-[11px] text-start"
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
                className="btn inline-flex min-h-[36px] items-center justify-center rounded-xl bg-ink px-3 py-2 text-[13px] font-bold text-paper hover:opacity-90"
              >
                Make the call
              </button>
            ))}
          {!a.locked && a.type !== "hold" && <Feedback onSend={onFeedback} />}
        </div>
      )}

      {lockCall && <ShareLock call={lockCall} leagueName={leagueName} week={week} />}
    </div>
  );
}

/**
 * A working department's memo: the lineup, the wire or the trade board.
 *
 * `item` is null when there is nothing left to show and the card falls back to the
 * clear line. The door is the action's own `cta.href` when there is one — so a trade
 * memo still deep-links into the Trade Lab with the offer pre-filled, and a locked
 * teaser still opens its own upsell — and the room's front door otherwise.
 */
export function ActionMemo({
  dept,
  item,
  more,
  note = null,
  called = false,
  onCall,
  onFeedback,
  leagueName = "",
  week = 0,
  animate = true,
  delay = 0,
}: {
  dept: Exclude<DepartmentKey, "report">;
  item: Action | null;
  /** How many more this memo could still show, behind the one it is showing. */
  more: number;
  note?: DeadlineNote | null;
  called?: boolean;
  onCall?: () => void;
  onFeedback: (verdict: "helpful" | "wrong", reason?: string) => void | Promise<void>;
  /** Printed on a shared card. Without them a Lock still shares, just unlabelled. */
  leagueName?: string;
  week?: number;
  animate?: boolean;
  delay?: number;
}) {
  const section = SECTIONS[dept];
  return (
    <MemoCard
      dept={dept}
      status={<MemoStatus dept={dept} more={item ? more : 0} note={note} />}
      door={item ? { label: item.cta.label, href: item.cta.href } : { label: section.title, href: section.href }}
      animate={animate}
      delay={delay}
    >
      {item ? (
        // Keyed by the id so a dismissal mounts the next item fresh: the thumbs carry
        // their own "sent" state, and the promoted call must arrive with clean controls
        // rather than inheriting a "Noted" from the call it replaced.
        <Item
          key={item.id}
          a={item}
          called={called}
          onCall={onCall}
          onFeedback={onFeedback}
          leagueName={leagueName}
          week={week}
        />
      ) : (
        <ClearLine dept={dept} />
      )}
    </MemoCard>
  );
}

/**
 * The film room's memo, which is a different kind of thing and says so.
 *
 * It carries no call, because nothing on the feed measures the film — so it takes no
 * stamp, no tick and no thumbs. A result is a fact rather than a call the reader has to
 * make (`Scorecard.tsx` has the rule), and there is nothing here to be wrong about.
 *
 * What it does carry is the two lines the hero used to (D6): how last week's calls
 * landed, and where the season stands. Both were white on the dark hero and are ink on
 * a card here; both are free for every reader, paid or not. `children` is where the page
 * hands them in, so this file needs to know nothing about either one's own fetch.
 */
export function FilmMemo({
  children,
  animate = true,
  delay = 0,
}: {
  children: ReactNode;
  animate?: boolean;
  delay?: number;
}) {
  return (
    <MemoCard
      dept="report"
      status={<MemoStatus dept="report" more={0} note={null} />}
      door={{ label: SECTIONS.report.title, href: SECTIONS.report.href }}
      animate={animate}
      delay={delay}
    >
      {children}
    </MemoCard>
  );
}
