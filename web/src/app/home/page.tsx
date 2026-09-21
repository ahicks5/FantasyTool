"use client";
/** The Debrief: one memo per department, each with the one thing it needs you to see. */
import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/Shell";
import { ErrorBox, Opening, useHeldWait } from "@/components/ui";
import { Alarm } from "@/components/Alarm";
import type { Alarm as AlarmState } from "@/lib/gameday.ts";
import { MatchupCell } from "@/components/MatchupCell";
import { ActionMemo, FilmMemo } from "@/components/Memo";
import { Standing } from "@/components/Standing";
import { LastWeek } from "@/components/LastWeek";
import { getActions, getLineup, sendFeedback } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { calledKey, dismissedKey } from "@/lib/format";
import { dismissable, memos } from "@/lib/sheet";
import { deadlineNote, type DeadlineNote } from "@/lib/deadline.ts";
import { alarm } from "@/lib/gameday.ts";
import { loadCalled, loadDismissed, saveCalled, saveDismissed, type Connection } from "@/lib/storage";
import { ROOMS, type GroupKey } from "@/lib/vocab";
import type { ActionFeed, Lineup } from "@/lib/types";

function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/**
 * The deadline a memo carries in its header, if any.
 *
 * The lineup memo is the interesting case, and it gets its note only while kickoff is
 * still `open` — more than a day out. The rule came off the bench row this memo
 * replaces and both of its reasons still hold.
 *
 * Inside a day `deadlineNote` renders the deadline as a live countdown, but this is
 * computed once per render: nothing here ticks, so the memo would sit on a frozen
 * "Locks 04:11:32" that is wrong a second later. A stopped clock is worse than no clock.
 *
 * And it would be a second clock for a fact the screen already carries. The kickoff
 * countdown is on the starters plate above, live, and inside two hours it takes the
 * brand's red — which is allowed there, on the page's one dark surface, and nowhere
 * else. So the memo states the deadline while it is far enough away to be reference,
 * and hands it to the plate once it is tense. One clock per fact, and the loud one is
 * the one that is actually running.
 *
 * Waivers and trade have no clock anywhere else, and neither counts in seconds: a
 * waiver night and a deadline week do not go stale between renders.
 */
function memoNote(key: GroupKey, feed: ActionFeed): DeadlineNote | null {
  const note = deadlineNote(key, feed.deadlines, feed.week);
  if (key === "team" && note?.urgency !== "open") return null;
  return note;
}

/**
 * The Debrief itself.
 *
 * Mounted under a key of `storageKey`, so a new week (or a different league) remounts
 * this with its own ticks and its own dismissals read once, in the initialisers, rather
 * than syncing local state to a prop inside an effect.
 */
