"use client";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { ShareCard } from "@/components/ShareCard";
import { PlayerLine } from "@/components/Players";
import { Button, Card, ErrorBox, H2, Spinner, VerdictWord } from "@/components/ui";
import { evaluateTrade, getLeague, getLineup } from "@/lib/api";
import { signed } from "@/lib/format";
import type { Connection } from "@/lib/storage";
import type { LeagueSummary, Lineup, Player, TradeResult } from "@/lib/types";

function rosterPlayers(l: Lineup): Player[] {
  return [...l.slots.map((s) => s.player), ...l.bench.map((b) => b.player)];
}

function TradeBody({ c }: { c: Connection }) {
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [mine, setMine] = useState<Player[]>([]);
  const [theirs, setTheirs] = useState<Player[]>([]);
  const [theirId, setTheirId] = useState("");
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getLeague(c.platform, c.league_id), getLineup(c.platform, c.league_id, c.team_id)])
      .then(([l, lineup]) => {
        setLeague(l);
        setMine(rosterPlayers(lineup));
        const first = l.teams.find((t) => t.id !== c.team_id);
        if (first) setTheirId(first.id);
      })
      .catch((e: Error) => setError(e.message));
  }, [c.platform, c.league_id, c.team_id]);

  useEffect(() => {
    if (!theirId) return;
    // No roster endpoint in the contract yet; the lineup endpoint returns the full roster.
    getLineup(c.platform, c.league_id, theirId)
      .then((l) => setTheirs(rosterPlayers(l)))
      .catch((e: Error) => setError(e.message));
  }, [c.platform, c.league_id, theirId]);

  const others = useMemo(() => league?.teams.filter((t) => t.id !== c.team_id) ?? [], [league, c.team_id]);
  const theirTeam = others.find((t) => t.id === theirId);
  const givePlayers = give.map((id) => mine.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const getPlayers = get.map((id) => theirs.find((p) => p.id === id)).filter((p): p is Player => !!p);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setResult(null);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await evaluateTrade(c.platform, c.league_id, { my_team_id: c.team_id, their_team_id: theirId, give, get });
      setResult(r);
      setTimeout(() => document.getElementById("verdict")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !league) return <ErrorBox message={error} />;
  if (!league) return <Spinner />;

  return (
    <div className="grid gap-5">
      <section>
        <label htmlFor="their-team" className="text-sm font-bold">
          Trade with
        </label>
        <select
          id="their-team"
          className="mt-1 w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-base font-bold"
          value={theirId}
          onChange={(e) => {
            setTheirId(e.target.value);
            setTheirs([]);
            setGet([]);
            setResult(null);
          }}
        >
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.record})
            </option>
          ))}
        </select>
      </section>

      <PlayerPicker title="You give" tone="sit" players={mine} selected={give} onToggle={(id) => toggle(give, setGive, id)} />
      <PlayerPicker title={`You get from ${theirTeam?.name ?? "them"}`} tone="start" players={theirs} selected={get} onToggle={(id) => toggle(get, setGet, id)} />

      <div className="sticky bottom-20 z-[5]">
        <Button className="w-full shadow-lg" onClick={submit} disabled={busy || give.length === 0 || get.length === 0}>
          {busy ? "Evaluating…" : `Evaluate ${give.length}-for-${get.length}`}
        </Button>
      </div>
      {error && <ErrorBox message={error} />}

      {result && (
        <div id="verdict" className="grid gap-4 scroll-mt-16">
          <Card>
            <div className="text-xs font-bold uppercase text-muted">Verdict</div>
            <VerdictWord value={result.verdict} className="block text-5xl" />
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <SideBox label="You" side={result.me} />
              <SideBox label={theirTeam?.name ?? "Them"} side={result.them} />
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs font-bold uppercase text-muted">
                <span>Fairness</span>
                <span>{Math.round(result.fairness * 100)}%</span>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-soft">
                <div className={`h-full ${result.fairness >= 0.9 ? "bg-start" : result.fairness >= 0.75 ? "bg-flip" : "bg-sit"}`} style={{ width: `${Math.round(result.fairness * 100)}%` }} />
              </div>
            </div>
            <p className="mt-4 text-base leading-relaxed">{result.explanation}</p>
          </Card>

          <Card>
            <div className="text-xs font-bold uppercase text-muted">{theirTeam?.name ?? "Their"} tendencies</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                result.their_tendencies.style,
                `${result.their_tendencies.trades} trades`,
                `${result.their_tendencies.waiver_claims} claims`,
                `avg bid $${result.their_tendencies.avg_bid}`,
                ...result.their_tendencies.favorite_positions.map((p) => `loves ${p}`),
              ].map((t) => (
                <span key={t} className="rounded-full bg-soft px-3 py-1 text-sm font-bold">
                  {t}
                </span>
              ))}
            </div>
          </Card>

          {result.counter && (
            <Card className="border-2 border-flip bg-flip-soft">
              <div className="text-xs font-bold uppercase text-flip-dark">Counteroffer</div>
              <div className="mt-1 text-base">
                <span className="font-bold text-sit">Give</span> {names(result.counter.give, mine)}
                <br />
                <span className="font-bold text-start">Get</span> {names(result.counter.get, theirs)}
              </div>
              <p className="mt-2 text-sm">{result.counter.why}</p>
            </Card>
          )}

          <section>
            <H2>Share graphic</H2>
            <p className="mb-2 text-sm text-muted">1080×1080 preview. Screenshot it or save it from the report.</p>
            <ShareCard result={result} give={givePlayers} get={getPlayers} leagueName={c.league_name} />
          </section>
        </div>
      )}
    </div>
  );
}

