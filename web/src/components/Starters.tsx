"use client";
/** The week's starters in a row on the Debrief's one dark plate, and the clock over them. */
import Link from "next/link";
import { Avatar, initials } from "./Avatar";
import { Countdown } from "./ui";
import { confidenceRing } from "@/lib/format";
import { SECTIONS, STARTERS } from "@/lib/vocab";
import type { Action, Lineup, LineupSlot, PlayerRef } from "@/lib/types";

/**
 * The call the feed made about this slot, if it made one.
 *
 * Matched on the *incoming* player's id rather than on the slot name, for two reasons.
 * A league starts two RBs and two FLEXes, so `slot` is not unique and matching on it
 * would drop a badge on whichever RB the array happened to hit first. And the id is the
 * one the memo below ticks (`actions.py` builds `start:{slot}:{in.id}` and puts the
 * incoming player first in `players`), so the strip and the memo agree about which call
 * has been made without this file knowing how that id is spelled.
 */
function callFor(slot: LineupSlot, actions: Action[]): Action | undefined {
  const id = slot.player?.id;
  if (!id) return undefined;
  return actions.find((a) => a.type === "start" && !a.locked && a.players[0]?.id === id);
}

/** Who this slot is being started over, when the engine wants it changed. */
function outgoing(slot: LineupSlot, lineup: Lineup): PlayerRef | null {
  const id = slot.player?.id;
  if (!id) return null;
  return lineup.changes.find((c) => c.in.id === id)?.out ?? null;
}

/**
 * One slot: the face we would start, its confidence ring, and the slot under it.
 *
 * No name label. Nine truncated surnames read as noise at 36px, and the names are one
 * tap away on the depth chart this whole plate links to — so the visible strip is
 * faces and slots, and the names go to a screen reader instead, where there is room
 * for them and where "RB2" on its own would say nothing.
 */
function Slot({ slot, out, swapping }: { slot: LineupSlot; out: PlayerRef | null; swapping: boolean }) {
  const p = slot.player;
  return (
    <li className="flex w-[44px] shrink-0 flex-col items-center gap-1.5">
      <span className="relative">
        {p ? (
          <Avatar
            name={p.name}
            photo={p.photo}
            size="sm"
            ring={confidenceRing(slot.confidence)}
            // The gap in the ring is painted in the plate's own colour. The default is
            // the card surface, which is white in the light theme and would ring every
            // face in a halo here.
            ringOffset="var(--color-hero)"
          />
        ) : (
          // An empty slot is a fact about the roster, not a rendering failure, so it
          // keeps its place in the row and its label underneath.
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-white/25 text-[11px] font-black text-white/35" aria-hidden>
            —
          </span>
        )}
        {swapping && out && (
          // The difference between the lineup we would play and the one that is set:
          // who comes out, struck through, tucked under who goes in.
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 rounded-full bg-[var(--color-hero)] px-1 text-[8px] font-black leading-[14px] text-white/55 line-through ring-1 ring-white/20"
          >
            {initials(out.name)}
          </span>
        )}
      </span>
      <span className="text-[9px] font-black uppercase tracking-[0.08em] text-white/50">{slot.slot}</span>
      <span className="sr-only">
        {p ? (swapping && out ? STARTERS.swap(p.name, out.name) : `${p.name}, ${STARTERS.set}`) : ""}
      </span>
    </li>
  );
}

/**
 * The starters plate.
 *
 * It replaces the hero, and it keeps the two things the hero was actually for: the one
 * dark surface the page's elevation rule needs (plane < paper < hero), and the kickoff
 * clock, which is the only place in the app the brand's red is allowed to run.
 *
 * **What it draws is the engine's recommended lineup**, because that is what
 * `lineup.slots` is — `advise` returns the lineup we would play, with `change` marking
 * each slot where that differs from what is actually set on Sleeper or ESPN. So the
 * strip is always our answer, and a badge is the gap between our answer and the
 * reader's team. That is the "updates as the lineup changes while you move around the
 * app" behaviour: tick the call on the memo below and the badge drops; go and make the
 * swap for real and the next focus refetch drops it for good.
 *
 * A badge with no call behind it on the feed is left standing on purpose. `actions.py`
 * caps the sheet at five and drops swaps inside the noise band, so a slot can differ
 * with nothing to tick — and the honest reading of that badge is "this is not what you
 * have set", which is still true. The depth chart lists it either way.
 *
 * **No generated art** (D4). A likeness of a named NFL player on a paid product is a
 * right-of-publicity question with no CDN to point at, it costs money per repaint on a
 * surface every free reader loads, and it cannot be deterministic — so it cannot be
 * tested, and it cannot be recorded into the fixture the weekly freeze snapshots. A
 * server-rendered "Starting lineup" share card through `edge/graphics.py` is the
 * version of this idea that can ship, and it is phase 2.
 */
export function Starters({
  lineup,
  actions,
  called,
  animate = true,
}: {
  lineup: Lineup;
  /** This week's feed, to pair a slot with the call that would change it. */
  actions: Action[];
  /** Action ids already ticked off. A ticked call's badge is gone. */
  called: string[];
  animate?: boolean;
}) {
  const swaps = lineup.slots.filter((s) => s.change).length;
  return (
    <Link
      href={SECTIONS.team.href}
      aria-label={`${STARTERS.head}, ${SECTIONS.team.title}`}
      className={`hero callsheet block ${animate ? "rise" : ""}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        {/* The ON AIR lamp does not come with the clock. It was the hero saying the room
            was live; the plate is saying what your lineup is, and a pulsing light beside
            nine faces reads as an alert about one of them. */}
        <span className="eyebrow min-w-0 truncate">{STARTERS.head}</span>
        <Countdown onHero />
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-baseline gap-2">
          {/* The total does not count up. The strip beside it is the thing the eye lands
              on, and a figure easing from 0.0 to 121.4 would drag the row's baseline
              with it for the length of the animation. */}
          <span className="display tnum text-[27px] leading-none text-white">
            {lineup.projected_total.toFixed(1)}
          </span>
          <span className="text-[12px] text-white/55">
            {STARTERS.projected} · Week {lineup.week}
          </span>
        </div>
      </div>

      <div className="relative">
        {/* `-mx-` plus matching padding so the row's first and last discs sit on the
            plate's own margin when it fits, and run under the edges when it does not. */}
        <ul className="strip flex gap-2.5 px-5 pb-4 pt-3.5">
          {lineup.slots.map((s, i) => {
            const call = callFor(s, actions);
            return (
              <Slot
                key={`${s.slot}:${s.player?.id ?? i}`}
                slot={s}
                out={outgoing(s, lineup)}
                swapping={s.change && !(call && called.includes(call.id))}
              />
            );
          })}
        </ul>
        {/* Only when there is something past the edge to point at. A permanent fade over
            a row that fits is a gradient pretending to be information. */}
        {lineup.slots.length > 7 && (
          <span aria-hidden className="strip-fade pointer-events-none absolute inset-y-0 right-0 w-10" />
        )}
      </div>
      <span className="sr-only">{swaps === 0 ? STARTERS.set : ""}</span>
    </Link>
  );
}
