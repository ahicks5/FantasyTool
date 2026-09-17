"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { ShareCard } from "@/components/ShareCard";
import { Avatar } from "@/components/Avatar";
import { PlayerLine } from "@/components/Players";
import { Button, Card, ErrorBox, Eyebrow, H2, Sheet, SkeletonList, VerdictWord, Why } from "@/components/ui";
import { createShare, evaluateTrade, findTrades, getLeague, getRoster, PaywallError } from "@/lib/api";
import { TradeFinderView } from "@/components/TradeFinderView";
import { signed } from "@/lib/format";
import type { Connection } from "@/lib/storage";
import type { LeagueSummary, Player, TradeFinderResponse, TradeResult } from "@/lib/types";

function sortRoster(players: Player[]): Player[] {
  return [...players].sort((a, b) => (b.ros ?? b.projected ?? 0) - (a.ros ?? a.projected ?? 0));
}

/** Searchable bottom-sheet picker. */
function PickerSheet({ open, onClose, title, players, selected, onToggle, tone }: { open: boolean; onClose: () => void; title: string; players: Player[]; selected: string[]; onToggle: (id: string) => void; tone: "sit" | "start" }) {
  const [q, setQ] = useState("");
  const list = players.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.position.toLowerCase() === q.toLowerCase());
  const on = tone === "sit" ? "border-sit bg-sit-soft" : "border-start bg-start-soft";
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or position"
        className="mb-3 w-full rounded-xl border-2 border-line px-4 py-3 text-base focus:border-ink focus:outline-none"
      />
      <ul className="grid gap-2">
        {list.map((p) => {
          const sel = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button onClick={() => onToggle(p.id)} aria-pressed={sel} className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left ${sel ? on : "border-line"}`}>
                <PlayerLine p={p} avatar="md" />
                <span className="ml-auto text-right">
                  <span className="block font-black tabular-nums">{(p.ros ?? 0).toFixed(0)}</span>
                  <span className="block text-[10px] uppercase text-muted">ROS</span>
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="py-6 text-center text-muted">{players.length ? "No match" : "Loading roster…"}</li>}
      </ul>
    </Sheet>
  );
}

function Chips({ players, tone, onRemove, empty }: { players: Player[]; tone: "sit" | "start"; onRemove: (id: string) => void; empty: string }) {
  if (!players.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {players.map((p) => (
        <li key={p.id}>
          <button onClick={() => onRemove(p.id)} className={`flex min-h-0 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-sm font-bold ${tone === "sit" ? "border-sit bg-sit-soft" : "border-start bg-start-soft"}`} aria-label={`Remove ${p.name}`}>
            <Avatar name={p.name} photo={p.photo} size="sm" />
            {p.name}
            <span aria-hidden className="text-muted">
              ×
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TradeBody({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  const params = useSearchParams();
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [mine, setMine] = useState<Player[]>([]);
  const [theirs, setTheirs] = useState<Player[]>([]);
  const [theirId, setTheirId] = useState(params.get("their") ?? "");
  const [give, setGive] = useState<string[]>(params.get("give")?.split(",").filter(Boolean) ?? []);
  const [get, setGet] = useState<string[]>(params.get("get")?.split(",").filter(Boolean) ?? []);
  const [sheet, setSheet] = useState<"give" | "get" | null>(null);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paywall, setPaywall] = useState<PaywallError | null>(null);
  const [found, setFound] = useState<TradeFinderResponse | null>(null);
  const [tab, setTab] = useState<"find" | "grade">(params.get("give") ? "grade" : "find");

  useEffect(() => {
    Promise.all([getLeague(c.platform, c.league_id), getRoster(c.platform, c.league_id, c.team_id)])
      .then(([l, roster]) => {
        setLeague(l);
        setMine(sortRoster(roster.players));
        setTheirId((cur) => cur || l.teams.find((t) => t.id !== c.team_id)?.id || "");
      })
      .catch((e: Error) => setError(e.message));
  }, [c.platform, c.league_id, c.team_id]);

  useEffect(() => {
    let alive = true;
    findTrades(c.platform, c.league_id, c.team_id)
      .then((f) => alive && setFound(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id]);

  useEffect(() => {
    if (!theirId) return;
    let alive = true;
    getRoster(c.platform, c.league_id, theirId)
      .then((r) => alive && setTheirs(sortRoster(r.players)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, theirId]);

  const others = useMemo(() => league?.teams.filter((t) => t.id !== c.team_id) ?? [], [league, c.team_id]);
  const theirTeam = others.find((t) => t.id === theirId);
  const givePlayers = give.map((id) => mine.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const getPlayers = get.map((id) => theirs.find((p) => p.id === id)).filter((p): p is Player => !!p);

  const toggle = useCallback((list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setResult(null);
  }, []);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await evaluateTrade(c.platform, c.league_id, { my_team_id: c.team_id, their_team_id: theirId, give, get });
      setResult(r);
      setTimeout(() => document.getElementById("verdict")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      if (e instanceof PaywallError) setPaywall(e);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Auto-run when arriving from an Action card with a prefilled offer.
  const prefilled = params.get("give") && params.get("get");
  const [autoRan, setAutoRan] = useState(false);
  useEffect(() => {
    if (!prefilled || autoRan || !mine.length || !theirs.length || !givePlayers.length || !getPlayers.length) return;
    const id = window.setTimeout(() => {
      setAutoRan(true);
      void submit();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.length, theirs.length, autoRan]);

  if (paywall) return <Locked signedIn={signedIn} sku="trade_lab" what="Trade Lab" teaser={paywall.teaser} onUnlocked={refresh} />;
  if (error && !league) return <ErrorBox message={error} />;
  if (!league) return <SkeletonList rows={3} />;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-soft p-1" role="tablist" aria-label="Trade mode">
        {(["find", "grade"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-0 rounded-lg py-2.5 text-sm font-bold ${tab === t ? "bg-paper shadow-[var(--shadow-card)]" : "text-muted"}`}
          >
            {t === "find" ? "Find a trade" : "Grade a trade"}
          </button>
        ))}
      </div>

      {tab === "find" &&
        (found ? (
          <TradeFinderView found={found} />
        ) : (
          <SkeletonList rows={3} tall />
        ))}

      {tab === "grade" && (
      <>
      <section className="card p-4">
        <label htmlFor="their-team" className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
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

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>You give</Eyebrow>
          <button onClick={() => setSheet("give")} className="min-h-0 rounded-full bg-soft px-3 py-1 text-sm font-bold">
            + Add
          </button>
        </div>
        <div className="mt-2">
          <Chips players={givePlayers} tone="sit" onRemove={(id) => toggle(give, setGive, id)} empty="Tap + Add to pick from your roster." />
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>You get from {theirTeam?.name ?? "them"}</Eyebrow>
          <button onClick={() => setSheet("get")} className="min-h-0 rounded-full bg-soft px-3 py-1 text-sm font-bold">
            + Add
          </button>
        </div>
        <div className="mt-2">
          <Chips players={getPlayers} tone="start" onRemove={(id) => toggle(get, setGet, id)} empty="Tap + Add to pick from their roster." />
        </div>
      </section>

      <PickerSheet open={sheet === "give"} onClose={() => setSheet(null)} title="Your roster" players={mine} selected={give} onToggle={(id) => toggle(give, setGive, id)} tone="sit" />
      <PickerSheet open={sheet === "get"} onClose={() => setSheet(null)} title={`${theirTeam?.name ?? "Their"} roster`} players={theirs} selected={get} onToggle={(id) => toggle(get, setGet, id)} tone="start" />

      <div className="sticky bottom-20 z-[5]">
        <Button variant="start" className="w-full shadow-[var(--shadow-float)]" onClick={submit} disabled={busy || give.length === 0 || get.length === 0}>
          {busy ? "Evaluating…" : `Evaluate ${give.length}-for-${get.length}`}
        </Button>
      </div>
      {error && <ErrorBox message={error} />}

      {result && (
        <div id="verdict" className="grid gap-4 scroll-mt-16">
          <Card className="rise">
            <Eyebrow>Verdict</Eyebrow>
            <VerdictWord value={result.verdict} className="block text-6xl leading-none" />
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <SideBox label="You" side={result.me} />
              <SideBox label={theirTeam?.name ?? "Them"} side={result.them} />
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                <span>Fairness</span>
                <span>{Math.round(result.fairness * 100)}%</span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-soft">
                <div className={`h-full rounded-full ${result.fairness >= 0.9 ? "bg-start" : result.fairness >= 0.75 ? "bg-flip" : "bg-sit"}`} style={{ width: `${Math.round(result.fairness * 100)}%` }} />
              </div>
            </div>
            <p className="mt-4 text-base leading-relaxed">{result.explanation}</p>
            {result.notes?.map((n) => (
              <p key={n} className="mt-2 rounded-lg bg-flip-soft px-3 py-2 text-sm text-flip-dark">
                {n}
              </p>
            ))}
            <Why
              lines={[
                `Value = rest-of-season projected points, rescored to this league. You send ${result.me.value_out.toFixed(0)}, receive ${result.me.value_in.toFixed(0)}.`,
                `Lineup impact is measured with free-agent replacements available, so an emptied slot costs the gap to the best waiver option, not the whole player.`,
                `Fairness = smaller side ÷ larger side of asset value.`,
              ]}
              label="How is this scored?"
            />
          </Card>

          <Card className="rise rise-1">
            <Eyebrow>{theirTeam?.name ?? "Their"} tendencies</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-2">
              {(result.their_tendencies.style
                ? [
                    result.their_tendencies.style,
                    `${result.their_tendencies.trades ?? 0} trades`,
                    `${result.their_tendencies.waiver_claims ?? 0} claims`,
                    `avg bid $${result.their_tendencies.avg_bid ?? 0}`,
                    ...(result.their_tendencies.favorite_positions ?? []).map((p) => `acquires ${p}s`),
                    ...(result.their_tendencies.hoards ?? []).map((p) => `hoards ${p}s`),
                  ]
                : ["No transaction history yet"]
              ).map((t) => (
                <span key={t} className="rounded-full bg-soft px-3 py-1 text-sm font-bold">
                  {t}
                </span>
              ))}
            </div>
          </Card>

          {result.counter && (
            <Card className="border-2 border-flip bg-flip-soft rise rise-2">
              <Eyebrow className="text-flip-dark">Counteroffer</Eyebrow>
              <div className="mt-1 text-base">
                <span className="font-bold text-sit">Give</span> {result.counter.give_names.join(" + ") || "nothing"}
                <br />
                <span className="font-bold text-start">Get</span> {result.counter.get_names.join(" + ") || "nothing"}
              </div>
              <p className="mt-2 text-sm">{result.counter.why}</p>
            </Card>
          )}

          <section className="rise rise-3">
            <H2>Share this verdict</H2>
            <p className="mb-2 text-sm text-muted">
              A public link anyone can open, with no account. Long-press the card to save the image.
            </p>
            <ShareLink result={result} give={givePlayers} get={getPlayers} c={c} />
            <div className="mt-3">
              <ShareCard result={result} give={givePlayers} get={getPlayers} leagueName={c.league_name} />
            </div>
          </section>
        </div>
      )}
      </>
      )}
    </div>
  );
}

