"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/Shell";
import { ActionCard } from "@/components/ActionCard";
import { Eyebrow, ErrorBox, SkeletonList, Skeleton } from "@/components/ui";
import { getActions, sendFeedback } from "@/lib/api";
import { signed } from "@/lib/format";
import type { Connection } from "@/lib/storage";
import type { ActionFeed } from "@/lib/types";

function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function HomeBody({ c }: { c: Connection }) {
  const [feed, setFeed] = useState<ActionFeed | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    getActions(c.platform, c.league_id, c.team_id)
      .then((f) => alive && setFeed(f))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [c.platform, c.league_id, c.team_id, tick]);
  const load = () => {
    setError("");
    setFeed(null);
    setTick((t) => t + 1);
  };

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!feed)
    return (
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-32" />
        <div className="mt-6">
          <SkeletonList rows={3} tall />
        </div>
      </div>
    );

  const delta = feed.projected_total - feed.current_total;
  return (
    <div>
      <header className="rise">
        <Eyebrow>
          Week {feed.week} — {feed.team}
        </Eyebrow>
        <h1 className="display mt-1 text-3xl font-black leading-tight">{feed.summary}</h1>
        <p className="mt-1 text-sm text-muted">
          Synced {ago(feed.synced_at)} · Projected <span className="font-bold text-ink tabular-nums">{feed.projected_total.toFixed(1)}</span>
          {delta > 0.05 && <span className="font-bold text-start tabular-nums"> ({signed(delta)} if you make the swaps)</span>}
        </p>
      </header>

      <ol className="mt-5 grid gap-3">
        {feed.actions.map((a, i) => (
          <li key={a.id}>
            <ActionCard
              a={a}
              delay={i + 1}
              onFeedback={(verdict, reason) =>
                sendFeedback({ platform: c.platform, league_id: c.league_id, team_id: c.team_id, action_id: a.id, action_type: a.type, verdict, reason, week: feed.week }).catch(() => undefined)
              }
            />
          </li>
        ))}
      </ol>

      <p className="mt-6 text-center text-sm text-muted rise rise-5">{feed.footer}</p>
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
