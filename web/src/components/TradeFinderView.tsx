"use client";
import Link from "next/link";
import type { Player, TradeFinderResponse, TradePartner } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconChevron, IconTrade } from "./icons";
import { Eyebrow, Why } from "./ui";

function Chips({ label, map, tone }: { label: string; map: Record<string, number>; tone: "start" | "sit" }) {
  const entries = Object.entries(map).slice(0, 3);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="eyebrow">{label}</span>
      {entries.map(([pos]) => (
        <span
          key={pos}
          className={`rounded-md px-1.5 py-[2px] text-[11px] font-black ${tone === "start" ? "bg-start-soft text-start" : "bg-sit-soft text-sit"}`}
        >
          {pos}
        </span>
      ))}
    </div>
  );
}

function PlayerRow({ label, players, names, tone }: { label: string; players: Player[]; names: string[]; tone: "sit" | "start" }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="w-[52px] shrink-0 text-[10px] font-black uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {players.map((g) => (
          <Avatar key={g.id} name={g.name} photo={g.photo} teamLogo={g.team_logo} size="md" />
        ))}
        <span className="min-w-0">
          <span className={`block text-[14px] font-black leading-tight ${tone === "sit" ? "text-sit" : "text-start"}`}>
            {names.join(" + ")}
          </span>
          {players[0]?.position && (
            <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
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
    // Coming off the printer, not rising: this list is the booth's board.
    <li className={`card min-w-0 overflow-hidden p-0 print print-${Math.min(index + 1, 5)}`}>
      <div className="flex min-w-0">
        {/* The margin, same as the call sheet: the line number over a rule. */}
        <div className="flex w-[40px] shrink-0 flex-col items-center border-r border-line bg-soft pt-5">
          <span className="slug text-[14px] leading-none text-muted">{String(index + 1).padStart(2, "0")}</span>
          <span aria-hidden className={`mt-2.5 w-[3px] flex-1 ${index === 0 ? "bg-ink" : "bg-line-2"}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="border-b border-line p-5">
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>{index === 0 ? "Best fit" : "Worth a call"}</Eyebrow>
              <span className="tnum text-[11px] font-bold text-muted">fit {p.complement.toFixed(2)}</span>
            </div>
            <h3 className="display mt-1 text-[21px] leading-tight">{p.team_name}</h3>
            {/* The summary above already carries the best partner's headline; repeating it here
                reads like a stutter. */}
            {index > 0 && <p className="mt-1 text-[13px] leading-snug text-muted">{p.headline}</p>}
            <div className="mt-3 flex flex-col gap-2">
              <Chips label="They have" map={p.positions.surplus} tone="start" />
              <Chips label="They need" map={p.positions.need} tone="sit" />
            </div>
          </div>

          <ul className="divide-y divide-line">
            {p.offers.map((o) => (
              <li key={o.give.join() + o.get.join()} className="p-5">
                <div className="grid gap-2.5">
                  <PlayerRow label="You send" players={o.give_players} names={o.give_names} tone="sit" />
                  <div className="flex items-center gap-3 pl-[52px] text-muted" aria-hidden>
                    <IconTrade size={16} />
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <PlayerRow label="You get" players={o.get_players} names={o.get_names} tone="start" />
                </div>

                <div className="tnum mt-4 flex items-center gap-3 text-[13px]">
                  <span className="font-black text-start">You +{o.my_gain_ros.toFixed(0)} ROS</span>
                  <span className="font-bold text-muted">Them +{o.their_gain_ros.toFixed(0)}</span>
                  <span className="ml-auto text-[11px] font-bold text-muted">{Math.round(o.fairness * 100)}% balanced</span>
                </div>

                <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{o.why}</p>

                <div className="mt-3.5 flex items-center justify-between gap-3">
                  <Link
                    href={`/trade?their=${o.their_team_id}&give=${o.give.join(",")}&get=${o.get.join(",")}`}
                    className="btn inline-flex min-h-0 items-center gap-1 rounded-xl bg-ink px-3.5 py-2 text-[13px] font-bold text-paper"
                  >
                    Grade this offer
                    <IconChevron size={13} strokeWidth={2.8} />
                  </Link>
                  <Why
                    lines={[
                      p.headline,
                      `Your lineup gains ${o.my_gain_ros.toFixed(0)} rest-of-season points; theirs gains ${o.their_gain_ros.toFixed(0)}.`,
                      `Asset value is ${Math.round(o.fairness * 100)}% balanced, so it should not read as an insult.`,
                      o.reason_codes.includes("matches_their_history")
                        ? "It also matches what this manager has traded for before."
                        : "Scored on both lineups, not just yours.",
                    ]}
                    label="Why them?"
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

export function TradeFinderView({ found }: { found: TradeFinderResponse }) {
  return (
    <div className="grid min-w-0 gap-3.5">
      <section className="hero callsheet p-5">
        <Eyebrow>Trade lab · week {found.week}</Eyebrow>
        <p className="display mt-1.5 text-[21px] leading-snug text-white">{found.summary}</p>
        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow">You can spare</span>
            {Object.keys(found.my_positions.surplus).slice(0, 3).map((pos) => (
              <span key={pos} className="rounded-md bg-white/15 px-1.5 py-[2px] text-[11px] font-black text-white">
                {pos}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow">You&rsquo;re short at</span>
            {Object.keys(found.my_positions.need).slice(0, 3).map((pos) => (
              <span key={pos} className="rounded-md bg-white/15 px-1.5 py-[2px] text-[11px] font-black text-white">
                {pos}
              </span>
            ))}
          </div>
        </div>
      </section>
      {found.partners.length > 0 && (
        <p className="text-[13px] leading-relaxed text-muted">
          Lines the booth spotted, best fit first. Each one is scored on both rosters, not just yours.
        </p>
      )}
      <ol className="grid gap-3.5">
        {found.partners.map((p, i) => (
          <PartnerCard key={p.team_id} p={p} index={i} />
        ))}
      </ol>
    </div>
  );
}
