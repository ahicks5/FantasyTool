import type { Player } from "@/lib/types";
import { InjuryTag } from "./ui";

export function PlayerLine({ p, big = false }: { p: Player; big?: boolean }) {
  return (
    <span className="min-w-0">
      <span className={`block truncate font-bold ${big ? "text-base" : "text-sm"}`}>
        {p.name}
        <InjuryTag status={p.injury_status} />
      </span>
      <span className="block text-xs text-muted">
        {p.position} · {p.nfl_team}
        {p.opponent ? ` vs ${p.opponent}` : ""}
      </span>
    </span>
  );
}
