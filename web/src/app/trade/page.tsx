"use client";
/**
 * GM's Office: the three deals worth a call, every GM in one line each, and the trade room
 * with its two doors, Compare teams and Build a trade (W-037). The first open rings
 * (`CallOpening`).
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/Shell";
import { GhostRows, Locked } from "@/components/Locked";
import { ShareCard } from "@/components/ShareCard";
import { Avatar } from "@/components/Avatar";
import { PlayerLine } from "@/components/Players";
import { Button, Card, ErrorBox, Eyebrow, H2, Sheet, SkeletonList, Stamp, Why } from "@/components/ui";
import { createShare, evaluateTrade, findTrades, getLeague, getRoster, getTeamGrades, PaywallError } from "@/lib/api";
import { shareInApp } from "@/lib/native";
import { once } from "@/lib/cache";
import { TradeFinderWait } from "@/components/TradeFinderView";
import { CallOpening } from "@/components/CallOpening";
import { PartnerList, TopDeals } from "@/components/OfficeDeals";
import { Compare } from "@/components/Compare";
import { signed, verdictBlurb, verdictClass } from "@/lib/format";
import type { Connection } from "@/lib/storage";
import type { Grades, LeagueSummary, Player, TeamGrades, TradeFinderResponse, TradeResult } from "@/lib/types";
import { OFFICE } from "@/lib/vocab";
import { ACCEPT_INK, canGrade, officeKey } from "@/lib/office";

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
          {OFFICE.table.add}
        </button>
      </div>
      <div className="mt-2.5">
        <Chips players={players} tone={tone} onRemove={onRemove} empty={empty} />
      </div>
    </div>
  );
}

/**
 * The bar between the two halves: name value on each side.
 *
 * Deliberately not a verdict, and deliberately not red. It used to read "ROS VALUE · -19
 * TO YOU" in the loss colour over an Accept, because name value and what the trade does to
 * your lineup are different questions (W-033). The lineup is what the Grade button reads;
 * this only weighs the names, and says so.
 */
function TableBalance({ out, in: inValue, live }: { out: number; in: number; live: boolean }) {
  const net = whole(inValue) - whole(out);
  const total = out + inValue;
  const left = total > 0 ? Math.max(6, Math.min(94, Math.round((out / total) * 100))) : 50;
  return (
    <div className="border-y border-line bg-soft px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className={`tnum shrink-0 text-[13px] font-black ${out > 0 ? "text-sit" : "text-muted"}`}>{whole(out)}</span>
        {/* Grey until there is something to weigh: a red and green bar over two zeroes
            looks like a reading, and there is nothing to read yet. */}
        <span aria-hidden className="flex h-[3px] min-w-0 flex-1 overflow-hidden rounded-full">
          <span className={`h-full rounded-l-full ${total > 0 ? "bg-sit" : "bg-line-2"}`} style={{ width: `${left}%` }} />
          <span className="h-full w-[2px] shrink-0 bg-soft" />
          <span className={`h-full flex-1 rounded-r-full ${total > 0 ? "bg-start" : "bg-line-2"}`} />
        </span>
        <span className={`tnum shrink-0 text-[13px] font-black ${inValue > 0 ? "text-start" : "text-muted"}`}>{whole(inValue)}</span>
      </div>
      <p className="mt-1.5 truncate text-center text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        {live ? OFFICE.table.valueLive(signed(net, 0)) : OFFICE.table.value}
      </p>
    </div>
  );
}

