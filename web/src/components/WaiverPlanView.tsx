"use client";
import type { WaiverClaim, WaiverPlanResponse } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { Eyebrow, InjuryTag, Stat, Why } from "./ui";

function ClaimCard({ c, index }: { c: WaiverClaim; index: number }) {
  const primary = index === 0;
  return (
    <li className={`card overflow-hidden p-0 rise rise-${Math.min(index + 1, 5)} ${primary ? "border-2 border-start" : ""}`}>
      <div className={`flex items-center justify-between px-4 py-2 ${primary ? "bg-start text-white" : "bg-soft"}`}>
        <span className="text-[11px] font-black uppercase tracking-[0.12em]">{primary ? "Claim this" : `If he's gone · #${index + 1}`}</span>
        {c.trending_adds > 0 && <span className="text-[11px] font-bold opacity-80">{c.trending_adds.toLocaleString()} adds</span>}
      </div>

      <div className="flex items-center gap-3 p-4">
        <Avatar name={c.add.name} photo={c.add.photo} teamLogo={c.add.team_logo} size="lg" ring={primary ? "start" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="display truncate text-lg font-extrabold leading-tight">
            {c.add.name}
            <InjuryTag status={c.add.injury_status} />
          </div>
          <div className="text-xs text-muted">
            {c.add.position} · {c.add.nfl_team ?? "FA"}
          </div>
          <div className="mt-1 flex gap-3 text-sm tabular-nums">
            {c.weekly_gain > 0 && <span className="font-black text-start">{signed(c.weekly_gain)} wk</span>}
            {c.ros_gain >= 1 && <span className="font-bold text-start">{signed(c.ros_gain, 0)} ROS</span>}
            <span className="font-bold text-muted">{c.net.toFixed(2)} pts/wk net</span>
          </div>
        </div>
      </div>

      <div className="flex items-stretch divide-x divide-line border-y border-line bg-soft/60">
        <div className="flex-1 p-3">
          <Eyebrow>Bid</Eyebrow>
          <div className="display text-2xl font-black tabular-nums">
            {c.bid.amount === null ? "—" : `$${c.bid.amount}`}
            {c.bid.range && (
              <span className="ml-1 text-sm font-bold text-muted">
                ${c.bid.range[0]}–{c.bid.range[1]}
              </span>
            )}
          </div>
          {c.bid.value_cap != null && c.bid.market != null && (
            <div className="text-xs text-muted">
              worth up to ${c.bid.value_cap} · league clears ~${c.bid.market}
            </div>
          )}
          {c.bid.note && <div className="text-xs text-muted">{c.bid.note}</div>}
        </div>
        <div className="flex-1 p-3">
          <Eyebrow>Drop</Eyebrow>
          {c.drop ? (
            <div className="flex items-center gap-2">
              <Avatar name={c.drop.name} photo={c.drop.photo} size="sm" className="opacity-70 grayscale" />
              <span className="min-w-0">
                <span className="block truncate font-extrabold text-sit">{c.drop.name}</span>
                <span className="block text-xs text-muted">
                  {c.drop.position}
                  {c.drop_cost > 0.05 ? ` · costs ${c.drop_cost.toFixed(2)}/wk` : " · free to lose"}
                </span>
              </span>
            </div>
          ) : (
            <div className="font-bold text-muted">Open roster spot</div>
          )}
        </div>
      </div>

      <div className="p-4">
        <p className="text-sm leading-relaxed">{c.reason}</p>
        <Why
          lines={[
            `Worth about ${c.net.toFixed(2)} points a week after the drop.`,
            c.drop_cost > 0.05
              ? `Dropping ${c.drop?.name} costs about ${c.drop_cost.toFixed(2)} a week; that is already subtracted.`
              : "The drop never cracks your rest-of-season lineup, so it costs nothing.",
            c.bid.value_cap != null
              ? `Bid is the smaller of what he is worth to you ($${c.bid.value_cap}) and what claims usually clear for here ($${c.bid.market}).`
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
    <div className="grid min-w-0 gap-3">
      <div className="card flex items-end justify-between p-4">
        <Stat label="FAAB remaining" value={plan.faab_remaining === null ? "Priority" : `$${plan.faab_remaining}`} />
        <div className="text-right text-xs text-muted">
          Week {plan.week}
          <br />
          {claims.length ? `Plan spends $${plan.total_planned_spend}` : "Nothing to spend on"}
        </div>
      </div>

      {plan.hold_reason && (
        <div className="card border-2 border-dashed p-5 text-center">
          <div className="display text-xl font-extrabold">Hold this week</div>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">{plan.hold_reason}</p>
        </div>
      )}

      {claims.length > 0 && (
        <>
          {!compact && (
            <p className="text-sm text-muted">
              Claims run in order. If your first one loses, the next is already priced.
            </p>
          )}
          <ol className="grid gap-3">
            {claims.map((c, i) => (
              <ClaimCard key={c.add.id} c={c} index={i} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
