/**
 * The ESPN key: how a phone gets a private league's two cookies without a computer.
 *
 * ESPN has no sign-in door for other apps, so a private league is read with the two
 * cookies ESPN's own site keeps in the user's browser, `espn_s2` and `SWID`. Every guide
 * says "open DevTools on a computer". Andrew will not accept that (2026-09-28): the whole
 * product is a phone, and the ceiling he set is a bookmark that runs a script.
 *
 * So this is that bookmark, built here rather than typed, and tested here rather than
 * trusted. It runs on fantasy.espn.com, reads the two cookies off `document.cookie`, and
 * sends the phone back to Penthouse with them in the URL **fragment**. A fragment never
 * leaves the browser: it is not in the request, not in a server log, not in a referrer.
 * The return page (`/connect/espn`) saves the two values to this device and strips them
 * from the address before anything else happens. The server never sees them, which keeps
 * the rule in `docs/DATA.md` true by construction.
 *
 * Why this works at all: Disney's sign-in SDK writes `espn_s2` from page script
 * (`document.cookie = ...`, checked in OneID.js, 2026-09-28), and a cookie set that way is
 * readable the same way. A cookie a *server* set with HttpOnly is not, which is the case
 * the bookmark reports honestly rather than returning with half a key.
 *
 * Pure: no React, no DOM at module level, so the bookmark's own behaviour is unit tested
 * by running it against a fake page in node.
 */

import { ESPN_KEY } from "./vocab.ts";

export interface EspnKey {
  s2: string;
  swid: string;
  /** The league and team ESPN's page URL named (`leagueId=`, `teamId=`), or "" when it did not. */
  league: string;
  team: string;
}

/** The bookmark's name. Chrome on Android runs a bookmarklet by typing its name in the address bar, so it has to be short and easy to spell. */
export const KEY_NAME = "Penthouse key";

/** Where the key comes back to. Kept in one place because the bookmark and the page must agree. */
export const RETURN_PATH = "/connect/espn";

/** Where to send someone who needs to be signed in to ESPN on this browser. */
export const ESPN_URL = "https://fantasy.espn.com/football/";

/** Signed-in ESPN pages carry the key. Anything else is the wrong tab. */
const HOST_TEST = "/(^|\\.)espn\\.com$/";

/**
 * The bookmarklet, as one `javascript:` URL. Hand-written rather than `fn.toString()`
 * so the bundler cannot change it, and one line because a bookmark's address is one line.
 *
 * What it says to the person, in order: wrong site; no key on this browser; otherwise it
 * leaves. It never shows the values, so nothing sits on a screenshot.
 */
export function buildEspnKeyBookmarklet(returnUrl: string, carriedLeagueId = ""): string {
  const back = JSON.stringify(returnUrl);
  const wrongSite = JSON.stringify(ESPN_KEY.bookmark.wrongSite);
  const noKey = JSON.stringify(ESPN_KEY.bookmark.noKey);
  const noLeague = JSON.stringify(ESPN_KEY.bookmark.noLeague);
  // With no league carried from the walk, the ESPN page has to name one, or there is nothing to load.
  const needLeague = carriedLeagueId.trim() ? "false" : "true";
  const src =
    "(function(){" +
    "var c=document.cookie,u=location.search;" +
    "function g(n){var m=c.match(new RegExp('(?:^|; *)'+n+'=([^;]*)'));return m?m[1]:''}" +
    "function q(n){var m=u.match(new RegExp('[?&]'+n+'=([0-9]+)'));return m?m[1]:''}" +
    `if(!${HOST_TEST}.test(location.hostname)){alert(${wrongSite});return}` +
    "var s=g('espn_s2'),w=g('SWID'),l=q('leagueId'),t=q('teamId');" +
    `if(!s||!w){alert(${noKey});return}` +
    `if(!l&&${needLeague}){alert(${noLeague});return}` +
    `location.href=${back}+'#s2='+encodeURIComponent(s)+'&swid='+encodeURIComponent(w)+'&league='+l+'&team='+t;` +
    "})();";
  return "javascript:" + src;
}

/** The fragment the bookmark comes back with, read back into a key, or null when it is not one. */
export function parseEspnKeyReturn(hash: string): EspnKey | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }
  const s2 = (params.get("s2") ?? "").trim();
  const swid = (params.get("swid") ?? "").trim();
  const digits = (v: string | null) => (/^\d+$/.test(v ?? "") ? (v as string) : "");
  return s2 && swid ? { s2, swid, league: digits(params.get("league")), team: digits(params.get("team")) } : null;
}

/** Which set of steps to show. Detected from the user agent, and always switchable on the page. */
export type Hand = "iphone" | "android" | "computer";

export function detectHand(userAgent: string): Hand {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "iphone";
  // iPadOS 13+ presents as a Mac with touch; treat it as the phone flow, which is what it needs.
  if (/macintosh/.test(ua) && /mobile/.test(ua)) return "iphone";
  if (/android/.test(ua)) return "android";
  return "computer";
}

/** The return URL for a bookmark built on this site, carrying the league it was built for. */
export function espnKeyReturnUrl(origin: string, leagueId: string): string {
  const id = leagueId.trim();
  return origin.replace(/\/+$/, "") + RETURN_PATH + (id ? `?id=${encodeURIComponent(id)}` : "");
}
