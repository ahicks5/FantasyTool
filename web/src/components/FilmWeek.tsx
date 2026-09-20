"use client";
/** One week of the film: the final, then every call and what happened, stated flat. */
import { useState } from "react";
import { IconChevron } from "./icons";
import { Eyebrow } from "./ui";
import { finalLine, points, RECAP_COPY as COPY, resultWord, type StarterLine, type WeekResult, type WeekView } from "@/lib/recap";

/**
 * The result, as a colour and always as a word.
 *
 * A win takes the start green. A loss deliberately takes none: `--color-sit` is status red
 * and means "bench this player", and painting a finished scoreline in it turns a fact into
 * a telling-off. The word does the work in both directions.
 */
const RESULT_INK: Record<WeekResult, string> = {
  won: "text-start",
  lost: "text-ink",
  tied: "text-ink",
  none: "text-muted",
};

export function FilmWeek({ week, defaultOpen = false }: { week: WeekView; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `film-week-${week.week}`;
  // A week with nothing recorded under it has nothing to reveal, so it is not a control.
  // A disabled button would still take a tab stop and promise something that is not there.
  const expandable = week.starters.length > 0 || week.bench.length > 0 || week.bestPossible !== null;

  const head = (
    <>
      <span className="slug w-[30px] shrink-0 pt-[2px] text-[13px] text-muted">{week.week}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`display shrink-0 text-[15px] ${RESULT_INK[week.result]}`}>{resultWord(week.result)}</span>
          <span className="tnum truncate text-[15px] font-bold">{finalLine(week)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted">
          {week.opponent ? COPY.vs(week.opponent) : COPY.noGameLine}
        </span>
      </span>
      <span aria-hidden className="flex w-[14px] shrink-0 self-center justify-center">
        {expandable && (
          <IconChevron size={14} strokeWidth={2.8} className={`text-muted transition-transform ${open ? "rotate-90" : ""}`} />
        )}
      </span>
    </>
  );

  return (
    <div className="card overflow-hidden">
      {expandable ? (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[44px] w-full min-w-0 items-start gap-3 px-4 py-3 text-left"
        >
          {head}
        </button>
      ) : (
        <div className="flex min-h-[44px] min-w-0 items-start gap-3 px-4 py-3">{head}</div>
      )}

      {expandable && open && (
        <div id={panelId} className="grid grid-cols-1 gap-4 border-t border-line px-4 pb-4 pt-3.5">
          <Starters week={week} />
          <BestPossible week={week} />
          <Bench week={week} />
        </div>
      )}
    </div>
  );
}

/** Every starter, what we had him at when we have a record, and what he scored. */
function Starters({ week }: { week: WeekView }) {
  if (week.starters.length === 0) return null;
  return (
    <section>
      <Eyebrow>{COPY.startersHead}</Eyebrow>
      {!week.hasRecord && <p className="mt-1 text-[12px] leading-snug text-muted">{COPY.noRecordWeek}</p>}
      <table className="mt-1.5 w-full table-fixed text-[13px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted">
            <th scope="col" className="pb-1 text-left font-bold">
              <span className="sr-only">{COPY.startersHead}</span>
            </th>
            {/* The column is dropped, not blanked, when there is nothing behind it. */}
            {week.hasRecord && (
              <th scope="col" className="w-[54px] pb-1 text-right font-bold">{COPY.colHad}</th>
            )}
            <th scope="col" className="w-[54px] pb-1 text-right font-bold">{COPY.colWent}</th>
          </tr>
        </thead>
        <tbody>
          {week.starters.map((s, i) => (
            <StarterRow key={`${s.slot}-${i}`} starter={s} showHad={week.hasRecord} />
          ))}
        </tbody>
      </table>
      {week.partialRecord && <p className="mt-1 text-[11px] text-muted">{COPY.noRecordFoot}</p>}
    </section>
  );
}

function StarterRow({ starter, showHad }: { starter: StarterLine; showHad: boolean }) {
  return (
    <tr className="border-t border-line">
      <td className="overflow-hidden py-1.5 pr-2">
        <div className="truncate font-bold leading-tight">{starter.name}</div>
        <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
          {starter.slot}
          {starter.position && starter.position !== starter.slot ? ` · ${starter.position}` : ""}
        </div>
      </td>
      {showHad && (
        <td className="tnum py-1.5 text-right align-top text-muted">
          {starter.projected === null ? (
            <>
              <span aria-hidden>{"—"}</span>
              <span className="sr-only">{COPY.noRecordCell}</span>
            </>
          ) : (
            points(starter.projected)
          )}
        </td>
      )}
      <td className="tnum py-1.5 text-right align-top font-bold">{points(starter.actual)}</td>
    </tr>
  );
}

/** What the roster could have scored, against what it did. Two numbers, no verdict. */
function BestPossible({ week }: { week: WeekView }) {
  return (
    <section>
      <Eyebrow>{COPY.bestHead}</Eyebrow>
      {week.bestPossible === null ? (
        <p className="mt-1 text-[12px] text-muted">{COPY.bestUnknown}</p>
      ) : (
        <>
          <div className="display tnum mt-0.5 text-[24px] leading-none">{points(week.bestPossible)}</div>
          <p className="mt-1 text-[12px] text-muted">
            {week.onTheBench && week.onTheBench > 0
              ? COPY.bestSub(points(week.myPoints), points(week.onTheBench))
              : COPY.bestPerfect}
          </p>
        </>
      )}
    </section>
  );
}

/** The bench, worst miss first. A name and a number. */
function Bench({ week }: { week: WeekView }) {
  return (
    <section>
      <Eyebrow>{COPY.benchHead}</Eyebrow>
      {week.bench.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted">{COPY.benchEmpty}</p>
      ) : (
        <ul className="mt-1 grid grid-cols-1 gap-1.5">
          {week.bench.map((b, i) => (
            <li key={`${b.player.id}-${i}`} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">
                <span className="font-bold">{b.player.name}</span>
                {b.player.position && (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{b.player.position}</span>
                )}
              </span>
              <span className="tnum shrink-0 font-bold">{points(b.points)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
