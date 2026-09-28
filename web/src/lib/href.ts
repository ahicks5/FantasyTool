"use client";
/**
 * The address bar, read as a store: one hook that says where the page is right now.
 *
 * `useSearchParams` makes the whole client tree above it dynamic, which in the static
 * export is a build error and in the normal build costs a route its prerendered HTML (see
 * PlayerSheetProvider, which reads the URL the same way for the same reason). For a page
 * that only wants to glance at `?id=` or at the fragment once it has mounted, this is the
 * whole job: the server sees an empty string, the browser sees `window.location.href`, and
 * back and forward re-read it.
 */
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

function current(): string {
  return window.location.href;
}

/** Nothing during prerender: there is no address to read. */
function onTheServer(): string {
  return "";
}

/** The page's full address, or "" until the browser has one. */
export function useHref(): string {
  return useSyncExternalStore(subscribe, current, onTheServer);
}

/** The address, parsed, or null on the server. */
export function useLocation(): URL | null {
  const href = useHref();
  return href ? new URL(href) : null;
}
