"use client";
/**
 * Who the player sheet is open on, and the URL that says so.
 *
 * Mounted once in `AppShell`, so every room shares one sheet: tapping a name on the call
 * sheet, the depth chart or the wire opens the same page over the same tab, and the tab
 * underneath stays lit because nothing navigated.
 *
 * **The URL is the state**, and it is read straight off `window.location` rather than
 * through `useSearchParams`. That hook makes the whole client tree above it dynamic, and
 * this provider sits above every page in the app -- in the static export (`npm run demo`)
 * that is a build error on every route, and in the normal build it would cost the app its
 * prerendered HTML for the sake of one optional query parameter. The parameter is ours
 * either way: we are the only thing that writes it and the only thing that reads it.
 *
 * It is subscribed to rather than copied into state, so there is one answer to "whose page
 * is open" no matter how it changed -- a tap, the back button, a pasted link. The seed is
 * the only thing held in React state, because it is the only thing the URL cannot carry.
 */
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { useSession } from "@/lib/session";
import { PlayerSheet, type PlayerSeed } from "./PlayerSheet";

/** The query parameter the sheet keeps itself in. Also the deep link into a player. */
export const PLAYER_PARAM = "player";

/* --------------------------------------------------- the URL, as a store --- */

const listeners = new Set<() => void>();

/** `pushState` fires no event, so our own writes have to say so. */
function announce(): void {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Back and forward. Reading the URL rather than assuming which way it moved means the
  // forward button reopens the page the back button closed, for free.
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function openId(): string | null {
  return new URL(window.location.href).searchParams.get(PLAYER_PARAM);
}

/** Nothing is open during prerender: there is no URL to read and no sheet in the HTML. */
function noneOnTheServer(): null {
  return null;
}

/* ----------------------------------------------------------------- the api --- */

interface Api {
  /** Open his page. Pass the whole player where you have one; the header is better for it. */
  open: (player: PlayerSeed | string) => void;
  close: () => void;
  /** Who is open, or null. Lets a row mark itself as the one being read. */
  openId: string | null;
}

/**
 * A no-op default rather than a thrown error.
 *
 * `PlayerName` renders in components that are also used outside the shell -- the share
 * card's static export is the live case -- and a name that cannot open a sheet should
 * render as a name, not crash the page it is on.
 */
const Ctx = createContext<Api>({ open: () => {}, close: () => {}, openId: null });

export function usePlayerSheet(): Api {
  return useContext(Ctx);
}

export function PlayerSheetProvider({ children }: { children: React.ReactNode }) {
  const id = useSyncExternalStore(subscribe, openId, noneOnTheServer);
  // What the tapped row knew about him. Kept beside the URL rather than in it: a header
  // that paints a beat early is worth a state field, and is not worth a query string
  // carrying a player's name and headshot URL around.
  const [seed, setSeed] = useState<PlayerSeed | null>(null);
  const session = useSession();

  const show = useCallback((player: PlayerSeed | string) => {
    const next = typeof player === "string" ? null : player;
    const nextId = typeof player === "string" ? player : player.id;
    setSeed(next);
    const url = new URL(window.location.href);
    url.searchParams.set(PLAYER_PARAM, nextId);
    // pushState rather than replaceState: the back button is how a phone closes things.
    // It integrates with the Next router, so `usePathname` and the like stay in step.
    window.history.pushState(null, "", url);
    announce();
  }, []);

  /**
   * Close, by undoing the history entry the open pushed.
   *
   * `history.back()` rather than another `pushState`: pushing again would leave the reader
   * two entries deep on one tap, so their next back press would land on the same page with
   * the sheet already shut, which reads as a back button that did nothing.
   */
  const hide = useCallback(() => {
    if (openId()) {
      window.history.back();
      return;
    }
    announce();
  }, []);

  const api = useMemo<Api>(() => ({ open: show, close: hide, openId: id }), [show, hide, id]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* The report is scored by the reader's own league, so without a connection there is
          no page to draw. A name tapped before one is connected does nothing, which is the
          same answer the rooms behind it give. */}
      {id && session.connection && (
        <PlayerSheet
          c={session.connection}
          playerId={id}
          seed={seed && seed.id === id ? seed : null}
          onClose={hide}
        />
      )}
    </Ctx.Provider>
  );
}
