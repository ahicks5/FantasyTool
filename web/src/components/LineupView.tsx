"use client";
/**
 * Lineup: is my starting lineup right for this week? Two piles, then the roster.
 *
 * The page splits the week into things nobody should spend a second on (a man who will not
 * play, an empty slot, a swap the projection has settled) and roles that need the owner:
 * a starting role (RB2, FLEX) where the engine's pick is not a Lock over the closest man
 * on the bench. The two are never blurred: the hero states both counts side by side, and
 * each pile has its own section.
 *
 * A role that needs the owner is one tight row here -- the role in big letters, the pick
 * ringed green, the other men in the frame beside him, an arrow -- and a whole page of
 * its own at `/team/decide?role=RB2` (`DecisionView`), where every read on every man is
 * laid out and the owner can mark it handled. The roster below is one line per man: role,
 * face, name, his rank at his position in this league, his number, his tag. A row with a
 * decision behind it carries the same arrow.
 *
 * The head coach owns the tab: his notes are the hero's top line, and when the tab opens
 * fresh a stamp lands over the page with the two numbers and the faces involved. It stays
 * until dismissed, so the summary is seen.
 *
 * Every number and every probability comes from the engine (`engine/lineup.roles`,
 * `engine/decisions.py`). Every word comes from `lib/vocab.ts`. This file draws.
 */

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import type { Lineup, LineupChange, LineupHole, LineupRole, Player } from "@/lib/types";
import { signed } from "@/lib/format";
import { handledKey, loadConnection, loadHandled, saveHandled } from "@/lib/storage";
import { CONFIDENCE_LABEL, LINEUP, SECTIONS } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { PlayerName, PlayerTarget } from "./Players";
import { IconAlert, IconArrowUp, IconCheck, IconChevron, IconFlag, IconLock, IconNotes, IconX } from "./icons";
import { ConfidenceStamp, CountUp, Eyebrow, H2, InjuryTag, LinkButton, Stamp } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };
const INK: Record<string, string> = { Lock: "text-start", Lean: "text-lean", "Coin flip": "text-flip" };

/** Session-scoped: the stamp has landed this sitting (value: the week). */
const BOOM_KEY = "booth.boom";
/** Written by a role's page so the stamp stays down on the way back to the lineup. */
const BOOM_SKIP = "skip";
export function skipNextBoom() {
  try {
    window.sessionStorage.setItem(BOOM_KEY, BOOM_SKIP);
  } catch {
    /* nothing to remember with: it lands again */
  }
}

/** The statuses that put a man on the reserve list rather than the bench. */
const RESERVE = new Set(["IR", "PUP"]);

export function decideHref(label: string): string {
  return `${SECTIONS.team.href}/decide?role=${encodeURIComponent(label)}`;
}

// Browser storage is read before the first paint on the client and never on the server,
// so hydration sees the same empty set on both sides (the same shape `ui.tsx` uses).
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Which roles this reader has marked handled this week. Shared with `DecisionView`. */
export function useHandled(week: number): [Set<string>, (label: string, on: boolean) => void] {
  const [key, setKey] = useState<string | null>(null);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  useBeforePaint(() => {
    const c = loadConnection();
    if (!c) return;
    const k = handledKey(c.platform, c.league_id, c.team_id, week);
    setKey(k);
    setHandled(new Set(loadHandled(k)));
  }, [week]);
  const set = (label: string, on: boolean) => {
    const next = new Set(handled);
    if (on) next.add(label);
    else next.delete(label);
    setHandled(next);
    if (key) saveHandled(key, [...next]);
  };
  return [handled, set];
}

/** "RB12": where he ranks at his position in this league this week. A dash without one. */
function PosRank({ p }: { p: Player }) {
  return <span className="roster-rank tnum">{p.pos_rank ? `${p.position}${p.pos_rank.rank}` : "\u2014"}</span>;
}

/** A man who cannot be started this week: out, on reserve, suspended, doubtful. */
const DOWN = new Set(["OUT", "IR", "PUP", "SUS", "NA", "DOUBTFUL"]);

/**
 * One line of the roster, on a fixed grid so every column stands in a line: the role, the
 * face, the name, his rank at his position, his number, and one mark. The mark is a green
 * lock when the projection has settled his role, a gold flag when the role is the owner's
 * to decide (it opens that decision), and a red alert when he cannot play and has to leave
 * the lineup. The row itself opens the man's page.
 */
