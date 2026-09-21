"use client";
/**
 * Vibes: the player in words, and **not one digit**.
 *
 * A placeholder until phase B writes the hook, the three whys and the take. What it can
 * show honestly today is the reads' **heads** — "Running the route tree", "Red zone work
 * is arriving" — which are already sentences with a direction on them. Their `line`s are
 * not here, and cannot be: they carry the counts ("on 91% of the snaps") and this side of
 * the page never does.
 *
 * The heads are also exactly the facts sheet the written take gets built from in phase D,
 * so the placeholder is the shape of the real thing rather than a stand-in for it.
 */
import type { ScoutRead } from "@/lib/types";
import { PLAYER } from "@/lib/vocab";
import { IconClock, IconFilm, IconReport, IconSheet, IconTeam, IconWire } from "../icons";
import { H2 } from "../ui";

type IconFn = (p: { size?: number; strokeWidth?: number; className?: string }) => React.ReactElement;

/** Same mapping as the scout report's, so one read wears one icon everywhere it appears. */
const READ_ICON: Record<string, IconFn> = {
  role: IconTeam,
  volume: IconSheet,
  chances: IconWire,
  shape: IconFilm,
  efficiency: IconClock,
};

export function VibesView({ reads }: { reads: ScoutRead[] }) {
  if (reads.length === 0) {
    return (
      <div className="card p-5">
        <p className="text-[15px] leading-relaxed text-muted">{PLAYER.vibes.empty}</p>
      </div>
    );
  }
  return (
    <section>
      <H2>{PLAYER.vibes.head}</H2>
      <ul className="mt-2 grid grid-cols-1 gap-3">
        {reads.map((r, i) => {
          const Icon = READ_ICON[r.key] ?? IconReport;
          return (
            <li key={`${r.key}-${i}`} className="card flex min-w-0 items-start gap-3 p-4">
              <span
                aria-hidden
                className="mode-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft"
              >
                <Icon size={18} strokeWidth={2} />
              </span>
              {/* Display type, not body: this is the line that is supposed to sell him. */}
              <span className="display min-w-0 flex-1 text-[17px] leading-tight break-words">{r.head}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
