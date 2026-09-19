"use client";
import type { WaiverClaim, WaiverPlanResponse } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { IconArrowUp } from "./icons";
import { Countdown, Eyebrow, H2, InjuryTag, OnAir, Stamp, Why } from "./ui";

/**
 * One signing, printed as one: who comes in at the top, who gets cut and what we
 * offer in the strip under him. The first claim is the call we are asking for, so
 * it gets the band and the stamp; the rest are the backup plan and stay quiet —
 * stamping every card would turn the plan into confetti.
 */
function ClaimCard({ c, index }: { c: WaiverClaim; index: number }) {
  const primary = index === 0;
  return (
    <li
      className={`card min-w-0 overflow-hidden p-0 print print-${Math.min(index + 1, 5)} ${primary ? "ring-2 ring-lean" : ""}`}
    >
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${primary ? "bg-lean text-white" : "bg-soft"}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className={`slug text-[13px] leading-none ${primary ? "text-white/65" : "text-muted"}`}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="truncate text-[10px] font-black uppercase tracking-[0.12em]">
            {primary ? "First claim" : "Backup · if the first one is gone"}
          </span>
        </span>
        {primary && (
          // Inked white: the band is dark in both themes, where status colour would vanish.
          <Stamp ink="text-white" slam className="shrink-0">
            Claim him
          </Stamp>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-3.5 p-4">
        <Avatar name={c.add.name} photo={c.add.photo} teamLogo={c.add.team_logo} size="lg" ring={primary ? "lean" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[19px] leading-tight">
            {c.add.name}
            <InjuryTag status={c.add.injury_status} />
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* The half of the trade that arrives. The word carries it; the green is decoration. */}
            <span className="inline-flex items-center gap-1 rounded bg-start-soft px-1.5 py-[2px] text-[10px] font-black uppercase tracking-[0.1em] text-start">
              <IconArrowUp size={10} strokeWidth={3.2} />
              In
            </span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
              {c.add.position} · {c.add.nfl_team ?? "FA"}
              {c.trending_adds > 0 && <span className="tnum"> · {c.trending_adds.toLocaleString()} adds</span>}
            </span>
          </div>
          <div className="tnum mt-1.5 flex flex-wrap gap-x-3 text-[13px]">
            {c.weekly_gain > 0 && <span className="font-black text-start">{signed(c.weekly_gain)} wk</span>}
            {c.ros_gain >= 1 && <span className="font-bold text-start">{signed(c.ros_gain, 0)} ROS</span>}
            <span className="font-bold text-muted">{c.net.toFixed(2)}/wk net</span>
          </div>
        </div>
      </div>

      {/* Cut first, then the money: the signing reads top to bottom, in, out, offer. */}
      <div className="flex items-stretch divide-x divide-line border-y border-line bg-soft/70">
        <div className="min-w-0 flex-1 p-3.5">
          <Eyebrow>Cut</Eyebrow>
          {c.drop ? (
            /* No avatar here: the cut is the small half of the row and a face steals the
               width the name needs. */
            <div className="mt-0.5 min-w-0">
              <span className="block text-[14px] font-black leading-tight text-sit">{c.drop.name}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                {c.drop.position}
                {c.drop_cost > 0.05 ? ` · costs ${c.drop_cost.toFixed(2)}/wk` : " · free to lose"}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-[13px] font-bold text-muted">Nobody · open spot</div>
          )}
        </div>
        <div className="min-w-0 flex-1 p-3.5">
          <Eyebrow>We bid</Eyebrow>
          <div className="display tnum mt-0.5 text-[26px] leading-none">
            {c.bid.amount === null ? <span className="text-[19px]">Priority</span> : `$${c.bid.amount}`}
            {c.bid.range && (
              <span className="tnum ml-1.5 text-[13px] font-bold text-muted">
                ${c.bid.range[0]}–${c.bid.range[1]}
              </span>
            )}
          </div>
          {c.bid.value_cap != null && c.bid.market != null && (
            <div className="tnum mt-1 text-[11px] leading-snug text-muted">
              worth up to ${c.bid.value_cap} · league clears ~${c.bid.market}
            </div>
          )}
          {c.bid.note
            ? <div className="mt-1 text-[11px] leading-snug text-muted">{c.bid.note}</div>
            : c.bid.amount === null && <div className="mt-1 text-[11px] leading-snug text-muted">No money here. Claims run in order.</div>}
        </div>
      </div>

      <div className="p-4">
        <p className="text-[14px] leading-relaxed text-ink-2">{c.reason}</p>
        <Why
          lines={[
            `Worth about ${c.net.toFixed(2)} points a week after the drop.`,
            c.drop_cost > 0.05
              ? `Cutting ${c.drop?.name} costs about ${c.drop_cost.toFixed(2)} a week; that is already subtracted.`
              : "The cut never cracks your rest-of-season lineup, so it costs nothing.",
            c.bid.value_cap != null
              ? `The bid is the smaller of what he is worth to you ($${c.bid.value_cap}) and what claims usually clear for here ($${c.bid.market}).`
              : "This league uses priority waivers, so there is no bid.",
          ]}
          label="How is this priced?"
        />
      </div>
    </li>
  );
}

export function WaiverPlanView({ plan, compact = false }: { plan: WaiverPlanResponse; compact?: boolean }) {
  const claims = [plan.primary, ...plan.fallbacks].filter((c): c is WaiverClaim => !!c);
  // Counts up on arrival, then snaps. `?? 0` keeps the hook unconditional; a priority
  // league never shows the number.
  // No count-up on a budget. A projected total racing upward reads as a scoreboard
  // settling; a FAAB balance doing it shows "$4" and "$19" on the way to $100, which are
  // wrong numbers presented as real ones — and it made the wire look like it loaded twice.
  const budget = String(plan.faab_remaining ?? 0);

  return (
    <div className="grid min-w-0 gap-3.5">
      <section className="hero callsheet rise">
        {!compact && (
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <OnAir className="text-white/70" />
            <Countdown onHero />
          </div>
        )}
        <div className="flex items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <Eyebrow>{plan.waiver_type === "faab" ? "Budget left" : "Waiver order"}</Eyebrow>
            <div className="display tnum mt-1 text-[42px] leading-none text-white">
              {plan.faab_remaining === null ? "Priority" : `$${budget}`}
            </div>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-relaxed text-white/60">
            Week {plan.week}
            <br />
            {claims.length ? (
              <span className="tnum">We spend ${plan.total_planned_spend}</span>
            ) : (
              "Nothing worth spending on"
            )}
          </div>
        </div>
      </section>

      {plan.hold_reason && (
        <div className="card rise p-6 text-center">
          {/* A quiet week is a call too — stamped, not apologised for. When there are
              claims as well, the note stays a note and the stamp stays on the claim. */}
          {claims.length === 0 ? (
            <Stamp size="lg" ink="text-ink" slam className="mb-4">
              Hold
            </Stamp>
          ) : (
            <Eyebrow className="mb-2">Also on the board</Eyebrow>
          )}
          <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-ink-2">{plan.hold_reason}</p>
        </div>
      )}

      {claims.length > 0 && (
        <section className="min-w-0">
          {!compact && (
            <>
              <H2>Claims, in order</H2>
            </>
          )}
          <ol className={`grid gap-3.5 ${compact ? "" : "mt-2.5"}`}>
            {claims.map((c, i) => (
              <ClaimCard key={c.add.id} c={c} index={i} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
