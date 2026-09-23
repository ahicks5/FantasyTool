"use client";
/**
 * The top of the GM's Office: your roster's shape in one line, then the three deals worth
 * a call as panels in one row (the face you get, who you send, what it does for you), each
 * an arrow into that partner's page. Under them, every GM in one line each.
 *
 * Same grammar as Scouting's top pickups, on purpose: a stamp that says how hard to pick
 * up the phone, the one hot line pulsing, everything else quiet. The engine ranks the
 * partners and prices the offers (`edge/engine/trade_finder.py`); `lib/office.ts` only
 * puts a word on its numbers.
 *
 * Free, the row still stands with the faces withheld and the lock goes under the list:
 * the shape of the answer is visible, the names are Trade Lab's.
 */
import Link from "next/link";
import type { FinderOffer } from "@/lib/types";
import { dealHref, heat, lastName, posList, topDeals, type Heat, type OfficeBoard, type OfficePartner } from "@/lib/office";
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

/** Your roster in one line: what you can spare, where you are short. */
export function Posture({ board }: { board: OfficeBoard }) {
  const spare = posList(board.my_positions.surplus);
  const short = posList(board.my_positions.need);
  return (
    <div className="office-posture">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="office-posture-label">{OFFICE.spare}</span>
        {spare.length ? <Chips items={spare} tone="start" /> : <span className="office-posture-none">{OFFICE.nothingSpare}</span>}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="office-posture-label">{OFFICE.short}</span>
        {short.length ? <Chips items={short} tone="sit" /> : <span className="office-posture-none">{OFFICE.noHoles}</span>}
      </span>
    </div>
  );
}

function Band({ h }: { h: Heat }) {
  return <span className={`deal-band deal-band-${h}`}>{OFFICE.heat[h]}</span>;
}

/** One of the three: the whole panel is the door into the partner's page. */
function DealPanel({ partner, offer, rank }: { partner: OfficePartner; offer: FinderOffer; rank: number }) {
  const h = heat(offer, rank);
  const get = offer.get_players[0];
  const give = offer.give_players[0];
  return (
    <li className={`min-w-0 rise rise-${rank}`}>
      <Link href={dealHref(partner.team_id)} aria-label={OFFICE.goAria(partner.team_name)} className={`deal deal-${h}`}>
        <Band h={h} />
        <span className="deal-team">{partner.team_name}</span>
        <span className="mt-1.5 flex justify-center">
          <span className="relative">
            <Avatar name={get?.name ?? offer.get_names[0]} photo={get?.photo} teamLogo={get?.team_logo} size="md" ring={h === "hot" ? "sit" : h === "call" ? "lean" : undefined} />
            {give && (
              <span className="deal-give-face" aria-hidden>
                <Avatar name={give.name} photo={give.photo} size="xs" />
              </span>
            )}
          </span>
        </span>
        <span className="mt-1.5 block text-center text-[12.5px] font-black leading-[1.15] [overflow-wrap:anywhere]">
          {offer.get_names.map(lastName).join(" + ")}
        </span>
        <span className="mt-0.5 block text-center text-[10.5px] text-muted">
          {OFFICE.forWord} <span className="font-bold text-sit">{offer.give_names.map(lastName).join(" + ")}</span>
        </span>
        <span className="tnum mt-1 flex items-baseline justify-center gap-1 text-[14px] font-black">
          <span className={offer.my_gain_ros > 0 ? "text-start" : "text-muted"}>+{offer.my_gain_ros.toFixed(0)}</span>
          <span className="text-[10px] font-bold text-muted">{OFFICE.ros}</span>
        </span>
        <span className="deal-foot tnum">
          {Math.round(offer.fairness * 100)}% {OFFICE.fair}
        </span>
        <span className="deal-go" aria-hidden>
          <IconChevron size={13} />
        </span>
      </Link>
    </li>
  );
}

/** The same panel for the free board: the partner is named, the deal is not. */
function LockedPanel({ partner, rank }: { partner: OfficePartner; rank: number }) {
  return (
    <li className={`min-w-0 rise rise-${rank}`}>
      <Link href={dealHref(partner.team_id)} aria-label={OFFICE.goAria(partner.team_name)} className="deal deal-long deal-locked">
        <span className="deal-band">{OFFICE.locked}</span>
        <span className="deal-team">{partner.team_name}</span>
        <span className="mt-1.5 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-soft text-muted">
            <IconLock size={18} />
          </span>
        </span>
        <span className="mt-2 flex flex-wrap justify-center gap-1">
          <Chips items={posList(partner.positions.surplus, 2)} tone="start" />
        </span>
        <span className="deal-foot">{OFFICE.has}</span>
        <span className="deal-go" aria-hidden>
          <IconChevron size={13} />
        </span>
      </Link>
    </li>
  );
}

export function TopDeals({ board, preview }: { board: OfficeBoard; preview: boolean }) {
  const deals = topDeals(board);
  return (
    <section className="grid min-w-0 gap-2.5">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <h2 className="display text-[22px] leading-none">{OFFICE.title}</h2>
        {board.partners.length > 0 && (
          <a href="#every-gm" className="min-h-0 shrink-0 text-[13px] font-bold text-lean hover:underline">
            {OFFICE.seeAll(board.partners.length)}
          </a>
        )}
      </div>
      <Posture board={board} />
      {deals.length === 0 ? (
        <p className="card p-5 text-center text-[14px] text-ink-2">{OFFICE.none}</p>
      ) : (
        <ol className="grid min-w-0 grid-cols-3 gap-2">
          {deals.map((d) =>
            d.offer && !preview ? (
              <DealPanel key={d.partner.team_id} partner={d.partner} offer={d.offer} rank={d.rank} />
            ) : (
              <LockedPanel key={d.partner.team_id} partner={d.partner} rank={d.rank} />
            ),
          )}
        </ol>
      )}
      {preview && deals.length > 0 && <p className="text-center text-[12px] text-muted">{OFFICE.lockedLine}</p>}
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
          const h = heat(best, i + 1);
          return (
            <li key={p.team_id}>
              <Link href={dealHref(p.team_id)} aria-label={OFFICE.goAria(p.team_name)} className="office-row">
                <span className={`office-rank office-rank-${h}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold leading-tight">{p.team_name}</span>
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                    <span className="office-posture-label">{OFFICE.has}</span>
                    <Chips items={posList(p.positions.surplus, 2)} tone="start" />
                    <span className="office-posture-label ml-1">{OFFICE.needs}</span>
                    <Chips items={posList(p.positions.need, 2)} tone="sit" />
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
