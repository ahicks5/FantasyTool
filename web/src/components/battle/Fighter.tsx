"use client";
/**
 * A fighter: the big face in his corner's ring, and the name card under it.
 *
 * Bigger than `Avatar`'s largest size on purpose -- the arena is the one place in the app a
 * face is the subject rather than a label beside a row. Initials sit under the photo, so a
 * slow or missing headshot is never an empty ring (the same rule `Avatar` keeps).
 */
import { useState } from "react";
import type { BattleBrief, BattleSide } from "@/lib/types";
import { BATTLE } from "@/lib/vocab";
import { InjuryTag } from "../ui";

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function FighterFace({ p, side, className = "" }: { p: Pick<BattleBrief, "name" | "photo">; side: BattleSide; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`fighter-face fighter-face-${side} ${className}`}>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[22px] font-black text-white/50">
        {initials(p.name)}
      </span>
      {p.photo && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photo} alt="" loading="eager" decoding="async" onError={() => setBroken(true)} />
      )}
    </span>
  );
}

/** Where he stands, in the corner's words: "Holds WR2", "Your bench", "Trade · HusH". */
export function whereLine(p: BattleBrief, spot?: string): string {
  const w = p.where;
  if (w.kind === "starter") return spot ? BATTLE.holds(spot) : BATTLE.where.starter(w.label);
  if (w.kind === "bench") return BATTLE.where.bench;
  if (w.kind === "wire") return BATTLE.where.wire;
  return BATTLE.where.trade(w.team_name ?? w.label);
}

/** One corner of the arena: the face, the name, the team and where he stands. */
export function Corner({ p, side, spot }: { p: BattleBrief; side: BattleSide; spot?: string }) {
  return (
    <div className={`relative flex min-w-0 flex-col items-center gap-2 text-center ${side === "a" ? "rise" : "rise rise-2"}`}>
      <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${side === "a" ? "text-[#9dbcff]" : "text-[#ff9aa0]"}`}>
        {BATTLE.corners[side]}
      </span>
      <FighterFace p={p} side={side} className="h-[88px] w-[88px] min-[380px]:h-[104px] min-[380px]:w-[104px]" />
      <div className="min-w-0">
        <div className="display line-clamp-2 text-[17px] leading-[1.1] break-words">{p.name}</div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] font-bold uppercase tracking-wide text-white/60">
          <span>{[p.position, p.nfl_team ?? "FA"].join(" · ")}</span>
          <InjuryTag status={p.injury_status} />
        </div>
        <div className="mt-1 text-[11.5px] font-semibold text-white/75">{whereLine(p, side === "a" && p.where.kind === "starter" ? spot : undefined)}</div>
      </div>
    </div>
  );
}
