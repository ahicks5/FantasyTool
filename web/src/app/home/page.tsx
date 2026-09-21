"use client";
/** The call sheet: this week's ranked moves, each one checkable. The app's home screen. */
import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/Shell";
import { ActionCard } from "@/components/ActionCard";
import { CheckBack, Countdown, ErrorBox, Eyebrow, OnAirLive, Opening, Stamp, useHeldWait } from "@/components/ui";
import { Alarm } from "@/components/Alarm";
import type { Alarm as AlarmState } from "@/lib/gameday.ts";
import { MatchupCell } from "@/components/MatchupCell";
import { SheetGroup, SheetRoom } from "@/components/SheetGroup";
import { Standing } from "@/components/Standing";
import { LastWeek } from "@/components/LastWeek";
import { getActions, getLineup, sendFeedback } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { calledKey, sheetStatus } from "@/lib/format";
import { groupStatus, sheetRows } from "@/lib/sheet";
import { deadlineNote, type DeadlineNote } from "@/lib/deadline.ts";
import { alarm } from "@/lib/gameday.ts";
import { loadCalled, saveCalled, type Connection } from "@/lib/storage";
import { CLOSED, type GroupKey } from "@/lib/vocab";
import type { Action, ActionFeed, Lineup } from "@/lib/types";

function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** A hold is the staff telling you to stand pat — it is not a call you tick off. */
const isCallable = (a: Action) => !a.locked && a.type !== "hold";

/**
 * The deadline a bench row carries, if any.
 *
 * The lineup row is the interesting case, and it gets its note only while kickoff is
 * still `open` — more than a day out. Two reasons, and they point the same way.
 *
 * Inside a day `deadlineNote` renders the team's deadline as a live countdown, but this
 * is computed once per render: nothing here ticks, so the row would sit on a frozen
 * "Locks 04:11:32" that is wrong a second later. A stopped clock is worse than no clock.
 *
 * And it would be a second clock for a fact the screen already carries. `Countdown` is in
 * the call-sheet band a few hundred pixels above, live, and inside two hours it takes the
 * brand's red while the lamp quickens. So the row states the deadline while it is far
 * enough away to be reference, and hands it to the band once it is tense — one clock per
 * fact, and the loud one is the one that is actually running.
 *
 * Waivers and trade have no clock anywhere else, and neither counts in seconds: a waiver
 * night and a deadline week do not go stale between renders.
 */
function rowNote(key: GroupKey, feed: ActionFeed): DeadlineNote | null {
  const note = deadlineNote(key, feed.deadlines, feed.week);
  if (key === "team" && note?.urgency !== "open") return null;
  return note;
}

/**
 * The call sheet header. The one dark surface on the screen, printed with a
 * ruled grid, carrying the three things you need before kickoff: what week it
 * is, how long you have, and how much of the sheet you have worked through.
 *
 * The matchup used to hang off the bottom of this panel, which buried the week's
 * scoreline below three folds of hero. It is its own cell above the sheet now
 * (`MatchupCell`), where it is the first thing under the title.
 */
