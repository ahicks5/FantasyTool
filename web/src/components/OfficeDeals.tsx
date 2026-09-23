"use client";
/**
 * The top of the GM's Office: your roster, one tile per position (spare, short, set), then
 * the three deals worth a call as wide rows (Andrew, 2026-09-23: not Scouting's panels):
 * who you get on the left, the GM in the middle, who you send on the right, each row a
 * door into that partner's page. Under them, every GM in one line each. A word on how hard
 * to pick up the phone, the one hot line pulsing, everything else quiet. The engine ranks the
 * partners and prices the offers (`edge/engine/trade_finder.py`); `lib/office.ts` only
 * puts a word on its numbers.
 *
 * Free, the row still stands with the faces withheld and the lock goes under the list:
 * the shape of the answer is visible, the names are Trade Lab's.
 */
import Link from "next/link";
import type { FinderOffer } from "@/lib/types";
import { dealHref, heat, lastName, posList, rosterShape, shapeLists, topDeals, type OfficeBoard, type OfficePartner } from "@/lib/office";
import { OFFICE } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { IconChevron, IconLock } from "./icons";

function Chips({ items, tone }: { items: string[]; tone: "start" | "sit" | "hero" }) {
  return (
    <>
      {items.map((pos) => (
        <span key={pos} className={`office-chip office-chip-${tone}`}>
          {pos}
        </span>
      ))}
    </>
  );
}

/**
 * Your roster, one tile per position across the full width: the position, one word (spare,
 * short, set) and a bar for how much. What every deal below is built on, so it leads.
 */
