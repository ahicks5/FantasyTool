"use client";
import type { Waivers } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { Eyebrow, InjuryTag, Why } from "./ui";

export function WaiversView({ waivers, compact = false }: { waivers: Waivers; compact?: boolean }) {
  return (
    <div className="grid min-w-0 gap-3">
      <ol className="grid gap-3">
        {waivers.picks.map((w, i) => (
          <li key={w.player.id} className={`card min-w-0 overflow-hidden p-0 rise rise-${Math.min(i + 1, 5)}`}>
            <div className="flex min-w-0 items-center gap-3 p-4">
              <span className="display tnum w-5 shrink-0 text-center text-[19px] text-muted/50">{i + 1}</span>
              <Avatar name={w.player.name} photo={w.player.photo} teamLogo={w.player.team_logo} size="lg" ring={i === 0 ? "start" : undefined} />
              <div className="min-w-0 flex-1">
                <div className="display truncate text-[17px] leading-tight">
                  {w.player.name}
                  <InjuryTag status={w.player.injury_status} />
                </div>
                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {w.player.position} · {w.player.nfl_team ?? "FA"}
                  {w.trending_adds > 0 && <span className="tnum"> · {w.trending_adds.toLocaleString()} adds</span>}
                </div>
                <div className="tnum mt-1.5 flex gap-3 text-[13px]">
                  <span className={`font-black ${w.weekly_gain > 0 ? "text-start" : "text-muted"}`}>{signed(w.weekly_gain)} wk</span>
                  <span className={`font-bold ${w.ros_gain > 0 ? "text-start" : "text-muted"}`}>{signed(w.ros_gain, 0)} ROS</span>
                </div>
              </div>
            </div>
            <div className="flex items-stretch divide-x divide-line border-t border-line bg-soft/70">
              <div className="min-w-0 flex-1 p-3.5">
                <Eyebrow>Bid</Eyebrow>
                <div className="display tnum mt-0.5 text-[22px] leading-none">
                  {w.bid.amount === null ? "—" : `$${w.bid.amount}`}
                  {w.bid.range && (
                    <span className="tnum ml-1 text-[12px] font-bold text-muted">
                      ${w.bid.range[0]}–{w.bid.range[1]}
                    </span>
                  )}
                </div>
                {w.bid.pct_of_budget !== null && <div className="tnum mt-1 text-[11px] text-muted">{w.bid.pct_of_budget}% of budget</div>}
              </div>
              <div className="min-w-0 flex-1 p-3.5">
                <Eyebrow>Drop</Eyebrow>
                {w.drop ? (
                  <>
                    <div className="mt-0.5 truncate text-[14px] font-black text-sit">{w.drop.name}</div>
                    <div className="text-[11px] text-muted">{w.drop.position}</div>
                  </>
                ) : (
                  <div className="mt-0.5 text-[14px] font-bold text-muted">Open spot</div>
                )}
              </div>
            </div>
            {!compact && (
              <div className="px-4 pb-4 pt-3.5">
                <p className="text-[14px] leading-relaxed text-ink-2">{w.reason}</p>
                <Why
                  lines={[
                    `Fit score ${w.fit_score.toFixed(1)} = 40% this week's lineup gain + 60% rest-of-season gain per week + depth.`,
                    w.bid.amount !== null
                      ? "The bid scales with fit, weeks left, this league's bid history and how many managers are adding him."
                      : "This league uses priority waivers, so there is no bid.",
                  ]}
                  label="How is this ranked?"
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
