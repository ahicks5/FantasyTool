"use client";
/** The one line that interrupts the call sheet: a starter who will not play. */
import Link from "next/link";
import type { Alarm as AlarmState } from "@/lib/gameday.ts";
import { ALARM, SECTIONS } from "@/lib/vocab";
import { IconAlarm, IconArrowUp } from "./icons";

/**
 * A banner above everything, and only when there is something to say.
 *
 * This is the app's loudest surface, so what earns it is narrow on purpose:
 * `lib/gameday.ts` decides, and it returns null most weeks. An alert that fires every
 * Sunday is furniture, and furniture gets ignored on the week it is real.
 *
 * It renders nothing at all rather than a placeholder while the lineup loads. The call
 * sheet paints from its own feed and must not wait on this one; a banner that appears a
 * beat late is a banner, while a reserved empty box on a quiet week is a scar on every
 * screen for the sake of the rare one.
 *
 * The whole thing is one link. There is exactly one thing to do about a hole in your
 * lineup and it is not on this page, so the banner does not offer a choice — it is a
 * door, at full width, impossible to miss with a thumb.
 */
export function Alarm({ alarm, animate = true }: { alarm: AlarmState | null; animate?: boolean }) {
  if (!alarm) return null;
  const critical = alarm.level === "critical";
  const n = alarm.players.length;

  return (
    <Link
      href={SECTIONS.team.href}
      // Status red for certain, warning amber for doubt -- the same pairing the depth
      // chart uses for the same players, so the front page and the detail do not read as
      // two different opinions. `--color-signal` stays out of it: BRAND.md keeps the lamp
      // on chrome, and this is a claim about named players.
      className={`card flex min-h-[56px] min-w-0 items-center gap-3 px-4 py-3 ${
        critical ? "border-sit bg-sit-soft" : "border-flip bg-flip-soft"
      } ${animate ? "rise" : ""}`}
      aria-label={`${critical ? ALARM.critical(n) : ALARM.warning(n)}. ${ALARM.cta}.`}
    >
      <IconAlarm
        size={18}
        strokeWidth={2.6}
        aria-hidden
        className={`shrink-0 ${critical ? "text-sit" : "text-flip"}`}
      />
      <span className="min-w-0 flex-1">
        {/* Counted, not named: see the note in vocab. The headline never truncates. */}
        <span className={`display block truncate text-[16px] leading-tight ${critical ? "text-sit" : "text-flip"}`}>
          {critical ? ALARM.critical(n) : ALARM.warning(n)}
        </span>
        <span className="mt-0.5 block truncate text-[12px] font-semibold leading-tight text-muted">
          {ALARM.cta}
        </span>
      </span>
      <IconArrowUp size={17} strokeWidth={2.4} aria-hidden className="shrink-0 rotate-90 text-muted" />
    </Link>
  );
}
