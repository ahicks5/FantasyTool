"use client";
/**
 * The board: every free agent worth a claim, ranked. This is a long scannable
 * list, not a set of calls, so nothing here is stamped — rank numeral, plain
 * numbers and the same Cut / Bid strip the plan uses, so a row on the board
 * reads like a signing the moment you decide to make it.
 */

import type { Waivers } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { Eyebrow, InjuryTag, Why } from "./ui";

export function WaiversView({ waivers, compact = false }: { waivers: Waivers; compact?: boolean }) {
  return (
    <div className="grid min-w-0 gap-3">
      {!compact && (
        <p className="text-[13px] leading-relaxed text-muted">
          Ranked by fit: what he adds this week, what he adds the rest of the way, and who you cut to make room.
        </p>
      )}
      <ol className="grid gap-3">
        {waivers.picks.map((w, i) => (
          <li key={w.player.id} className={`card min-w-0 overflow-hidden p-0 rise rise-${Math.min(i + 1, 5)}`}>
            <div className="flex min-w-0 items-center gap-3 p-4">
              <span className="slug w-5 shrink-0 text-center text-[13px] leading-none text-muted">{i + 1}</span>
              <Avatar name={w.player.name} photo={w.player.photo} teamLogo={w.player.team_logo} size="lg" ring={i === 0 ? "lean" : undefined} />
              <div className="min-w-0 flex-1">
                <div className="display truncate text-[17px] leading-tight">
                  {w.player.name}
                  <InjuryTag status={w.player.injury_status} />
                </div>
                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {w.player.position} · {w.player.nfl_team ?? "FA"}
                  {w.trending_adds > 0 && <span className="tnum"> · {w.trending_adds.toLocaleString()} adds</span>}
                </div>
                <div className="tnum mt-1.5 flex flex-wrap gap-x-3 text-[13px]">
                  <span className={`font-black ${w.weekly_gain > 0 ? "text-start" : "text-muted"}`}>{signed(w.weekly_gain)} wk</span>
                  <span className={`font-bold ${w.ros_gain > 0 ? "text-start" : "text-muted"}`}>{signed(w.ros_gain, 0)} ROS</span>
                  <span className="font-bold text-muted">{w.fit_score.toFixed(1)} fit</span>
                </div>
              </div>
            </div>
            <div className="flex items-stretch divide-x divide-line border-t border-line bg-soft/70">
              <div className="min-w-0 flex-1 p-3.5">
                <Eyebrow>Cut</Eyebrow>
                {w.drop ? (
                  <>
                    <div className="mt-0.5 truncate text-[14px] font-black text-sit">{w.drop.name}</div>
                    <div className="text-[11px] text-muted">{w.drop.position}</div>
                  </>
                ) : (
                  <div className="mt-0.5 text-[14px] font-bold text-muted">Nobody · open spot</div>
                )}
              </div>
              <div className="min-w-0 flex-1 p-3.5">
                <Eyebrow>We bid</Eyebrow>
                <div className="display tnum mt-0.5 text-[22px] leading-none">
                  {w.bid.amount === null ? <span className="text-[17px]">Priority</span> : `$${w.bid.amount}`}
                  {w.bid.range && (
                    <span className="tnum ml-1 text-[12px] font-bold text-muted">
                      ${w.bid.range[0]}–${w.bid.range[1]}
                    </span>
                  )}
                </div>
                {w.bid.pct_of_budget !== null ? (
                  <div className="tnum mt-1 text-[11px] text-muted">{w.bid.pct_of_budget}% of budget</div>
                ) : (
                  w.bid.amount === null && <div className="mt-1 text-[11px] text-muted">Claims run in order</div>
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
