"use client";
/**
 * The radar tab: people asking for a start/sit, waiver or trade call on Reddit and Bluesky,
 * newest first (GET /api/admin/radar, edge/radar.py). It finds the threads; we answer them
 * by hand. Answered and skipped rows are shared, so two admins never take the same one.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { Loading } from "@/components/Loading";
import { adminRadar, adminRadarMark } from "@/lib/api";
import { ago, visible, waiting, type RadarFilter } from "@/lib/radar";
import type { RadarItem, RadarResponse, RadarStatus } from "@/lib/types";
import { ACCOUNT } from "@/lib/vocab";

const W = ACCOUNT.admin.radar;
const FILTERS: RadarFilter[] = ["all", "start_sit", "waiver", "trade"];
const CHIP = "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider";
// A word and a tint, never a tint alone (the Dashboard's rule).
const INTENT_CLASS: Record<RadarItem["intent"], string> = {
  start_sit: "bg-start-soft text-start",
  waiver: "bg-flip-soft text-flip",
  trade: "bg-sit-soft text-sit",
  other: "bg-soft text-muted",
};
const RELOAD_MS = 5 * 60 * 1000;

function Row({ item, now, onMark }: { item: RadarItem; now: number; onMark: (status: RadarStatus) => void }) {
  const handled = item.status !== "new";
  return (
    <li className={`card min-w-0 p-4 ${handled ? "opacity-60" : ""}`} data-testid="radar-row">
      <div className="flex items-center gap-2 text-[12px]">
        <span className={`${CHIP} bg-ink text-paper`}>{item.source}</span>
        <span className="min-w-0 truncate font-bold text-ink-2">{item.where}</span>
        <span className={`${CHIP} ${INTENT_CLASS[item.intent]}`}>{W.intents[item.intent]}</span>
        <span className="tnum ml-auto shrink-0 text-muted">{ago(now - item.created)}</span>
      </div>
      {item.thread ? <p className="mt-1.5 truncate text-[12px] text-muted">{W.inThread(item.thread)}</p> : null}
      <p className="mt-2 line-clamp-6 whitespace-pre-line [overflow-wrap:anywhere] text-[14px] leading-relaxed text-ink">{item.text}</p>
      <p className="mt-1 text-[12px] text-muted">{item.author}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center rounded-full bg-ink px-4 text-[13px] font-bold text-paper"
        >
          {W.open} ↗
        </a>
        {handled ? (
          <>
            <span className="text-[12px] text-muted">{W.handledBy(item.status as "done" | "skip", item.by ?? "")}</span>
            <Button variant="secondary" size="sm" onClick={() => onMark("new")}>
              {W.undo}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => onMark("done")}>
              {W.done}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onMark("skip")}>
              {W.skip}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export default function Radar() {
  const [data, setData] = useState<RadarResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<RadarFilter>("all");
  const [showHandled, setShowHandled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);

  const load = useCallback(
    (fresh = false) =>
      adminRadar(fresh)
        .then((d) => {
          setData(d);
          setError(null);
          setNow(Date.now() / 1000);
        })
        .catch(setError),
    [],
  );
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), RELOAD_MS);
    return () => clearInterval(t);
  }, [load]);

  async function mark(id: string, status: RadarStatus) {
    // Optimistic: the row moves at once, and a failed save puts it back.
    const before = data;
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === id ? { ...i, status, by: status === "new" ? null : i.by } : i)) });
    try {
      await adminRadarMark(id, status);
    } catch (e) {
      setData(before);
      setError(e);
    }
  }

  function refresh() {
    setBusy(true);
    load(true).finally(() => setBusy(false));
  }

  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;
  if (!data) return <Loading />;
  const counts = waiting(data.items);
  const rows = visible(data.items, filter, showHandled);
  const down = data.sources.filter((s) => !s.ok);

  return (
    <div className="mt-4" data-testid="radar">
      <p className="max-w-[28rem] text-[13px] leading-relaxed text-muted">{W.lead}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-9 whitespace-nowrap rounded-full px-3 text-[12px] font-bold ${filter === f ? "bg-ink text-paper" : "bg-soft text-ink-2"}`}
          >
            {W.intents[f]} <span className="tnum opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          {W.showHandled}
        </label>
        <span className="tnum">{W.updated(ago(now - data.fetched_at))}</span>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={refresh} busy={busy}>
          {W.refresh}
        </Button>
      </div>
      {error ? <ErrorBox error={error} /> : null}
      {down.length ? (
        <ul className="mt-3 grid gap-1 text-[11px] text-muted">
          {down.map((s) => (
            <li key={s.name}>{W.feedDown(s.name, s.error ?? "")}</li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
        {rows.map((i) => (
          <Row key={i.id} item={i} now={now} onMark={(s) => mark(i.id, s)} />
        ))}
        {rows.length === 0 && <li className="card p-4 text-[14px] text-muted">{W.none}</li>}
      </ul>
    </div>
  );
}
