"use client";
/**
 * The owner's numbers: six tabs over GET /api/admin/metrics (docs/SPEC-ADMIN-METRICS.md).
 *
 * Every figure is computed by the API (edge/business/metrics.py); this file only lays it
 * out. Statuses are a word and a tint, never a tint alone, and every table scrolls inside
 * its card so the page never scrolls sideways at 375px.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorBox, Eyebrow } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { adminAddSpend, adminDeleteSpend, adminMetrics } from "@/lib/api";
import {
  STATUS_CLASS,
  VERDICT_CLASS,
  cellOpacity,
  delta,
  money,
  presetRange,
  rate,
  scaleMax,
  type RangePreset,
} from "@/lib/adminMetrics";
import type { AdminMetrics, ChannelRow, CohortRow, MetricTiles } from "@/lib/types";
import { ACCOUNT } from "@/lib/vocab";

const W = ACCOUNT.admin.metrics;
export type MetricsTab = "today" | "funnel" | "channels" | "revenue" | "retention" | "loop";

const CHIP = "inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider";

function Tile({ label, value, sub, testid }: { label: string; value: string; sub?: string; testid?: string }) {
  return (
    <div className="card p-4" data-testid={testid}>
      <div className="eyebrow">{label}</div>
      <div className="display tnum mt-1 text-[26px] leading-none">{value}</div>
      {sub ? <div className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</div> : null}
    </div>
  );
}

function Today({ m }: { m: AdminMetrics }) {
  const c = m.today.current;
  const p: MetricTiles = m.today.previous;
  const target = money(m.thresholds.target_cac_cents);
  const h = m.today.last_hour;
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile label={W.tiles.revenue} value={money(c.revenue_cents)} sub={delta(c.revenue_cents, p.revenue_cents, true)} testid="tile-revenue" />
        <Tile label={W.tiles.paying} value={c.paying_now.toLocaleString("en-US")} />
        <Tile label={W.tiles.buyers} value={String(c.new_buyers)} sub={delta(c.new_buyers, p.new_buyers)} />
        <Tile label={W.tiles.signups} value={String(c.signups)} sub={delta(c.signups, p.signups)} />
        <Tile label={W.tiles.linked} value={String(c.leagues_linked)} sub={delta(c.leagues_linked, p.leagues_linked)} />
        <Tile
          label={W.tiles.cac}
          value={money(c.cac_cents)}
          sub={c.spend_cents ? `${money(c.spend_cents)} · ${W.cacHint(target)}` : W.noSpend}
        />
      </div>
      <Card className="mt-2">
        <div className="eyebrow">{W.lastHour}</div>
        <p className="tnum mt-1 text-[15px] font-bold text-ink">{W.lastHourLine(h.signups, h.checkouts, h.purchases)}</p>
      </Card>
    </>
  );
}

function Funnel({ m }: { m: AdminMetrics }) {
  const f = m.funnel;
  return (
    <>
      <ul className="mt-3 grid gap-2">
        {f.steps.map((s) => (
          <li key={s.key} className="card p-4" data-testid={`funnel-${s.key}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-bold leading-snug text-ink">
                {W.steps[s.key]}
                {s.scope === "to_date" && <span className="ml-1.5 font-normal text-muted">({W.toDate})</span>}
              </p>
              <span className={`${CHIP} ${STATUS_CLASS[s.status]}`}>{W.status[s.status]}</span>
            </div>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="display tnum text-[26px] leading-none">{rate(s.rate)}</span>
              <span className="tnum text-[13px] text-muted">
                {s.num} / {s.den}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-muted">{W.stepTarget(rate(s.healthy), rate(s.leak))}</p>
          </li>
        ))}
      </ul>
      <Card className="mt-2">
        <div className="eyebrow">{W.checkoutTitle}</div>
        <p className="tnum mt-1 text-[14px] text-ink">
          {W.checkoutLine(f.checkout.started, f.checkout.finished, f.checkout.abandoned)}
          {f.checkout.finish_rate !== null && <span className="text-muted"> · {rate(f.checkout.finish_rate)}</span>}
        </p>
      </Card>
      <Card className="mt-2">
        <div className="eyebrow">{W.paywallTitle}</div>
        {f.paywall.length === 0 ? (
          <p className="mt-1 text-[14px] text-muted">{W.paywallNone}</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {f.paywall.map((w) => (
              <li key={w.feature} className="flex justify-between text-[14px]">
                <span className="text-ink-2">{w.feature}</span>
                <span className="tnum font-bold text-ink">{w.views}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function ChannelTable({ rows }: { rows: ChannelRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const C = W.channelCols;
  return (
    <div className="card mt-3 overflow-x-auto p-0">
      <table className="w-full min-w-[34rem] text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wider text-muted">
          <tr className="border-b border-line">
            <th className="px-3 py-2 font-bold">{C.source}</th>
            <th className="px-2 py-2 text-right font-bold">{C.visitors}</th>
            <th className="px-2 py-2 text-right font-bold">{C.signups}</th>
            <th className="px-2 py-2 text-right font-bold">{C.buyers}</th>
            <th className="px-2 py-2 text-right font-bold">{C.revenue}</th>
            <th className="px-2 py-2 text-right font-bold">{C.spend}</th>
            <th className="px-3 py-2 text-right font-bold">{C.cac}</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map((r) => (
            <Fragment key={r.source}>
              <tr
                className="cursor-pointer border-b border-line last:border-0"
                onClick={() => setOpen(open === r.source ? null : r.source)}
                data-testid="channel-row"
              >
                <td className="max-w-[9rem] px-3 py-2">
                  <span className="block truncate font-bold text-ink">{r.source}</span>
                  <span className={`${CHIP} mt-1 ${VERDICT_CLASS[r.verdict]}`}>{W.verdict[r.verdict]}</span>
                </td>
                <td className="px-2 py-2 text-right">{r.visitors}</td>
                <td className="px-2 py-2 text-right">{r.signups}</td>
                <td className="px-2 py-2 text-right">{r.buyers}</td>
                <td className="px-2 py-2 text-right">{money(r.revenue_cents)}</td>
                <td className="px-2 py-2 text-right">{r.spend_cents ? money(r.spend_cents) : "—"}</td>
                <td className="px-3 py-2 text-right">{money(r.cac_cents)}</td>
              </tr>
              {open === r.source && r.campaigns.length > 0 && (
                <tr className="border-b border-line bg-soft">
                  <td colSpan={7} className="px-3 py-2">
                    <div className="eyebrow">{W.campaigns}</div>
                    <ul className="mt-1 grid gap-0.5">
                      {r.campaigns.map((c) => (
                        <li key={c.campaign} className="flex justify-between gap-3 text-[12px]">
                          <span className="truncate text-ink-2">{c.campaign}</span>
                          <span className="shrink-0 text-ink">
                            {c.signups} · {c.buyers} · {money(c.revenue_cents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendForm({ m, onChange, today }: { m: AdminMetrics; onChange: () => void; today: string }) {
  const [day, setDay] = useState(today);
  const [channel, setChannel] = useState("");
  const [dollars, setDollars] = useState("");
  const [campaign, setCampaign] = useState("");
  const [clicks, setClicks] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const field =
    "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-3 py-2.5 text-base text-ink focus:border-ink focus:bg-paper focus:outline-none";

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-2">
      <div className="eyebrow">{W.spendTitle}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{W.spendLead}</p>
      <form
        className="mt-3 grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run("add", async () => {
            await adminAddSpend({
              day,
              channel,
              dollars: Number(dollars),
              campaign,
              clicks: clicks ? Number(clicks) : null,
            });
            setDollars("");
            setClicks("");
          });
        }}
      >
        <label className="grid gap-1">
          <span className="eyebrow">{W.spendDay}</span>
          <input className={field} type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </label>
        <label className="grid gap-1">
          <span className="eyebrow">{W.spendChannel}</span>
          <input className={field} value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="reddit" autoCapitalize="none" required />
        </label>
        <label className="grid gap-1">
          <span className="eyebrow">{W.spendDollars}</span>
          <input className={field} inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} placeholder="50" required />
        </label>
        <label className="grid gap-1">
          <span className="eyebrow">{W.spendClicks}</span>
          <input className={field} inputMode="numeric" value={clicks} onChange={(e) => setClicks(e.target.value)} />
        </label>
        <label className="col-span-2 grid gap-1">
          <span className="eyebrow">{W.spendCampaign}</span>
          <input className={field} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
        </label>
        <Button type="submit" size="sm" className="col-span-2" busy={busy === "add"}>
          {W.spendAdd}
        </Button>
      </form>
      {m.channels.spend.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">{W.spendNone}</p>
      ) : (
        <ul className="mt-3 grid gap-1">
          {[...m.channels.spend].reverse().map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="tnum min-w-0 truncate text-ink-2">
                {s.day} · <strong className="text-ink">{s.channel}</strong>
                {s.campaign ? ` · ${s.campaign}` : ""}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tnum font-bold text-ink">{money(s.cents)}</span>
                <Button size="sm" variant="ghost" busy={busy === s.id} onClick={() => run(s.id, () => adminDeleteSpend(s.id))}>
                  {W.spendRemove}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <div className="mt-2">
          <ErrorBox error={error} />
        </div>
      ) : null}
    </Card>
  );
}

function Channels({ m, onChange, today }: { m: AdminMetrics; onChange: () => void; today: string }) {
  return (
    <>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {W.rules(money(m.thresholds.target_cac_cents), money(m.thresholds.kill_spend_cents))}
      </p>
      {m.channels.rows.length === 0 ? (
        <Card className="mt-3">
          <p className="text-[14px] text-muted">{W.noChannels}</p>
        </Card>
      ) : (
        <ChannelTable rows={m.channels.rows} />
      )}
      <SpendForm m={m} onChange={onChange} today={today} />
    </>
  );
}

function Revenue({ m }: { m: AdminMetrics }) {
  const r = m.revenue;
  const max = scaleMax(r.by_day.map((d) => d.total_cents));
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile label={W.gross} value={money(r.gross_cents)} />
        <Tile label={W.refunds} value={money(r.refunds_cents)} />
        <Tile label={W.net} value={money(r.net_cents)} />
        <Tile label={W.netAfterFees} value={money(r.net_after_fees_cents)} />
      </div>
      <Card className="mt-2">
        <div className="eyebrow">{W.byDay}</div>
        <ul className="mt-2 grid gap-1.5">
          {r.by_day.map((d) => (
            <li key={d.day} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-[12px]">
              <span className="tnum text-muted">{d.day.slice(5)}</span>
              <span className="h-2.5 rounded-full bg-soft" aria-hidden>
                <span className="block h-full rounded-full bg-ink" style={{ width: `${(d.total_cents / max) * 100}%` }} />
              </span>
              <span className="tnum text-right font-bold text-ink">
                {d.total_cents ? money(d.total_cents) : "—"}
              </span>
            </li>
          ))}
        </ul>
        {r.by_day.some((d) => d.total_cents) && (
          <p className="mt-2 text-[12px] text-muted">
            {Object.entries(
              r.by_day.reduce<Record<string, number>>((acc, d) => {
                for (const [k, v] of Object.entries(d.by_sku)) acc[k] = (acc[k] ?? 0) + v;
                return acc;
              }, {}),
            )
              .map(([k, v]) => `${W.skuNames[k] ?? k} ${money(v)}`)
              .join(" · ")}
          </p>
        )}
      </Card>
      <Card className="mt-2">
        <div className="eyebrow">{W.subs}</div>
        <p className="tnum mt-1 text-[14px] text-ink">{W.subsLine(r.subscriptions)}</p>
      </Card>
    </>
  );
}

function Cohorts({ title, rows }: { title: string; rows: CohortRow[] }) {
  const cols = Math.max(1, ...rows.map((r) => r.cells.length));
  return (
    <div className="card mt-2 overflow-x-auto p-0">
      <div className="eyebrow px-3 pt-3">{title}</div>
      {rows.length === 0 ? (
        <p className="px-3 pb-3 pt-1 text-[13px] text-muted">{W.noCohorts}</p>
      ) : (
        <table className="mt-1 w-full min-w-[22rem] text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-1.5 text-left font-bold">{W.cohortCol}</th>
              <th className="px-1 py-1.5 text-right font-bold">{W.sizeCol}</th>
              {Array.from({ length: cols }, (_, k) => (
                <th key={k} className="px-1 py-1.5 text-center font-bold">
                  {W.weekCol(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((r) => (
              <tr key={r.week_of} className="border-t border-line">
                <td className="px-3 py-1.5 text-ink-2">{r.week_of.slice(5)}</td>
                <td className="px-1 py-1.5 text-right text-ink">{r.size}</td>
                {Array.from({ length: cols }, (_, k) => {
                  const v = r.cells[k];
                  return (
                    <td key={k} className="px-1 py-1">
                      {v === undefined ? null : (
                        <span className="relative block rounded-md px-1 py-1 text-center font-bold text-ink">
                          <span className="absolute inset-0 rounded-md bg-start" style={{ opacity: cellOpacity(v) * 0.55 }} aria-hidden />
                          <span className="relative">{rate(v)}</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Retention({ m }: { m: AdminMetrics }) {
  return (
    <>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">{W.retentionLead}</p>
      <Cohorts title={W.retentionAll} rows={m.retention.all} />
      <Cohorts title={W.retentionPaying} rows={m.retention.paying} />
    </>
  );
}

function Loop({ m }: { m: AdminMetrics }) {
  const l = m.loop;
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile label={W.loopCreated} value={String(l.created)} />
        <Tile label={W.loopOpens} value={String(l.opens)} sub={`${W.loopPerCard}: ${l.opens_per_card === null ? "—" : l.opens_per_card.toFixed(1)}`} />
        <Tile label={W.loopSignups} value={String(l.signups)} />
        <Tile label={W.loopBuyers} value={String(l.buyers)} />
      </div>
      <Card className="mt-2">
        <div className="eyebrow">{W.topCards}</div>
        {l.top.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">{W.noCards}</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {l.top.map((s) => (
              <li key={s.id} className="flex justify-between text-[13px]">
                <a className="font-bold text-ink underline underline-offset-4" href={`/s/${s.id}`} target="_blank" rel="noreferrer">
                  /s/{s.id}
                </a>
                <span className="tnum text-ink-2">{s.views}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Today's date in Eastern time, as the spend form's default day. */
function easternToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export default function Dashboard({ tab }: { tab: MetricsTab }) {
  const [preset, setPreset] = useState<RangePreset>("week");
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<unknown>(null);
  const today = easternToday();

  const load = useCallback(() => {
    const { from, to } = presetRange(preset, weekStart, today);
    adminMetrics(from, to)
      .then((d) => {
        setData(d);
        setError(null);
        if (preset === "week") setWeekStart(d.range.start_day);
      })
      .catch(setError);
  }, [preset, weekStart, today]);
  useEffect(load, [load]);

  return (
    <section className="mt-4" data-testid="admin-metrics">
      <div className="flex items-center gap-1.5">
        {(["week", "last", "season"] as RangePreset[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            onClick={() => setPreset(p)}
            className={`min-h-9 whitespace-nowrap rounded-full px-3 text-[12px] font-bold ${preset === p ? "bg-ink text-paper" : "bg-soft text-ink-2"}`}
          >
            {W.ranges[p]}
          </button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={load}>
          {W.reload}
        </Button>
      </div>
      {data && <Eyebrow className="mt-2">{W.rangeLabel(data.range.start_day, data.range.end_day)}</Eyebrow>}
      {error ? (
        <div className="mt-3">
          <ErrorBox error={error} onRetry={load} />
        </div>
      ) : !data ? (
        <div className="pt-8">
          <Loading />
        </div>
      ) : tab === "today" ? (
        <Today m={data} />
      ) : tab === "funnel" ? (
        <Funnel m={data} />
      ) : tab === "channels" ? (
        <Channels m={data} onChange={load} today={today} />
      ) : tab === "revenue" ? (
        <Revenue m={data} />
      ) : tab === "retention" ? (
        <Retention m={data} />
      ) : (
        <Loop m={data} />
      )}
    </section>
  );
}
