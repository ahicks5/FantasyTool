"use client";
/** Who is signed in, which league they are looking at, what they have paid for, and the flag on the account. */
import { useEffect, useState } from "react";
import { loadConnection, saveConnection, useConnection, type Connection } from "./storage";
import { getLeague, getMe } from "./api";
import { clearToken, hasToken, onAuthChange } from "./auth";
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
 */
let cachedMe: Me | null = null;
let meLoaded = false;
let mePending: Promise<void> | null = null;
/** Bumped by sign-in and sign-out, so every mounted `useSession` refetches at once. */
const bumpers = new Set<() => void>();
let authWired = false;

function dropMe() {
  meLoaded = false;
  mePending = null;
  cachedMe = null;
  cacheClear();
}

/** The current answer, fetched once. For code outside React (the gate) that needs to know now. */
export function currentMe(): Promise<Me | null> {
  if (meLoaded) return Promise.resolve(cachedMe);
  if (!mePending) {
    mePending = getMe()
      .then((m) => {
        cachedMe = m;
        // A token the API no longer knows (signed out elsewhere, expired, the store reset)
        // is dropped here, so the door reads "Sign in" and the next save asks properly.
        if (m && !m.signed_in && typeof window !== "undefined" && hasToken()) clearToken();
      })
      .catch(() => {
        cachedMe = null;
      })
      .finally(() => {
        meLoaded = true;
        mePending = null;
      });
  }
  return mePending.then(() => cachedMe);
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

  useEffect(() => {
    if (authWired) return;
    authWired = true;
    // A sign-in or sign-out anywhere drops the cached answer and wakes every mounted hook.
    onAuthChange(() => {
      dropMe();
      bumpers.forEach((b) => b());
    });
  }, []);

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
    // synchronous setState here: same frame in practice, no cascading render.
    const p = meLoaded && tick === 0 ? Promise.resolve(cachedMe) : currentMe();
    p.then((m) => {
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
      bumpers.forEach((b) => b());
    },
  };
}
