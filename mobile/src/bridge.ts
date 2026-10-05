/**
 * The bridge between the page and the frame: the script injected first, and the messages back.
 *
 * The script goes into our own site before any of its script runs.
 *
 * Injected, before content loads:
 * - `OwnersSuiteNative`, so a page can tell it is in the app (`web/src/lib/native.ts` reads
 *   the user agent and the message channel instead, which needs nothing from here).
 * - Stubs for the Meta and Reddit pixels, so their loaders bail out even on a page built
 *   before `Analytics.tsx` learned to skip them in the app.
 * - `navigator.vibrate`, which iOS does not have, turned into real haptics. The GM's call
 *   (`CallOpening.tsx`) buzzes the phone this way with no change to the page.
 * - A light tap on every tab-bar press.
 * - Route reports on every client-side navigation (Next moves by `history.pushState`, which
 *   no WebView event reports), and the theme whenever `data-theme` flips.
 *
 * Messages back: `route`, `theme`, `haptic`, `tap`, `share`. Anything else is ignored.
 *
 * Pure, so `node --test` runs it.
 */

export type Message =
  | { type: "route"; path: string }
  | { type: "theme"; mode: "dark" | "light" }
  | { type: "haptic"; pulses: number[] }
  | { type: "tap" }
  | { type: "share"; url: string };

export function bootScript(version: string): string {
  return `(function(){
  if (window.OwnersSuiteNative) return;
  var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} };
  window.OwnersSuiteNative = { platform: 'ios', version: ${JSON.stringify(version)} };
  var noop = function(){};
  if (!window.fbq) { window.fbq = noop; }
  if (!window.rdt) { window.rdt = noop; }
  try {
    navigator.vibrate = function(p){ post({ type: 'haptic', pattern: [].concat(p || []) }); return true; };
  } catch (e) {}
  var last = '';
  var route = function(){
    var here = location.pathname + location.search + location.hash;
    if (here !== last) { last = here; post({ type: 'route', path: here }); }
  };
  ['pushState', 'replaceState'].forEach(function(k){
    var orig = history[k];
    history[k] = function(){ var r = orig.apply(this, arguments); setTimeout(route, 0); return r; };
  });
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  route();
  var theme = function(){
    post({ type: 'theme', mode: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark' });
  };
  var watchTheme = function(){
    if (!document.documentElement || window.__osTheme) return;
    window.__osTheme = true;
    new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    theme();
  };
  // At document start the root element may not exist yet; the theme boot script sets
  // data-theme in <head>, so the report after DOMContentLoaded is the one that counts.
  watchTheme();
  document.addEventListener('DOMContentLoaded', function(){ watchTheme(); theme(); });
  document.addEventListener('click', function(e){
    var t = e.target;
    if (t && t.closest && t.closest('nav a')) post({ type: 'tap' });
  }, true);
})();true;`;
}

/** At most this many buzzes, within this long, whatever the page asks for. */
const MAX_PULSES = 12;
const MAX_SPAN_MS = 6000;

/**
 * A vibration pattern (`[on, off, on, ...]` in ms) as the moments to fire a haptic, from the
 * start. iOS haptics are taps, not durations, so each "on" becomes one tap at its start.
 */
export function pulses(pattern: unknown): number[] {
  const steps = (Array.isArray(pattern) ? pattern : [pattern]).map(Number);
  if (steps.some((n) => !Number.isFinite(n) || n < 0)) return [];
  const out: number[] = [];
  let t = 0;
  steps.forEach((ms, i) => {
    if (i % 2 === 0 && ms > 0 && t <= MAX_SPAN_MS && out.length < MAX_PULSES) out.push(t);
    t += ms;
  });
  return out;
}

export function parseMessage(data: string): Message | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case "route":
      return typeof m.path === "string" && m.path.startsWith("/") ? { type: "route", path: m.path } : null;
    case "theme":
      return { type: "theme", mode: m.mode === "light" ? "light" : "dark" };
    case "haptic": {
      const p = pulses(m.pattern);
      return p.length ? { type: "haptic", pulses: p } : null;
    }
    case "tap":
      return { type: "tap" };
    case "share":
      return typeof m.url === "string" && /^https:\/\//.test(m.url) ? { type: "share", url: m.url } : null;
    default:
      return null;
  }
}

/** The rooms past the front desk. The first visit to one is when the app asks to send reminders. */
export function isRoom(path: string): boolean {
  return /^\/(team|waivers|trade|report)(\/|\?|#|$)/.test(path);
}
