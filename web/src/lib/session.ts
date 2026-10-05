"use client";
/** Who is signed in, which league they are looking at, what they have paid for, and the flag on the account. */
import { useEffect, useState } from "react";
import { loadConnection, saveConnection, useConnection, type Connection } from "./storage";
import { getLeague, getMe } from "./api";
import { clearToken, loadToken, onAuthChange } from "./auth";
import { ME_RETRY_MS, REVALIDATE_AFTER_MS, identityKey, retryable, shouldDropToken } from "./identity";
import { pickLeague } from "./account";
import { cacheClear } from "./cache";
import type { Account, Feature, Me, MeLeague } from "./types";

export interface Session {
  loading: boolean;
  connection: Connection | null;
  me: Me | null;
  signedIn: boolean;
  /** The account block, null when signed out. */
  account: Account | null;
  /** The flag the views check: `free` until a pass is held. */
  premium: boolean;
  isAdmin: boolean;
  has: (f: Feature) => boolean;
  refresh: () => void;
}

/**
 * Who is calling, remembered for the session.
 *
 * Every page mounts its own `AppShell`, so without this cache each tab switch
 * reset `loaded` to false and the whole shell showed a loading state again —
 * which is what made flipping tabs look like a reload. The answer to "who is
 * this" does not change while you walk between tabs, so it is fetched once and
 * every later mount starts already knowing it.
 *
 * It is kept honest four ways, so the app never disagrees with itself about whether you
 * are signed in:
 *  - a sign-in or sign-out in this tab or another (`onAuthChange`) drops it at once;
 *  - coming back to the tab after a minute, or through the back button (bfcache), checks
 *    again in the background and repaints only if something changed (`revalidate`);
 *  - a failed check is retried and never read as "signed out": the last answer stands
 *    until a real one arrives (`ME_RETRY_MS`);
 *  - an answer that left before a sign-in or sign-out is thrown away (`generation`).
 */
let cachedMe: Me | null = null;
/** The token the cached answer was asked with: if storage now holds another, the answer is stale. */
let cachedFor: string | null = null;
let meLoaded = false;
/** The last check failed (or a background check is due): the next ask goes to the API. */
let meStale = false;
let checkedAt = 0;
let mePending: Promise<void> | null = null;
/** Bumped by every sign-in and sign-out, so an answer that left before one is not believed. */
let generation = 0;
/** Bumped by sign-in and sign-out, so every mounted `useSession` refetches at once. */
const bumpers = new Set<() => void>();
let wired = false;

function dropMe() {
  generation += 1;
  meLoaded = false;
  meStale = false;
  mePending = null;
  cachedMe = null;
  cachedFor = null;
  cacheClear();
}

function bumpAll() {
  bumpers.forEach((b) => b());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `GET /api/me`, asked again through a redeploy or a cold start. A 4xx is an answer. */
async function fetchMe(gen: number): Promise<Me> {
  for (let i = 0; ; i++) {
    try {
      return await getMe();
    } catch (err) {
      if (i >= ME_RETRY_MS.length || !retryable(err) || gen !== generation) throw err;
      await sleep(ME_RETRY_MS[i]);
    }
  }
}

/** The current answer, fetched once. For code outside React (the gate) that needs to know now. */
export function currentMe(): Promise<Me | null> {
  if (meLoaded && !meStale) return Promise.resolve(cachedMe);
  if (!mePending) {
    const gen = generation;
    const sent = typeof window === "undefined" ? null : loadToken();
    mePending = fetchMe(gen)
      .then((m) => {
        if (gen !== generation) return;
        cachedMe = m;
        cachedFor = sent;
        meStale = false;
        checkedAt = Date.now();
        // A token the API no longer knows (signed out elsewhere, expired, the store reset)
        // is dropped here, so the door reads "Sign in" and the next save asks properly.
        if (shouldDropToken(sent, loadToken(), m)) clearToken();
      })
      .catch(() => {
        // Not an answer: keep whatever we knew, and ask again on the next mount, focus or
        // reconnect. Reading a failed call as "signed out" is what made sign-in look flaky.
        if (gen === generation) meStale = true;
      })
      .finally(() => {
        if (gen !== generation) return;
        meLoaded = true;
        mePending = null;
      });
  }
  const gen = generation;
  // If a sign-in or sign-out landed while this was in flight, wait for the answer to that.
  return mePending.then(() => (gen === generation ? cachedMe : currentMe()));
}

/**
 * Check again without a loading state: the page stays as it is, and repaints only if the
 * answer changed (signed out in another tab, a pass bought on the phone, a league linked).
 */
export function revalidate(): void {
  if (typeof window === "undefined" || mePending) return;
  if (loadToken() !== cachedFor && meLoaded) {
    // Storage holds another token than the one we asked with: a sign-in or sign-out we
    // missed (a tab frozen in the back-forward cache gets no storage events).
    dropMe();
    bumpAll();
    return;
  }
  if (!meLoaded) return;
  const before = identityKey(cachedMe);
  meStale = true;
  void currentMe().then((after) => {
    if (identityKey(after) === before) return;
    cacheClear(); // what the API will return has changed with who is asking
    bumpAll();
  });
}

/** Window events that keep the answer honest. Once per page, however many hooks mount. */
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  // A sign-in or sign-out anywhere drops the cached answer and wakes every mounted hook.
  onAuthChange(() => {
    dropMe();
    bumpAll();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (meStale || Date.now() - checkedAt > REVALIDATE_AFTER_MS)) revalidate();
  });
  // Back or forward into a page the browser kept frozen: everything in memory is as old as it.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) revalidate();
  });
  window.addEventListener("online", () => {
    if (meStale) revalidate();
  });
}

