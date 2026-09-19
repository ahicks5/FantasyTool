"use client";
import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/Shell";
import { ActionCard } from "@/components/ActionCard";
import { BoothOpening, Countdown, ErrorBox, Eyebrow, OnAirLive, SplitMeter, Stamp, useCountUp } from "@/components/ui";
import { getActions, sendFeedback } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { calledKey, pct, sheetStatus, signed } from "@/lib/format";
import { loadCalled, saveCalled, type Connection } from "@/lib/storage";
import type { Action, ActionFeed } from "@/lib/types";

function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** A hold is the staff telling you to stand pat — it is not a call you tick off. */
const isCallable = (a: Action) => !a.locked && a.type !== "hold";

/**
 * The call sheet header. The one dark surface on the screen, printed with a
 * ruled grid, carrying the three things you need before kickoff: what week it
 * is, how long you have, and how much of the sheet you have worked through.
 */
function Sheet({ feed, called, total, animate }: { feed: ActionFeed; called: number; total: number; animate: boolean }) {
  const delta = feed.projected_total - feed.current_total;
  const projected = useCountUp(feed.projected_total, 1, animate);
  const m = feed.matchup;
  const showMatchup = m && m.opponent && m.win_prob !== null && m.their_proj !== null;
  const done = total > 0 && called >= total;

  return (
    <section className={`hero callsheet ${animate ? "rise" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <OnAirLive className="text-white/70" />
        <Countdown onHero />
      </div>

      <div className="p-6">
        <Eyebrow>
          Week {feed.week} · {feed.team}
        </Eyebrow>
        <h1 className="display mt-2 text-[30px] leading-[1.08] text-white">{feed.summary}</h1>
        <p className="mt-2.5 text-[13px] text-white/60">
          Synced {ago(feed.synced_at)} · Projected{" "}
          <span className="tnum font-bold text-white">{projected}</span>
          {delta > 0.05 && <span className="tnum font-bold text-start"> {signed(delta)} if you make every call</span>}
        </p>

        {total > 0 && (
          <div className="mt-5">
            <div className="flex min-h-[26px] items-center justify-between gap-3">
              {/* Once the sheet is clean the stamp says so; repeating it as a label
                  beside itself would just be the same words twice. */}
              {done ? (
                // Inked white: the hero is dark in both themes, where status green would vanish.
                <Stamp ink="text-white" slam>
                  Sheet clean
                </Stamp>
              ) : (
                <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/55">{sheetStatus(called, total)}</span>
              )}
            </div>
            <div className="mt-2 flex gap-1.5" role="img" aria-label={sheetStatus(called, total)}>
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < called ? "bg-start" : "bg-white/20"}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showMatchup && (
        <div className="border-t border-white/10 bg-black/20 px-6 py-5">
          <Eyebrow>Matchup</Eyebrow>
          <div className="mt-1 truncate text-[13px] font-bold text-white/85">vs {m.opponent}</div>
          <div className="display tnum mt-1.5 text-[34px] leading-none text-white">
            {m.my_proj.toFixed(1)}
            <span className="mx-1.5 text-white/35">–</span>
            <span className="text-white/55">{m.their_proj!.toFixed(1)}</span>
          </div>
          <div className="mt-3.5">
            <SplitMeter
              left={m.win_prob!}
              right={1 - m.win_prob!}
              leftLabel={`${pct(m.win_prob!)} to win`}
              rightLabel={pct(1 - m.win_prob!)}
              onHero
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The sheet and its calls. Mounted under a key of `storageKey`, so a new week (or a
 * different league) remounts this with its own ticks read once, in the initialiser —
 * rather than syncing local state to a prop inside an effect.
 */
function CallSheet({ feed, c, storageKey, animate }: { feed: ActionFeed; c: Connection; storageKey: string; animate: boolean }) {
  const [called, setCalled] = useState<string[]>(() => loadCalled(storageKey));

  const toggle = useCallback(
    (id: string) => {
      setCalled((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        saveCalled(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  // Only calls you can actually make count toward the sheet, and only ones still on
  // this week's feed — a stale id left in storage must not inflate the count.
  const callable = useMemo(() => feed.actions.filter(isCallable).map((a) => a.id), [feed]);
  const calledCount = useMemo(() => callable.filter((id) => called.includes(id)).length, [callable, called]);

  return (
    <div>
      <Sheet feed={feed} called={calledCount} total={callable.length} animate={animate} />
      <ol className="mt-4 grid gap-3.5">
        {feed.actions.map((a, i) => (
          <li key={a.id}>
            <ActionCard
              a={a}
              n={i + 1}
              delay={i + 1}
              animate={animate}
              called={called.includes(a.id)}
              onCall={isCallable(a) ? () => toggle(a.id) : undefined}
              onFeedback={(verdict, reason) =>
                sendFeedback({
                  platform: c.platform,
                  league_id: c.league_id,
                  team_id: c.team_id,
                  action_id: a.id,
                  action_type: a.type,
                  verdict,
                  reason,
                  week: feed.week,
                }).catch(() => undefined)
              }
            />
          </li>
        ))}
      </ol>
      <p className={`mx-auto mt-7 max-w-[19rem] text-center text-[13px] leading-relaxed text-muted ${animate ? "rise rise-5" : ""}`}>
        {feed.footer}
      </p>
    </div>
  );
}

function HomeBody({ c }: { c: Connection }) {
  // Cached for the session, so coming back to this tab paints the sheet on the
  // first frame instead of opening the booth all over again.
  const { data: feed, error, instant, reload } = useCached<ActionFeed>(
    `actions:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getActions(c.platform, c.league_id, c.team_id),
  );

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!feed) return <BoothOpening />;

  // Per league and per week, so a new week always starts with a clean sheet.
  const key = calledKey(c.league_id, feed.week);
  return <CallSheet key={key} storageKey={key} feed={feed} c={c} animate={!instant} />;
}

export default function HomePage() {
  return (
    <AppShell title="the call sheet" hideTitle>
      {(s) => <HomeBody c={s.connection!} />}
    </AppShell>
  );
}
