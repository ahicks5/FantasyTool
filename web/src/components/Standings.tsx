"use client";
/** The table: every team in the league, by record, and what the rosters are worth from here. */
import { Eyebrow, H2 } from "./ui";
import { STANDINGS_COPY as COPY, standingsView, type StandingsRowView } from "@/lib/recap";
import type { Standings as StandingsPayload } from "@/lib/types";

/**
 * The free half of `/report`, and the answer to "how am I doing".
 *
 * Three things shape the layout, and all three are the same constraint: twelve rows on a
 * 320px phone.
 *
 * **Seven columns do not fit, so there are four.** Rank, team, record and points for are
 * the columns; points against, the scoring rank, the roster rank and the streak run along a
 * second line under each team. A table you have to drag sideways is not a table, and the
 * second line also lets the two derived ranks carry a word ("Scoring 8th", not a column
 * headed "SR" that nobody can read).
 *
 * **It is a list, not a `<table>`.** A real table with a two-line cell either pins the
 * second line inside one column's width or breaks the row semantics to escape it. A grid
 * gives the second line the full width from the name across, which is what it needs.
 *
 * **The reader's own row is marked with a word.** `COPY.you` beside the name, plus a rail
 * and a lifted surface. The rail alone would be colour carrying meaning on its own, which
 * `docs/BRAND.md` does not allow, and the word survives both themes and a screenshot.
 *
 * Nothing here is a call, so nothing here gets a stamp — the same rule the scorecard
 * follows. Free for every reader: this component never asks about an entitlement.
 */
export function Standings({ standings, teamId }: { standings: StandingsPayload; teamId: string }) {
  const view = standingsView(standings, teamId);
  return (
    <section>
      <H2>{COPY.head}</H2>

      {/* The read sits above the table, because it is the one line most readers came for. */}
      {view.read && <p className="mt-1.5 text-[15px] font-bold leading-snug">{view.read.line}</p>}

      <div className="card mt-2.5 px-4 py-3">
        {view.rows.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted">{COPY.empty}</p>
        ) : (
          <>
            <div className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto_auto] items-baseline gap-x-2 border-b border-line pb-1.5">
              <Eyebrow>{COPY.colRank}</Eyebrow>
              <Eyebrow>{COPY.colTeam}</Eyebrow>
              <Eyebrow className="text-right">{COPY.colRecord}</Eyebrow>
              <Eyebrow className="w-[46px] text-right">{COPY.colPoints}</Eyebrow>
            </div>
            <ul>
              {view.rows.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-muted">{COPY.legend}</p>
    </section>
  );
}

function Row({ row }: { row: StandingsRowView }) {
  return (
    <li
      aria-current={row.isMe ? "true" : undefined}
      className={`grid grid-cols-[1.4rem_minmax(0,1fr)_auto_auto] items-baseline gap-x-2 border-b border-line py-2 last:border-0 ${
        row.isMe ? "-mx-2 rounded-lg border-l-2 border-l-metal bg-soft px-2" : ""
      }`}
    >
      <span className="tnum text-[12px] font-bold text-muted">{row.rank}</span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[14px] font-bold">{row.name}</span>
        {row.isMe && (
          <span className="shrink-0 rounded border border-line-2 px-1 text-[10px] font-black uppercase tracking-wide text-muted">
            {COPY.you}
          </span>
        )}
      </span>
      <span className="tnum text-right text-[13px] font-bold">{row.record}</span>
      <span className="tnum w-[46px] text-right text-[13px]">{row.pointsFor}</span>
      {/* Wraps rather than truncates: at 320px the longest of these is a few pixels from
          the edge, and a second line of it is still readable where a clipped one is not. */}
      <span className="col-span-3 col-start-2 mt-0.5 text-[11px] leading-snug text-muted">
        {row.notes.join(" · ")}
      </span>
    </li>
  );
}