function RosterRow({ label, p, confidence, role, changed }: { label: string; p: Player | null; confidence?: string; role?: LineupRole; changed?: boolean }) {
  const down = !p || DOWN.has((p.injury_status ?? "").toUpperCase());
  const inFrame = !!role?.decision && !!p && (p.id === role.pick?.id || role.candidates.some((c) => c.player.id === p.id));
  const mark = down ? (
    <span className="roster-mark text-sit" role="img" aria-label={LINEUP.mark.out}>
      <IconAlert size={15} strokeWidth={2.2} />
    </span>
  ) : inFrame && role ? (
    <Link href={decideHref(role.label)} aria-label={LINEUP.mark.flag(role.label)} className="roster-mark roster-flag text-flip">
      <IconFlag size={15} strokeWidth={2} />
    </Link>
  ) : confidence === "Lock" ? (
    <span className="roster-mark text-start" role="img" aria-label={LINEUP.mark.lock}>
      <IconLock size={14} strokeWidth={2.3} />
    </span>
  ) : (
    <span className="roster-mark" aria-hidden />
  );
  return (
    <li className={`roster-row ${changed ? "bg-start-soft" : ""}`}>
      {p ? (
        <PlayerTarget p={p} className="roster-row-main" face={false}>
          <span className="roster-role">{label}</span>
          <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="xs" ring={confidence ? RING[confidence] : undefined} />
          <span className="roster-name">
            <span className="truncate">{p.name}</span>
            <InjuryTag status={p.injury_status} />
          </span>
          <PosRank p={p} />
          <span className="roster-proj display tnum">{p.projected.toFixed(1)}</span>
        </PlayerTarget>
      ) : (
        <span className="roster-row-main">
          <span className="roster-role">{label}</span>
          <Avatar name="?" size="xs" />
          <span className="roster-name text-muted">{LINEUP.change.empty}</span>
          <span className="roster-rank" />
          <span className="roster-proj" />
        </span>
      )}
      {mark}
    </li>
  );
}

/**
 * A required change, blatant: the out man's face under a red X, a green arrow, the in man
 * ringed green, and what the swap is worth. `faces` finds each man's photo on the roster,
 * because the change itself carries only names.
 */
