"use client";
import type { Waivers } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { Eyebrow, Stat, Why } from "./ui";
import { InjuryTag } from "./ui";

export function WaiversView({ waivers, compact = false }: { waivers: Waivers; compact?: boolean }) {
  return (
    <div className="grid min-w-0 gap-3">
      <div className="card flex items-end justify-between p-4">
        <Stat label="FAAB remaining" value={waivers.faab_remaining === null ? "Priority" : `$${waivers.faab_remaining}`} />
        <div className="text-right text-xs text-muted">
          Week {waivers.week}
          <br />
          {waivers.picks.length} ranked pickups
        </div>
      </div>
      <ol className="grid gap-3">
        {waivers.picks.map((w, i) => (
          <li key={w.player.id} className={`card overflow-hidden p-0 rise rise-${Math.min(i + 1, 5)}`}>
            <div className="flex items-center gap-3 p-4">
              <span className="display -ml-1 w-6 shrink-0 text-center text-2xl font-black text-muted/60">{i + 1}</span>
              <Avatar name={w.player.name} photo={w.player.photo} teamLogo={w.player.team_logo} size="lg" ring={i === 0 ? "start" : undefined} />
              <div className="min-w-0 flex-1">
                <div className="display truncate text-lg font-extrabold leading-tight">
                  {w.player.name}
                  <InjuryTag status={w.player.injury_status} />
                </div>
                <div className="text-xs text-muted">
                  {w.player.position} · {w.player.nfl_team ?? "FA"}
                  {w.trending_adds > 0 && <> · {w.trending_adds.toLocaleString()} adds</>}
                </div>
                <div className="mt-1 flex gap-3 text-sm tabular-nums">
                  <span className={`font-black ${w.weekly_gain > 0 ? "text-start" : "text-muted"}`}>{signed(w.weekly_gain)} wk</span>
                  <span className={`font-bold ${w.ros_gain > 0 ? "text-start" : "text-muted"}`}>{signed(w.ros_gain, 0)} ROS</span>
                </div>
              </div>
            </div>
            <div className="flex items-stretch divide-x divide-line border-t border-line bg-soft/60">
              <div className="flex-1 p-3">
                <Eyebrow>Bid</Eyebrow>
                <div className="display text-2xl font-black tabular-nums">
                  {w.bid.amount === null ? "—" : `$${w.bid.amount}`}
                  {w.bid.range && (
                    <span className="ml-1 text-sm font-bold text-muted">
                      ${w.bid.range[0]}–{w.bid.range[1]}
                    </span>
                  )}
                </div>
                {w.bid.pct_of_budget !== null && <div className="text-xs text-muted">{w.bid.pct_of_budget}% of budget</div>}
              </div>
              <div className="flex-1 p-3">
                <Eyebrow>Drop</Eyebrow>
                {w.drop ? (
                  <>
                    <div className="truncate font-extrabold text-sit">{w.drop.name}</div>
                    <div className="text-xs text-muted">{w.drop.position}</div>
                  </>
                ) : (
                  <div className="font-bold text-muted">Open spot</div>
                )}
              </div>
            </div>
            {!compact && (
              <div className="px-4 pb-4 pt-3">
                <p className="text-sm leading-relaxed">{w.reason}</p>
                <Why lines={[`Fit score ${w.fit_score.toFixed(1)} = 40% this week's lineup gain + 60% rest-of-season gain per week + depth.`, w.bid.amount !== null ? `Bid scales with fit, weeks left, league bid history and add trend.` : "This league uses priority waivers, so there is no bid."]} label="How is this ranked?" />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
