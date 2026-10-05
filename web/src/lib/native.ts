/**
 * The iPhone app's frame, seen from the page (`mobile/`, docs/IOS.md).
 *
 * The app is these same pages inside a native WebView. The frame announces itself twice
 * before any of our script runs: a user-agent token (`OwnersSuiteApp/<version>`) and a
 * message channel (`window.ReactNativeWebView`). Both must be there, so a browser that
 * happens to carry one of them never takes the app's path.
 *
 * Everything here is a no-op in a browser, which is the whole contract: the web build is
 * unchanged for every visitor who is not in the app. Most of the app's behaviour needs no
 * page code at all (the frame intercepts Stripe, ESPN's walk and outside links itself);
 * this module is only for the few places where the page has to choose.
 *
 * Pure apart from reading `window`, so it is tested flat in node.
 */

/** The token the app appends to the WebView's user agent. The app and this file must agree. */
export const APP_UA_TOKEN = "OwnersSuiteApp/";

interface NativeWindow {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  navigator?: { userAgent?: string };
}

function frame(w: unknown = typeof window === "undefined" ? undefined : window): NativeWindow | null {
  if (!w) return null;
  const nw = w as NativeWindow;
  const ua = nw.navigator?.userAgent ?? "";
  return nw.ReactNativeWebView && ua.includes(APP_UA_TOKEN) ? nw : null;
}

/** Whether this page is running inside the iPhone app. Always false on the server. */
export function isNativeApp(w?: unknown): boolean {
  return frame(w) !== null;
}

/**
 * Hand a link to the phone's share sheet. Returns true when the app took it, so the caller
 * falls back to the clipboard only in a browser.
 */
export function shareInApp(url: string, w?: unknown): boolean {
  const f = frame(w);
  if (!f || !url) return false;
  try {
    f.ReactNativeWebView!.postMessage(JSON.stringify({ type: "share", url }));
    return true;
  } catch {
    return false;
  }
}