function names(ids: string[], pool: Player[]): string {
  return ids.map((id) => pool.find((p) => p.id === id)?.name ?? id).join(" + ") || "nothing";
}

function SideBox({ label, side }: { label: string; side: TradeResult["me"] }) {
  const net = side.value_in - side.value_out;
  return (
    <div className="rounded-lg bg-soft p-3">
      <div className="truncate text-xs font-bold uppercase text-muted">{label}</div>
      <div className="mt-1 tabular-nums">
        <span className="text-sit">out {side.value_out.toFixed(1)}</span> · <span className="text-start">in {side.value_in.toFixed(1)}</span>
      </div>
      <div className={`text-lg font-black tabular-nums ${net >= 0 ? "text-start" : "text-sit"}`}>{signed(net)}</div>
      <div className="text-xs text-muted">
        wk {signed(side.lineup_delta_week)} · ROS {signed(side.lineup_delta_ros)}
      </div>
    </div>
  );
}

function PlayerPicker({
  title,
  tone,
  players,
  selected,
  onToggle,
}: {
  title: string;
  tone: "sit" | "start";
  players: Player[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const on = tone === "sit" ? "border-sit bg-sit-soft" : "border-start bg-start-soft";
  return (
    <section>
      <H2>{title}</H2>
      {players.length === 0 ? (
        <Spinner label="Loading roster…" />
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {players.map((p) => {
            const sel = selected.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  onClick={() => onToggle(p.id)}
                  aria-pressed={sel}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left ${sel ? on : "border-line"}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-black ${sel ? "border-ink bg-ink text-white" : "border-line"}`} aria-hidden>
                    {sel ? "✓" : ""}
                  </span>
                  <PlayerLine p={p} />
                  <span className="ml-auto font-bold tabular-nums">{p.projected.toFixed(1)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function TradePage() {
  return (
    <AppShell title="Trade Lab">
      {(s) => (s.has("trade_lab") ? <TradeBody c={s.connection!} /> : <Locked sku="trade_lab" what="Trade Lab" onUnlocked={s.refresh} />)}
    </AppShell>
  );
}
