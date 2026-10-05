"use client";
/**
 * The red button: Position Battle, on every player page (Andrew, 2026-10-05: "always
 * showing ... starkly coloured, like a red ... a clash").
 *
 * The one door in the app painted the battle's own red. It is a link, not a sheet over the
 * sheet: the battle is a page of its own with a URL worth sending, and a stack of sheets
 * has no way back on a phone. Following it changes the path, which drops `?player=`, so
 * the sheet closes itself on the way out and the back button brings it back.
 */
import Link from "next/link";
import { battleHref } from "@/lib/battle";
import { BATTLE } from "@/lib/vocab";
import { IconClash } from "../icons";

export function BattleDoor({ playerId, name, size = "bar" }: { playerId: string; name: string; size?: "bar" | "wide" }) {
  const shape =
    size === "bar"
      ? "h-12 min-h-0 flex-col rounded-xl px-1 gap-0.5"
      : "min-h-12 w-full flex-row rounded-2xl px-4 gap-2";
  return (
    <Link
      href={battleHref(playerId)}
      aria-label={BATTLE.buttonAria(name || BATTLE.title)}
      data-testid="battle-door"
      className={`battle-door flex items-center justify-center text-center ${shape}`}
    >
      <span className="relative flex items-center gap-1">
        <IconClash size={size === "bar" ? 14 : 18} strokeWidth={2.2} />
        <span className="whitespace-nowrap text-[11px] font-black leading-none tracking-tight">{BATTLE.button}</span>
      </span>
      {size === "wide" ? (
        <span className="relative text-[11px] font-bold uppercase tracking-wide text-white/80">· {BATTLE.buttonSub}</span>
      ) : (
        <span className="relative text-[9px] font-black uppercase leading-none tracking-wide text-white/80">{BATTLE.buttonSub}</span>
      )}
    </Link>
  );
}
