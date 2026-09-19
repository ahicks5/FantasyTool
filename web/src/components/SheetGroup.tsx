"use client";
/** One bench on the call sheet: the tab that owns these calls, its status, and the calls. */
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { GROUPS, SECTIONS, type GroupKey } from "@/lib/vocab";
import { IconArrowUp, IconCheck, IconChevron } from "./icons";
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
  animate = true,
  delay = 0,
  children,
}: {
  group: GroupKey;
  /** The one-line status, or null when the bench is clear and the stamp speaks instead. */
  status: string | null;
  /** How many cards are folded underneath. Nothing to open means nothing to toggle. */
  count: number;
  /** False when this came from the session cache: it is already "on screen". */
  animate?: boolean;
  delay?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const section = SECTIONS[group];
  const expandable = count > 0;

  const head = (
    <>
      {/* `min-w-0` or the truncating status line sets this track's min-content width to
          the whole string and pushes the arrow off a 320px screen. */}
      <span className="min-w-0 flex-1">
        <span className="display block truncate text-[17px] leading-tight">{section.title}</span>
        {status ? (
          <span className="tnum mt-1 block truncate text-[12px] font-semibold leading-tight text-muted">{status}</span>
        ) : (
          // Wraps rather than truncates: "Nothing worth a bid" and a STANDING PAT stamp
          // want about 230px and a 320px screen leaves this column 178, so inline they
          // would cut the sentence in half. The stamp drops to its own line instead, and
          // sits back beside the words from 375px up.
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] leading-tight text-muted">
            {GROUPS[group].clear}
            <Stamp ink="text-start" className="shrink-0">
              <IconCheck size={11} strokeWidth={3.2} />
              {GROUPS[group].stamp}
            </Stamp>
          </span>
        )}
      </span>
      {expandable && (
        <IconChevron
          size={14}
          strokeWidth={2.8}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
        />
      )}
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
              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
            >
              {head}
            </button>
          ) : (
            // Nothing to reveal, so it is not a control. A disabled button here would still
            // take a tab stop and promise something that is not there.
            <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 px-4 py-3">{head}</div>
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
