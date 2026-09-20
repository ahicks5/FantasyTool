"use client";
/**
 * The game log: every week he has on record this season, and the same weeks as bars.
 *
 * The chart is inline SVG built from `lib/profile.ts` geometry, the way `SeasonLine` is —
 * no chart dependency, because the stdlib and a viewBox already do the job (CLAUDE.md).
 * Every colour is a token, so the drawing re-themes with the page instead of being redrawn
 * for light mode.
 *
 * A week is a row you can open. Stacking six figures under every week turns a 320px phone
 * into a wall, so the week states the two things a reader scans for (who he faced, what he
 * scored) and keeps snaps, targets, carries, red-zone work, yards and scores one tap away.
 */
import { useState } from "react";
import { decimal, PROFILE_COPY as COPY, type BarChart, type GameRow } from "@/lib/profile";
import { IconChevron } from "./icons";
import { Eyebrow, H2 } from "./ui";

/**
 * Weekly points as bars off a zero baseline.
 *
 * His best week takes the solid ink and the rest take the secondary step, which is a
 * difference in weight rather than in hue — a status colour here would turn "his biggest
 * week" into a call we never made. A week he did not play is a hollow stub on the
 * baseline: it is not a zero-point game, and drawing it as one would be the page lying.
 */
export function PointsBars({ chart }: { chart: BarChart }) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{COPY.chartHead}</Eyebrow>
        <span className="tnum shrink-0 text-[11px] font-bold text-muted">
          {COPY.chartAvg} {decimal(chart.average)}
        </span>
      </div>

      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="mt-2 h-auto w-full" role="img" aria-label={chart.alt}>
        <line
          x1={0}
          x2={chart.width}
          y1={chart.baseline}
          y2={chart.baseline}
          stroke="var(--color-line-2)"
          strokeWidth={1}
        />
        <line
          x1={0}
          x2={chart.width}
          y1={chart.averageY}
          y2={chart.averageY}
          stroke="var(--color-muted)"
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={0.65}
        />
        {chart.bars.map((b) => (
          <rect
            key={b.week}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={2}
            fill={!b.played ? "none" : b.best ? "var(--color-ink)" : "var(--color-ink-2)"}
            stroke={b.played ? "none" : "var(--color-line-2)"}
            strokeWidth={b.played ? 0 : 1.5}
          />
        ))}
        {chart.bars.map((b) => (
          <text
            key={`t-${b.week}`}
            x={b.x + b.w / 2}
            y={chart.height - 5}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="var(--color-muted)"
          >
            {b.label}
          </text>
        ))}
      </svg>

      <p className="mt-1 text-[11px] text-muted">{COPY.chartNote}</p>
    </section>
  );
}

/** One week, closed. Opens onto whatever the platform actually recorded, and nothing else. */
function Game({ row, defaultOpen = false }: { row: GameRow; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `scout-week-${row.week}`;
  // A week with nothing behind it is not a control. A disabled button still takes a tab
  // stop and still promises something that is not there.
  const expandable = row.detail.length > 0;

  const head = (
    <>
      {/* The number in the margin is the call sheet's slug, the same device the film uses.
          It is the week, said once: printing "Week 12" under "12" costs a line of a 320px
          screen to repeat itself, so the week rides in the margin and is read out for
          anyone who cannot see that it is a week number. */}
      <span aria-hidden className="slug w-[26px] shrink-0 self-center text-[15px] text-muted">{row.week}</span>
      <span className="min-w-0 flex-1 self-center">
        <span className="sr-only">{COPY.weekLabel(row.week)}, </span>
        <span className="block truncate text-[14px] font-bold leading-tight">{row.opponent}</span>
      </span>
      {row.points === null ? (
        <span className="shrink-0 self-center text-[11px] font-bold uppercase tracking-wide text-muted">
          {COPY.didNotPlay}
        </span>
      ) : (
        <span className="display tnum shrink-0 self-center text-[17px]">{decimal(row.points)}</span>
      )}
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
          className="flex min-h-[44px] w-full min-w-0 items-start gap-2.5 px-3.5 py-3 text-left"
        >
          {head}
        </button>
      ) : (
        <div className="flex min-h-[44px] min-w-0 items-start gap-2.5 px-3.5 py-3">{head}</div>
      )}

      {expandable && open && (
        <dl id={panelId} className="grid grid-cols-3 gap-x-3 gap-y-3 border-t border-line px-3.5 pb-4 pt-3">
          {row.detail.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="eyebrow truncate">{d.label}</dt>
              <dd className="tnum mt-0.5 text-[16px] font-bold leading-none">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function ProfileGames({ games, chart }: { games: GameRow[]; chart: BarChart | null }) {
  return (
    <section>
      <H2>{COPY.gamesHead}</H2>
      {games.length === 0 ? (
        // Week 1, or a player who has not taken a snap this year. A real answer.
        <div className="card mt-2 p-5">
          <p className="text-[14px] leading-relaxed text-muted">{COPY.gamesEmpty}</p>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2">
          {chart && <PointsBars chart={chart} />}
          <ul className="grid grid-cols-1 gap-2">
            {games.map((g, i) => (
              <li key={g.week}>
                {/* The newest week is the one you came for, so it is the one already open. */}
                <Game row={g} defaultOpen={i === 0} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
