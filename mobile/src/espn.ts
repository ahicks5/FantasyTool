/**
 * A private ESPN league, linked from the app: the key read off ESPN's page, handed to ours.
 *
 * ESPN's own sign-in opens in a sheet in place of the bookmark walk at /connect/espn, which
 * cannot work here: the app's WebView has no bookmarks.
 *
 * It is the same key and the same hand-off as the bookmark (`web/src/lib/espnKey.ts`): read
 * `espn_s2` and `SWID` off ESPN's page once the owner has logged in, read `leagueId` and
 * `teamId` off the team page's address, and come back to /connect/espn with all four in the
 * URL **fragment**. The page's own landing code saves them to this device and loads the
 * league. A fragment is never sent to a server, so `docs/DATA.md` stays true: the values go
 * from ESPN's page to our page on the same phone, and nowhere else.
 *
 * Pure: no React Native imports. The fragment format is pinned against the web's parser by
 * `espn.test.ts`, so the two cannot drift.
 */

import { ESPN_URL, RETURN_PATH } from "../../web/src/lib/espnKey.ts";
import { parts } from "./policy.ts";

export { ESPN_URL };

export interface FoundKey {
  s2: string;
  swid: string;
  league: string;
  team: string;
}

/**
 * Whether a page address is the bookmark walk, which the app answers with the ESPN sheet.
 * The walk with a key already in its fragment is the landing, and must be left alone.
 */
export function isEspnWalk(pathAndMore: string): boolean {
  const p = parts(pathAndMore.startsWith("/") ? `https://x${pathAndMore}` : pathAndMore);
  if (!p) return false;
  const path = p.path.replace(/\/+$/, "") || "/";
  return path === RETURN_PATH && !/[#&]s2=/.test(p.hash);
}

/**
 * Runs inside ESPN's pages, once a second: reports the two cookies and the league and team
 * on the address. The same reads as the bookmark, and it never shows the values on screen.
 * ESPN is a single-page app, so a timer rather than a page-load hook.
 */
export const ESPN_READ_SCRIPT = `(function(){
  if (window.__osKey) return true;
  function g(n){var m=document.cookie.match(new RegExp('(?:^|; *)'+n+'=([^;]*)'));return m?m[1]:''}
  function q(n){var m=location.search.match(new RegExp('[?&]'+n+'=([0-9]+)'));return m?m[1]:''}
  window.__osKey = setInterval(function(){
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'espn-key', s2: g('espn_s2'), swid: g('SWID'), league: q('leagueId'), team: q('teamId')
      }));
    } catch (e) {}
  }, 1000);
  return true;
})();true;`;

/**
 * A report from ESPN's page, judged: a key we can use, or null to keep waiting.
 *
 * The league must come off ESPN's own address (the team page), never only from the walk.
 * Cookies left over from an old session can still be on the phone after ESPN has signed the
 * owner out; waiting for the team page means ESPN has just accepted them. And when the owner
 * opens a different league than the walk was for, the one they opened wins, as with the
 * bookmark.
 */
export function readyKey(raw: unknown): FoundKey | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== "espn-key") return null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const digits = (v: unknown) => (/^\d+$/.test(str(v)) ? str(v) : "");
  const s2 = str(r.s2);
  const swid = str(r.swid);
  const league = digits(r.league);
  if (!s2 || !swid || !league) return null;
  return { s2, swid, league, team: digits(r.team) };
}

/** Where the main WebView goes with the key: the walk's own landing, the key in the fragment. */
export function keyReturnUrl(home: string, key: FoundKey): string {
  const base = home.replace(/\/+$/, "");
  // Exactly the bookmark's encoding (`buildEspnKeyBookmarklet`), so the page reads it the same way.
  const frag = `s2=${encodeURIComponent(key.s2)}&swid=${encodeURIComponent(key.swid)}&league=${key.league}&team=${key.team}`;
  return `${base}${RETURN_PATH}#${frag}`;
}

/**
 * ESPN's team page is open but the key is not readable: a cookie ESPN's server set with
 * HttpOnly. The sheet says so and points at the paste fields, rather than waiting forever.
 */
export function keyHidden(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  const has = (v: unknown) => typeof v === "string" && v.trim() !== "";
  return r.type === "espn-key" && /^\d+$/.test(String(r.league ?? "")) && !(has(r.s2) && has(r.swid));
}
