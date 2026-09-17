import type { Player } from "@/lib/types";
import { Avatar } from "./Avatar";
import { InjuryTag } from "./ui";

/** Name + position/team line, with headshot. */
export function PlayerLine({ p, big = false, avatar = "sm", ring }: { p: Player; big?: boolean; avatar?: "none" | "sm" | "md" | "lg"; ring?: "start" | "sit" | "flip" | "lean" }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {avatar !== "none" && <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size={avatar} ring={ring} />}
      <span className="min-w-0">
        <span className={`block truncate font-bold leading-tight ${big ? "text-base" : "text-sm"}`}>
          {p.name}
          <InjuryTag status={p.injury_status} />
        </span>
        <span className="block text-xs text-muted">
          {p.position} · {p.nfl_team ?? "FA"}
          {p.opponent ? ` vs ${p.opponent}` : ""}
        </span>
      </span>
    </span>
  );
}
