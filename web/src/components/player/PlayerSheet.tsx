"use client";
/**
 * The player page: a full-height sheet that rises over whatever you were reading.
 *
 * The frame is three rows and only the middle one moves. The header holds who he is and
 * the mode toggle; the footer holds the three doors out; the middle is Vibes or Stats.
 * Freezing both ends is what makes it a page rather than a long card — you can scroll to
 * the bottom of a game log and the way out is still under your thumb.
 *
 * **There is no close button.** You swipe it down, press Escape, or press back. That is a
 * deliberate cost: it buys the header its whole width for the name and the toggle, which
 * at 320px is the difference between "Amon-Ra St. Brown" fitting and not. The drag handle
 * and the line under it say so, and both of them are also buttons, so a reader who never
 * swipes anything still has a target.
 *
 * The gesture rules are in `lib/player/sheet.ts` and are tested there. This file does the
 * DOM: which element the finger went down on, where the middle is scrolled, and turning a
 * decision into a transform.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getPlayerProfile } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { HttpError } from "@/lib/errors";
import { profileView } from "@/lib/profile";
import { DEFAULT_MODE, MODES, decide, type Mode } from "@/lib/player/sheet";
import type { Connection } from "@/lib/storage";
import type { PlayerProfile } from "@/lib/types";
import { PLAYER, SCOUT } from "@/lib/vocab";
import { Avatar } from "../Avatar";
import { ErrorBox, H2, InjuryTag, Opening } from "../ui";
import { Report } from "./Report";
import { VibesView } from "./VibesView";

/**
 * What the tapped row already knew about him.
 *
 * A name is almost always tapped from a row that is holding a whole `Player`, so the
 * header can be painted from that before any request goes out. Without it the sheet rises
 * with an empty head and fills in a beat later, which is the one moment the reader is
 * actually looking at it. Opening from a `?player=` link has no seed and does wait.
 */
export interface PlayerSeed {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  /** Only the roster payloads carry this, which is why the header takes a seed at all. */
  opponent?: string | null;
  photo?: string | null;
  team_logo?: string | null;
  injury_status?: string | null;
}

/** Who the header is drawing, from the seed or from the profile, whichever has landed. */
interface Head {
  name: string;
  position: string;
  nflTeam: string | null;
  opponent: string | null;
  photo: string | null;
  teamLogo: string | null;
  injuryStatus: string | null;
}

/** How far down the screen the panel starts, so the page behind it still shows. */
const TOP_INSET = "1.75rem";