function Change({ c, faces, animate, i }: { c: LineupChange; faces: Map<string, Player>; animate: boolean; i: number }) {
  const out = c.out ? faces.get(c.out.id) : undefined;
  const inn = faces.get(c.in.id);
  return (
    <li className={`card border-sit/35 p-3.5 ${animate ? `print print-${Math.min(i + 1, 5)}` : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{c.slot}</Eyebrow>
        {c.forced ? (
          <Stamp ink="text-sit" size="md">{LINEUP.change.forced}</Stamp>
        ) : (
          <ConfidenceStamp value={c.confidence} />
        )}
      </div>
      <div className="swap mt-3">
        <span className="swap-man swap-out" role="img" aria-label={LINEUP.change.outAria(c.out?.name ?? LINEUP.change.empty)}>
          <span className="swap-face">
            <Avatar name={c.out?.name ?? "?"} photo={out?.photo} teamLogo={out?.team_logo} size="lg" ring="sit" />
            <span className="swap-x" aria-hidden>
              <IconX size={56} strokeWidth={3.2} />
            </span>
          </span>
          <span className="swap-name">{c.out?.name ?? LINEUP.change.empty}</span>
        </span>
        <span className="swap-arrow" aria-hidden>
          <IconArrowUp size={26} strokeWidth={3} className="rotate-90" />
        </span>
        <span className={`swap-man swap-in ${animate ? "promote" : ""}`} role="img" aria-label={LINEUP.change.inAria(c.in.name)}>
          <span className="swap-face">
            <Avatar name={c.in.name} photo={inn?.photo} teamLogo={inn?.team_logo} size="lg" ring="start" />
          </span>
          <span className="swap-name">{c.in.name}</span>
        </span>
        <span className="swap-gain">
          <span className="swap-gain-n display tnum">{signed(c.gain)}</span>
          <span className="swap-gain-l">{LINEUP.change.saves}</span>
        </span>
      </div>
      <p className="mt-3 text-[12px] leading-snug text-ink-2">{c.reason}</p>
    </li>
  );
}

/** A slot the roster cannot fill: not a swap, a trip to the wire. */
function Hole({ h, animate, i }: { h: LineupHole; animate: boolean; i: number }) {
  return (
    <li className={`card border-sit/35 p-3.5 ${animate ? `print print-${Math.min(i + 1, 5)}` : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{h.slot}</Eyebrow>
        <Stamp ink="text-sit" size="md">{LINEUP.change.hole}</Stamp>
      </div>
      <div className="mt-2 text-[15px] font-black text-sit">{h.player ? <PlayerName p={h.player} /> : LINEUP.change.empty}</div>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-2">{h.reason}</p>
      <LinkButton href={SECTIONS.waivers.href} variant="secondary" size="sm" className="mt-2.5">
        {LINEUP.change.wire}
      </LinkButton>
    </li>
  );
}

/**
 * One role that needs the owner, as a teaser: the role in big letters, the pick ringed
 * green, the other men in the frame, the tag, the arrow. Every word about *why* lives on
 * the role's own page, so this row stays one line tall.
 */
function RoleRow({ r, animate, i }: { r: LineupRole; animate: boolean; i: number }) {
  const others = r.candidates.slice(0, 3);
  const more = r.candidates.length - others.length;
  return (
    <li className={`card role-row ${animate ? `print print-${Math.min(i + 1, 5)}` : ""}`}>
      <Link href={decideHref(r.label)} aria-label={LINEUP.role.aria(r.label)} className="role-row-link">
        <span className="role-label display">{r.label}</span>
        <span className="role-faces">
          {r.pick && (
            <span className="role-pick">
              <Avatar name={r.pick.name} photo={r.pick.photo} teamLogo={r.pick.team_logo} size="sm" ring="start" />
            </span>
          )}
          {others.map((c) => (
            <Avatar key={c.player.id} name={c.player.name} photo={c.player.photo} teamLogo={c.player.team_logo} size="sm" />
          ))}
          {more > 0 && <span className="role-more tnum">+{more}</span>}
        </span>
        <span className="role-meta">
          <span className={`role-tag ${INK[r.confidence]}`}>{CONFIDENCE_LABEL[r.confidence]}</span>
          {r.change && <span className="role-change">{r.tipped ? LINEUP.role.tipped : LINEUP.role.change}</span>}
        </span>
        <IconChevron size={14} strokeWidth={2.8} className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}

/**
 * The stamp that lands when the tab opens: an alarm, no numbers, and the faces. It stays until
 * dismissed, by the button or a tap on the shade, so the summary is seen. Never under
 * reduced motion, where the CSS hides it.
 */
function Boom({ required, decisions, faces, onDone }: { required: number; decisions: number; faces: Player[]; onDone: () => void }) {
  const clear = required + decisions === 0;
  return (
    <div className="boom" role="dialog" aria-label={LINEUP.stamp.aria} onClick={onDone}>
      <div className="boom-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="boom-x" aria-label={LINEUP.stamp.closeAria} onClick={onDone}>
          <IconX size={16} strokeWidth={2.4} />
        </button>
        <span className="coach-notes text-muted">
          <span className="coach-notes-pad">
            <IconNotes size={18} strokeWidth={2.2} />
          </span>
          {LINEUP.coach.notes}
        </span>
        <Stamp size="xl" ink={required > 0 ? "text-sit" : decisions > 0 ? "text-flip" : "text-start"} slam className="text-[30px]">
          {clear ? LINEUP.stamp.clear : LINEUP.stamp.urgent}
        </Stamp>
        {!clear && <span className="boom-then">{LINEUP.stamp.then}</span>}
        {faces.length > 0 && (
          <>
            <span className="boom-faces">
              {faces.map((p) => (
                <Avatar key={p.id} name={p.name} photo={p.photo} teamLogo={p.team_logo} size="md" />
              ))}
            </span>
          </>
        )}
        <button type="button" className="boom-close" onClick={onDone}>
          {LINEUP.stamp.close}
        </button>
      </div>
    </div>
  );
}

export function LineupView({
  lineup,
  compact = false,
  animate = true,
}: {
  lineup: Lineup;
  compact?: boolean;
  /** False when this came from the session cache: the board is already on screen. */
  animate?: boolean;
}) {
  const required = lineup.required ?? [];
  const holes = lineup.holes ?? [];
  const roles = lineup.roles ?? [];
  const [handled, setHandled] = useHandled(lineup.week);
  const open = roles.filter((r) => r.decision && !handled.has(r.label));
  const done = roles.filter((r) => r.decision && handled.has(r.label));
  const nRequired = lineup.summary?.required ?? required.length + holes.length;
  const nDecisions = open.length;
  const set = nRequired + nDecisions === 0;
  // A bench man's arrow goes to the role he is in the frame for, when that role is open.
  const roleOf = new Map<string, LineupRole>();
  for (const r of roles) if (r.decision) for (const c of r.candidates) roleOf.set(c.player.id, r);
  // Every man on the roster by id, for the faces a required change names.
  const men = new Map<string, Player>();
  for (const sl of lineup.slots) if (sl.player) men.set(sl.player.id, sl.player);
  for (const b of lineup.bench) men.set(b.player.id, b.player);
  const bench = lineup.bench.filter((b) => !RESERVE.has((b.player.injury_status ?? "").toUpperCase()));
  const reserve = lineup.bench.filter((b) => RESERVE.has((b.player.injury_status ?? "").toUpperCase()));

  // The stamp lands on every arrival at the tab -- a fresh open, a tap over from another
  // room -- never in the report's compact embed, and not on the way back from a role's
  // page, which leaves a marker so the summary does not re-land mid-decision. (It used to
  // land once per browser session; a phone keeps that session for days, so it never came
  // back, and a summary the owner never sees again is not a summary.)
  const [boom, setBoom] = useState(false);
  useBeforePaint(() => {
    if (compact) return;
    // A shared link straight to a player opens his page over the lineup; the stamp would
    // land on top of it, two dialogs deep. He came for the player: let him have it.
    if (new URLSearchParams(window.location.search).has("player")) return;
    try {
      if (window.sessionStorage.getItem(BOOM_KEY) === BOOM_SKIP) {
        window.sessionStorage.removeItem(BOOM_KEY);
        return;
      }
    } catch {
      /* blocked storage: it lands every time */
    }
    setBoom(true);
  }, [compact, lineup.week]);
  const dismiss = () => setBoom(false);
  const faces = [...required.map((c) => c.in), ...open.map((r) => r.pick)]
    .filter((p): p is Player => !!p && "projected" in p)
    .slice(0, 6);

  return (
    <div className="grid min-w-0 gap-5">
      {boom && <Boom required={nRequired} decisions={nDecisions} faces={faces} onDone={dismiss} />}

      <section className="hero callsheet">
        {/* The top line is the head coach's: the personality of the page, and who it is from. */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
          <span className="coach-notes" aria-label={LINEUP.coach.aria} role="img">
            <span className="coach-notes-pad" aria-hidden>
              <IconNotes size={16} strokeWidth={2.2} />
            </span>
            {LINEUP.coach.from}
          </span>
          {!compact && (
            <a href="#roster" className="hero-jump">
              {LINEUP.jump}
              <IconArrowUp size={11} strokeWidth={3} className="rotate-180" />
            </a>
          )}
        </div>
        <div className="px-4 pb-4 pt-3">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow className="whitespace-nowrap">{LINEUP.projected(lineup.week)}</Eyebrow>
              <CountUp value={lineup.projected_total} animate={animate} className="display mt-0.5 text-[40px] leading-none text-white" />
            </div>
            <div className="shrink-0 pb-1 text-right">
              {set ? (
                // Inked white: the hero is dark in both themes, where status green would vanish.
                <Stamp ink="text-white" slam={animate}>
                  <IconCheck size={12} strokeWidth={3.4} />
                  {LINEUP.clear}
                </Stamp>
              ) : (
                lineup.standing && (
                  <>
                    <Eyebrow className="whitespace-nowrap">{LINEUP.standingLabel}</Eyebrow>
                    <div className="display tnum mt-0.5 whitespace-nowrap text-[22px] leading-none text-white/85">{LINEUP.standing(lineup.standing.rank, lineup.standing.of)}</div>
                  </>
                )
              )}
            </div>
          </div>
          {/* The split, stated plainly: two chips, two colours, two words, one row. */}
          {!set && (
            <div className="lineup-split mt-3">
              <span className="lineup-split-chip lineup-split-required">
                <span className="lineup-split-dot bg-sit" aria-hidden />
                {LINEUP.required(nRequired)}
              </span>
              <span className="lineup-split-chip lineup-split-decisions">
                <span className="lineup-split-dot bg-flip" aria-hidden />
                {LINEUP.decisions(nDecisions)}
              </span>
            </div>
          )}
        </div>
      </section>

      {!compact && (
        <section className="min-w-0">
          <H2>{LINEUP.section.required}</H2>
          {nRequired === 0 ? (
            <div className="mt-2 flex items-center gap-3">
              <Stamp ink="text-start" size="md" slam={animate}>
                <IconCheck size={11} strokeWidth={3.4} />
                {LINEUP.requiredClear}
              </Stamp>
              <span className="text-[12px] text-muted">{LINEUP.requiredClearLine}</span>
            </div>
          ) : (
            <ul className="mt-2.5 grid gap-2.5">
              {required.map((c, i) => (
                <Change key={`c${i}`} c={c} faces={men} animate={animate} i={i} />
              ))}
              {holes.map((h, i) => (
                <Hole key={`h${i}`} h={h} animate={animate} i={required.length + i} />
              ))}
            </ul>
          )}
        </section>
      )}

      {!compact && (
        <section className="min-w-0">
          <H2>{LINEUP.section.decisions}</H2>
          {open.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">{LINEUP.decisionsQuiet}</p>
          ) : (
            <ul className="mt-2.5 grid gap-2">
              {open.map((r, i) => (
                <RoleRow key={r.label} r={r} animate={animate} i={i} />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
              <IconCheck size={11} strokeWidth={3} className="text-start" />
              <span>{LINEUP.handled(done.length)}</span>
              <button type="button" className="min-h-0 font-bold text-ink underline decoration-line-2 underline-offset-2" onClick={() => done.forEach((r) => setHandled(r.label, false))}>
                {LINEUP.showHandled}
              </button>
            </p>
          )}
        </section>
      )}

      {compact && lineup.changes.length > 0 && (
        <section className="min-w-0">
          <H2>{LINEUP.section.required}</H2>
          <ul className="mt-2.5 grid gap-2.5">
            {lineup.changes.map((c, i) => (
              <Change key={i} c={c} faces={men} animate={animate} i={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0 scroll-mt-16" id="roster">
        <H2>{LINEUP.section.field}</H2>
        <ul className="card mt-2 min-w-0 divide-y divide-line overflow-hidden p-0">
          {lineup.slots.map((s, i) => (
            // The tag is the role's: a starter with no man in the frame for his seat is a
            // Lock there even if a bench man who sits at another role projects near him.
            <RosterRow key={i} label={roles[i]?.label ?? s.slot} p={s.player} confidence={roles[i]?.confidence ?? s.confidence} role={roles[i]} changed={s.change} />
          ))}
          {/* The same number as the hero, so the table adds up to what the page promised. */}
          <li className="roster-row roster-total">
            <span className="roster-row-main">
              <span className="roster-role">{LINEUP.total}</span>
              <span aria-hidden />
              <span className="roster-name" />
              <span className="roster-rank" />
              <span className="roster-proj display tnum">{lineup.projected_total.toFixed(1)}</span>
            </span>
            <span className="roster-mark" aria-hidden />
          </li>
        </ul>
      </section>

      {!compact && (
        <section className="min-w-0">
          <H2>{LINEUP.section.bench}</H2>
          <ul className="card mt-2 min-w-0 divide-y divide-line overflow-hidden p-0">
            {bench.map((b, i) => (
              <RosterRow key={i} label={b.player.position} p={b.player} role={roleOf.get(b.player.id)} />
            ))}
          </ul>
        </section>
      )}

      {!compact && reserve.length > 0 && (
        <section className="min-w-0">
          <H2>{LINEUP.section.reserve}</H2>
          <ul className="card mt-2 min-w-0 divide-y divide-line overflow-hidden p-0">
            {reserve.map((b, i) => (
              <RosterRow key={i} label={b.player.position} p={b.player} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
