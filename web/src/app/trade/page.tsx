"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/Shell";
import { Locked } from "@/components/Locked";
import { ShareCard } from "@/components/ShareCard";
import { Avatar } from "@/components/Avatar";
import { PlayerLine } from "@/components/Players";
import { Button, Card, ErrorBox, Eyebrow, H2, Sheet, SkeletonList, Stamp, StatusMeter, Why } from "@/components/ui";
import { createShare, evaluateTrade, findTrades, getLeague, getRoster, PaywallError } from "@/lib/api";
import { once } from "@/lib/cache";
import { TradeFinderView, TradeFinderWait } from "@/components/TradeFinderView";
import { signed, verdictBlurb, verdictClass } from "@/lib/format";
import type { Connection } from "@/lib/storage";
import type { LeagueSummary, Player, TradeFinderResponse, TradeResult } from "@/lib/types";

function sortRoster(players: Player[]): Player[] {
  return [...players].sort((a, b) => (b.ros ?? b.projected ?? 0) - (a.ros ?? a.projected ?? 0));
}

/** Searchable bottom-sheet picker. */
function PickerSheet({ open, onClose, title, players, selected, onToggle, tone }: { open: boolean; onClose: () => void; title: string; players: Player[]; selected: string[]; onToggle: (id: string) => void; tone: "sit" | "start" }) {
  const [q, setQ] = useState("");
  const list = players.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.position.toLowerCase() === q.toLowerCase());
  const on = tone === "sit" ? "border-sit/50 bg-sit-soft" : "border-start/50 bg-start-soft";
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or position"
        className="mb-3 w-full rounded-xl border border-line-2 bg-paper px-4 py-3 text-[15px] focus:border-ink focus:outline-none"
      />
      <ul className="grid gap-2">
        {list.map((p) => {
          const sel = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button onClick={() => onToggle(p.id)} aria-pressed={sel} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${sel ? on : "border-line hover:bg-soft"}`}>
                <PlayerLine p={p} avatar="md" />
                <span className="ml-auto text-right">
                  <span className="display tnum block text-[17px]">{(p.ros ?? 0).toFixed(0)}</span>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">ROS</span>
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
          <button onClick={() => onRemove(p.id)} className={`flex min-h-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] font-bold ${tone === "sit" ? "border-sit/40 bg-sit-soft text-sit" : "border-start/40 bg-start-soft text-start"}`} aria-label={`Remove ${p.name}`}>
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

/** Rest-of-season value of a side of the table. Zero for a player we could not price. */
function rosOf(players: Player[]): number {
  return players.reduce((n, p) => n + (p.ros ?? 0), 0);
}

/** One half of the table: its chips, and the control that adds to it. */
function TableSide({
  label,
  tone,
  players,
  onAdd,
  onRemove,
  empty,
}: {
  label: string;
  tone: "sit" | "start";
  players: Player[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  empty: string;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="min-w-0 truncate">{label}</Eyebrow>
        <button
          onClick={onAdd}
          className="min-h-0 shrink-0 rounded-full border border-line-2 bg-soft px-3 py-1.5 text-[13px] font-bold hover:bg-line"
        >
          + Add
        </button>
      </div>
      <div className="mt-2.5">
        <Chips players={players} tone={tone} onRemove={onRemove} empty={empty} />
      </div>
    </div>
  );
}

/**
 * The bar between the two halves: what each side is worth and which way it leans.
 *
 * Deliberately not a verdict. Asset value alone says nothing about whether a trade
 * helps your lineup — that needs both rosters scored, which is what the Grade button
 * is for — so this labels itself "value" and stays quiet until both sides have a
 * player on them.
 */
function TableBalance({ out, in: inValue, live }: { out: number; in: number; live: boolean }) {
  const net = inValue - out;
  const total = out + inValue;
  const left = total > 0 ? Math.max(6, Math.min(94, Math.round((out / total) * 100))) : 50;
  return (
    <div className="border-y border-line bg-soft px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className={`tnum shrink-0 text-[13px] font-black ${out > 0 ? "text-sit" : "text-muted"}`}>{out.toFixed(0)}</span>
        {/* Grey until there is something to weigh: a red and green bar over two zeroes
            looks like a reading, and there is nothing to read yet. */}
        <span aria-hidden className="flex h-[3px] min-w-0 flex-1 overflow-hidden rounded-full">
          <span className={`h-full rounded-l-full ${total > 0 ? "bg-sit" : "bg-line-2"}`} style={{ width: `${left}%` }} />
          <span className="h-full w-[2px] shrink-0 bg-soft" />
          <span className={`h-full flex-1 rounded-r-full ${total > 0 ? "bg-start" : "bg-line-2"}`} />
        </span>
        <span className={`tnum shrink-0 text-[13px] font-black ${inValue > 0 ? "text-start" : "text-muted"}`}>{inValue.toFixed(0)}</span>
      </div>
      <p className="mt-1.5 truncate text-center text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        {live ? `ROS value · ${signed(net, 0)} to you` : "ROS value on the table"}
      </p>
    </div>
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
    Promise.all([
      once(`league:${c.platform}:${c.league_id}`, () => getLeague(c.platform, c.league_id)),
      once(`roster:${c.platform}:${c.league_id}:${c.team_id}`, () => getRoster(c.platform, c.league_id, c.team_id)),
    ])
      .then(([l, roster]) => {
        setLeague(l);
        setMine(sortRoster(roster.players));
        setTheirId((cur) => cur || l.teams.find((t) => t.id !== c.team_id)?.id || "");
      })
      .catch((e: Error) => setError(e.message));
  }, [c.platform, c.league_id, c.team_id]);

  useEffect(() => {
    let alive = true;
    once(`findTrades:${c.platform}:${c.league_id}:${c.team_id}`, () => findTrades(c.platform, c.league_id, c.team_id))
      .then((f) => alive && setFound(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id]);

  useEffect(() => {
    if (!theirId) return;
    let alive = true;
    once(`roster:${c.platform}:${c.league_id}:${theirId}`, () => getRoster(c.platform, c.league_id, theirId))
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
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-soft p-1" role="tablist" aria-label="Trade lab mode">
        {(["find", "grade"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-0 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${
              tab === t ? "bg-paper text-ink shadow-[var(--shadow-card)]" : "text-muted"
            }`}
          >
            {t === "find" ? "Find a trade" : "Grade an offer"}
          </button>
        ))}
      </div>

      {tab === "find" && (found ? <TradeFinderView found={found} /> : <TradeFinderWait />)}

      {tab === "grade" && (
      <>
      <section className="card p-4">
        <label htmlFor="their-team" className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
          Across the table
        </label>
        <select
          id="their-team"
          className="mt-1.5 w-full rounded-xl border border-line-2 bg-paper px-4 py-3 text-[15px] font-bold"
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

      {/* One table rather than two cards. The two sides of a trade are one object, and
          splitting them into separate panels meant nothing on screen ever showed the
          offer as a whole — you built each half blind and only learned what it was worth
          after a round trip to the API. The tally between them is rest-of-season value
          off the roster you already have in memory, so it moves the instant you add a
          player: not a verdict, which is the engine's job, but enough to stop you
          sending a ticket you did not mean to. */}
      <section className="card overflow-hidden p-0">
        <TableSide
          label="You send"
          tone="sit"
          players={givePlayers}
          onAdd={() => setSheet("give")}
          onRemove={(id) => toggle(give, setGive, id)}
          empty="Tap Add to put someone on the table."
        />
        <TableBalance out={rosOf(givePlayers)} in={rosOf(getPlayers)} live={give.length > 0 && get.length > 0} />

        <TableSide
          label={`You get from ${theirTeam?.name ?? "them"}`}
          tone="start"
          players={getPlayers}
          onAdd={() => setSheet("get")}
          onRemove={(id) => toggle(get, setGet, id)}
          empty="Tap Add to name what you want back."
        />
      </section>

      <PickerSheet open={sheet === "give"} onClose={() => setSheet(null)} title="Your roster" players={mine} selected={give} onToggle={(id) => toggle(give, setGive, id)} tone="sit" />
      <PickerSheet open={sheet === "get"} onClose={() => setSheet(null)} title={`${theirTeam?.name ?? "Their"} roster`} players={theirs} selected={get} onToggle={(id) => toggle(get, setGet, id)} tone="start" />

      <div className="sticky bottom-24 z-[5]">
        <Button variant="start" className="w-full shadow-[var(--shadow-float)]" onClick={submit} busy={busy} disabled={give.length === 0 || get.length === 0}>
          {busy ? "Grading it…" : `Grade ${give.length}-for-${get.length}`}
        </Button>
      </div>
      {error && <ErrorBox message={error} />}

      {result && (
        <div id="verdict" className="grid gap-4 scroll-mt-16">
          <Card className="overflow-hidden p-0 rise">
            {/* The moment. Same device as the share card: the call is stamped, not typeset.
                The hero is dark in both themes, where the status inks vanish in light mode,
                so the stamp goes white here and the verdict colour carries the line below. */}
            <div className="hero callsheet rounded-none px-5 pb-6 pt-5">
              <Eyebrow>The verdict</Eyebrow>
              <div className="mt-3.5 pl-1">
                <Stamp size="xl" slam ink="text-white" className="text-[34px]">
                  {result.verdict}
                </Stamp>
              </div>
              <p className="mt-4 text-[13px] leading-snug text-white/60">
                Your {give.length}-for-{get.length} with {theirTeam?.name ?? "them"}, scored on both rosters.
              </p>
            </div>
            <div className="p-5">
              <p className={`display text-[19px] leading-snug ${verdictClass(result.verdict)}`}>{verdictBlurb(result.verdict)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <SideBox label="You" side={result.me} />
                <SideBox label={theirTeam?.name ?? "Them"} side={result.them} />
              </div>
              <div className="mt-4">
                <StatusMeter value={result.fairness} label="Fairness" />
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{result.explanation}</p>
              {result.notes?.map((n) => (
                <p key={n} className="mt-2.5 rounded-xl bg-flip-soft px-3 py-2 text-[13px] leading-snug text-flip">
                  {n}
                </p>
              ))}
              <Why
                lines={[
                  `Value is rest-of-season projected points, rescored to this league's settings. You send ${result.me.value_out.toFixed(0)} and receive ${result.me.value_in.toFixed(0)}.`,
                  "Lineup impact is measured with free agents available, so an emptied slot costs the gap to the best waiver option rather than the whole player.",
                  "Fairness is the smaller side divided by the larger side of asset value.",
                ]}
                label="How is this scored?"
              />
            </div>
          </Card>

          <Card className="rise rise-1">
            <Eyebrow>The read on {theirTeam?.name ?? "them"}</Eyebrow>
            <p className="mt-1 text-[13px] leading-snug text-muted">How this manager has actually traded and bid this season.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(result.their_tendencies.style
                ? [
                    result.their_tendencies.style,
                    `${result.their_tendencies.trades ?? 0} trades`,
                    `${result.their_tendencies.waiver_claims ?? 0} claims`,
                    `avg bid $${result.their_tendencies.avg_bid ?? 0}`,
                    ...(result.their_tendencies.favorite_positions ?? []).map((p) => `acquires ${p}s`),
                    ...(result.their_tendencies.hoards ?? []).map((p) => `hoards ${p}s`),
                  ]
                : ["No moves on record yet"]
              ).map((t) => (
                <span key={t} className="rounded-full border border-line bg-soft px-2.5 py-1 text-[12px] font-bold">
                  {t}
                </span>
              ))}
            </div>
          </Card>

          {result.counter && (
            <Card className="border-flip/40 bg-flip-soft rise rise-2">
              <Eyebrow className="text-flip">What we&rsquo;d send back</Eyebrow>
              <div className="mt-1.5 text-base">
                <span className="font-bold text-sit">Send</span> {result.counter.give_names.join(" + ") || "nothing"}
                <br />
                <span className="font-bold text-start">Ask for</span> {result.counter.get_names.join(" + ") || "nothing"}
              </div>
              <p className="mt-2 text-sm">{result.counter.why}</p>
            </Card>
          )}

          <section className="rise rise-3">
            <H2>Send it to the league</H2>
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
        <Button variant="secondary" onClick={make} busy={busy} className="w-full">
          {busy ? "Making the link…" : "Make a share link"}
        </Button>
        {error && <p className="mt-2 text-sm text-sit">{error}</p>}
      </>
    );

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-soft p-2">
      <code className="min-w-0 flex-1 truncate px-1 text-[13px]">{url}</code>
      <Button size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function SideBox({ label, side }: { label: string; side: TradeResult["me"] }) {
  const net = side.value_in - side.value_out;
  return (
    <div className="min-w-0 rounded-2xl bg-soft p-3.5">
      <div className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`display tnum mt-1 text-[26px] leading-none ${net >= 0 ? "text-start" : "text-sit"}`}>{signed(net, 0)}</div>
      <div className="tnum mt-1.5 text-[11px] text-muted">
        <span className="text-sit">out {side.value_out.toFixed(0)}</span> · <span className="text-start">in {side.value_in.toFixed(0)}</span>
      </div>
      <div className="tnum mt-0.5 text-[11px] text-muted">
        lineup wk {signed(side.lineup_delta_week)} · ROS {signed(side.lineup_delta_ros, 0)}
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
    <AppShell section="trade" needsMe>
      {(s) => (
        <Suspense fallback={<SkeletonList rows={3} />}>
          {s.has("trade_lab") ? (
            <TradeBodyKeyed c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
          ) : (
            <Locked signedIn={s.signedIn} sku="trade_lab" what="Trade Lab" teaser="Propose any trade. We grade it, then draft a counter tuned to how that manager actually behaves." onUnlocked={s.refresh} />
          )}
        </Suspense>
      )}
    </AppShell>
  );
}