function CallSheet({
  feed,
  c,
  storageKey,
  animate,
  warning,
  lineup,
}: {
  feed: ActionFeed;
  c: Connection;
  storageKey: string;
  animate: boolean;
  warning: AlarmState | null;
  lineup: Lineup | null;
}) {
  const [called, setCalled] = useState<string[]>(() => loadCalled(storageKey));
  const dismissKey = dismissedKey(c.league_id, feed.week);
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed(dismissKey));

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

  /**
   * A thumbs-down takes the item off this page for the rest of the week (D5).
   *
   * It is stored, not just dropped from state, so a reload does not resurrect the call
   * the reader has already refused. And it is *only* the Debrief: the depth chart, the
   * wire and the trade board stay complete, because hiding a call from the page that
   * summarises the week is a different act from deleting it from the room where it is
   * worked. The feedback itself has already gone to the API either way — this write is
   * about what the reader sees next, not about what we recorded.
   */
  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        saveDismissed(dismissKey, next);
        return next;
      });
    },
    [dismissKey],
  );

  const rows = useMemo(() => memos(feed.actions, dismissed), [feed, dismissed]);

  return (
    <div>
      {warning && (
        <div className="mb-3.5">
          <Alarm alarm={warning} animate={animate} />
        </div>
      )}
      {feed.matchup && (
        <div className="mb-3.5">
          <MatchupCell m={feed.matchup} animate={animate} />
        </div>
      )}

      {/* The one line the hero used to shout (D3). `feed.summary` is still the engine's
          own headline — the landing page's worked example is pinned to it and the weekly
          email prints it — but it is a sentence now rather than a panel, because the
          space it used to fill belongs to the departments. "Synced …" rides with it: the
          two are one fact, which is how current this page is. */}
      <p className={`px-1 text-[13px] text-muted ${animate ? "rise" : ""}`}>
        <span className="font-bold text-ink">{feed.summary}</span> · Synced {ago(feed.synced_at)}
      </p>

      {/* Four memos, in tab order, always all four — the quiet one is the point.
          `min-w-0` on the items: a grid track defaults to `min-width: auto`, and a
          clamped card title is a `-webkit-box` whose min-content width is the whole
          string, so without this one memo stretches the page sideways. */}
      <ol className="mt-3.5 grid grid-cols-[minmax(0,1fr)] gap-3.5">
        {rows.map((memo, i) => (
          <li key={memo.key} className="min-w-0">
            {memo.key === "report" ? (
              <FilmMemo animate={animate} delay={i + 1}>
                {/* How last week's calls landed, then where the season stands. Both free
                    for every reader (D4, D6). `last_week` is null far more often than
                    not — week 1, a reader who connected on Wednesday, an ESPN league
                    whose scoreline carries nobody's points — and the room says what it
                    is for rather than going blank. */}
                {feed.last_week ? (
                  <LastWeek week={feed.last_week} tone="card" />
                ) : (
                  <p className="text-[14px] font-semibold text-muted">{ROOMS.report.line}</p>
                )}
                <Standing platform={c.platform} leagueId={c.league_id} teamId={c.team_id} tone="card" />
              </FilmMemo>
            ) : (
              <ActionMemo
                dept={memo.key}
                item={memo.item?.action ?? null}
                // The lineup's count comes off the depth chart's own payload, not the
                // feed: `actions.py` caps at five calls across the whole sheet and drops
                // swaps inside the noise band, so the feed under-counts exactly the tab
                // that lists them all. The other two have no such second source, and the
                // feed's own count is the honest one for them.
                more={
                  memo.key === "team" && lineup
                    ? Math.max(0, lineup.changes.length - 1)
                    : memo.more
                }
                note={memoNote(memo.key, feed)}
                called={!!memo.item && called.includes(memo.item.action.id)}
                onCall={memo.item && dismissable(memo.item.action) ? () => toggle(memo.item!.action.id) : undefined}
                leagueName={feed.league}
                week={feed.week}
                animate={animate}
                delay={i + 1}
                onFeedback={(verdict, reason) => {
                  const id = memo.item?.action.id;
                  if (!id) return;
                  void sendFeedback({
                    platform: c.platform,
                    league_id: c.league_id,
                    team_id: c.team_id,
                    action_id: id,
                    action_type: memo.item!.action.type,
                    verdict,
                    reason,
                    week: feed.week,
                  }).catch(() => undefined);
                  // "Wrong" is the one verdict that changes the page. A thumbs-up is
                  // noted and the call stays: agreeing with a call is not a reason to
                  // stop being shown it before you have made it.
                  if (verdict === "wrong") dismiss(id);
                }}
              />
            )}
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
  // Cached for the session, so coming back to this tab paints the memos on the
  // first frame instead of opening the room all over again.
  const { data: feed, error, instant, reload } = useCached<ActionFeed>(
    `actions:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getActions(c.platform, c.league_id, c.team_id),
  );

  // The depth chart's own payload. It answers "is anything broken" for the alarm banner
  // and "how many swaps are there really" for the head coach's memo.
  //
  // Deliberately a second request rather than a new field on the action feed: it is the
  // same cache key the depth chart uses, so `useCached` de-duplicates and this warms that
  // tab instead of costing it, and it needs no API deploy to ship.
  //
  // Its `error` is swallowed on purpose. The Debrief is the product and paints from its
  // own feed; a lineup that fails to load must cost the reader a banner and a count,
  // never the page.
  const { data: lineup } = useCached<Lineup>(
    `lineup:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getLineup(c.platform, c.league_id, c.team_id),
  );

  // One clock per mount, in an initialiser rather than the render body: `alarm` compares
  // news timestamps against it, and a clock re-read every render makes the judgement drift
  // under React — the same reason the depth chart reads it once. Declared here, above the
  // early returns, because a hook after one runs in a different order on the render that
  // takes the branch.
  const [now] = useState(() => Date.now());

  // Held so a warm API cannot cut the opening off mid-sentence; zero cost once it has played.
  const waiting = useHeldWait(!!feed);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (waiting || !feed) return <Opening />;

  const warning = lineup ? alarm(lineup, now) : null;
  // Per league and per week, so a new week always starts with a clean page.
  const key = calledKey(c.league_id, feed.week);
  return <CallSheet key={key} storageKey={key} feed={feed} c={c} animate={!instant} warning={warning} lineup={lineup} />;
}

export default function HomePage() {
  return (
    <AppShell section="home">
      {(s) => <HomeBody c={s.connection!} />}
    </AppShell>
  );
}
