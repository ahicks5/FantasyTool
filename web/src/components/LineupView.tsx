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
import { IconArrowUp, IconCheck, IconChevron, IconNotes, IconX } from "./icons";
import { ConfidenceStamp, CountUp, Eyebrow, H2, InjuryTag, LinkButton, Stamp } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };
const INK: Record<string, string> = { Lock: "text-start", Lean: "text-lean", "Coin flip": "text-flip" };

/** Session-scoped: the stamp has landed this sitting (value: the week). */
const BOOM_KEY = "booth.boom";

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

/** "RB12": where he ranks at his position in this league this week. Nothing without the rank. */
function PosRank({ p }: { p: Player }) {
  if (!p.pos_rank) return null;
  return (
    <span className="tnum text-[10px] font-bold uppercase tracking-wide text-muted">
      {p.position}
      {p.pos_rank.rank}
    </span>
  );
}

/**
 * One line of the roster: the role, the man, his rank, his number, his tag. A role with a
 * decision behind it carries the arrow to it; a Lock carries nothing, there is nothing
 * to open. The row itself opens the man's page.
 */
function RosterRow({ label, p, confidence, role, changed }: { label: string; p: Player | null; confidence?: string; role?: LineupRole; changed?: boolean }) {
  const open = role && role.decision;
  const tag = confidence && confidence !== "Coin flip" ? confidence : null;
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
          {tag && <span className={`roster-tag ${INK[tag]}`}>{CONFIDENCE_LABEL[tag as keyof typeof CONFIDENCE_LABEL] ?? tag}</span>}
        </PlayerTarget>
      ) : (
        <span className="roster-row-main">
          <span className="roster-role">{label}</span>
          <Avatar name="?" size="xs" />
          <span className="roster-name text-muted">{LINEUP.change.empty}</span>
        </span>
      )}
      {open ? (
        <Link href={decideHref(role.label)} aria-label={LINEUP.role.aria(role.label)} className="roster-go">
          <IconChevron size={13} strokeWidth={2.8} />
        </Link>
      ) : (
        <span className="roster-go roster-go-none" aria-hidden />
      )}
    </li>
  );
}

/** A required change: the benched name drops, the starter rises, and the tag says why nobody has to think. */
function Change({ c, animate, i }: { c: LineupChange; animate: boolean; i: number }) {
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
      <div className="mt-2 flex min-w-0 items-center gap-2.5">
        <span className="min-w-0 flex-1">
          <span className={`${animate ? "demote" : "opacity-55"} block truncate text-[13px] font-bold text-sit line-through decoration-2`}>
            {c.out ? <PlayerName p={c.out} /> : LINEUP.change.empty}
          </span>
          <span className={`${animate ? "promote" : ""} mt-0.5 flex items-center gap-1 text-[15px] font-black text-start`}>
            <IconArrowUp size={14} strokeWidth={3} />
            <PlayerName p={c.in} className="truncate" />
          </span>
        </span>
        <span className="display tnum shrink-0 text-[21px] text-start">{signed(c.gain)}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-2">{c.reason}</p>
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
 * The stamp that lands when the tab opens: the two numbers and the faces. It stays until
 * dismissed, by the button or a tap on the shade, so the summary is seen. Never under
 * reduced motion, where the CSS hides it.
 */
function Boom({ required, decisions, faces, onDone }: { required: number; decisions: number; faces: Player[]; onDone: () => void }) {
  const words = required + decisions === 0 ? [LINEUP.stamp.clear] : [required > 0 && LINEUP.stamp.fix(required), decisions > 0 && LINEUP.stamp.decide(decisions)].filter(Boolean);
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
          {words.join(" · ")}
        </Stamp>
        {faces.length > 0 && (
          <>
            <span className="boom-then">{LINEUP.stamp.then}</span>
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
  const bench = lineup.bench.filter((b) => !RESERVE.has((b.player.injury_status ?? "").toUpperCase()));
  const reserve = lineup.bench.filter((b) => RESERVE.has((b.player.injury_status ?? "").toUpperCase()));

  // The stamp lands once per sitting: a fresh arrival, never the report's compact embed,
  // and not again this browser session once dismissed (the roster is one tap from every
  // room, and a summary that re-lands on every tap stops being read).
  const [boom, setBoom] = useState(false);
  useBeforePaint(() => {
    if (!animate || compact) return;
    try {
      if (window.sessionStorage.getItem(BOOM_KEY) === String(lineup.week)) return;
    } catch {
      /* blocked storage: it lands every time */
    }
    setBoom(true);
  }, [animate, compact, lineup.week]);
  const dismiss = () => {
    setBoom(false);
    try {
      window.sessionStorage.setItem(BOOM_KEY, String(lineup.week));
    } catch {
      /* nothing to remember with */
    }
  };
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
              <IconChevron size={11} strokeWidth={3} className="rotate-90" />
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
                lineup.standing && <div className="max-w-[128px] text-[11px] font-bold leading-snug text-white/70">{LINEUP.standing(lineup.standing.rank, lineup.standing.of)}</div>
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
                <Change key={`c${i}`} c={c} animate={animate} i={i} />
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
              <Change key={i} c={c} animate={animate} i={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0 scroll-mt-16" id="roster">
        <H2>{LINEUP.section.field}</H2>
        <ul className="card mt-2 min-w-0 divide-y divide-line overflow-hidden p-0">
          {lineup.slots.map((s, i) => (
            <RosterRow key={i} label={roles[i]?.label ?? s.slot} p={s.player} confidence={s.confidence} role={roles[i]} changed={s.change} />
          ))}
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