/** Turns the verdict into a public URL and offers it for copying. */
function ShareLink({ result, give, get, c }: { result: TradeResult; give: Player[]; get: Player[]; c: Connection }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function make() {
    setBusy(true);
    setError("");
    try {
      const r = await createShare({
        graphic: result.graphic,
        explanation: result.explanation,
        league_name: c.league_name,
        week: c.week,
        give_players: give,
        get_players: get,
      });
      setUrl(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the link and copy it by hand.");
    }
  }

  if (!url)
    return (
      <>
        <Button variant="secondary" onClick={make} disabled={busy} className="w-full">
          {busy ? "Creating link…" : "Create a share link"}
        </Button>
        {error && <p className="mt-2 text-sm text-sit">{error}</p>}
      </>
    );

  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-line p-2">
      <code className="min-w-0 flex-1 truncate px-1 text-sm">{url}</code>
      <Button size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function SideBox({ label, side }: { label: string; side: TradeResult["me"] }) {
  const net = side.value_in - side.value_out;
  return (
    <div className="rounded-xl bg-soft p-3">
      <div className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1 tabular-nums">
        <span className="text-sit">out {side.value_out.toFixed(0)}</span> · <span className="text-start">in {side.value_in.toFixed(0)}</span>
      </div>
      <div className={`display text-2xl font-black tabular-nums ${net >= 0 ? "text-start" : "text-sit"}`}>{signed(net, 0)}</div>
      <div className="text-xs text-muted">
        lineup: wk {signed(side.lineup_delta_week)} · ROS {signed(side.lineup_delta_ros, 0)}
      </div>
    </div>
  );
}

/** Remounts the body when the query string changes, so an offer link from the finder or the
 *  home feed lands with its players already selected. */
function TradeBodyKeyed({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  const params = useSearchParams();
  return <TradeBody key={params.toString()} c={c} refresh={refresh} signedIn={signedIn} />;
}

export default function TradePage() {
  return (
    <AppShell title="Trade Lab">
      {(s) => (
        <Suspense fallback={<SkeletonList rows={3} />}>
          {s.has("trade_lab") ? (
            <TradeBodyKeyed c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
          ) : (
            <Locked signedIn={s.signedIn} sku="trade_lab" what="Trade Lab" teaser="Propose any trade. Edge grades it, then drafts a counter tuned to how that manager actually behaves." onUnlocked={s.refresh} />
          )}
        </Suspense>
      )}
    </AppShell>
  );
}
