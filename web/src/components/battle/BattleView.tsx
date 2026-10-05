"use client";
/**
 * Position Battle: the man in the spot, a challenger, the clash, and the tale of the tape.
 *
 * One page, three beats (Andrew, 2026-10-05). **The corner**: the arena split in half, the
 * man in the spot in the blue corner and an empty red one, with every man who could fight
 * him for it underneath -- your roster, the wire, every other roster as a trade -- cut by
 * position and searchable by name. **The clash**: pick one and the two meet in the middle
 * of the screen (`Clash.tsx`) while the judges score it. **The verdict**: who wins this week,
 * the next five, the rest of the season and the playoffs, then every row of the tape.
 *
 * The URL is the state (`/team/battle?a=&b=`), so a battle survives a refresh and the back
 * button takes the challenger out of the ring. The corner list is free; the verdict is the
 * paid half, and a free reader still gets the whole clash -- the faces, the hit, "Verdict
 * sealed" -- with the engine's name-free sentence on the haze. The clash is the sales pitch.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createShare, getBattle, getBattleOptions } from "@/lib/api";
import { CORNER_TABS, battleHref, cornerList, firstTab, shareBody, shortName, type CornerTab } from "@/lib/battle";
import { useCached } from "@/lib/cache";
import { HttpError } from "@/lib/errors";
import type { Connection } from "@/lib/storage";
import type { Battle, BattleBrief, BattleOptions, BattleResult } from "@/lib/types";
import { BATTLE, PLAYER } from "@/lib/vocab";
import { GhostRows, Locked } from "../Locked";
import { usePlayerSheet } from "../player/PlayerSheetProvider";
import { IconChevron, IconClash } from "../icons";
import { Button, ErrorBox, H2, InjuryTag, Opening } from "../ui";
import { Avatar } from "../Avatar";
import { Clash } from "./Clash";
import { Corner, whereLine } from "./Fighter";
import { Headline, Horizons, Road, TaleOfTheTape, WhyWeek } from "./Tape";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function BattleView({ c, a, b, signedIn }: { c: Connection; a: string; b: string | null; signedIn: boolean }) {
  const router = useRouter();
  const opts = useCached<BattleOptions>(`battle-options:${c.platform}:${c.league_id}:${c.team_id}:${a}`, () =>
    getBattleOptions(c.platform, c.league_id, c.team_id, a),
  );
  const key = b ? `${a}:${b}` : null;
  // The fight, fetched the moment a challenger is in. Kept with the key it answers, so a
  // fast second pick can never show the first pick's verdict.
  const [fight, setFight] = useState<{ key: string; result?: BattleResult; error?: unknown } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!b || !key) return;
    let alive = true;
    getBattle(c.platform, c.league_id, c.team_id, a, b).then(
      (result) => alive && setFight({ key, result }),
      (error) => alive && setFight({ key, error }),
    );
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, a, b, key, nonce]);
  const current = fight && fight.key === key ? fight : null;
  // The clash plays for a pick, and for a battle opened from a link. Never under reduced motion.
  const [clashing, setClashing] = useState<string | null>(() => (key && !reducedMotion() ? key : null));

  function pick(id: string) {
    const next = `${a}:${id}`;
    if (!reducedMotion()) setClashing(next);
    router.replace(battleHref(a, id), { scroll: false });
    window.scrollTo({ top: 0 });
  }

  if (opts.cause instanceof HttpError && opts.cause.status === 404) {
    return (
      <div className="card p-5">
        <H2>{PLAYER.notFoundHead}</H2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{PLAYER.notFoundLine}</p>
      </div>
    );
  }
  if (opts.error) return <ErrorBox message={opts.error} onRetry={opts.reload} />;
  if (!opts.data) return <Opening />;
  const o = opts.data;
  const challenger = b ? [...o.roster, ...o.wire, ...o.trade].find((r) => r.id === b) ?? null : null;
  const spot = o.player.where.kind === "starter" ? o.player.where.label : o.player.position;

  return (
    <div>
      {clashing && clashing === key && challenger && (
        <Clash a={o.player} b={challenger} spot={spot} result={current?.result ?? null} onDone={() => setClashing(null)} />
      )}
      <Arena a={o.player} b={challenger} spot={spot} result={current?.result ?? null} />
      {!b || !challenger ? (
        <Picker o={o} onPick={pick} />
      ) : current?.error ? (
        <div className="mt-4">
          <ErrorBox error={current.error} onRetry={() => setNonce((n) => n + 1)} />
        </div>
      ) : !current?.result ? (
        <div className="mt-6">
          <Opening />
        </div>
      ) : current.result.locked ? (
        <div className="mt-4">
          <Locked sku="battle" what={BATTLE.lockedWhat} teaser={current.result.teaser} signedIn={signedIn} onUnlocked={() => setNonce((n) => n + 1)}>
            <Sketch />
          </Locked>
          <Rematch onClick={() => router.replace(battleHref(a), { scroll: false })} />
        </div>
      ) : (
        <Result battle={current.result.battle} c={c} onRematch={() => router.replace(battleHref(a), { scroll: false })} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- the arena --- */