function Sheet({ feed, c, called, total, animate }: { feed: ActionFeed; c: Connection; called: number; total: number; animate: boolean }) {
  const delta = feed.projected_total - feed.current_total;
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
        {/* The engine's summary counts what is *outstanding* ("4 moves to make"), so once
            every call is ticked it counts down to nothing and the hero is left asserting
            a number that is no longer the point — and an instruction nobody has left to
            follow. The closed line is the answer to the question the sheet was opened
            with, and it only exists client-side because only the browser knows which
            calls this reader has ticked. */}
        <h1 className="display mt-2 text-[30px] leading-[1.08] text-white">{done ? CLOSED.head : feed.summary}</h1>
        {/* The total does not count up here. It sits inside a sentence, and a figure that
            eases from 0.0 to 121.4 re-wraps the whole paragraph while it climbs — the
            reserved width stops the reflow but not the reading. The scoreboard number
            below is the one that gets to animate. */}
        {/* "Projected 103.6 +0.1 if you make every call" was sixty-one characters on a
            forty-five character line, so it wrapped and took a third of the hero. The
            upside reads as where-to-where instead: two numbers and an arrow say the same
            thing in five characters, and say it better, because the old form printed the
            *finished* total and then a gain you could not locate against it. The arrow is
            decorative to a screen reader, which gets the word instead. */}
        <p className="mt-2.5 text-[13px] text-white/60">
          Synced {ago(feed.synced_at)} · Projected{" "}
          {delta > 0.05 ? (
            <>
              <span className="tnum">{feed.current_total.toFixed(1)}</span>
              <span aria-hidden> → </span>
              <span className="sr-only"> rising to </span>
              <span className="tnum font-bold text-start">{feed.projected_total.toFixed(1)}</span>
              <span className="sr-only"> if you make every call</span>
            </>
          ) : (
            <span className="tnum font-bold text-white">{feed.projected_total.toFixed(1)}</span>
          )}
        </p>

        {/* Where the season stands, under where the week stands. The line above is this
            kickoff; this one is the only thing on the call sheet that looks past it, and
            it is the free reader's whole answer to "how am I doing" — the tab that
            answers it properly is the one they have not paid for. Its own component
            because it fetches its own two reads and must be allowed to fail on its own:
            the hero is built from the feed and nothing in it may wait on a scorecard. */}
        <Standing platform={c.platform} leagueId={c.league_id} teamId={c.team_id} />

        {/* And under where the season stands, whether we were right the last time we told
            this reader something. Free for everyone (D4): one line here, the per-call
            detail behind the film. It rides on the feed already in hand, so unlike the
            standing line it needs no request and no reserved height — it is either there
            on the first paint or not there at all, which is the normal case until a week
            has finished with a recorded call in it. */}
        <LastWeek week={feed.last_week} />

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
            {/* A finished sheet used to end here, and a page that goes quiet reads as one
                that failed to load. The appointment is the close. */}
            {done && <CheckBack className="mt-2.5" />}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The sheet and its calls. Mounted under a key of `storageKey`, so a new week (or a
 * different league) remounts this with its own ticks read once, in the initialiser —
 * rather than syncing local state to a prop inside an effect.
 */
function CallSheet({ feed, c, storageKey, animate, warning }: { feed: ActionFeed; c: Connection; storageKey: string; animate: boolean; warning: AlarmState | null }) {
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
  // Grouped by the tab that owns each call, but numbered by the server's ranking across
  // the whole sheet — `lib/sheet.ts` carries both halves and the reason. Rooms you read
  // ride along after the benches, so the front door shows the whole building.
  const rows = useMemo(() => sheetRows(feed.actions), [feed]);

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
      <Sheet feed={feed} c={c} called={calledCount} total={callable.length} animate={animate} />
      {/* Three benches, in tab order, always all three — the empty one is the point.
          `min-w-0` on the items: a grid track defaults to `min-width: auto`, and a
          clamped card title is a `-webkit-box` whose min-content width is the whole
          string, so without this one card stretches the sheet sideways. */}
      <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3.5">
        {rows.map((row, gi) =>
          row.kind === "room" ? (
            <li key={row.key} className="min-w-0">
              <SheetRoom room={row.key} animate={animate} delay={gi + 1} />
            </li>
          ) : (
          <li key={row.key} className="min-w-0">
            <SheetGroup
              group={row.key}
              note={rowNote(row.key, feed)}
              status={groupStatus(row.key, row.items)}
              count={row.items.length}
              // Collapsed is the default, so a group that is fully worked through has to
              // say so on the row itself. Otherwise the greyed-out cards proving it are
              // behind a tap and the sheet looks the same at 0 of 3 as at 3 of 3.
              done={row.items.filter(({ action }) => isCallable(action) && called.includes(action.id)).length}
              total={row.items.filter(({ action }) => isCallable(action)).length}
              animate={animate}
              delay={gi + 1}
            >
              {row.items.map(({ action: a, n }) => (
                <li key={a.id} className="min-w-0">
                  <ActionCard
                    a={a}
                    n={n}
                    delay={n}
                    animate={animate}
                    called={called.includes(a.id)}
                    leagueName={feed.league}
                    week={feed.week}
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
            </SheetGroup>
          </li>
          ),
        )}
      </ol>
      <p className={`mx-auto mt-7 max-w-[19rem] text-center text-[13px] leading-relaxed text-muted ${animate ? "rise rise-5" : ""}`}>
        {feed.footer}
      </p>
    </div>
  );
}

function HomeBody({ c }: { c: Connection }) {
  // Cached for the session, so coming back to this tab paints the sheet on the
  // first frame instead of opening the room all over again.
  const { data: feed, error, instant, reload } = useCached<ActionFeed>(
    `actions:${c.platform}:${c.league_id}:${c.team_id}`,
    () => getActions(c.platform, c.league_id, c.team_id),
  );

  // The depth chart's own payload, fetched here only to answer "is anything broken".
  //
  // Deliberately a second request rather than a new field on the action feed: it is the
  // same cache key the depth chart uses, so `useCached` de-duplicates and this warms that
  // tab instead of costing it, and it needs no API deploy to ship.
  //
  // Its `error` is swallowed on purpose. The call sheet is the product and paints from
  // its own feed; a lineup that fails to load must cost the reader a banner, never the
  // page. The banner is additive -- nothing below it changes shape when it is absent.
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
  // Per league and per week, so a new week always starts with a clean sheet.
  const key = calledKey(c.league_id, feed.week);
  return <CallSheet key={key} storageKey={key} feed={feed} c={c} animate={!instant} warning={warning} />;
}

export default function HomePage() {
  return (
    <AppShell section="home">
      {(s) => <HomeBody c={s.connection!} />}
    </AppShell>
  );
}
