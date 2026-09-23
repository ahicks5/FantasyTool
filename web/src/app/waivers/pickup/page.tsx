"use client";
/**
 * One pickup, read in full: the arrow on each of Scouting's top panels lands here.
 *
 * Everything on it is the wire's own (`GET .../waivers`, already in the session cache from
 * the tab, so the page paints on the first frame): the stamp, the numbers, the case in the
 * engine's words, who goes out for him and what to bid. The player's own scout report is
 * one tap further, in the sheet, like every name in the app.
 *
 * Paid, like the row it came from: a 402 here is the same lock the tab shows. The pickup is
 * named in the query string (`?id=`), never the path, because the static demo export
 * cannot pre-render a path it has not seen.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { Locked } from "@/components/Locked";
import { PlayerName } from "@/components/Players";
import { usePlayerSheet } from "@/components/player/PlayerSheetProvider";
import { AppShell } from "@/components/Shell";
import { IconChevron } from "@/components/icons";
import { ErrorBox, Eyebrow, InjuryTag, SkeletonList, Stamp, Stat, Why } from "@/components/ui";
import { getWaivers, PaywallError } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { signed } from "@/lib/format";
import { paywallTeaser } from "@/lib/teaser";
import type { Connection } from "@/lib/storage";
import type { WaiverPick, Waivers } from "@/lib/types";
import { WIRE } from "@/lib/vocab";
import { findPick, pickupHref, urgency, wireKey } from "@/lib/wire";

function Back() {
  return (
    <Link href="/waivers" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-muted hover:text-ink">
      <IconChevron size={14} className="rotate-180" />
      {WIRE.page.back}
    </Link>
  );
}

function Read({ pick, rank, picks }: { pick: WaiverPick; rank: number; picks: WaiverPick[] }) {
  const { open } = usePlayerSheet();
  const u = urgency(pick, rank);
  const p = pick.player;
  const others = picks.filter((o) => o.player.id !== p.id).slice(0, 3);
  return (
    <div className="grid min-w-0 gap-4">
      {/* At both ends: the way back is the first thing on the page and the last. */}
      <div className="-mb-2 -mt-2">
        <Back />
      </div>
      <section className={`hero rise pickup-hero pickup-hero-${u} overflow-hidden p-5`}>
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{WIRE.page.rank(rank)}</span>
          <Stamp ink={u === "must" ? "text-signal" : "text-white"} slam className="shrink-0">
            {WIRE.urgency[u]}
          </Stamp>
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-4">
          <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="xl" ring={u === "must" ? "sit" : "lean"} />
          <div className="min-w-0">
            <h2 className="display text-[26px] leading-[1.05] text-white [overflow-wrap:anywhere]">
              {p.name}
              <InjuryTag status={p.injury_status} />
            </h2>
            <div className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-white/60">
              {p.position} · {p.nfl_team ?? "FA"}
              {p.opponent ? ` · vs ${p.opponent}` : ""}
            </div>
          </div>
        </div>
      </section>

      <section className="card rise rise-1 grid grid-cols-2 gap-4 p-4">
        <Stat label={WIRE.page.thisWeek} value={signed(pick.weekly_gain)} tone={pick.weekly_gain > 0 ? "start" : "muted"} />
        <Stat label={WIRE.page.restOfSeason} value={signed(pick.ros_gain, 0)} tone={pick.ros_gain > 0 ? "start" : "muted"} />
        <Stat label={WIRE.page.fit} value={pick.fit_score.toFixed(1)} />
        <Stat label={WIRE.page.adds} value={pick.trending_adds > 0 ? pick.trending_adds.toLocaleString() : "—"} tone="muted" />
      </section>

      <section className="card rise rise-2 p-4">
        <Eyebrow>{WIRE.page.why}</Eyebrow>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{pick.reason}</p>
        <Why lines={[...WIRE.page.howLines]} label={WIRE.page.how} />
      </section>

      <section className="card rise rise-3 grid grid-cols-2 divide-x divide-line p-0">
        <div className="min-w-0 p-4">
          <Eyebrow>{WIRE.page.cut}</Eyebrow>
          {pick.drop ? (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <Avatar name={pick.drop.name} photo={(pick.drop as { photo?: string | null }).photo} size="sm" ring="sit" />
              <div className="min-w-0">
                <div className="text-[14px] font-black leading-tight text-sit [overflow-wrap:anywhere]"><PlayerName p={pick.drop} /></div>
                <div className="text-[11px] text-muted">{pick.drop.position}</div>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-[13px] font-bold text-muted">{WIRE.page.cutNone}</p>
          )}
        </div>
        <div className="min-w-0 p-4">
          <Eyebrow>{WIRE.page.bid}</Eyebrow>
          <div className="display tnum mt-1 text-[30px] leading-none">
            {pick.bid.amount === null ? <span className="text-[20px]">{WIRE.priority}</span> : `$${pick.bid.amount}`}
          </div>
          {pick.bid.range && (
            <div className="tnum mt-1 text-[12px] font-bold text-muted">${pick.bid.range[0]}–${pick.bid.range[1]}</div>
          )}
          <div className="tnum mt-0.5 text-[11px] text-muted">
            {pick.bid.pct_of_budget !== null ? `${pick.bid.pct_of_budget}% ${WIRE.page.budget}` : pick.bid.amount === null ? WIRE.page.priorityLine : ""}
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => open(p)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[14px] font-black text-paper"
      >
        {WIRE.page.report}
        <IconChevron size={15} />
      </button>

      {others.length > 0 && (
        <section>
          <Eyebrow className="mb-1.5">{WIRE.page.others}</Eyebrow>
          <ol className="grid gap-1.5">
            {others.map((o) => (
              <li key={o.player.id}>
                <Link href={pickupHref(o.player.id)} className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line px-3 py-2 hover:bg-soft">
                  <Avatar name={o.player.name} photo={o.player.photo} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{o.player.name}</span>
                    <span className="block truncate text-[11px] text-muted">{o.player.position} · {WIRE.urgency[urgency(o, picks.indexOf(o) + 1)]}</span>
                  </span>
                  <span className={`tnum shrink-0 text-[13px] font-black ${o.weekly_gain > 0 ? "text-start" : "text-muted"}`}>{signed(o.weekly_gain)}</span>
                  <IconChevron size={14} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Back />
    </div>
  );
}

function PickupBody({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  const id = useSearchParams().get("id");
  const { data, error, cause, reload } = useCached<Waivers>(wireKey(c.platform, c.league_id, c.team_id), () =>
    getWaivers(c.platform, c.league_id, c.team_id),
  );
  if (cause instanceof PaywallError) {
    return (
      <div className="grid gap-4">
        <Back />
        <Locked signedIn={signedIn} sku="waivers" what="Wire Pass" teaser={paywallTeaser(cause, WIRE.lockedLine)} onUnlocked={refresh} />
      </div>
    );
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <SkeletonList rows={4} />;
  const hit = findPick(data.picks, id);
  if (!hit) {
    return (
      <div className="grid gap-3">
        <p className="card p-5 text-center text-[14px] text-ink-2">{WIRE.page.gone}</p>
        <Back />
      </div>
    );
  }
  return <Read pick={hit.pick} rank={hit.rank} picks={data.picks} />;
}

export default function PickupPage() {
  return (
    <AppShell section="waivers" needsMe>
      {(s) => (
        <Suspense fallback={<SkeletonList rows={4} />}>
          <PickupBody c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
        </Suspense>
      )}
    </AppShell>
  );
}
