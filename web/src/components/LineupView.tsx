"use client";
import type { Lineup, LineupChange, LineupSlot, LockCall, Player, SharedPlayer } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { PlayerLine } from "./Players";
import { IconArrowUp, IconCheck } from "./icons";
import { ShareLock } from "./ShareLock";
import { ConfidencePill, Eyebrow, H2, Why } from "./ui";

const RING: Record<string, "start" | "lean" | "flip"> = { Lock: "start", Lean: "lean", "Coin flip": "flip" };

function SlotRow({ s, hit }: { s: LineupSlot; hit?: number }) {
  return (
    <li className={`min-w-0 px-4 py-3 ${s.change ? "bg-start-soft" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-[34px] shrink-0 text-[10px] font-black uppercase tracking-[0.08em] text-muted">{s.slot}</span>
        {s.player ? (
          <PlayerLine p={s.player} avatar="md" ring={RING[s.confidence]} />
        ) : (
          <span className="flex flex-1 items-center gap-3">
            <Avatar name="?" size="md" />
            <span className="text-sm text-muted">Empty</span>
          </span>
        )}
        {/* Only the number sits beside the name. The confidence pill is wide, so it moves to
            its own row rather than eating the name column down to an ellipsis. */}
        <span className="display tnum shrink-0 text-[22px] leading-none">{(s.player?.projected ?? 0).toFixed(1)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 pl-[46px]">
        <ConfidencePill value={s.confidence} hit={hit} />
          <Why
          lines={[
            s.reason,
            hit !== undefined
              ? `${s.confidence}: margins this size were right about ${Math.round(hit * 100)}% of the time last week.`
              : "",
          ].filter(Boolean)}
          label="Why?"
        />
      </div>
    </li>
  );
}

/** What a start/sit call needs to become a public card. The page supplies it; without it the
    lineup still renders, just with no share button (the report and email embeds). */
export type ShareContext = { leagueName: string; week: number };

/** Only Locks get a share button. "Lock" is the word we want people repeating, and a card
    bragging about a coin flip is a bad advert — the renderer handles every tag, the UI offers
    the one worth posting. */
function lockCall(c: LineupChange, faces: Map<string, Player>, hit?: number): LockCall {
  // A LineupChange carries only a PlayerRef, and the faces are what make the card. The full
  // players are already on the page in the slots and the bench, so look them up by id.
  const shared = (ref: { id: string; name: string; position?: string } | null): SharedPlayer | null => {
    if (!ref) return null;
    const p = faces.get(ref.id);
    return {
      name: ref.name,
      position: p?.position ?? ref.position ?? "",
      nfl_team: p?.nfl_team ?? "",
      photo: p?.photo ?? null,
      team_logo: p?.team_logo ?? null,
    };
  };
  return {
    start: shared(c.in) as SharedPlayer,
    bench: shared(c.out),
    gain: c.gain,
    confidence: c.confidence,
    slot: c.slot,
    note: hit !== undefined
      ? `Margins this size have been right about ${Math.round(hit * 100)}% of the time.`
      : c.reason,
  };
}

export function LineupView({
  lineup,
  compact = false,
  share,
}: { lineup: Lineup; compact?: boolean; share?: ShareContext }) {
  const delta = lineup.projected_total - lineup.current_total;
  const faces = new Map<string, Player>(
    [...lineup.slots.map((s) => s.player), ...lineup.bench.map((b) => b.player)]
      .filter((p): p is Player => !!p)
      .map((p) => [p.id, p]),
  );
  return (
    <div className="grid min-w-0 gap-6">
      <section className="hero flex items-end justify-between gap-4 p-5">
        <div className="min-w-0">
          <Eyebrow>Projected · Week {lineup.week}</Eyebrow>
          <div className="display tnum mt-1 text-[42px] leading-none text-white">{lineup.projected_total.toFixed(1)}</div>
        </div>
        <div className="shrink-0 text-right">
          {delta > 0.05 ? (
            <>
              <div className="tnum display text-[19px] text-start">{signed(delta)}</div>
              <div className="text-[11px] text-white/55">
                vs current <span className="tnum">{lineup.current_total.toFixed(1)}</span>
              </div>
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-bold text-white">
              <IconCheck size={13} strokeWidth={3} /> Lineup is set
            </div>
          )}
        </div>
      </section>

      {lineup.changes.length > 0 && (
        <section className="min-w-0">
          <H2>Make these swaps</H2>
          <ul className="mt-2.5 grid gap-2.5">
            {lineup.changes.map((c, i) => (
              <li key={i} className={`card border-start/35 bg-start-soft p-4 rise rise-${Math.min(i + 1, 5)}`}>
                <div className="flex items-center justify-between gap-2">
                  <Eyebrow>{c.slot}</Eyebrow>
                  <ConfidencePill value={c.confidence} />
                </div>
                <div className="mt-2.5 flex min-w-0 items-center gap-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-sit line-through decoration-2">
                      {c.out?.name ?? "Empty"}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[15px] font-black text-start">
                      <IconArrowUp size={14} strokeWidth={3} />
                      <span className="truncate">{c.in.name}</span>
                    </span>
                  </span>
                  <span className="display tnum shrink-0 text-[21px] text-start">{signed(c.gain)}</span>
                </div>
                {!compact && <p className="mt-2 text-[13px] leading-snug text-ink-2">{c.reason}</p>}
                {!compact && share && c.confidence === "Lock" && (
                  <ShareLock
                    call={lockCall(c, faces, lineup.confidence_hit_rate?.[c.confidence])}
                    leagueName={share.leagueName}
                    week={share.week}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0">
        <H2>Starters</H2>
        <ul className="card mt-2.5 min-w-0 divide-y divide-line overflow-hidden p-0">
          {lineup.slots.map((s, i) => (
            <SlotRow key={i} s={s} hit={lineup.confidence_hit_rate?.[s.confidence]} />
          ))}
        </ul>
      </section>

      {!compact && (
        <section className="min-w-0">
          <H2>Bench</H2>
          <ul className="card mt-2.5 min-w-0 divide-y divide-line overflow-hidden p-0">
            {lineup.bench.map((b, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PlayerLine p={b.player} avatar="md" />
                  <span className="display tnum shrink-0 text-[19px] text-muted">{b.player.projected.toFixed(1)}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-muted">{b.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
