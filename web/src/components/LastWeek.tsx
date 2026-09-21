"use client";
/** How last week's calls landed, in one line under the standing. Free for everyone. */
import Link from "next/link";
import { points } from "@/lib/recap";
import { LAST_WEEK, SECTIONS } from "@/lib/vocab";
import type { LastWeek as LastWeekData } from "@/lib/types";
import { IconChevron } from "./icons";

/**
 * "Last week: W 127.8–101.4 · 2 of 3 calls hit", under the standing line.
 *
 * The call sheet is about the next kickoff; the standing line above says where the season
 * stands; this one says whether the staff were right the last time they told you something.
 * It is the loop that brings a reader back on a Tuesday, and it is free for everyone (D4) —
 * the per-call detail is what the film sells.
 *
 * **It is not an accuracy claim.** Per call the film states the outcome flat (this player
 * outscored that one, by this margin); here it is two integers about this reader's own
 * three calls. What is not available anywhere, in any wording, is a summed "points gained",
 * a "points left on your bench" or a percentage — `CLAUDE.md` forbids a public
 * decision-accuracy claim until `scripts/score_runs.py` has graded real weeks, and
 * `lib/recap.ts` already refuses to sum hits. The engine hands down no such figure to
 * print; nothing here may derive one.
 *
 * **Additive, and absent far more often than not.** Week 1 has no finished week, a reader
 * who connected on Wednesday has no recorded call, and an ESPN league gives us a scoreline
 * with nobody's points attached — so `last_week` is null and this renders nothing. No
 * reserved height and no placeholder: unlike the standing line this arrives with the feed
 * rather than a beat later, so there is nothing for it to shove down the page.
 *
 * **No stamp, no colour carrying meaning.** A result is a fact rather than a call the
 * reader has to make (`Scorecard.tsx` has the rule), and a loss printed in status red turns
 * a scoreline into a telling-off (`FilmWeek.tsx` has that one). Chrome on the dark hero,
 * both themes, with the letter doing the work.
 */
export function LastWeek({ week }: { week?: LastWeekData | null }) {
  // `total` is never 0 from the engine — a week with nothing to grade comes back null —
  // but an older API build is allowed to be wrong about that rather than print "0 of 0".
  if (!week || week.total < 1) return null;

  const final =
    week.result && week.opp_score !== null
      ? `${LAST_WEEK.mark[week.result]} ${points(week.score)}–${points(week.opp_score)}`
      : null;
  const calls = LAST_WEEK.calls(week.hits, week.total);
  const spokenFinal =
    week.result && week.opp_score !== null
      ? `${LAST_WEEK.said[week.result]} ${points(week.score)} to ${points(week.opp_score)}.`
      : null;

  return (
    <Link
      href={SECTIONS.report.href}
      aria-label={`${LAST_WEEK.lead} ${[spokenFinal, `${calls}.`].filter(Boolean).join(" ")} ${LAST_WEEK.go} ${SECTIONS.report.title}.`}
      className="-mx-1.5 mt-1 inline-flex max-w-full items-start gap-1.5 rounded-lg px-1.5 py-0.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
    >
      {/* It WRAPS, it does not truncate. At 320px the whole line is ~43 characters and
          truncating drops the tail -- which is the count, the only part that says whether
          we were right. Andrew chose losing 16px of hero height over losing the count.
          `inline-block` on each half keeps the scoreline and the count whole: the break
          falls between them, never inside "127.8-101.4" or "2 of 3". At 390 and up the
          two halves sit on one line exactly as before. */}
      <span aria-hidden className="tnum text-[12px] font-bold leading-tight">
        <span className="inline-block">{LAST_WEEK.lead}{final ? ` ${final}` : ""}</span>
        {final ? " · " : " "}
        <span className="inline-block">{calls}</span>
      </span>
      <IconChevron size={12} strokeWidth={2.8} className="mt-[2px] shrink-0" aria-hidden />
    </Link>
  );
}
