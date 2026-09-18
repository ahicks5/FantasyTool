"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { ActionCard } from "@/components/ActionCard";
import { ErrorBox, Eyebrow, Skeleton, SkeletonList, SplitMeter } from "@/components/ui";
import { getActions, sendFeedback } from "@/lib/api";
import { pct, signed } from "@/lib/format";
import type { Connection } from "@/lib/storage";
import type { ActionFeed } from "@/lib/types";

function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** The dark surface is the only one on screen, so it reads as the headline by material. */
function Hero({ feed }: { feed: ActionFeed }) {
  const delta = feed.projected_total - feed.current_total;
  const m = feed.matchup;
  const showMatchup = m && m.opponent && m.win_prob !== null && m.their_proj !== null;
  return (
    <section className="hero overflow-hidden rise">
      <div className="p-6">
        <Eyebrow>
          Week {feed.week} · {feed.team}
        </Eyebrow>
        <h1 className="display mt-2 text-[30px] leading-[1.08] text-white">{feed.summary}</h1>
        <p className="mt-2.5 text-[13px] text-white/60">
          Synced {ago(feed.synced_at)} · Projected{" "}
          <span className="tnum font-bold text-white">{feed.projected_total.toFixed(1)}</span>
          {delta > 0.05 && <span className="tnum font-bold text-start"> {signed(delta)} if you make the swaps</span>}
        </p>
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

function HomeBody({ c }: { c: Connection }) {
  const [feed, setFeed] = useState<ActionFeed | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getActions(c.platform, c.league_id, c.team_id)
      .then((f) => alive && setFeed(f))
      .catch((e: unknown) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, tick]);

  const load = () => {
    setError(null);
    setFeed(null);
    setTick((t) => t + 1);
  };

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!feed)
    return (
      <div className="grid gap-4">
        <div className="hero p-6">
          <Skeleton className="h-3 w-32 opacity-30" />
          <Skeleton className="mt-3 h-8 w-56 opacity-30" />
          <Skeleton className="mt-3 h-3 w-40 opacity-30" />
        </div>
        <SkeletonList rows={3} tall />
      </div>
    );

  return (
    <div>
      <Hero feed={feed} />
      <ol className="mt-4 grid gap-3.5">
        {feed.actions.map((a, i) => (
          <li key={a.id}>
            <ActionCard
              a={a}
              delay={i + 1}
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
      <p className="mx-auto mt-7 max-w-[19rem] text-center text-[13px] leading-relaxed text-muted rise rise-5">{feed.footer}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell title="This week" hideTitle>
      {(s) => <HomeBody c={s.connection!} />}
    </AppShell>
  );
}
