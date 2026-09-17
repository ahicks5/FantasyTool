"use client";
import { useEffect, useState } from "react";
import { useConnection, type Connection } from "./storage";
import { getMe } from "./api";
import type { Feature, Me } from "./types";

export interface Session {
  loading: boolean;
  connection: Connection | null;
  me: Me | null;
  signedIn: boolean;
  has: (f: Feature) => boolean;
  refresh: () => void;
}

/** Persisted league connection + entitlements from GET /api/me. Client-only. */
export function useSession(): Session {
  const connection = useConnection();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((m) => alive && setMe(m))
      .catch(() => alive && setMe(null))
      .finally(() => alive && setLoaded(true));
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
    refresh: () => setTick((t) => t + 1),
  };
}
