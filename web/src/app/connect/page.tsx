"use client";
/** Connect a league: pick a platform, then one box. Sleeper takes a username or an id; ESPN takes an id plus, if the league is private, the key from /connect/espn; Yahoo takes a sign-in, then a pick from your own leagues. */
import { LeagueLinker } from "@/components/LeagueLinker";

/** The logic lives in `LeagueLinker`, which the sign-up walk mounts too, so the two cannot drift. */
export default function ConnectPage() {
  return <LeagueLinker variant="page" />;
}