/** Half away from zero: the rule `edge/engine/trade.whole` sets for every trade figure. */
function whole(x: number): number {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

/** One of the two doors into the trade room (W-037). Pressed is open. */
function DoorButton({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-0 min-w-0 rounded-2xl border px-3.5 py-3 text-left transition-colors ${active ? "border-ink bg-ink text-paper" : "border-line-2 bg-soft hover:bg-line"}`}
    >
      <span className="block truncate text-[14px] font-black">{label}</span>
      <span className={`mt-0.5 block text-[11.5px] leading-snug ${active ? "text-paper/70" : "text-muted"}`}>{hint}</span>
    </button>
  );
}

type Door = "compare" | "build" | null;

function TradeBody({ c, refresh, signedIn }: { c: Connection; refresh: () => void; signedIn: boolean }) {
  const params = useSearchParams();
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [mine, setMine] = useState<Player[]>([]);
  const [theirs, setTheirs] = useState<Player[]>([]);
  // No default opponent (W-037): nothing loads until a manager is picked, unless a link
  // from the finder or a partner's page already named one.
  const [theirId, setTheirId] = useState(params.get("their") ?? "");
  const [give, setGive] = useState<string[]>(params.get("give")?.split(",").filter(Boolean) ?? []);
  const [get, setGet] = useState<string[]>(params.get("get")?.split(",").filter(Boolean) ?? []);
  const [sheet, setSheet] = useState<"give" | "get" | null>(null);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [paywall, setPaywall] = useState<PaywallError | null>(null);
  // The API is the authority on entitlement, not the session: a caller without Trade Lab
  // gets `{preview: true, ...}` from /trades/find — the same board with the offers taken
  // out — rather than a 402. See `edge/engine/trade_finder.preview`.
  const [found, setFound] = useState<(TradeFinderResponse & { preview?: boolean }) | null>(null);
  const prefilled = params.get("give") && params.get("get");
  const [door, setDoor] = useState<Door>(
    params.get("compare") === "1" ? "compare" : params.get("build") === "1" || prefilled || params.get("their") ? "build" : null,
  );

  useEffect(() => {
    Promise.all([
      once(`league:${c.platform}:${c.league_id}`, () => getLeague(c.platform, c.league_id)),
      once(`roster:${c.platform}:${c.league_id}:${c.team_id}`, () => getRoster(c.platform, c.league_id, c.team_id)),
    ])
      .then(([l, roster]) => {
        setLeague(l);
        setMine(sortRoster(roster.players));
      })
      .catch((e: unknown) => setError(e));
  }, [c.platform, c.league_id, c.team_id]);

  useEffect(() => {
    let alive = true;
    once(officeKey(c.platform, c.league_id, c.team_id), () => findTrades(c.platform, c.league_id, c.team_id))
      .then((f) => alive && setFound(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id]);

  useEffect(() => {
    if (!theirId || door !== "build") return;
    let alive = true;
    once(`roster:${c.platform}:${c.league_id}:${theirId}`, () => getRoster(c.platform, c.league_id, theirId))
      .then((r) => alive && setTheirs(sortRoster(r.players)))
      .catch((e: unknown) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, theirId, door]);

  // Two scorecards for Compare teams, on the same `theirId` the picker drives.
  //
  // Both sides go through `getTeamGrades` rather than lifting mine out of the depth
  // chart's payload: one endpoint means both columns are computed the same way on the
  // same bundle, and two roads to the same number is how a comparison ends up right on
  // your side and quietly wrong on theirs.
  //
  // Failures are swallowed. This is a free read sitting beside a paid product, and a
  // scorecard that will not load must cost its own block, never the trade builder.
  // Tagged with the team it describes rather than cleared on the way in, so a stale card
  // never renders under a new pick without a synchronous setState in the effect.
  const [cards, setCards] = useState<{ id: string; mine: Grades; theirs: TeamGrades } | null>(null);
  useEffect(() => {
    if (!theirId || door !== "compare") return;
    let alive = true;
    Promise.all([
      once(`grades:${c.platform}:${c.league_id}:${c.team_id}`, () => getTeamGrades(c.platform, c.league_id, c.team_id)),
      once(`grades:${c.platform}:${c.league_id}:${theirId}`, () => getTeamGrades(c.platform, c.league_id, theirId)),
    ])
      .then(([m, t]) => alive && setCards({ id: theirId, mine: m.grades, theirs: t }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, theirId, door]);

  const others = useMemo(() => league?.teams.filter((t) => t.id !== c.team_id) ?? [], [league, c.team_id]);
  const theirTeam = others.find((t) => t.id === theirId);
  const theirName = theirTeam?.name ?? OFFICE.verdict.them;
  const givePlayers = give.map((id) => mine.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const getPlayers = get.map((id) => theirs.find((p) => p.id === id)).filter((p): p is Player => !!p);

  const toggle = useCallback((list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setResult(null);
  }, []);

  /** Open a door (or close the open one), and bring the room into view. */
  function openDoor(d: Exclude<Door, null>, toggleOff = true) {
    setDoor((cur) => (toggleOff && cur === d ? null : d));
    requestAnimationFrame(() => document.getElementById("build")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function pickManager(id: string) {
    setTheirId(id);
    setTheirs([]);
    setGet([]);
    setResult(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await evaluateTrade(c.platform, c.league_id, { my_team_id: c.team_id, their_team_id: theirId, give, get });
      setResult(r);
      setTimeout(() => document.getElementById("verdict")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      if (e instanceof PaywallError) setPaywall(e);
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  // Auto-run when arriving from an Action card with a prefilled offer.
  const [autoRan, setAutoRan] = useState(false);
  // Waits for the board before firing: on the free tier there is no grading to auto-run,
  // and running it anyway traded a readable preview for a bare paywall.
  useEffect(() => {
    if (!prefilled || autoRan || !found || found.preview || !mine.length || !theirs.length || !givePlayers.length || !getPlayers.length) return;
    const id = window.setTimeout(() => {
      setAutoRan(true);
      void submit();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.length, theirs.length, autoRan, found]);

  const preview = found?.preview === true;
  // Only when there is no board to put it under. With one, the lock is a section of the
  // page rather than a replacement for it.
  if (paywall && !preview) return <Locked signedIn={signedIn} sku="trade_lab" what="Trade Lab" teaser={paywall.teaser} onUnlocked={refresh} />;
  if (error && !league) return <ErrorBox error={error} />;
  if (!league) return <SkeletonList rows={3} />;

  return (
    <div className="grid gap-7">
      {/* The first time: the phone rings. Once per browser (`lib/call.ts`). */}
      <CallOpening c={c} />

      {/* The office, top down (Andrew, 2026-09-23): the three deals worth a call, every
          GM in one line each, and the trade room for your own idea at the bottom. */}
      {/* Side by side from 1024px up: the three calls on the left, every GM on the right. */}
      {found ? (
        <div className="grid min-w-0 gap-7 lg:grid-cols-2 lg:items-start lg:gap-8">
          <TopDeals
            board={found}
            preview={preview}
            onJump={() => document.getElementById("build")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          <PartnerList board={found} preview={preview} />
        </div>
      ) : (
        <TradeFinderWait />
      )}

      {/* The other GMs, under a haze (Andrew, 2026-09-28: one GM, blur the rest). The rows
          under it are ghosts: the server sent one partner and a count, never the names. */}
      {preview && (
        <Locked
          signedIn={signedIn}
          sku="trade_lab"
          what="Trade Lab"
          teaser={found?.hidden ? OFFICE.hiddenLine(found.hidden) : OFFICE.hiddenNone}
          onUnlocked={refresh}
        >
          <GhostRows n={Math.min(Math.max(found?.hidden ?? 0, 3), 6)} />
        </Locked>
      )}

      {/* Free, there is no builder to offer: grading an offer is the thing being sold. */}
      {!preview && (
      // From 1024px up the room sits in the left column of the grid above, the same width
      // as the roster tiles and the calls (W-036), rather than centred and wider.
      <section id="build" className="office-build grid min-w-0 scroll-mt-20 tablet:scroll-mt-28 gap-4 lg:w-[calc(50%-1rem)]">
        <div className="min-w-0">
          <h2 className="display text-[20px] leading-tight">{OFFICE.build}</h2>
          <p className="mt-1 text-[12px] leading-snug text-muted">{OFFICE.buildHint}</p>
        </div>

        {/* Two doors (W-037): size up a roster, or put an offer on the table. Each opens
            empty on a "Pick a manager" control, and each has a way into the other. */}
        <div className="grid grid-cols-2 gap-2">
          <DoorButton active={door === "compare"} onClick={() => openDoor("compare")} label={OFFICE.doors.compare} hint={OFFICE.doors.compareHint} />
          <DoorButton active={door === "build"} onClick={() => openDoor("build")} label={OFFICE.doors.build} hint={OFFICE.doors.buildHint} />
        </div>

        {door && (
          <section className="card p-4">
            <label htmlFor="their-team" className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              {OFFICE.doors.pickLabel}
            </label>
            <select
              id="their-team"
              className="mt-1.5 w-full rounded-xl border border-line-2 bg-paper px-4 py-3 text-[15px] font-bold"
              value={theirId}
              onChange={(e) => pickManager(e.target.value)}
            >
              <option value="" disabled>
                {OFFICE.doors.pick}
              </option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.record})
                </option>
              ))}
            </select>
            {!theirId && <p className="mt-2 text-[12px] text-muted">{OFFICE.doors.pickFirst}</p>}
          </section>
        )}

        {/* Compare teams: both rosters side by side by position. Free on purpose: the
            rosters are public inside the league and the letters are our arithmetic on them,
            while what Trade Lab sells, the verdict on an actual offer and a counter tuned to
            this manager, is behind the other door. Nothing here names a target. */}
        {door === "compare" && theirId && (
          cards?.id === theirId ? (
            <Compare
              mine={cards.mine}
              theirs={cards.theirs}
              footer={
                <Button variant="start" className="w-full" onClick={() => openDoor("build", false)}>
                  {OFFICE.doors.toBuild(theirName)}
                </Button>
              }
            />
          ) : (
            <SkeletonList rows={2} />
          )
        )}

      {door === "build" && theirId && (
      <>
      {/* One table rather than two cards. The two sides of a trade are one object, and
          splitting them into separate panels meant nothing on screen ever showed the
          offer as a whole. The tally between them is name value off the rosters already in
          memory, so it moves the instant you add a player: not a verdict, which is the
          engine's job, but enough to stop you sending a ticket you did not mean to. */}
      <section className="card overflow-hidden p-0">
        <TableSide
          label={OFFICE.table.send}
          tone="sit"
          players={givePlayers}
          onAdd={() => setSheet("give")}
          onRemove={(id) => toggle(give, setGive, id)}
          empty={OFFICE.table.sendEmpty}
        />
        <TableBalance out={rosOf(givePlayers)} in={rosOf(getPlayers)} live={canGrade(give, get)} />

        <TableSide
          label={OFFICE.table.get(theirName)}
          tone="start"
          players={getPlayers}
          onAdd={() => setSheet("get")}
          onRemove={(id) => toggle(get, setGet, id)}
          empty={theirs.length ? OFFICE.table.getEmpty : OFFICE.doors.loading}
        />
      </section>

      <button type="button" onClick={() => openDoor("compare", false)} className="min-h-0 justify-self-start text-[13px] font-bold underline underline-offset-4">
        {OFFICE.doors.toCompare}
      </button>

      <PickerSheet open={sheet === "give"} onClose={() => setSheet(null)} title="Your roster" players={mine} selected={give} onToggle={(id) => toggle(give, setGive, id)} tone="sit" />
      <PickerSheet open={sheet === "get"} onClose={() => setSheet(null)} title={`${theirName} roster`} players={theirs} selected={get} onToggle={(id) => toggle(get, setGet, id)} tone="start" />

      {/* No grade button until both sides have a player (W-037): "Grade 0-for-0" floated
          over an empty table and read as a control that did something. Clears the phone's
          tab bar; from tablet up there is none, so it sits at the edge. */}
      {canGrade(give, get) && (
        <div className="sticky bottom-24 z-[5] tablet:bottom-6">
          <Button variant="start" className="w-full shadow-[var(--shadow-float)]" onClick={submit} busy={busy}>
            {busy ? OFFICE.table.grading : OFFICE.table.grade(give.length, get.length)}
          </Button>
        </div>
      )}
      {error && <ErrorBox error={error} />}

      {result && <VerdictView result={result} give={givePlayers} get={getPlayers} theirName={theirName} c={c} />}
      </>
      )}
      </section>
      )}
    </div>
  );
}

/**
 * The verdict (W-033), top down: the stamp, then the one number it is based on (what the
 * trade does to your starting lineup rest of season), name value as a line under it that
 * cannot read as a loss, then "Will they say yes?" off their own lineup change. Every
 * figure is the API's printed number (W-032): nothing here rounds or recomputes one.
 */
function VerdictView({ result, give, get, theirName, c }: { result: TradeResult; give: Player[]; get: Player[]; theirName: string; c: Connection }) {
  const V = OFFICE.verdict;
  const lead = result.me.lineup_delta_ros;
  return (
    <div id="verdict" className="grid gap-4 scroll-mt-16 tablet:scroll-mt-28">
      <Card className="overflow-hidden p-0 rise">
        {/* The moment. Same device as the share card: the call is stamped, not typeset.
            The hero is dark in both themes, where the status inks vanish in light mode,
            so the stamp goes white here and the verdict colour carries the line below. */}
        <div className="hero callsheet rounded-none px-5 pb-6 pt-5">
          <Eyebrow>{V.eyebrow}</Eyebrow>
          <div className="mt-3.5 pl-1">
            <Stamp size="xl" slam ink="text-white" className="text-[34px]">
              {result.verdict}
            </Stamp>
          </div>
          <p className="mt-4 text-[13px] leading-snug text-white/60">{V.scored(give.length, get.length, theirName)}</p>
        </div>
        <div className="p-5">
          <p className={`display text-[19px] leading-snug ${verdictClass(result.verdict)}`}>{verdictBlurb(result.verdict)}</p>

          {/* The lead: one number, and it is the one the call is made on. */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[11px] font-black uppercase tracking-[0.1em] text-muted">{V.lead}</span>
            <span className={`display tnum text-[40px] leading-none ${lead >= 0 ? "text-start" : "text-sit"}`}>{signed(lead, 0)}</span>
            <span className="text-[13px] font-bold text-muted">{V.leadUnit}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">{V.nameValue(lead, netOf(result.me))}</p>

          {/* "Will they say yes?" where "Fairness 90%" used to sit. */}
          <div className="mt-4 rounded-2xl bg-soft p-3.5">
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-muted">{V.willThey}</div>
            <div className={`display mt-1 text-[22px] leading-none ${ACCEPT_INK[result.acceptance] ?? "text-ink"}`}>{V.will[result.acceptance] ?? result.acceptance}</div>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{V.theirLine(result.them.lineup_delta_ros)}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <SideBox label={V.you} side={result.me} />
            <SideBox label={theirName} side={result.them} />
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{result.explanation}</p>
          {result.notes?.map((n) => (
            <p key={n} className="mt-2.5 rounded-xl bg-flip-soft px-3 py-2 text-[13px] leading-snug text-flip">
              {n}
            </p>
          ))}
          <Why lines={V.howLines(result.me.value_out, result.me.value_in)} label={V.how} />
        </div>
      </Card>

      <Card className="rise rise-1">
        <Eyebrow>The read on {theirName}</Eyebrow>
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
        <ShareLink result={result} give={give} get={get} c={c} />
        <div className="mt-3">
          <ShareCard result={result} give={give} get={get} leagueName={c.league_name} />
        </div>
      </section>
    </div>
  );
}

/** Name value in minus out, as printed. An older API sends no `value_net`. */
function netOf(side: TradeResult["me"]): number {
  return side.value_net ?? side.value_in - side.value_out;
}

/** Turns the verdict into a public URL and offers it for copying. */
function ShareLink({ result, give, get, c }: { result: TradeResult; give: Player[]; get: Player[]; c: Connection }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function make() {
    setBusy(true);
    setError(null);
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
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    // In the iPhone app the link goes to the share sheet, which has Copy on it too.
    if (shareInApp(url)) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
    }
  }

  if (!url)
    return (
      <>
        <Button variant="secondary" onClick={make} busy={busy} className="w-full">
          {busy ? "Making the link…" : "Make a share link"}
        </Button>
        {error ? <ErrorBox error={error} /> : null}
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

/** One side's numbers, secondary to the lead: the lineup first, then this week, then name value. */
function SideBox({ label, side }: { label: string; side: TradeResult["me"] }) {
  const V = OFFICE.verdict;
  return (
    <div className="min-w-0 rounded-2xl bg-soft p-3.5">
      <div className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`display tnum mt-1 text-[26px] leading-none ${side.lineup_delta_ros >= 0 ? "text-start" : "text-sit"}`}>
        {signed(side.lineup_delta_ros, 0)} <span className="text-[11px] font-bold text-muted">{OFFICE.ros}</span>
      </div>
      <div className="tnum mt-1.5 text-[11px] text-muted">
        {V.weekLabel} {signed(side.lineup_delta_week)}
      </div>
      <div className="tnum mt-0.5 text-[11px] text-muted">
        {V.valueLabel} {V.out} {side.value_out} · {V.in} {side.value_in}
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

/**
 * No entitlement branch here any more.
 *
 * The room is open to everyone and the API decides what is in it: a caller with Trade Lab
 * gets the offers, a caller without gets the same board in preview with the lock under it.
 * `edge/products.py` is still the only thing that says which, and the 402 on `POST /trade`
 * still holds the grade and the counter.
 */
export default function TradePage() {
  return (
    <AppShell section="trade" needsMe wide>
      {(s) => (
        <Suspense fallback={<SkeletonList rows={3} />}>
          <TradeBodyKeyed c={s.connection!} refresh={s.refresh} signedIn={s.signedIn} />
        </Suspense>
      )}
    </AppShell>
  );
}
