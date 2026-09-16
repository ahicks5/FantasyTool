import type { Waivers } from "@/lib/types";
import { formatBid, signed } from "@/lib/format";
import { Card } from "./ui";
import { PlayerLine } from "./Players";

export function WaiversView({ waivers, compact = false }: { waivers: Waivers; compact?: boolean }) {
  return (
    <div className="grid gap-3">
      <Card className="flex items-center justify-between">
        <span className="text-sm font-bold uppercase text-muted">FAAB remaining</span>
        <span className="text-2xl font-black tabular-nums">${waivers.faab_remaining}</span>
      </Card>
      <ol className="grid gap-3">
        {waivers.picks.map((w, i) => (
          <li key={w.player.id} className="rounded-xl border border-line p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{i + 1}</span>
              <PlayerLine p={w.player} big />
              <span className="ml-auto shrink-0 text-right text-sm">
                <span className="block font-black tabular-nums text-start">{signed(w.weekly_gain)} wk</span>
                <span className="block font-bold tabular-nums text-muted">{signed(w.ros_gain)} ROS</span>
              </span>
            </div>
            <div className="mt-3 rounded-lg bg-soft p-3">
              <div className="text-xs font-bold uppercase text-muted">Suggested bid</div>
              <div className="text-xl font-black">
                ${w.bid.amount} <span className="text-sm font-bold text-muted">{formatBid(w.bid).replace(/^\$\d+ /, "")}</span>
              </div>
              {w.drop && (
                <div className="mt-1 text-sm">
                  Drop <span className="font-bold text-sit">{w.drop.name}</span> <span className="text-muted">({w.drop.position})</span>
                </div>
              )}
            </div>
            {!compact && <p className="mt-2 text-sm">{w.reason}</p>}
            {!compact && <p className="mt-1 text-xs text-muted">{w.trending_adds.toLocaleString()} adds this week · fit {w.fit_score.toFixed(1)}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
