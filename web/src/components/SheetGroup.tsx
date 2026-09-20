"use client";
/** One row of the call sheet: a bench you work, or a room you read, and the door into it. */
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { GROUPS, ROOMS, SECTIONS, type GroupKey, type RoomKey } from "@/lib/vocab";
import { IconArrowUp, IconChevron, IconClock } from "./icons";
import { Stamp } from "./ui";

/**
 * A deadline the row has to say out loud — waivers clearing, kickoff, a trade deadline.
 *
 * `text` is the whole message and is written by the caller (`lib/deadline.ts`), so the
 * urgency here only ever picks a colour and a weight. That ordering is the rule, not an
 * accident: the words say the thing, the colour agrees with them. A row whose meaning
 * lived in the colour would be silent in greyscale and to a screen reader.
 */
export interface SheetNote {
  text: string;
  urgency: "open" | "soon" | "final";
}

/**
 * The same three bands `Countdown` uses, escalating by fill rather than by a second hue.
 *
 * `open` is the common case — most of the week, on every row — so it is the muted step and
 * disappears into the status line above it. `soon` takes the warning amber as text.
 *
 * `final` is the same amber in a filled chip, and the two reds it is deliberately *not*
 * are each ruled out by a different rule. `--color-signal` is the brand's lamp, and
 * BRAND.md confines it to chrome — wordmark, call-sheet band, ON AIR chip, share-card
 * corner — "never on a player row, never on a verdict". `Countdown` may turn it red
 * because it sits on the call-sheet band; this line sits on a card, which is not chrome.
 * `--color-sit` is status red, which is the app's word for "bench this player", and
 * spending it on a clock would read as a claim about the names underneath.
 *
 * Fill also survives the dark theme, which a brighter amber would not: `--color-flip` and
 * `--color-flip-fill` resolve to the same value on black, so `soon` and `final` would be
 * indistinguishable in the default theme. Each theme's `flip` / `flip-soft` pair is
 * designed as a contrast pair, so the chip reads on paper and on black.
 */
const NOTE_INK: Record<SheetNote["urgency"], string> = {
  open: "text-muted",
  soon: "text-flip",
  final: "text-flip bg-flip-soft rounded-[4px] px-1.5 py-0.5 -mx-0.5",
};

/**
 * The deadline line, under the status line and inside the same text column.
 *
 * It is its own line rather than a chip beside the title for one reason: at 320px that
 * column is ~178px wide (288px card, less the 52px arrow, less 32px of padding, less the
 * 12px gap and the 14px caret slot), and anything sharing the row with the title takes its
 * width from the title. "Depth ch…" has shipped here once already. On its own line the note
 * gets the full column, truncates only against itself, and the title is untouched at every
 * width.
 *
 * The clock is a second channel for the same fact, and it is always present so that a row
 * does not change shape as a deadline tightens. Colour is never the only channel: the
 * words say it, the weight goes black at `final`, and the chip is a shape a greyscale eye
 * can still see.
 *
 * `inline-flex`, not `flex`, so the chip's fill wraps the words. The text column is block
 * flow, where a block-level flex box stretches the full 178px and the fill reads as a bar
 * across the row rather than as a chip on a clock. `max-w-full` with `min-w-0` keeps the
 * inner truncation working inside that shrink-wrapped box.
 */
