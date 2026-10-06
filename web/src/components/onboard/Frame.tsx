"use client";
/** The walk's chrome: the small wordmark, the way back, the bar, and one screen at a time sliding in. */
import { IconChevron } from "@/components/icons";
import { Eyebrow, Wordmark } from "@/components/ui";
import { ONBOARD } from "@/lib/vocab";

/**
 * The frame every screen of the walk sits in. A full-height column on a phone: the bar
 * across the top (lit a little from the first screen, so the walk reads as begun), the
 * screen in the middle, and its button pinned to the bottom where the thumb is.
 */
export function Frame({
  progress,
  stepIndex,
  stepCount,
  onBack,
  children,
}: {
  progress: number;
  stepIndex: number;
  stepCount: number;
  onBack: (() => void) | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col overflow-x-clip px-4" data-testid="walk">
      <header className="flex h-14 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={ONBOARD.back}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-soft"
            data-testid="walk-back"
          >
            <IconChevron size={18} strokeWidth={2.6} className="rotate-180" />
          </button>
        ) : null}
        {/* The way home (W-004): the wordmark is the link, flush with the content edge on
            the first screen, where there is no way back to make room for. */}
        <Wordmark className="text-[20px]" linkClassName="flex min-h-11 flex-1 items-center" />
      </header>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stepCount}
        aria-valuenow={stepIndex}
        aria-label={ONBOARD.progressAria(stepIndex, stepCount)}
      >
        <span className="walk-bar-fill block h-full rounded-full bg-start-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {/* Clipped sideways: a screen slides in from 28px off its edge, and the page must not scroll with it. */}
      <main id="content" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}

/**
 * One screen: an eyebrow, the question, one line under it, the field, and the button
 * pinned to the bottom with the quiet way out under it. `dir` picks the side it slides
 * in from; the parent keys it by step so each screen animates once.
 */
export function Screen({
  eyebrow,
  title,
  line,
  children,
  footer,
  dir,
  testId,
}: {
  eyebrow: string;
  title: React.ReactNode;
  line?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  dir: "fwd" | "back";
  testId: string;
}) {
  return (
    <section className={`flex flex-1 flex-col ${dir === "back" ? "walk-back" : "walk-fwd"}`} data-testid={`walk-${testId}`}>
      <div className="flex-1 pt-8">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display mt-2 text-[32px] leading-[1.05]">{title}</h1>
        {line ? <p className="mt-2 max-w-[24rem] text-[15px] leading-relaxed text-muted">{line}</p> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
      {footer ? (
        <div className="sticky bottom-0 -mx-4 mt-6 bg-[color-mix(in_srgb,var(--color-plane)_94%,transparent)] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 backdrop-blur-md">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** The quiet way past a question: small, under the button, never hidden. */
export function Skip({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 min-h-11 w-full text-center text-[14px] font-bold text-muted underline-offset-4 hover:text-ink hover:underline"
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3.5 text-[17px] text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";
