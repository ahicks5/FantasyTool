"use client";
/**
 * One GM, read in full: the arrow on each of the office's panels and rows lands here.
 *
 * The shape of his roster, the headline the engine wrote about the two of you, then every
 * offer it found with the math under it, and the door to build your own with him. Read
 * from the board the tab already cached (`officeKey`), so it paints on the first frame.
 * Free, the page stands with the offers out and the lock under it, like the tab.
 *
 * Named in the query string (`?team=`), never the path: the demo export cannot pre-render
 * a path it has not seen.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Locked } from "@/components/Locked";
import { AppShell } from "@/components/Shell";
import { Offer } from "@/components/TradeFinderView";
import { IconChevron } from "@/components/icons";
import { ErrorBox, SkeletonList, Stamp } from "@/components/ui";
import { findTrades } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { heat, officeKey, posList } from "@/lib/office";
import type { Connection } from "@/lib/storage";
import type { TradeFinderResponse } from "@/lib/types";
import { OFFICE, TRADE } from "@/lib/vocab";

type Found = TradeFinderResponse & { preview?: boolean };

function Back() {
  return (
    <Link href="/trade" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-muted hover:text-ink">
      <IconChevron size={14} className="rotate-180" />
      {OFFICE.deal.back}
    </Link>
  );
}

function Chips({ items, tone }: { items: string[]; tone: "start" | "sit" }) {
  if (!items.length) return <span className="text-[12px] font-bold text-white/45">—</span>;
  return (
    <>
      {items.map((p) => (
        <span key={p} className={`rounded-md px-1.5 py-[2px] text-[11px] font-black ${tone === "start" ? "bg-start text-white" : "bg-sit text-white"}`}>
          {p}
        </span>
      ))}
    </>
  );
}

function DealBody({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  const team = useSearchParams().get("team");
  const { data, error, reload } = useCached<Found>(officeKey(c.platform, c.league_id, c.team_id), () =>
    findTrades(c.platform, c.league_id, c.team_id) as Promise<Found>,
  );
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <SkeletonList rows={4} />;
  const i = data.partners.findIndex((p) => p.team_id === team);
  if (i < 0) {
    return (
      <div className="grid gap-3">
        <Back />
        <p className="card p-5 text-center text-[14px] text-ink-2">{OFFICE.deal.gone}</p>
      </div>
    );
  }
  const p = data.partners[i];
  const preview = data.preview === true;
  const offers = preview ? [] : p.offers ?? [];
  const h = heat(offers[0] ?? null, i + 1);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="-mb-2 -mt-2">
        <Back />
      </div>

      <section className={`hero rise pickup-hero ${h === "hot" ? "pickup-hero-must" : h === "call" ? "pickup-hero-claim" : ""} overflow-hidden p-5`}>
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{OFFICE.deal.rank(i + 1)}</span>
          <Stamp ink={h === "hot" ? "text-signal" : "text-white"} slam className="shrink-0">
            {OFFICE.heat[h]}
          </Stamp>
        </div>
        <h2 className="display mt-3 text-[28px] leading-[1.05] text-white [overflow-wrap:anywhere]">{p.team_name}</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-white/65">{p.headline}</p>
        <div className="mt-4 grid gap-2 border-t border-white/10 pt-3.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[11px] font-bold text-white/50">{OFFICE.has}</span>
            <Chips items={posList(p.positions.surplus)} tone="start" />
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-[11px] font-bold text-white/50">{OFFICE.needs}</span>
            <Chips items={posList(p.positions.need)} tone="sit" />
          </span>
        </div>
      </section>

      {offers.length > 0 && (
        <section>
          <h3 className="display mb-2 text-[18px] leading-none">{OFFICE.deal.offers}</h3>
          <ol className="grid gap-3">
            {offers.map((o, k) => (
              <li key={o.give.join() + o.get.join()} className={`card overflow-hidden p-0 rise rise-${Math.min(k + 1, 5)}`}>
                <Offer o={o} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {preview ? (
        <Locked signedIn={signedIn} sku="trade_lab" what="Trade Lab" teaser={TRADE.lockTeaser} onUnlocked={refresh} />
      ) : (
        <Link
          href={`/trade?their=${encodeURIComponent(p.team_id)}&build=1#build`}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[14px] font-black text-paper"
        >
          {OFFICE.deal.build(p.team_name)}
          <IconChevron size={15} />
        </Link>
      )}

      <Back />
    </div>
  );
}

export default function DealPage() {
  return (
    <AppShell section="trade" needsMe>
      {(s) => (
        <Suspense fallback={<SkeletonList rows={4} />}>
          <DealBody c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
        </Suspense>
      )}
    </AppShell>
  );
}
