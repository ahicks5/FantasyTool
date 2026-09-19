"use client";
/** Who is signed in, which league they are looking at, and what they have paid for. */
import { useEffect, useState } from "react";
import { useConnection, type Connection } from "./storage";
import { getMe } from "./api";
import { cacheClear } from "./cache";
import type { Feature, Me } from "./types";

export interface Session {
  loading: boolean;
  connection: Connection | null;
  me: Me | null;
  signedIn: boolean;
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

/** Persisted league connection + entitlements from GET /api/me. Client-only. */
export function useSession(): Session {
  const connection = useConnection();
  const [me, setMe] = useState<Me | null>(cachedMe);
  const [loaded, setLoaded] = useState(meLoaded);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // An already-known answer still lands through a promise rather than a
    // synchronous setState here: same frame in practice, no cascading render.
    const p =
      meLoaded && tick === 0
        ? Promise.resolve()
        : // One request even when several components mount at once.
          (tick === 0 && mePending) ||
          (mePending = getMe()
            .then((m) => {
              cachedMe = m;
            })
            .catch(() => {
              cachedMe = null;
            })
            .finally(() => {
              meLoaded = true;
              mePending = null;
            }));
    p.then(() => {
      if (!alive) return;
      setMe(cachedMe);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  return {
    loading: !loaded,
    connection,
    me,
    signedIn: !!me?.signed_in,
    has: (f) => !!me?.entitlements.includes(f),
    refresh: () => {
      // A purchase changes what the API will return, so drop what we remember.
      meLoaded = false;
      mePending = null;
      cacheClear();
      setTick((t) => t + 1);
    },
  };
}