function NoteLine({ note }: { note: SheetNote }) {
  return (
    <span className={`mt-1 inline-flex min-w-0 max-w-full items-center gap-1 align-top ${NOTE_INK[note.urgency]}`}>
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
 * The text column both kinds of row fill: title, a line under it, and any deadline.
 *
 * `min-w-0` or the truncating lines set this track's min-content width to the whole string
 * and push the arrow off a 320px screen.
 */
function RowText({
  title,
  dim = false,
  line,
  tnum = false,
  note,
}: {
  title: string;
  /** The title recedes when there is nothing left to do here. */
  dim?: boolean;
  line: ReactNode;
  /** Tabular figures, for a line that is counting something. */
  tnum?: boolean;
  note?: SheetNote | null;
}) {
  return (
    <span className="min-w-0 flex-1">
      {/* The title recedes rather than the whole row. Fading the `<section>` was the
          obvious move and the wrong one: the arrow beside it is a 44px navigation
          target, and dropping a control to 55% opacity to say something about the text
          next to it is how a link ends up under its contrast floor. */}
      <span
        className={`display block truncate text-[17px] leading-tight transition-colors ${dim ? "text-muted" : ""}`}
      >
        {title}
      </span>
      <span className={`mt-1 block truncate text-[12px] font-semibold leading-tight text-muted ${tnum ? "tnum" : ""}`}>
        {line}
      </span>
      {note && <NoteLine note={note} />}
    </span>
  );
}

/**
 * The row itself: the text, the reserved caret slot, and the arrow into the tab.
 *
 * Every row on the sheet is this shape, so a bench and a room line up down both edges
 * without either one owning a private copy of the layout.
 *
 * The toggle and the arrow are two separate controls on purpose. A `<Link>` inside a
 * `<button>` is invalid HTML — the browser flattens it and the keyboard order goes with
 * it — so opening the calls here and leaving for the tab are neighbours, each with its
 * own 44px target.
 */
function SheetRowShell({
  section,
  animate,
  delay,
  toggle,
  children,
}: {
  section: { href: string; title: string };
  animate: boolean;
  delay: number;
  /** Present only when there is something folded underneath to open. */
  toggle?: { open: boolean; panelId: string; onToggle: () => void };
  children: ReactNode;
}) {
  const inner = (
    <>
      {children}
      {/* The caret's slot is reserved whether or not there is a caret in it. Rendered only
          when expandable, it stole 14px from the row it appeared on and nothing from the
          others, so the stamps ended at three different x positions and read as scattered
          rather than as a column of verdicts down the right edge. A room has no caret and
          keeps the slot for the same reason: it also keeps its text column the same width
          as the benches', so the three lines wrap and truncate identically. */}
      <span aria-hidden className="flex w-[14px] shrink-0 self-center justify-center">
        {toggle && (
          <IconChevron
            size={14}
            strokeWidth={2.8}
            className={`text-muted transition-transform ${toggle.open ? "rotate-90" : ""}`}
          />
        )}
      </span>
    </>
  );

  return (
    <section className={`card overflow-hidden ${animate ? `rise rise-${Math.min(delay, 5)}` : ""}`}>
      <div className="flex min-w-0 items-stretch">
        {toggle ? (
          <button
            onClick={toggle.onToggle}
            aria-expanded={toggle.open}
            aria-controls={toggle.panelId}
            className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
          >
            {inner}
          </button>
        ) : (
          // Nothing to reveal, so it is not a control. A disabled button here would still
          // take a tab stop and promise something that is not there.
          <div className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 px-4 py-3">{inner}</div>
        )}
        <Link
          href={section.href}
          aria-label={`Go to ${section.title}`}
          className="flex w-[52px] shrink-0 items-center justify-center border-l border-line-2 text-muted hover:bg-soft"
        >
          {/* The caret above says "open this"; a full arrow says "leave for the tab".
              Two chevrons side by side read as one control. */}
          <IconArrowUp size={17} strokeWidth={2.4} className="rotate-90" />
        </Link>
      </div>
    </section>
  );
}

/**
 * A status row for one section of the sheet, with its calls folded underneath.
 *
 * The row exists whether or not the section has anything to say, which is the whole
 * reason the sheet is grouped: a settled lineup produces no card at all, so the old flat
 * list could only stay silent about it. "Lineup's set" is an answer; nothing is not.
 */
export function SheetGroup({
  group,
  status,
  count,
  done = 0,
  total = 0,
  note = null,
  animate = true,
  delay = 0,
  children,
}: {
  group: GroupKey;
  /** The one-line status, or null when the bench is clear and the stamp speaks instead. */
  status: string | null;
  /** How many cards are folded underneath. Nothing to open means nothing to toggle. */
  count: number;
  /** Calls on this bench already ticked off, out of `total` that can be ticked at all. */
  done?: number;
  /** Callable calls here. A hold is not one, so a bench of holds is never "worked". */
  total?: number;
  /** A deadline this bench is up against. Omitted when there is nothing to say. */
  note?: SheetNote | null;
  /** False when this came from the session cache: it is already "on screen". */
  animate?: boolean;
  delay?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const section = SECTIONS[group];
  const expandable = count > 0;
  // Every call on this bench is made. The row recedes to match the cards underneath it,
  // so scanning the sheet answers "what is left" without opening anything.
  const worked = total > 0 && done >= total;

  return (
    <>
      <SheetRowShell
        section={section}
        animate={animate}
        delay={delay}
        toggle={expandable ? { open, panelId, onToggle: () => setOpen((o) => !o) } : undefined}
      >
        <RowText
          title={section.title}
          dim={worked}
          tnum={!!status}
          note={note}
          line={
            <>
              {status ?? GROUPS[group].clear}
              {/* Opacity alone is not a channel a screen reader or a greyscale eye can read,
                  and "all of them" is the one number worth saying out loud. */}
              {worked && <span className="text-start"> · all called</span>}
            </>
          }
        />
        {/* Pinned top-right rather than trailing the sentence it belongs to.
            Inline, the stamp had to wrap under the words at 320px -- "Nothing worth a bid"
            plus STANDING PAT wants ~230px and the column has ~178 -- so a clear bench was
            a line taller than a busy one, which is backwards. Up here it is out of the
            text flow entirely: the status line truncates on one line at every width, all
            three rows are the same height, and the stamps line up down the right edge
            where they read as a column of verdicts rather than as trailing punctuation. */}
        {!status && (
          // No tick inside it. The glyph cost ~17px of a row that has none to spare at
          // 320px, and the stamp does not need it: the rotated rule and the word are both
          // non-colour channels already, so dropping it loses decoration, not meaning.
          <Stamp ink="text-start" className="mt-0.5 shrink-0 self-start">
            {GROUPS[group].stamp}
          </Stamp>
        )}
      </SheetRowShell>
      {expandable && (
        // Kept mounted and hidden rather than unmounted: a card holds its own "called"
        // stamp and its Why? panel, and folding the group shut must not throw those away.
        // The `hidden` attribute sits on a bare wrapper, never on the grid itself — a
        // `display` utility outranks `[hidden]` and the panel would stay open.
        <div id={panelId} hidden={!open}>
          <ol className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3.5">{children}</ol>
        </div>
      )}
    </>
  );
}

/**
 * A room on the sheet: a door into a tab you read rather than a bench you work.
 *
 * It takes no status, no stamp, no count and no caret, because it has no verdict to
 * deliver — nothing on the feed measures the film. What it has is the same row height,
 * the same text column and the same arrow as a bench, so the front door reads as one list
 * of destinations rather than three benches with a footnote bolted underneath.
 */
export function SheetRoom({
  room,
  note = null,
  animate = true,
  delay = 0,
}: {
  room: RoomKey;
  /** A deadline attached to this room, on the same terms as a bench's. */
  note?: SheetNote | null;
  animate?: boolean;
  delay?: number;
}) {
  const section = SECTIONS[room];
  return (
    <SheetRowShell section={section} animate={animate} delay={delay}>
      <RowText title={section.title} line={ROOMS[room].line} note={note} />
    </SheetRowShell>
  );
}