/**
 * A returning account lands on its league without re-entering it.
 *
 * The browser's own connection wins when it has one. When it has none and the account
 * has leagues on file, the one opened most recently on any device is restored: the API
 * row carries the ids and names, and the week comes from the league itself (a stored
 * week would be stale by Tuesday). Once per session, however many shells are mounted.
 */
let restoring: Promise<void> | null = null;
export function restoreConnection(me: Me | null): Promise<void> {
  if (restoring) return restoring;
  if (!me?.signed_in || !me.leagues.length || loadConnection()) return Promise.resolve();
  const pick: MeLeague | null = pickLeague(me.leagues);
  if (!pick) return Promise.resolve();
  restoring = getLeague(pick.platform, pick.league_id)
    .then((league) => {
      if (loadConnection()) return; // the visitor connected one while we were asking
      const team = league.teams.find((t) => t.id === pick.team_id);
      saveConnection({
        platform: pick.platform,
        league_id: pick.league_id,
        team_id: pick.team_id,
        league_name: league.name,
        team_name: team?.name ?? pick.team_name ?? `Team ${pick.team_id}`,
        week: league.week,
      });
    })
    .catch(() => undefined)
    .finally(() => {
      restoring = null;
    });
  return restoring;
}

/** Persisted league connection + entitlements from GET /api/me. Client-only. */
export function useSession(): Session {
  const connection = useConnection();
  const [me, setMe] = useState<Me | null>(cachedMe);
  const [loaded, setLoaded] = useState(meLoaded);
  const [tick, setTick] = useState(0);

  useEffect(wire, []);

  useEffect(() => {
    // Back to loading, so a shell that waits on the session (`needsMe`) remounts its page
    // and every paid room refetches: that is how an in-place grant opens the room it was
    // bought from, with no Stripe redirect to reload the page for us.
    const bump = () => {
      setLoaded(false);
      setTick((t) => t + 1);
    };
    bumpers.add(bump);
    return () => {
      bumpers.delete(bump);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    // An already-known answer still lands through a promise rather than a
    // synchronous setState here: same frame in practice, no cascading render. A stale
    // one (the last check failed) is asked again, with the old answer on screen meanwhile.
    currentMe().then((m) => {
      if (!alive) return;
      setMe(m);
      setLoaded(true);
      void restoreConnection(m);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const account = me?.account ?? null;
  return {
    loading: !loaded,
    connection,
    me,
    signedIn: !!me?.signed_in,
    account,
    premium: account?.plan.tier === "premium",
    isAdmin: !!account?.is_admin,
    has: (f) => !!me?.entitlements.includes(f),
    refresh: () => {
      // A purchase changes what the API will return, so drop what we remember.
      dropMe();
      bumpAll();
    },
  };
}