function Arena({ a, b, spot, result }: { a: BattleBrief; b: BattleBrief | null; spot: string; result: BattleResult | null }) {
  const battle = result && !result.locked ? result.battle : null;
  return (
    <section className="arena px-3 pb-5 pt-4">
      <p className="eyebrow relative text-center text-[#ff8a90]">{BATTLE.eyebrow(spot)}</p>
      <div className="arena-ring mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-1">
        <Corner p={a} side="a" spot={spot} />
        <span className="arena-vs mt-[38px] text-[30px] min-[380px]:mt-[46px] min-[380px]:text-[34px]" aria-hidden>
          {BATTLE.vs}
        </span>
        {b ? (
          <Corner p={b} side="b" />
        ) : (
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff9aa0]">{BATTLE.corners.b}</span>
            <span className="fighter-face fighter-empty flex h-[88px] w-[88px] items-center justify-center text-[34px] font-black text-white/40 min-[380px]:h-[104px] min-[380px]:w-[104px]">
              ?
            </span>
            <span className="display text-[15px] leading-tight text-white/85">{BATTLE.pickHead}</span>
          </div>
        )}
      </div>
      {battle && <Headline battle={battle} />}
      {result?.locked && (
        <p className="display relative mt-5 text-center text-[clamp(26px,8vw,34px)] leading-none slam">{BATTLE.clash.sealed}</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- the corner --- */

function Picker({ o, onPick }: { o: BattleOptions; onPick: (id: string) => void }) {
  const [pos, setPos] = useState<string | null>(o.player.position);
  const [tab, setTab] = useState<CornerTab>(() => firstTab(o, o.player.position));
  const [q, setQ] = useState("");
  const rows = cornerList(o, tab, pos, q);
  return (
    <section className="mt-4">
      <p className="text-[14px] leading-snug text-ink-2">{BATTLE.pickLine}</p>
      <div role="tablist" aria-label={BATTLE.tabAria} className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-soft p-1">
        {CORNER_TABS.map((t) => {
          const on = t === tab && !q;
          const n = cornerList(o, t, pos, "").length;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={on}
              onClick={() => {
                setTab(t);
                setQ("");
              }}
              className={`min-h-11 rounded-xl px-1 text-[13px] font-black ${on ? "bg-paper text-ink shadow-[var(--shadow-card)]" : "text-muted"}`}
            >
              {BATTLE.tabs[t]} <span className="tnum text-[11px] font-bold text-muted">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {[...o.positions, null].map((p) => (
          <button
            key={p ?? "all"}
            onClick={() => setPos(p)}
            aria-pressed={pos === p}
            className={`min-h-9 rounded-full border px-3 text-[12px] font-black ${pos === p ? "border-clash bg-clash text-white" : "border-line-2 text-ink-2"}`}
          >
            {p ?? BATTLE.allPositions}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={BATTLE.search}
        aria-label={BATTLE.searchAria}
        className="mt-2.5 min-h-11 w-full rounded-xl border border-line-2 bg-paper px-3.5 text-[15px] text-ink placeholder:text-muted"
      />
      <ul className="mt-2.5 grid gap-1.5" data-testid="battle-corner">
        {rows.length === 0 && (
          <li className="card p-4 text-[13.5px] text-muted">{q ? BATTLE.noMatch(q) : BATTLE.noneHere}</li>
        )}
        {rows.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => onPick(r.id)}
              aria-label={BATTLE.pickAria(r.name)}
              className="card flex w-full items-center gap-3 p-3 text-left transition-transform active:scale-[0.99]"
            >
              <Avatar name={r.name} photo={r.photo} teamLogo={r.team_logo} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-black">{r.name}</span>
                  <InjuryTag status={r.injury_status} />
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-muted">
                  {[r.position, r.nfl_team ?? "FA"].join(" · ")} · {whereLine(r)}
                </span>
              </span>
              <span className="grid shrink-0 grid-cols-2 gap-x-3 text-right">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-muted">{BATTLE.rowProj}</span>
                <span className="text-[9.5px] font-black uppercase tracking-wide text-muted">{BATTLE.rowRos}</span>
                <span className="text-[14px] font-black tnum">{r.projected.toFixed(1)}</span>
                <span className="text-[14px] font-black tnum">{r.ros.toFixed(0)}</span>
              </span>
              <IconClash size={18} className="shrink-0 text-clash" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ the verdict --- */

function Result({ battle, c, onRematch }: { battle: Battle; c: Connection; onRematch: () => void }) {
  const sheet = usePlayerSheet();
  return (
    <div className="mt-4">
      <Horizons battle={battle} />
      <WhyWeek battle={battle} />
      <TaleOfTheTape battle={battle} />
      <Road battle={battle} />
      <div className="mt-5 grid gap-2">
        <ShareBattle battle={battle} c={c} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => sheet.open(battle.a.id)}>
            {BATTLE.openPage(shortName(battle.a.name))}
          </Button>
          <Button variant="secondary" onClick={() => sheet.open(battle.b.id)}>
            {BATTLE.openPage(shortName(battle.b.name))}
          </Button>
        </div>
        <Rematch onClick={onRematch} />
      </div>
    </div>
  );
}

function Rematch({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 text-[13px] font-black text-clash">
      <IconClash size={16} />
      {BATTLE.rematch}
      <IconChevron size={12} strokeWidth={2.8} />
    </button>
  );
}

/** Under the haze: the shape of the verdict and the tape, never the numbers. */
function Sketch() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="horizon h-[118px]" />
        ))}
      </div>
      <div className="mt-4">
        <GhostRows n={6} faces={false} />
      </div>
    </div>
  );
}

function ShareBattle({ battle, c }: { battle: Battle; c: Connection }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const r = await createShare({ kind: "battle", battle: shareBody(battle), league_name: c.league_name, week: battle.week });
      setUrl(r.url);
      if (typeof navigator !== "undefined" && navigator.share) {
        navigator.share({ title: BATTLE.title, url: r.url }).catch(() => undefined);
      }
    } catch (e) {
      setError(e);
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
      /* the link is on screen to copy by hand */
    }
  }

  if (!url) {
    return (
      <div>
        <Button onClick={make} busy={busy} className="battle-door w-full !shadow-none">
          {busy ? BATTLE.sharing : BATTLE.share}
        </Button>
        {error ? (
          <div className="mt-2">
            <ErrorBox error={error} />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-soft p-2">
      <code className="min-w-0 flex-1 truncate px-1 text-[13px]">{url}</code>
      <Button size="sm" onClick={copy}>
        {copied ? BATTLE.copied : BATTLE.copy}
      </Button>
    </div>
  );
}
