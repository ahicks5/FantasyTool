"use client";
import type { WaiverClaim, WaiverPlanResponse } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { IconCheck } from "./icons";
import { Eyebrow, InjuryTag, Why } from "./ui";

function ClaimCard({ c, index }: { c: WaiverClaim; index: number }) {
  const primary = index === 0;
  return (
    <li className={`card min-w-0 overflow-hidden p-0 rise rise-${Math.min(index + 1, 5)} ${primary ? "ring-2 ring-start" : ""}`}>
      <div className={`flex items-center justify-between px-4 py-2 ${primary ? "bg-start-fill text-white" : "bg-soft"}`}>
        <span className="text-[10px] font-black uppercase tracking-[0.12em]">
          {primary ? "Claim this" : `If he's gone · #${index + 1}`}
        </span>
        {c.trending_adds > 0 && (
          <span className={`tnum text-[11px] font-bold ${primary ? "text-white" : "text-muted"}`}>
            {c.trending_adds.toLocaleString()} adds
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-3.5 p-4">
        <Avatar name={c.add.name} photo={c.add.photo} teamLogo={c.add.team_logo} size="lg" ring={primary ? "start" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[19px] leading-tight">
            {c.add.name}
            <InjuryTag status={c.add.injury_status} />
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {c.add.position} · {c.add.nfl_team ?? "FA"}
          </div>
          <div className="tnum mt-1.5 flex flex-wrap gap-x-3 text-[13px]">
            {c.weekly_gain > 0 && <span className="font-black text-start">{signed(c.weekly_gain)} wk</span>}
            {c.ros_gain >= 1 && <span className="font-bold text-start">{signed(c.ros_gain, 0)} ROS</span>}
            <span className="font-bold text-muted">{c.net.toFixed(2)}/wk net</span>
          </div>
        </div>
      </div>

      <div className="flex items-stretch divide-x divide-line border-y border-line bg-soft/70">
        <div className="min-w-0 flex-1 p-3.5">
          <Eyebrow>Bid</Eyebrow>
          <div className="display tnum mt-0.5 text-[26px] leading-none">
            {c.bid.amount === null ? "—" : `$${c.bid.amount}`}
            {c.bid.range && (
              <span className="tnum ml-1.5 text-[13px] font-bold text-muted">
                ${c.bid.range[0]}–{c.bid.range[1]}
              </span>
            )}
          </div>
          {c.bid.value_cap != null && c.bid.market != null && (
            <div className="tnum mt-1 text-[11px] leading-snug text-muted">
              worth up to ${c.bid.value_cap} · league clears ~${c.bid.market}
            </div>
          )}
          {c.bid.note && <div className="mt-1 text-[11px] leading-snug text-muted">{c.bid.note}</div>}
        </div>
        <div className="min-w-0 flex-1 p-3.5">
          <Eyebrow>Drop</Eyebrow>
          {c.drop ? (
            /* No avatar here: the drop is the small half of the row and a face steals the
               width the name needs. */
            <div className="mt-0.5 min-w-0">
              <span className="block text-[14px] font-black leading-tight text-sit">{c.drop.name}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                {c.drop.position}
                {c.drop_cost > 0.05 ? ` · costs ${c.drop_cost.toFixed(2)}/wk` : " · free to lose"}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-[13px] font-bold text-muted">Open roster spot</div>
          )}
        </div>
      </div>

      <div className="p-4">
        <p className="text-[14px] leading-relaxed text-ink-2">{c.reason}</p>
        <Why
          lines={[
            `Worth about ${c.net.toFixed(2)} points a week after the drop.`,
            c.drop_cost > 0.05
              ? `Dropping ${c.drop?.name} costs about ${c.drop_cost.toFixed(2)} a week; that is already subtracted.`
              : "The drop never cracks your rest-of-season lineup, so it costs nothing.",
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
  return (
    <div className="grid min-w-0 gap-3.5">
      <section className="hero flex items-end justify-between gap-4 p-5">
        <div className="min-w-0">
          <Eyebrow>{plan.waiver_type === "faab" ? "FAAB remaining" : "Waiver order"}</Eyebrow>
          <div className="display tnum mt-1 text-[42px] leading-none text-white">
            {plan.faab_remaining === null ? "Priority" : `$${plan.faab_remaining}`}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] leading-relaxed text-white/60">
          Week {plan.week}
          <br />
          {claims.length ? (
            <span className="tnum">This plan spends ${plan.total_planned_spend}</span>
          ) : (
            "Nothing to spend on"
          )}
        </div>
      </section>

      {plan.hold_reason && (
        <div className="card p-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-start-soft text-start" aria-hidden>
            <IconCheck size={26} strokeWidth={2.6} />
          </span>
          <div className="display text-[21px]">Hold this week</div>
          <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">{plan.hold_reason}</p>
        </div>
      )}

      {claims.length > 0 && (
        <>
          {!compact && (
            <p className="text-[13px] leading-relaxed text-muted">
              Claims run in order. If your first one loses, the next is already priced.
            </p>
          )}
          <ol className="grid gap-3.5">
            {claims.map((c, i) => (
              <ClaimCard key={c.add.id} c={c} index={i} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