export function PlayerSheet({
  c,
  playerId,
  seed,
  onClose,
}: {
  c: Connection;
  playerId: string;
  seed: PlayerSeed | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const middle = useRef<HTMLDivElement>(null);

  // Same cache key as the route's, so a player read in the sheet and then opened at
  // /waivers/<id> is one fetch, and both surfaces are the same report.
  const { data, error, cause, reload } = useCached<PlayerProfile>(
    `profile:${c.platform}:${c.league_id}:${c.team_id}:${playerId}`,
    () => getPlayerProfile(c.platform, c.league_id, playerId, c.team_id),
  );
  const view = useMemo(() => (data ? profileView(data, SCOUT.free) : null), [data]);
  const notFound = cause instanceof HttpError && cause.status === 404;

  // The seed wins on the fields it has, because it is on screen a beat sooner and says the
  // same thing; the profile fills the rest and is the only source once the sheet is opened
  // from a link. `opponent` is only ever the seed's -- the profile payload has no fixture
  // on it, and phase D is where the header gets one of its own.
  const head: Head | null = seed
    ? {
        name: seed.name,
        position: seed.position,
        nflTeam: seed.nfl_team,
        opponent: seed.opponent ?? null,
        photo: seed.photo ?? null,
        teamLogo: seed.team_logo ?? null,
        injuryStatus: seed.injury_status ?? null,
      }
    : view
      ? {
          name: view.name,
          position: view.position,
          nflTeam: view.nflTeam,
          opponent: null,
          photo: view.photo,
          teamLogo: view.teamLogo,
          injuryStatus: view.injuryStatus,
        }
      : null;

  /* ------------------------------------------------------------- the frame --- */

  // Escape leaves, and the page behind stops scrolling while the sheet is over it. Both
  // are what `ui.tsx`'s Sheet does; this one cannot reuse it because it is full height,
  // has a frozen footer and has no Done button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  /* ----------------------------------------------------------- the gesture --- */

  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Null while no finger is down. Set on the pointerdown that the sheet decides is its. */
  const from = useRef<{ y: number; t: number; atTop: boolean; inChrome: boolean } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // A secondary button or a second finger is not a swipe.
    if (!e.isPrimary || e.button !== 0) return;
    const target = e.target as Node;
    const inChrome = !middle.current?.contains(target);
    const atTop = (middle.current?.scrollTop ?? 0) <= 0;
    // The scroller's drag, not ours. Stay out of it entirely -- no capture, no transform --
    // so reading the report is exactly as it is on the route.
    if (!inChrome && !atTop) return;
    from.current = { y: e.clientY, t: e.timeStamp, atTop, inChrome };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = from.current;
    if (!start) return;
    // Clamped at zero: dragging up is the middle scrolling, and the panel is already at
    // the top of its travel, so it has nowhere to go. Never prevented -- the scroller
    // keeps the upward part of the gesture, which is what makes a drag that overshoots
    // and comes back feel like one motion rather than two.
    setDrag(Math.max(0, e.clientY - start.y));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = from.current;
      from.current = null;
      setDragging(false);
      if (!start) return;
      const verdict = decide({
        dy: e.clientY - start.y,
        dt: e.timeStamp - start.t,
        atTop: start.atTop,
        startedInChrome: start.inChrome,
      });
      // `reset` and `ignore` look the same from here -- the panel goes home. They differ
      // in whether it ever left, which is why the gesture module keeps them apart.
      setDrag(0);
      if (verdict === "close") onClose();
    },
    [onClose],
  );

  /* -------------------------------------------------------------- the page --- */

  const name = head?.name ?? "";
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${name} ${PLAYER.sheet}`.trim()}>
      <button aria-label={PLAYER.close} onClick={onClose} className="absolute inset-0 min-h-0 bg-black/55 backdrop-blur-[2px]" />
      <div
        data-mode={mode}
        data-dragging={dragging || undefined}
        style={{ top: TOP_INSET, transform: drag ? `translateY(${drag}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="sheet-panel absolute inset-x-0 bottom-0 mx-auto grid w-full max-w-lg grid-rows-[auto_1fr_auto] overflow-hidden rounded-t-[28px] bg-paper shadow-[var(--shadow-lift)] rise"
      >
        <Header head={head} mode={mode} onMode={setMode} onClose={onClose} />
        {/* `overscroll-contain` stops a flick at the end of the log from scrolling the page
            underneath, which on iOS also drags the sheet's own backdrop. */}
        <div ref={middle} className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5">
          <Middle mode={mode} view={view} notFound={notFound} error={error} reload={reload} onClose={onClose} />
        </div>
        <Footer playerId={playerId} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- head --- */

/**
 * Frozen: the avatar, who he is, and the toggle. Nothing here scrolls away, because the
 * whole page is about one player and forgetting which one is the one thing it cannot do.
 *
 * The drag handle is a button as well as a grip. Swiping is the gesture, but a mouse on a
 * desktop and a screen reader both need a target, and this is the one place a close
 * control can go without taking width off the name.
 */
function Header({
  head,
  mode,
  onMode,
  onClose,
}: {
  head: Head | null;
  mode: Mode;
  onMode: (m: Mode) => void;
  onClose: () => void;
}) {
  return (
    <div className="mode-chrome border-b border-line">
      <button onClick={onClose} aria-label={PLAYER.close} className="flex min-h-0 w-full justify-center pb-1 pt-2.5">
        <span aria-hidden className="h-1.5 w-10 rounded-full bg-line-2" />
      </button>
      <div className="flex items-start gap-3 px-4 pb-3">
        {/* `lg` and not `xl`: at 320px the toggle needs its width more than the head does. */}
        <Avatar name={head?.name ?? ""} photo={head?.photo ?? null} teamLogo={head?.teamLogo ?? null} size="lg" />
        <div className="min-w-0 flex-1">
          {/* Two lines at most, then it cuts. A third line moves the middle down by the
              height of a line on the one element that is supposed to be frozen. */}
          <h2 className="display line-clamp-2 text-[19px] leading-[1.15] break-words">
            {head?.name ?? " "}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
            <span>{positionLine(head)}</span>
            {head?.injuryStatus && <InjuryTag status={head.injuryStatus} />}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-muted">{PLAYER.swipe}</p>
        </div>
        <ModeToggle mode={mode} onMode={onMode} />
      </div>
    </div>
  );
}

/** "WR · CIN · vs CLE", dropping whatever is not on record rather than printing a gap. */
function positionLine(head: Head | null): string {
  if (!head) return " ";
  return [head.position, head.nflTeam, head.opponent ? `vs ${head.opponent}` : null].filter(Boolean).join(" · ");
}

/**
 * Two tabs, top right. The selected one carries the mode's word in the mode's ink, and the
 * frame around it has already changed colour -- so the flip is legible with the colour
 * stripped out, which is the house rule (docs/BRAND.md section 7).
 */
function ModeToggle({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div role="tablist" aria-label={PLAYER.modeGroup} className="flex shrink-0 rounded-full bg-soft p-0.5">
      {MODES.map((m) => {
        const on = m === mode;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={on}
            onClick={() => onMode(m)}
            className={`min-h-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-black tracking-tight ${
              on ? "mode-ink bg-paper shadow-[var(--shadow-card)]" : "text-muted"
            }`}
          >
            {PLAYER.modes[m].label}
            <span className="sr-only"> {PLAYER.modes[m].said}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- middle --- */

/**
 * The only part that scrolls, and the only part that can be empty.
 *
 * It never is: a wait, a 404 or an error box each take the whole middle, so the sheet has
 * no state in which it rises over the page and shows nothing.
 */
function Middle({
  mode,
  view,
  notFound,
  error,
  reload,
  onClose,
}: {
  mode: Mode;
  view: ReturnType<typeof profileView> | null;
  notFound: boolean;
  error: string;
  reload: () => void;
  onClose: () => void;
}) {
  // A 404 is the id being wrong, and it will still be wrong on a retry. The way out of it
  // is out of the sheet, so that is what it offers instead of a try-again.
  if (notFound) {
    return (
      <div className="card p-5">
        <H2>{PLAYER.notFoundHead}</H2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{PLAYER.notFoundLine}</p>
        <button onClick={onClose} className="mt-3 min-h-11 text-[13px] font-bold text-lean">
          {PLAYER.close}
        </button>
      </div>
    );
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!view) return <Opening />;
  return mode === "vibes" ? <VibesView reads={view.reads} /> : <Report view={view} />;
}

/* ------------------------------------------------------------------- footer --- */

/**
 * Three doors, frozen, and the bar never changes height.
 *
 * Two of them are shut in phase A. A disabled button that says "Soon" is better than a
 * bar that grows a third door later: the reader learns the shape of the page once, and
 * the footer is the one element that must not move while the middle scrolls.
 *
 * Mixed case, not the uppercase the rest of the app's chips use -- "POSITION BATTLE" does
 * not fit a third of a 320px bar, and a label that wraps takes the footer with it.
 */
function Footer({ playerId }: { playerId: string }) {
  return (
    <div className="mode-chrome grid grid-cols-3 gap-1 border-t border-line px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
      <Door label={PLAYER.footer.battle} />
      <Door label={PLAYER.footer.office} href={`/trade?player=${encodeURIComponent(playerId)}`} />
      <Door label={PLAYER.footer.chat} />
    </div>
  );
}

/** One door. Fixed height whether or not it carries the "soon" line, so the bar is level. */
function Door({ label, href }: { label: string; href?: string }) {
  const inner = (
    <>
      <span className="whitespace-nowrap text-[11px] font-bold leading-none">{label}</span>
      {!href && <span className="mt-1 text-[9px] font-black uppercase tracking-wide leading-none text-muted">{PLAYER.soon}</span>}
    </>
  );
  const shape = "flex h-12 min-h-0 flex-col items-center justify-center rounded-xl px-1 text-center";
  if (!href) {
    return (
      <span className={`${shape} text-muted opacity-60`} aria-disabled="true">
        {inner}
      </span>
    );
  }
  return (
    <Link href={href} className={`${shape} text-ink hover:bg-soft`}>
      {inner}
    </Link>
  );
}
