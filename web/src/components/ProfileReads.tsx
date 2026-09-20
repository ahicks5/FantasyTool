"use client";
/**
 * The read: what the counts say, in words, and the centrepiece of the scout report.
 *
 * Every line here is arithmetic the API already did on two recorded splits — snaps up,
 * targets down, red-zone work appearing. It says what changed, never what happens next,
 * which is the line `docs/ACCURACY_PROGRAM.md` draws.
 *
 * Colour is deliberately thin. `tone` tilts one icon and one arrow: up takes the start
 * green, down takes plain ink and a rotated arrow, flat takes the muted dash. Down does
 * **not** take `--color-sit` — status red means "bench this player", and spending it on a
 * falling target share turns a recorded fact into a verdict nobody made. The arrow and the
 * word beside it carry the direction, so the block reads with the colour stripped out.
 */
import type { ScoutRead } from "@/lib/types";
import { PROFILE_COPY as COPY } from "@/lib/profile";
import { IconArrowUp, IconClock, IconFilm, IconReport, IconSheet, IconTeam, IconWire } from "./icons";
import { H2 } from "./ui";

type IconFn = (p: { size?: number; strokeWidth?: number; className?: string }) => React.ReactElement;

/**
 * One icon per `key` on the contract. An unknown key still draws: the API may grow a
 * sixth read before the web ships again, and a missing icon must not blank the row.
 */
const READ_ICON: Record<string, IconFn> = {
  role: IconTeam,
  volume: IconSheet,
  chances: IconWire,
  shape: IconFilm,
  efficiency: IconClock,
};

const TONE_INK: Record<ScoutRead["tone"], string> = {
  up: "text-start",
  down: "text-ink",
  flat: "text-muted",
};

/** The chip behind the icon. Fill, not a brighter colour: dark-mode amber has nowhere to go. */
const TONE_CHIP: Record<ScoutRead["tone"], string> = {
  up: "bg-start-soft text-start",
  down: "bg-soft text-ink",
  flat: "bg-soft text-muted",
};

const TONE_WORD: Record<ScoutRead["tone"], string> = {
  up: COPY.toneUp,
  down: COPY.toneDown,
  flat: COPY.toneFlat,
};

function ToneMark({ tone }: { tone: ScoutRead["tone"] }) {
  return (
    <span className={`flex w-[14px] shrink-0 justify-center ${TONE_INK[tone]}`}>
      <span className="sr-only">{TONE_WORD[tone]}</span>
      {tone === "flat" ? (
        <span aria-hidden className="mt-[9px] h-[2px] w-[11px] rounded-full bg-current" />
      ) : (
        <IconArrowUp size={14} strokeWidth={2.8} className={tone === "down" ? "rotate-180" : ""} />
      )}
    </span>
  );
}

export function ProfileReads({ reads }: { reads: ScoutRead[] }) {
  return (
    <section>
      <H2>{COPY.readsHead}</H2>
      {reads.length === 0 ? (
        // Week 2 of a season, or a player who has not played: a real answer, said plainly
        // rather than hidden, so the page never looks like it failed to load a section.
        <div className="card mt-2 p-5">
          <p className="text-[14px] leading-relaxed text-muted">{COPY.readsEmpty}</p>
        </div>
      ) : (
        <ul className="card mt-2 divide-y divide-line">
          {reads.map((r, i) => {
            const Icon = READ_ICON[r.key] ?? IconReport;
            return (
              <li key={`${r.key}-${i}`} className="flex min-w-0 items-start gap-3 p-4">
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE_CHIP[r.tone]}`}
                >
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className="display min-w-0 flex-1 text-[15px] leading-tight break-words">{r.head}</span>
                    <ToneMark tone={r.tone} />
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{r.line}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
