"use client";
/** Name over position/team, with a headshot. The name column always gets the slack. */

import type { Player } from "@/lib/types";
import { Avatar } from "./Avatar";
import type { PlayerSeed } from "./player/PlayerSheet";
import { usePlayerSheet } from "./player/PlayerSheetProvider";
import { InjuryTag } from "./ui";

/**
 * A player's name, and the way into his page.
 *
 * Every name in the app goes through here. That is the whole of the feature: a reader
 * who wants to know who someone is should not have to work out that Scouting has a
 * search box, and a name that is not a door is a dead end on every screen it appears on.
 *
 * A `<button>`, not a `<Link>`: the sheet rises over the page you are on and the tab you
 * came from stays lit, so nothing navigates. The name itself is the label, so a screen
 * reader hears the player rather than "button".
 *
 * It is the one control in the app that does **not** take the house 44px minimum height.
 * A name is inline -- mid-sentence in a card's headline, inside a truncating roster row --
 * and a 44px inline target either blows the row's height out or is clipped by the
 * `overflow-hidden` that truncates it. It takes a little padding instead, cancelled by an
 * equal negative margin so the hit area grows without the line moving, and the target is
 * as wide as the name is long.
 */
export function PlayerName({
  p,
  className = "",
}: {
  /** The whole player where the caller has one: the sheet's header paints from it. */
  p: PlayerSeed;
  className?: string;
}) {
  const { open } = usePlayerSheet();
  return (
    <button
      type="button"
      onClick={(e) => {
        // The row behind a name is often a link or a disclosure of its own. Opening his
        // page should not also open the card he is sitting on.
        e.stopPropagation();
        e.preventDefault();
        open(p);
      }}
      className={`min-h-0 -my-1 py-1 text-left ${className}`}
    >
      {p.name}
    </button>
  );
}

export function PlayerLine({
  p,
  big = false,
  avatar = "sm",
  ring,
}: {
  p: Player;
  big?: boolean;
  avatar?: "none" | "sm" | "md" | "lg";
  ring?: "start" | "sit" | "flip" | "lean";
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {avatar !== "none" && <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size={avatar} ring={ring} />}
      <span className="min-w-0">
        <span className={`block truncate font-bold leading-tight ${big ? "text-[15px]" : "text-sm"}`}>
          <PlayerName p={p} />
          <InjuryTag status={p.injury_status} />
        </span>
        <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
          {p.position} · {p.nfl_team ?? "FA"}
          {p.opponent ? ` vs ${p.opponent}` : ""}
        </span>
      </span>
    </span>
  );
}

/**
 * The same door, on something that is not a name.
 *
 * One card on the call sheet carries a player without ever printing his name on its own:
 * the headline is a sentence the engine composed ("Start Chase over Pittman") and the only
 * element that is *him* is the headshot. This makes that headshot the target, labelled
 * with his name, so the call sheet is not the one tab where players cannot be opened.
 *
 * Children are whatever the caller was already drawing, so it changes nothing on screen.
 */
export function PlayerTarget({
  p,
  children,
  className = "",
}: {
  p: PlayerSeed;
  children: React.ReactNode;
  className?: string;
}) {
  const { open } = usePlayerSheet();
  return (
    <button
      type="button"
      aria-label={p.name}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        open(p);
      }}
      className={`min-h-0 ${className}`}
    >
      {children}
    </button>
  );
}
