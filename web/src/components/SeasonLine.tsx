"use client";
/** The season's scoring as one line: a point per week, inline SVG, no library. */
import { Eyebrow } from "./ui";
import { points, RECAP_COPY as COPY, type ChartModel } from "@/lib/recap";

/**
 * Every colour here is a token from `globals.css`, so the drawing re-themes with the page
 * rather than being redrawn for light mode. The viewBox scales uniformly, which keeps the
 * stroke weight honest at 320px.
 *
 * A win is a filled dot and a loss a hollow one, so the result never rides on colour
 * alone; the caption says which is which and the week's own row carries the number.
 */
export function SeasonLine({ chart }: { chart: ChartModel }) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{COPY.chartHead}</Eyebrow>
        <span className="tnum shrink-0 text-[11px] font-bold text-muted">
          {COPY.avgLabel} {points(chart.average)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="mt-2 h-auto w-full"
        role="img"
        aria-label={chart.alt}
      >
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
        {chart.path && (
          <path
            d={chart.path}
            fill="none"
            stroke="var(--color-ink-2)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {chart.dots.map((d) => (
          <circle
            key={d.week}
            cx={d.x}
            cy={d.y}
            r={3.5}
            fill={d.result === "won" ? "var(--color-start)" : "var(--color-paper)"}
            stroke={d.result === "won" ? "var(--color-start)" : "var(--color-ink-2)"}
            strokeWidth={1.5}
          />
        ))}
        {chart.dots
          .filter((d) => d.label)
          .map((d) => (
            <text
              key={`t-${d.week}`}
              x={d.x}
              y={chart.height - 5}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill="var(--color-muted)"
            >
              {d.label}
            </text>
          ))}
      </svg>

      <p className="mt-1 text-[11px] text-muted">{COPY.chartNote}</p>
    </section>
  );
}
