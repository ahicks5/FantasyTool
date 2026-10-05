/**
 * What the build points at: the site, the inspector switch, the version.
 *
 * `EXPO_PUBLIC_*` values are inlined when the bundle is built, so each EAS profile sets them
 * in `eas.json`, never at runtime.
 *
 * - `EXPO_PUBLIC_WEB_URL`: the site the app frames. Production is the live site; a beta can
 *   point at any deploy of `web/` the API's `EDGE_CORS` allows.
 * - `EXPO_PUBLIC_WEB_INSPECT=1`: Safari's Web Inspector can attach to the app's WebView
 *   (Develop menu on a Mac, phone plugged in). On for the internal and simulator builds only.
 */

import Constants from "expo-constants";
import { APP_UA_TOKEN } from "../../web/src/lib/native.ts";

export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || "https://penthousefantasy.com").replace(/\/+$/, "");

/** Where the app opens: the desk. A stranger is sent on to /register by the page itself. */
export const START_PATH = "/home";

export const INSPECTABLE = process.env.EXPO_PUBLIC_WEB_INSPECT === "1";

export const VERSION = Constants.expoConfig?.version ?? "0";

/** Appended to the WebView's user agent; `web/src/lib/native.ts` looks for it. */
export const USER_AGENT_SUFFIX = `${APP_UA_TOKEN}${VERSION}`;

/** Back from the background after this long, the page reloads: projections move, and stale advice is worse than a spinner. */
export const STALE_AFTER_MS = 30 * 60 * 1000;
