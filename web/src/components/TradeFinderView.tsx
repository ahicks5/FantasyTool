"use client";
/**
 * The board. Who to call, what to offer, and what it is worth to each side.
 *
 * Two rules the layout is built around, both learned on a 320px phone:
 *
 * 1. **The headline holds one line.** It used to print the engine's summary sentence at
 *    display size, which on a phone was a five-line block of heavy type before you
 *    reached a single trade. The headline is now a fixed short phrase and the engine's
 *    sentence sits under it at body size, where wrapping is just reading.
 * 2. **Nothing in a row wraps.** Every figure strip, chip row and button row is either
 *    `truncate`d or given its own column, because a control that breaks onto a second
 *    line drags the whole card taller and reads as a mistake rather than as a layout.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FinderOffer, Player, TradeFinderResponse, TradePartner } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconChevron, IconTrade } from "./icons";
import { Eyebrow, Skeleton, Spinner, Why } from "./ui";

function PosChips({ label, map, tone, max = 3 }: { label: string; map: Record<string, number>; tone: "start" | "sit"; max?: number }) {
  const entries = Object.keys(map).slice(0, max);
  if (!entries.length) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] text-muted">{label}</span>
      {entries.map((pos) => (
        <span
          key={pos}
          className={`shrink-0 rounded-md px-1.5 py-[2px] text-[11px] font-black ${tone === "start" ? "bg-start-soft text-start" : "bg-sit-soft text-sit"}`}
        >
          {pos}
        </span>
      ))}
    </span>
  );
}

/** One side of an offer: the faces, the names, the positions. */
function PlayerRow({ label, players, names, tone }: { label: string; players: Player[]; names: string[]; tone: "sit" | "start" }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="w-[46px] shrink-0 text-[10px] font-black uppercase leading-tight tracking-[0.06em] text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {players.map((g) => (
          <Avatar key={g.id} name={g.name} photo={g.photo} teamLogo={g.team_logo} size="sm" />
        ))}
        <span className="min-w-0">
          <span className={`block truncate text-[14px] font-black leading-tight ${tone === "sit" ? "text-sit" : "text-start"}`}>
            {names.join(" + ")}
          </span>
          {players[0]?.position && (
            <span className="mt-0.5 block truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
              {players.map((g) => `${g.position} ${g.nfl_team ?? ""}`.trim()).join(" · ")}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

/**
 * What the offer is worth, as three columns rather than a sentence of chips.
 *
 * The old row ran "You +21 ROS · Them +6 · 95% balanced" as inline spans, which wrapped
 * into three ragged lines at 320px. A grid cannot wrap: each figure gets a third of the
 * width, its own label, and the same baseline as the other two.
 */
function Figures({ o }: { o: FinderOffer }) {
  const cells: [string, string, string][] = [
    ["You", `+${o.my_gain_ros.toFixed(0)}`, "text-start"],
    ["Them", `+${o.their_gain_ros.toFixed(0)}`, "text-ink-2"],
    // "Balanced" truncated to "BALAN…" in a third of a 320px card. Same number, a word
    // that fits.
    ["Fair", `${Math.round(o.fairness * 100)}%`, "text-ink-2"],
  ];
  return (
    <dl className="mt-3.5 grid grid-cols-3 overflow-hidden rounded-xl bg-soft">
      {cells.map(([label, value, ink], i) => (
        <div key={label} className={`min-w-0 px-2.5 py-2 text-center ${i ? "border-l border-line" : ""}`}>
          <dt className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-muted">{label}</dt>
          <dd className={`display tnum mt-0.5 truncate text-[17px] leading-none ${ink}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Offer({ o }: { o: FinderOffer }) {
  return (
    <div className="p-4">
      <div className="grid gap-2.5">
        <PlayerRow label="You send" players={o.give_players} names={o.give_names} tone="sit" />
        <div className="flex items-center gap-3 pl-[46px] text-muted" aria-hidden>
          <IconTrade size={16} />
          <span className="h-px flex-1 bg-line" />
        </div>
        <PlayerRow label="You get" players={o.get_players} names={o.get_names} tone="start" />
      </div>

      <Figures o={o} />

      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{o.why}</p>

      {/* One row, two controls, neither allowed to wrap: the primary is a short verb and
          the evidence toggle is its own column. "Grade this offer" broke onto two lines
          inside its own button at 320px, which made the button look broken. */}
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <Link
          href={`/trade?their=${o.their_team_id}&give=${o.give.join(",")}&get=${o.get.join(",")}`}
          className="btn inline-flex min-h-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-ink px-3.5 py-2 text-[13px] font-bold text-paper"
        >
          Grade it
          <IconChevron size={13} strokeWidth={2.8} />
        </Link>
        <span className="shrink-0">
          <Why
            lines={[
              `Your lineup gains ${o.my_gain_ros.toFixed(0)} rest-of-season points; theirs gains ${o.their_gain_ros.toFixed(0)}.`,
              `Asset value is ${Math.round(o.fairness * 100)}% balanced, so it should not read as an insult.`,
              o.reason_codes.includes("matches_their_history")
                ? "It also matches what this manager has traded for before."
                : "Scored on both lineups, not just yours.",
            ]}
            label="Why?"
          />
        </span>
      </div>
    </div>
  );
}

/**
 * A partner, with their offers.
 *
 * Open or shut, and only the first one starts open. A board of four partners with every
 * offer expanded is a page you scroll rather than a page you read — the point of the
 * board is to see who is worth a call, then open the one you want.
 */
function PartnerCard({ p, index, open, onToggle }: { p: TradePartner; index: number; open: boolean; onToggle: () => void }) {
  const best = p.offers[0];
  return (
    <li id={`partner-${p.team_id}`} className={`card min-w-0 scroll-mt-20 overflow-hidden p-0 print print-${Math.min(index + 1, 5)}`}>
      <div className="flex min-w-0">
        {/* The margin, same as the call sheet: the line number over a rule. */}
        <div className="flex w-[36px] shrink-0 flex-col items-center border-r border-line bg-soft pt-4">
          <span className="slug text-[13px] leading-none text-muted">{String(index + 1).padStart(2, "0")}</span>
          <span aria-hidden className={`mt-2.5 w-[3px] flex-1 ${index === 0 ? "bg-ink" : "bg-line-2"}`} />
        </div>

        <div className="min-w-0 flex-1">
          {/* The whole header is the toggle, so the tap target is the card, not a chevron. */}
          <button
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`offers-${p.team_id}`}
            className="flex min-h-0 w-full items-start gap-3 p-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                  {index === 0 ? "Best fit" : "Worth a call"}
                </span>
                <span aria-hidden className="h-px flex-1 bg-line" />
                <span className="tnum shrink-0 text-[11px] font-bold text-muted">fit {p.complement.toFixed(2)}</span>
              </span>
              <span className="display mt-1 block truncate text-[20px] leading-tight">{p.team_name}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <PosChips label="Has" map={p.positions.surplus} tone="start" max={2} />
                <PosChips label="Needs" map={p.positions.need} tone="sit" max={2} />
              </span>
              {/* Shut, the card still says what is inside it. */}
              {!open && best && (
                <span className="mt-2 block truncate text-[12px] font-bold text-muted">
                  {p.offers.length > 1 ? `${p.offers.length} offers · ` : ""}
                  {best.give_names.join(" + ")} → {best.get_names.join(" + ")}
                </span>
              )}
            </span>
            <span
              aria-hidden
              className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-2 text-muted transition-transform ${open ? "rotate-90" : ""}`}
            >
              <IconChevron size={14} strokeWidth={2.6} />
            </span>
          </button>

          {open && (
            <div id={`offers-${p.team_id}`} className="border-t border-line">
              {/* The hero already carries the best partner's headline — printing it again
                  as the first thing inside the first card reads like a stutter. */}
              {index > 0 && <p className="px-4 pt-3 text-[13px] leading-snug text-muted">{p.headline}</p>}
              <ul className="divide-y divide-line">
                {p.offers.map((o) => (
                  <li key={o.give.join() + o.get.join()}>
                    <Offer o={o} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The headline, and it is always one line.
 *
 * Derived, not printed: the engine's `summary` is a whole sentence naming a team, which
 * at display size is a paragraph of heavy type on a phone. It still gets said — in body
 * copy under this — but the line the eye lands on first is short enough to be read at a
 * glance, which is the entire job of a headline.
 */
function headline(found: TradeFinderResponse): string {
  const n = found.partners.length;
  if (!n) return "No deal on the board";
  return n === 1 ? "One call to make" : `${n} calls to make`;
}

export function TradeFinderView({ found }: { found: TradeFinderResponse }) {
  // The best fit opens; the rest are a list you choose from. Keyed by team id rather
  // than index so opening one cannot follow the wrong card if the board re-ranks.
  const [open, setOpen] = useState<string | null>(found.partners[0]?.team_id ?? null);
  const spare = useMemo(() => Object.keys(found.my_positions.surplus).slice(0, 3), [found]);
  const short = useMemo(() => Object.keys(found.my_positions.need).slice(0, 3), [found]);

  return (
    <div className="grid min-w-0 gap-3.5">
      <section className="hero callsheet p-5">
        <div className="flex items-center gap-2">
          <Eyebrow className="shrink-0">Trade lab</Eyebrow>
          <span aria-hidden className="h-px flex-1 bg-white/10" />
          <span className="tnum shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-white/50">Week {found.week}</span>
        </div>
        <h2 className="display mt-1.5 truncate text-[24px] leading-tight text-white">{headline(found)}</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-white/65">{found.summary}</p>

        {/* Both rows of chips on one line each, and the labels are two words, so a
            twelve-team league with three surpluses still fits a 320px phone. */}
        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3.5">
          <ChipLine label="You can spare" items={spare} empty="Nothing spare" />
          <ChipLine label="You're short at" items={short} empty="No holes" />
        </div>
      </section>

      {found.partners.length > 0 && (
        <p className="text-[13px] leading-relaxed text-muted">Best fit first. Tap a team for its offers.</p>
      )}

      <ol className="grid gap-3.5">
        {found.partners.map((p, i) => (
          <PartnerCard
            key={p.team_id}
            p={p}
            index={i}
            open={open === p.team_id}
            onToggle={() => setOpen((cur) => (cur === p.team_id ? null : p.team_id))}
          />
        ))}
      </ol>
    </div>
  );
}

/** A label and its positions, on one line, on the hero. */
function ChipLine({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">{label}</span>
      {items.length ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {items.map((pos) => (
            <span key={pos} className="rounded-md bg-white/15 px-1.5 py-[2px] text-[11px] font-black text-white">
              {pos}
            </span>
          ))}
        </span>
      ) : (
        <span className="truncate text-[12px] font-bold text-white/45">{empty}</span>
      )}
    </div>
  );
}

/**
 * The board, still being read.
 *
 * It is the hero's own geometry with a one-line label in it, not a list of skeleton
 * rows: the finder used to wait behind a stack of grey cards and then replace them with
 * a panel of a completely different shape, so the page jumped the moment it answered.
 * Same frame, same sheen, and the label is a single line that cannot wrap — which is
 * the whole complaint about the old one.
 */
export function TradeFinderWait() {
  return (
    <div className="grid min-w-0 gap-3.5" aria-busy="true" aria-label="Reading the room">
      <section className="hero callsheet sweep relative overflow-hidden p-5">
        <div className="flex items-center gap-2">
          <Eyebrow className="shrink-0">Trade lab</Eyebrow>
          <span aria-hidden className="h-px flex-1 bg-white/10" />
          <span className="flex shrink-0 items-center gap-1.5 text-white/60">
            <Spinner size={12} label={null} />
            <span className="text-[10px] font-black uppercase tracking-[0.12em]">Working</span>
          </span>
        </div>
        <h2 className="display mt-1.5 truncate text-[24px] leading-tight text-white">Reading the room</h2>
        <p className="mt-1.5 truncate text-[13px] leading-snug text-white/65">Every roster, both sides scored.</p>
        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3.5">
          <Skeleton className="h-[14px] w-40 opacity-20" />
          <Skeleton className="h-[14px] w-32 opacity-20" />
        </div>
      </section>
      {[0, 1].map((i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-[12px] w-20" />
          <Skeleton className="mt-2 h-[20px] w-36" />
          <Skeleton className="mt-2.5 h-[12px] w-full" />
        </div>
      ))}
    </div>
  );
}