export function RosterShape({ board }: { board: OfficeBoard }) {
  const tiles = rosterShape(board);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="office-shape-title">{OFFICE.shape}</span>
      </div>
      <ul className="office-shape" style={{ ["--n" as string]: tiles.length }}>
        {tiles.map((t) => (
          <li key={t.pos} className={`office-tile office-tile-${t.shape}`} aria-label={OFFICE.shapeAria(t.pos, OFFICE.shapeWord[t.shape])}>
            <span className="office-tile-pos">{t.pos}</span>
            <span className="office-tile-word">{OFFICE.shapeWord[t.shape]}</span>
            <span className="office-tile-track" aria-hidden>
              <span style={{ width: `${Math.round(t.weight * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-snug text-muted">{OFFICE.shapeHint}</p>
    </div>
  );
}

/** One side of a deal: the faces (two when it is two for one) and the last names. */
function Side({ players, names, tone, label }: { players: FinderOffer["get_players"]; names: string[]; tone: "start" | "sit"; label: string }) {
  return (
    <span className={`deal-side deal-side-${tone}`}>
      <span className="deal-side-label">{label}</span>
      <span className="deal-faces">
        {names.slice(0, 2).map((n, i) => {
          const p = players[i];
          return <Avatar key={n} name={p?.name ?? n} photo={p?.photo} teamLogo={p?.team_logo} size="sm" ring={tone} />;
        })}
      </span>
      <span className="deal-names">{names.map(lastName).join(" + ")}</span>
    </span>
  );
}

/**
 * One deal, one wide row: who you get on the left, the GM across the table in the middle
 * with how hot it is and what it does for you, who you send on the right. The whole row is
 * the door into that partner's page.
 */
function DealRow({ partner, offer, rank }: { partner: OfficePartner; offer: FinderOffer; rank: number }) {
  const h = heat(offer, rank);
  return (
    <li className={`min-w-0 rise rise-${rank}`}>
      <Link href={dealHref(partner.team_id)} aria-label={OFFICE.goAria(partner.team_name)} className={`deal-row deal-row-${h}`}>
        <Side players={offer.get_players} names={offer.get_names} tone="start" label={OFFICE.youGetShort} />
        <span className="deal-mid">
          <span className={`deal-heat deal-heat-${h}`}>{OFFICE.heat[h]}</span>
          <span className="deal-mid-team">{partner.team_name}</span>
          <span className="deal-swap" aria-hidden>
            <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 1L1 4l4 3M1 4h16M17 5l4 3-4 3M21 8H5" />
            </svg>
          </span>
          <span className="tnum deal-mid-nums">
            <b className={offer.my_gain_ros > 0 ? "text-start" : "text-muted"}>+{offer.my_gain_ros.toFixed(0)}</b> {OFFICE.ros}
            <span className="mx-1 text-line-2">·</span>
            {Math.round(offer.fairness * 100)}% {OFFICE.fair}
          </span>
        </span>
        <Side players={offer.give_players} names={offer.give_names} tone="sit" label={OFFICE.youGive} />
      </Link>
    </li>
  );
}

/** The same row on the free board: the GM is named, the players are Trade Lab's. */
function LockedRow({ partner, rank }: { partner: OfficePartner; rank: number }) {
  const lock = (
    <span className="deal-side">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-soft text-muted">
        <IconLock size={15} />
      </span>
    </span>
  );
  return (
    <li className={`min-w-0 rise rise-${rank}`}>
      <Link href={dealHref(partner.team_id)} aria-label={OFFICE.goAria(partner.team_name)} className="deal-row deal-row-long">
        {lock}
        <span className="deal-mid">
          <span className="deal-heat">{OFFICE.locked}</span>
          <span className="deal-mid-team">{partner.team_name}</span>
          <span className="mt-1 flex flex-wrap justify-center gap-1">
            <Chips items={posList(partner.positions.surplus, 2)} tone="start" />
          </span>
        </span>
        {lock}
      </Link>
    </li>
  );
}

/** The top of the office: the roster, then the three deals worth a call. */
export function TopDeals({ board, preview, onJump }: { board: OfficeBoard; preview: boolean; onJump?: () => void }) {
  const deals = topDeals(board);
  return (
    <section className="grid min-w-0 gap-4">
      <RosterShape board={board} />
      <div className="grid min-w-0 gap-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="display text-[22px] leading-none">{OFFICE.title}</h2>
          {onJump && !preview && (
            <button type="button" onClick={onJump} className="office-jump">
              {OFFICE.jump}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
        {deals.length === 0 ? (
          <p className="card p-5 text-center text-[14px] text-ink-2">{OFFICE.none}</p>
        ) : (
          <ol className="grid min-w-0 gap-2">
            {deals.map((d) =>
              d.offer && !preview ? (
                <DealRow key={d.partner.team_id} partner={d.partner} offer={d.offer} rank={d.rank} />
              ) : (
                <LockedRow key={d.partner.team_id} partner={d.partner} rank={d.rank} />
              ),
            )}
          </ol>
        )}
        {preview && deals.length > 0 && <p className="text-center text-[12px] text-muted">{OFFICE.lockedLine}</p>}
      </div>
    </section>
  );
}

/** Every GM, one line each: who, what they have and need, the best deal, an arrow. */
export function PartnerList({ board, preview }: { board: OfficeBoard; preview: boolean }) {
  if (!board.partners.length) return null;
  return (
    <section id="every-gm" className="min-w-0 scroll-mt-20">
      <h2 className="display text-[22px] leading-none">{OFFICE.partners}</h2>
      <p className="mt-1.5 text-[12px] text-muted">{OFFICE.partnersHint}</p>
      <ol className="office-list mt-2.5">
        {board.partners.map((p, i) => {
          const best = preview ? null : p.offers?.[0] ?? null;
          const shape = shapeLists(p.positions);
          const h = heat(best, i + 1);
          return (
            <li key={p.team_id}>
              <Link href={dealHref(p.team_id)} aria-label={OFFICE.goAria(p.team_name)} className="office-row">
                <span className={`office-rank office-rank-${h}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold leading-tight">{p.team_name}</span>
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                    <span className="office-posture-label">{OFFICE.has}</span>
                    <Chips items={shape.has} tone="start" />
                    <span className="office-posture-label ml-1">{OFFICE.needs}</span>
                    <Chips items={shape.needs} tone="sit" />
                  </span>
                  {best && (
                    <span className="mt-1 block truncate text-[11.5px] text-muted">
                      <span className="font-bold text-start">{best.get_names.join(" + ")}</span> {OFFICE.forWord}{" "}
                      <span className="font-bold text-sit">{best.give_names.join(" + ")}</span>
                    </span>
                  )}
                </span>
                {best && (
                  <span className="shrink-0 text-right">
                    <span className="tnum block text-[15px] font-black text-start">+{best.my_gain_ros.toFixed(0)}</span>
                    <span className="block text-[9.5px] font-bold uppercase text-muted">{OFFICE.ros}</span>
                  </span>
                )}
                <IconChevron size={14} className="shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
