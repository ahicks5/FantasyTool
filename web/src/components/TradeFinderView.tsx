"use client";
import Link from "next/link";
import type { Player, TradeFinderResponse, TradePartner } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Eyebrow, Why } from "./ui";

function PositionChips({ label, map, tone }: { label: string; map: Record<string, number>; tone: "start" | "sit" }) {
  const entries = Object.entries(map).slice(0, 3);
  if (!entries.length) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</span>
      {entries.map(([pos]) => (
        <span key={pos} className={`rounded-full px-2 py-0.5 text-xs font-black ${tone === "start" ? "bg-start-soft text-start" : "bg-sit-soft text-sit"}`}>
          {pos}
        </span>
      ))}
    </div>
  );
}

function PlayerRow({ label, players, names, tone }: { label: string; players: Player[]; names: string[]; tone: "sit" | "start" }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {players.map((g) => (
          <Avatar key={g.id} name={g.name} photo={g.photo} teamLogo={g.team_logo} size="md" />
        ))}
        <span className={`min-w-0 text-sm font-extrabold leading-tight ${tone === "sit" ? "text-sit" : "text-start"}`}>
          {names.join(" + ")}
          {players[0]?.position && (
            <span className="block text-[11px] font-bold text-muted">
              {players.map((g) => `${g.position} ${g.nfl_team ?? ""}`.trim()).join(" · ")}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

function PartnerCard({ p, index }: { p: TradePartner; index: number }) {
  return (
    <li className={`card overflow-hidden p-0 rise rise-${Math.min(index + 1, 5)}`}>
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>{index === 0 ? "Best fit" : `Option ${index + 1}`}</Eyebrow>
          <span className="text-xs font-bold text-muted">fit {p.complement.toFixed(2)}</span>
        </div>
        <h3 className="display mt-1 text-lg font-extrabold">{p.team_name}</h3>
        <p className="text-sm text-muted">{p.headline}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <PositionChips label="They have" map={p.positions.surplus} tone="start" />
          <PositionChips label="They need" map={p.positions.need} tone="sit" />
        </div>
      </div>

      <ul className="divide-y divide-line">
        {p.offers.map((o) => (
          <li key={o.give.join() + o.get.join()} className="p-4">
            <div className="grid gap-2">
              <PlayerRow label="You give" players={o.give_players} names={o.give_names} tone="sit" />
              <PlayerRow label="You get" players={o.get_players} names={o.get_names} tone="start" />
            </div>

            <div className="mt-3 flex items-center gap-4 text-sm tabular-nums">
              <span className="font-black text-start">You +{o.my_gain_ros.toFixed(0)} ROS</span>
              <span className="font-bold text-muted">Them +{o.their_gain_ros.toFixed(0)}</span>
              <span className="ml-auto text-xs font-bold text-muted">{Math.round(o.fairness * 100)}% balanced</span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-muted">{o.why}</p>

            <div className="mt-3 flex items-center justify-between">
              <Link
                href={`/trade?their=${o.their_team_id}&give=${o.give.join(",")}&get=${o.get.join(",")}`}
                className="btn inline-flex min-h-0 items-center rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white"
              >
                Grade this offer →
              </Link>
              <Why
                lines={[
                  p.headline,
                  `Your lineup gains ${o.my_gain_ros.toFixed(0)} rest-of-season points; theirs gains ${o.their_gain_ros.toFixed(0)}.`,
                  `Asset value is ${Math.round(o.fairness * 100)}% balanced, so it should not read as an insult.`,
                  o.reason_codes.includes("matches_their_history") ? "It also matches what this manager has traded for before." : "Scored on both lineups, not just yours.",
                ]}
                label="Why them?"
              />
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function TradeFinderView({ found }: { found: TradeFinderResponse }) {
  return (
    <div className="grid min-w-0 gap-3">
      <div className="card p-4">
        <Eyebrow>Trade finder · week {found.week}</Eyebrow>
        <p className="display mt-1 text-lg font-extrabold leading-snug">{found.summary}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <PositionChips label="You have spare" map={found.my_positions.surplus} tone="start" />
          <PositionChips label="You need" map={found.my_positions.need} tone="sit" />
        </div>
      </div>
      <ol className="grid gap-3">
        {found.partners.map((p, i) => (
          <PartnerCard key={p.team_id} p={p} index={i} />
        ))}
      </ol>
    </div>
  );
}
