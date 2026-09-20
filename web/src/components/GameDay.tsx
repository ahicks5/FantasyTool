"use client";
/**
 * The game-day answer, above the board: am I good for Sunday, did anything just happen,
 * and is anything actually broken.
 *
 * Three collapsed rows, each one line, each opening onto its detail. A row exists whether
 * or not it has anything to report, for the same reason the call sheet's groups do: "all
 * clear" is an answer and an absent card is not. A row with nothing to open is a `<div>`,
 * never a disabled `<button>` — a disabled control still takes a tab stop and promises
 * something that is not there.
 *
 * Every number and every word here comes out of `lib/gameday.ts`. This file draws rows.
 */

import { useId, useState, type ReactNode } from "react";
import {
  GAMEDAY_COPY as COPY,
  dotted,
  gameDay,
  playerMeta,
  type NewsRow,
  type SlotProblem,
  type StarterQuestion,
} from "@/lib/gameday";
import type { Lineup } from "@/lib/types";
import { IconChevron } from "./icons";
import { Stamp } from "./ui";

/* Colour, and why each one.

   `text-sit` is status red, the app's word for "this man should not be in your lineup".
   An empty slot, a starter on his bye and a starter the engine already scores as zero are
   all exactly that claim, about exactly those names, and it is true without a projection
   in sight — so the token is doing its own job here rather than being borrowed for
   emphasis. `text-flip` is the warning amber the countdown and the coin-flip band use:
   unresolved, not decided. A Questionable tag is a thing to check before kickoff, not a
   verdict, and painting it red would put words in the platform's mouth.

   `--color-signal` appears nowhere below. BRAND.md confines the brand red to chrome —
   never a player row. */
const SOFT = "text-flip";
const HARD = "text-sit";

/**
 * One collapsible row. `children` is the detail; without it the row is not a control.
 *
 * The caret's 14px slot is reserved whether or not there is a caret in it, so the three
 * rows keep one text column width and their lines truncate against the same edge.
 */
function Row({
  title,
  line,
  lineInk = "text-muted",
  stamp,
  animate = false,
  delay = 0,
  children,
}: {
  title: string;
  line: string;
  lineInk?: string;
  stamp?: ReactNode;
  animate?: boolean;
  delay?: number;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const expandable = !!children;

  const head = (
    <>
      {/* `min-w-0` or the truncating lines set this track's min-content width to the
          whole string and push the caret off a 320px screen. */}
      <span className="min-w-0 flex-1">
        <span className="display block truncate text-[17px] leading-tight">{title}</span>
        <span className={`mt-1 block truncate text-[12px] font-semibold leading-tight ${lineInk}`}>{line}</span>
      </span>
      {stamp}
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
    <section className={`card overflow-hidden ${animate ? `rise rise-${Math.min(delay, 5)}` : ""}`}>
      {expandable ? (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[44px] w-full min-w-0 items-start gap-3 px-4 py-3 text-left"
        >
          {head}
        </button>
      ) : (
        <div className="flex min-h-[44px] min-w-0 items-start gap-3 px-4 py-3">{head}</div>
      )}
      {/* The `hidden` attribute sits on a bare wrapper, never on the list itself: a
          `display` utility outranks `[hidden]` and the panel would stay open. */}
      {expandable && (
        <div id={panelId} hidden={!open}>
          <ul className="grid divide-y divide-line border-t border-line">{children}</ul>
        </div>
      )}
    </section>
  );
}

/**
 * One player inside an open row: where he lines up, who he is, and what is wrong.
 *
 * Two lines rather than one, because at 320px the text column is ~230px and a name plus
 * a body part plus a time on one line is how "Depth ch…" happens. Both lines truncate
 * against that column and nothing pushes the trailing time off screen.
 */
function DetailRow({
  slug,
  name,
  meta,
  detail,
  ink,
  trailing,
}: {
  slug: string;
  name: string;
  meta: string;
  detail: string;
  ink: string;
  trailing?: string;
}) {
  return (
    <li className="flex min-w-0 items-start gap-2.5 px-4 py-2.5">
      <span className="slug w-[30px] shrink-0 pt-px text-[10px] uppercase tracking-[0.06em] text-muted">{slug}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold leading-tight">{name}</span>
        <span className={`mt-px block truncate text-[11px] font-semibold leading-tight ${ink}`}>
          {dotted(meta, detail)}
        </span>
      </span>
      {trailing && <span className="tnum shrink-0 pt-px text-[11px] font-semibold text-muted">{trailing}</span>}
    </li>
  );
}

function QuestionRow({ q }: { q: StarterQuestion }) {
  // A soft flag is amber; anything that means the slot scores zero takes status red.
  const ink = q.kind === "injury" && !q.hardOut ? SOFT : HARD;
  return (
    <DetailRow
      slug={q.slot}
      name={q.name ?? COPY.emptyName}
      meta={playerMeta(q.position, q.nflTeam)}
      detail={q.detail}
      ink={ink}
    />
  );
}

function ProblemRow({ p }: { p: SlotProblem }) {
  return (
    <DetailRow
      slug={p.slot}
      name={p.name ?? COPY.emptyName}
      meta={playerMeta(p.position, p.nflTeam)}
      detail={p.detail}
      ink={HARD}
    />
  );
}

function NewsItem({ r }: { r: NewsRow }) {
  return (
    <DetailRow
      slug={r.slug}
      name={r.name}
      meta={playerMeta(r.position, r.nflTeam)}
      // News is not good or bad. The timestamp says when, the status says what, and the
      // colour of a status we are only reporting is the muted one unless it is a hard out.
      detail={r.detail}
      ink={r.detail ? SOFT : "text-muted"}
      trailing={r.ago}
    />
  );
}

export function GameDay({ lineup, animate = true }: { lineup: Lineup; animate?: boolean }) {
  /* One clock per mount, so the relative times do not jitter between renders and no
     module-level `Date.now()` exists. Safe in the state initialiser because this view
     only ever mounts after the lineup has been fetched in the browser — the depth page
     renders `<Opening/>` on the server and through hydration. */
  const [now] = useState(() => Date.now());
  const { check, justIn, problems } = gameDay(lineup, now);

  return (
    <div className="grid min-w-0 gap-3">
      <Row
        title={COPY.checkTitle}
        line={check.line}
        lineInk={check.allClear ? "text-muted" : SOFT}
        animate={animate}
        delay={1}
        stamp={
          check.allClear && check.starters > 0 ? (
            <Stamp ink="text-start" className="mt-0.5 shrink-0 self-start">
              {COPY.checkStamp}
            </Stamp>
          ) : undefined
        }
      >
        {check.questions.length > 0
          ? check.questions.map((q) => <QuestionRow key={q.key} q={q} />)
          : undefined}
      </Row>

      <Row title={COPY.newsTitle} line={justIn.line} animate={animate} delay={2}>
        {justIn.rows.length > 0 ? justIn.rows.map((r) => <NewsItem key={r.key} r={r} />) : undefined}
      </Row>

      <Row
        title={COPY.problemsTitle}
        line={problems.line}
        lineInk={problems.rows.length > 0 ? HARD : "text-muted"}
        animate={animate}
        delay={3}
      >
        {problems.rows.length > 0 ? problems.rows.map((p) => <ProblemRow key={p.key} p={p} />) : undefined}
      </Row>
    </div>
  );
}
