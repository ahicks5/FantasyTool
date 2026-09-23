"use client";
/**
 * The top of Scouting: three pickups in one row, each a panel with a face, the stamp that
 * says how hard to go after him, and an arrow into his full read (`/waivers/pickup?id=`).
 *
 * The engine ranks them (`edge/engine/waivers.py`); this draws its first three and never
 * re-sorts. The stamp is `lib/wire.urgency` on the engine's own fit, and the must-add
 * panel gets the signal border and a slow pulse, because it is the one event on the tab.
 * "See more" opens the next seven as single lines, each a door into the same page.
 *
 * Locked, the row still stands — three panels with the faces withheld — so the reader
 * sees there are three moves waiting before he sees a price. The names are what Wire
 * Pass sells; the shape of the answer is not.
 */
import Link from "next/link";
import { useState } from "react";
import type { WaiverPick, Waivers } from "@/lib/types";
import { signed } from "@/lib/format";
import { pickupHref, splitPicks, urgency, type Urgency } from "@/lib/wire";
import { WIRE } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { IconChevron, IconLock } from "./icons";
import { Eyebrow, InjuryTag } from "./ui";

const FRAME: Record<Urgency, string> = {
  must: "pickup-must",
  claim: "pickup-claim",
  stash: "pickup-stash",
  depth: "pickup-depth",
};

function Band({ u }: { u: Urgency }) {
  return <span className={`pickup-band pickup-band-${u}`}>{WIRE.urgency[u]}</span>;
}

function bidText(p: WaiverPick): string {
  return p.bid.amount === null ? WIRE.priority : `$${p.bid.amount}`;
}

/** One of the three. The whole panel is the door; nothing inside it is a second button. */
function Panel({ p, i }: { p: WaiverPick; i: number }) {
  const u = urgency(p, i + 1);
  return (
    <li className={`min-w-0 rise rise-${i + 1}`}>
      <Link href={pickupHref(p.player.id)} aria-label={WIRE.goAria(p.player.name)} className={`pickup ${FRAME[u]}`}>
        <Band u={u} />
        <span className="pickup-rank slug">{i + 1}</span>
        <span className="mt-3 flex justify-center">
          <Avatar name={p.player.name} photo={p.player.photo} teamLogo={p.player.team_logo} size="lg" ring={u === "must" ? "sit" : u === "claim" ? "lean" : undefined} />
        </span>
        <span className="mt-2 block min-h-[2.4em] text-center text-[13px] font-black leading-[1.2] [overflow-wrap:anywhere]">
          {p.player.name}
          <InjuryTag status={p.player.injury_status} />
        </span>
        <span className="mt-0.5 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
          {p.player.position} · {p.player.nfl_team ?? "FA"}
        </span>
        <span className={`tnum mt-1.5 block text-center text-[15px] font-black ${p.weekly_gain > 0 ? "text-start" : "text-muted"}`}>
          {signed(p.weekly_gain)} <span className="text-[10px] font-bold uppercase">{WIRE.week}</span>
        </span>
        <span className="mt-auto flex items-center justify-between gap-1 border-t border-line pt-2 text-[11px]">
          <span className="min-w-0 truncate text-muted">
            {p.drop ? <>{WIRE.cut} <span className="font-bold text-sit">{p.drop.name.split(" ").slice(-1)[0]}</span></> : WIRE.open}
          </span>
          <span className="display tnum shrink-0 text-[14px] leading-none">{bidText(p)}</span>
        </span>
        <span className="pickup-go" aria-hidden>
          <IconChevron size={14} />
        </span>
      </Link>
    </li>
  );
}

/** One of the next seven: a single line, the same door. */
function MoreRow({ p, n }: { p: WaiverPick; n: number }) {
  const u = urgency(p, n);
  return (
    <li>
      <Link href={pickupHref(p.player.id)} aria-label={WIRE.goAria(p.player.name)} className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl border border-line px-3 py-2 transition-colors hover:bg-soft">
        <span className="slug w-5 shrink-0 text-center text-[12px] text-muted">{n}</span>
        <Avatar name={p.player.name} photo={p.player.photo} teamLogo={p.player.team_logo} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold leading-tight">{p.player.name}</span>
          <span className="block truncate text-[11px] text-muted">
            {p.player.position} · {p.player.nfl_team ?? "FA"} · {WIRE.urgency[u]}
          </span>
        </span>
        <span className={`tnum shrink-0 text-[13px] font-black ${p.weekly_gain > 0 ? "text-start" : "text-muted"}`}>{signed(p.weekly_gain)}</span>
        <span className="display tnum w-10 shrink-0 text-right text-[15px] leading-none">{bidText(p)}</span>
        <IconChevron size={14} className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}

function Header() {
  return (
    <div className="min-w-0">
      <Eyebrow>{WIRE.eyebrow}</Eyebrow>
      <h2 className="display mt-0.5 text-[22px] leading-none">{WIRE.title}</h2>
    </div>
  );
}

export function TopPickups({ waivers }: { waivers: Waivers }) {
  const [open, setOpen] = useState(false);
  const { top, more } = splitPicks(waivers.picks);

  return (
    <section className="grid min-w-0 gap-3">
      <Header />
      {top.length === 0 ? (
        <p className="card p-5 text-center text-[14px] text-ink-2">{WIRE.none}</p>
      ) : (
        <ol className="grid min-w-0 grid-cols-3 gap-2">
          {top.map((p, i) => (
            <Panel key={p.player.id} p={p} i={i} />
          ))}
        </ol>
      )}
      {more.length > 0 && (
        <>
          {open && (
            <ol className="grid min-w-0 gap-1.5">
              {more.map((p, i) => (
                <MoreRow key={p.player.id} p={p} n={i + 4} />
              ))}
            </ol>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-full rounded-xl border border-line-2 bg-soft py-2.5 text-[13px] font-black text-ink transition-colors hover:border-ink"
          >
            {open ? WIRE.less : WIRE.more(more.length)}
          </button>
        </>
      )}
    </section>
  );
}

/** The same row, faces withheld: three moves are waiting, and Wire Pass names them. */
export function TopPickupsLocked() {
  return (
    <section className="grid min-w-0 gap-3">
      <Header />
      <ol className="grid min-w-0 grid-cols-3 gap-2" aria-label={WIRE.lockedLine}>
        {[0, 1, 2].map((i) => (
          <li key={i} className={`min-w-0 rise rise-${i + 1}`}>
            <div className="pickup pickup-stash pickup-locked">
              <span className="pickup-band">{WIRE.mystery}</span>
              <span className="pickup-rank slug">{i + 1}</span>
              <span className="mt-3 flex justify-center">
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-soft text-muted">
                  <IconLock size={20} />
                </span>
              </span>
              <span className="mx-auto mt-2.5 block h-2.5 w-4/5 rounded bg-soft" />
              <span className="mx-auto mt-1.5 block h-2 w-1/2 rounded bg-soft" />
              <span className="mx-auto mt-3 block h-3 w-2/5 rounded bg-soft" />
            </div>
          </li>
        ))}
      </ol>
      <p className="text-center text-[13px] text-muted">{WIRE.lockedLine}</p>
    </section>
  );
}
