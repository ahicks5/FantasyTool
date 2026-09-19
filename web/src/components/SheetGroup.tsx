"use client";
/** One bench on the call sheet: the tab that owns these calls, its status, and the calls. */
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { GROUPS, SECTIONS, type GroupKey } from "@/lib/vocab";
import { IconArrowUp, IconChevron } from "./icons";
import { Stamp } from "./ui";

/**
 * A status row for one section of the sheet, with its calls folded underneath.
 *
 * The row exists whether or not the section has anything to say, which is the whole
 * reason the sheet is grouped: a settled lineup produces no card at all, so the old flat
 * list could only stay silent about it. "Lineup's set" is an answer; nothing is not.
 *
 * The toggle and the arrow are two separate controls on purpose. A `<Link>` inside a
 * `<button>` is invalid HTML — the browser flattens it and the keyboard order goes with
 * it — so opening the calls here and leaving for the tab are neighbours, each with its
 * own 44px target.
 */
export function SheetGroup({
  group,
  status,
  count,
  done = 0,
  total = 0,
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

  const head = (
    <>
      {/* `min-w-0` or the truncating status line sets this track's min-content width to
          the whole string and pushes the arrow off a 320px screen. */}
      <span className="min-w-0 flex-1">
        {/* The title recedes rather than the whole row. Fading the `<section>` was the
            obvious move and the wrong one: the arrow beside it is a 44px navigation
            target, and dropping a control to 55% opacity to say something about the text
            next to it is how a link ends up under its contrast floor. */}
        <span
          className={`display block truncate text-[17px] leading-tight transition-colors ${
            worked ? "text-muted" : ""
          }`}
        >
          {section.title}
        </span>
        <span
          className={`mt-1 block truncate text-[12px] font-semibold leading-tight text-muted ${status ? "tnum" : ""}`}
        >
          {status ?? GROUPS[group].clear}
          {/* Opacity alone is not a channel a screen reader or a greyscale eye can read,
              and "all of them" is the one number worth saying out loud. */}
          {worked && <span className="text-start"> · all called</span>}
        </span>
      </span>
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
      {/* The caret's slot is reserved whether or not there is a caret in it. Rendered only
          when expandable, it stole 14px from the row it appeared on and nothing from the
          others, so the stamps ended at three different x positions and read as scattered
          rather than as a column of verdicts down the right edge. */}
      <span aria-hidden className="flex w-[14px] shrink-0 self-center justify-center">
        {expandable && (
          <IconChevron
            size={14}
            strokeWidth={2.8}
            className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
      </span>
    </>
  );

  return (
    <>
      <section className={`card overflow-hidden ${animate ? `rise rise-${Math.min(delay, 5)}` : ""}`}>
        <div className="flex min-w-0 items-stretch">
          {expandable ? (
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
            >
              {head}
            </button>
          ) : (
            // Nothing to reveal, so it is not a control. A disabled button here would still
            // take a tab stop and promise something that is not there.
            <div className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 px-4 py-3">{head}</div>
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
