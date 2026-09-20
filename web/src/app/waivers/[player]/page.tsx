/**
 * One player's scout report, inside Scouting.
 *
 * A server component that does nothing but hand the id down, because `generateStaticParams`
 * cannot live in a `"use client"` file and the report itself needs the session, the cache
 * and a fetch. `params` is a Promise in the App Router and is awaited here once.
 *
 * The route sits under `/waivers/` on purpose: the profile is a room off Scouting, not a
 * tab of its own, so the Scouting tab stays lit while you read it (the same move
 * `/home/matchup` makes off the call sheet).
 */
import type { Metadata } from "next";
import { Profile } from "@/components/Profile";

/** The static demo (`npm run demo`) has no API, and an export must name its pages. */
const DEMO = process.env.EDGE_DEMO_EXPORT === "1";

export const metadata: Metadata = {
  // The template is "%s", so every title is absolute. The name is not known at build time
  // and the report is league-scoped anyway, so this is the room, not the player.
  title: "Scout report · Penthouse",
  description: "Every number a player has put up, scored by your league's own settings.",
};

/**
 * Real ids come from the league's own player dump, so none of them exist at build time and
 * pages render on demand (`dynamicParams` defaults to true). `output: "export"` has no
 * server to do that with, so the demo pre-renders exactly the pool its own search box can
 * return — `demoPool()` — and no link in the demo dead-ends.
 *
 * It reads that pool rather than listing ids here so the two can never drift: a page the
 * search offers but the export did not build is a 404 in a showroom. Building the whole
 * mock league instead was tried and reverted — 172 players is 968 files and 14 MB, past
 * the file ceiling of the host `demo:pack` exists to publish to.
 */
export async function generateStaticParams(): Promise<{ player: string }[]> {
  if (!DEMO) return [];
  // Imported lazily so the mock rosters stay out of the real server bundle.
  const { demoPool } = await import("@/lib/mocks");
  return demoPool().map((p) => ({ player: p.id }));
}

export default async function PlayerPage({ params }: { params: Promise<{ player: string }> }) {
  const { player } = await params;
  return <Profile playerId={player} />;
}
