/**
 * Owner's Suite for iPhone: the live site in a native frame, plus what only a phone can do.
 *
 * The rooms, the numbers, the account and the passes are all the site (`web/`), loaded from
 * `WEB_URL`, so a web deploy reaches the app the same minute. The frame adds:
 *
 * - links: our site stays inside; Stripe, ESPN and every outside link open in a Safari sheet
 *   over the app, and closing the sheet after a checkout reloads so the new pass shows
 *   (`policy.ts`);
 * - ESPN's own sign-in in place of the bookmark walk (`EspnSheet.tsx`);
 * - kickoff reminders scheduled on the phone (`notify.ts`);
 * - the share sheet, haptics, swipe back, pull to refresh, a reload after a long absence,
 *   and a screen of its own when the site cannot be reached.
 *
 * docs/IOS.md has the plan, the decisions behind it and the TestFlight walk-through.
 */

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { AppState, Linking, Platform, Share, StyleSheet, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { NATIVE } from "../web/src/lib/vocab.ts";
import { bootScript, isRoom, parseMessage } from "./src/bridge.ts";
import { INSPECTABLE, STALE_AFTER_MS, START_PATH, USER_AGENT_SUFFIX, VERSION, WEB_URL } from "./src/config.ts";
import { EspnSheet } from "./src/EspnSheet.tsx";
import { isEspnWalk, keyReturnUrl, type FoundKey } from "./src/espn.ts";
import { askForReminders, neverAsked, pathFrom, scheduleReminders } from "./src/notify.ts";
import { Offline } from "./src/Offline.tsx";
import { isHome, parts, reloadAfter, routeFor } from "./src/policy.ts";
import { PLANE, type Mode } from "./src/theme.ts";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });

const BOOT = bootScript(VERSION);

export default function App() {
  return (
    <SafeAreaProvider>
      <Frame />
    </SafeAreaProvider>
  );
}

type StartRequest = Parameters<NonNullable<ComponentProps<typeof WebView>["onShouldStartLoadWithRequest"]>>[0];

/** Where to open: a reminder tapped while the app was closed opens its room, once. */
function firstUrl(): string {
  const path = pathFrom(Notifications.getLastNotificationResponse());
  Notifications.clearLastNotificationResponse();
  return `${WEB_URL}${path ?? START_PATH}`;
}

function Frame() {
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);
  const [source] = useState(firstUrl);
  const [mode, setMode] = useState<Mode>("dark");
  const [failed, setFailed] = useState(false);
  // Bumped to remount the WebView: a reload cannot retry a first load that never committed.
  const [attempt, setAttempt] = useState(0);
  const [espn, setEspn] = useState(false);
  const route = useRef("");
  const asked = useRef(false);
  const away = useRef<number | null>(null);

  const go = useCallback((url: string) => {
    web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)});true;`);
  }, []);

  // The splash lifts on the first page, or after a few seconds whatever happens.
  const lift = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(lift, 6000);
    return () => clearTimeout(t);
  }, [lift]);

  // Reminders: rebuilt on every launch once allowed; a tapped one opens its room.
  useEffect(() => {
    scheduleReminders();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const path = pathFrom(r);
      if (path) go(`${WEB_URL}${path}`);
    });
    return () => sub.remove();
  }, [go]);

  // Back after a long absence: reload, so the numbers are this hour's.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") away.current = Date.now();
      if (state === "active" && away.current !== null) {
        if (Date.now() - away.current > STALE_AFTER_MS) web.current?.reload();
        away.current = null;
        scheduleReminders();
      }
    });
    return () => sub.remove();
  }, []);

  const openOutside = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        dismissButtonStyle: "done",
        controlsColor: "#f4f3f0",
        toolbarColor: PLANE.dark,
      });
    } finally {
      if (reloadAfter(url)) web.current?.reload();
    }
  }, []);

  const onRoute = useCallback((path: string) => {
    const before = route.current;
    route.current = path;
    if (isEspnWalk(path) && !isEspnWalk(before)) setEspn(true);
    if (isRoom(path) && !asked.current) {
      asked.current = true;
      neverAsked().then((yes) => {
        if (yes) askForReminders();
      });
    }
  }, []);

  function onShouldStart(req: StartRequest): boolean {
    if (!req.isTopFrame) return true;
    const where = routeFor(req.url, WEB_URL);
    if (where === "inside") return true;
    if (where === "browser") openOutside(req.url);
    else Linking.openURL(req.url).catch(() => undefined);
    return false;
  }

  function onNavigation(nav: WebViewNavigation) {
    // A full page load of our own site; client-side moves arrive as `route` messages.
    const p = parts(nav.url);
    if (p && isHome(p.host, WEB_URL)) onRoute(`${p.path}${p.search}${p.hash}`);
  }

  function onMessage(e: WebViewMessageEvent) {
    // Only our own pages speak to the frame.
    if (!isHome(parts(e.nativeEvent.url)?.host ?? "", WEB_URL)) return;
    const m = parseMessage(e.nativeEvent.data);
    if (!m) return;
    switch (m.type) {
      case "route":
        onRoute(m.path);
        break;
      case "theme":
        setMode(m.mode);
        break;
      case "tap":
        Haptics.selectionAsync().catch(() => undefined);
        break;
      case "haptic":
        for (const at of m.pulses) setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined), at);
        break;
      case "share":
        Share.share(Platform.OS === "ios" ? { url: m.url } : { message: m.url }, { subject: NATIVE.share.subject }).catch(() => undefined);
        break;
    }
  }

  function onEspnKey(key: FoundKey) {
    setEspn(false);
    go(keyReturnUrl(WEB_URL, key));
  }

  function onEspnClose() {
    setEspn(false);
    // Back off the walk: its bookmark steps cannot work in the app.
    if (isEspnWalk(route.current)) web.current?.goBack();
  }

  function retry() {
    setFailed(false);
    setAttempt((n) => n + 1);
  }

  return (
    <View style={[styles.frame, { backgroundColor: PLANE[mode], paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <WebView
        key={attempt}
        ref={web}
        source={{ uri: source }}
        style={{ backgroundColor: PLANE[mode] }}
        applicationNameForUserAgent={USER_AGENT_SUFFIX}
        injectedJavaScriptBeforeContentLoaded={BOOT}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={onNavigation}
        onOpenWindow={(e) => {
          const url = e.nativeEvent.targetUrl;
          if (routeFor(url, WEB_URL) === "inside") go(url);
          else openOutside(url);
        }}
        onLoadEnd={lift}
        onError={() => {
          setFailed(true);
          lift();
        }}
        onHttpError={(e) => {
          // A dead origin (a 5xx on the document itself) is the offline screen; a 404 is the site's own page.
          if (e.nativeEvent.statusCode >= 500 && isHome(parts(e.nativeEvent.url)?.host ?? "", WEB_URL)) setFailed(true);
        }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        // The room is laid out against these insets already; never let WebKit add its own.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        allowsLinkPreview={false}
        keyboardDisplayRequiresUserAction={false}
        allowsInlineMediaPlayback
        webviewDebuggingEnabled={INSPECTABLE}
        decelerationRate="normal"
      />
      {failed && <Offline onRetry={retry} />}
      {espn && <EspnSheet onClose={onEspnClose} onKey={onEspnKey} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
});
