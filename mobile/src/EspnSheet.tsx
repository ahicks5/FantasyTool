/**
 * ESPN's own sign-in in a sheet over the app, in place of the bookmark walk.
 *
 * The walk at /connect/espn needs a browser's bookmarks, so it cannot work here.
 *
 * The owner logs in and lands on their team page; the moment ESPN's address names the league
 * and the key is readable, the sheet says so, buzzes once and hands the key back (`espn.ts`).
 * ESPN keeps the owner logged in inside this sheet, so getting a fresh key after ESPN rotates
 * one is a tap and a second.
 *
 * A sign-in with Google or Apple inside ESPN's page may refuse to run in an embedded view;
 * those owners use the paste fields on /connect, which this sheet points them to.
 */

import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { NATIVE } from "../../web/src/lib/vocab.ts";
import { ESPN_READ_SCRIPT, ESPN_URL, keyHidden, readyKey, type FoundKey } from "./espn.ts";
import { parts } from "./policy.ts";
import { INK, MUTED, PLANE } from "./theme.ts";

/** Reports in a row with the team page open and no key before the sheet says so (one a second). */
const HIDDEN_AFTER = 4;

function onEspn(url: string): boolean {
  const host = parts(url)?.host ?? "";
  return host === "espn.com" || host.endsWith(".espn.com");
}

export function EspnSheet({ onClose, onKey }: { onClose: () => void; onKey: (key: FoundKey) => void }) {
  const [uri, setUri] = useState<string>(ESPN_URL);
  const [found, setFound] = useState(false);
  const [hidden, setHidden] = useState(0);
  const done = useRef(false);

  function onMessage(e: WebViewMessageEvent) {
    if (done.current || !onEspn(e.nativeEvent.url)) return;
    let raw: unknown;
    try {
      raw = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    const key = readyKey(raw);
    if (key) {
      done.current = true;
      setFound(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      // A beat on "Got it" so the hand-off reads as a result, not a glitch.
      setTimeout(() => onKey(key), 700);
      return;
    }
    setHidden((n) => (keyHidden(raw) ? n + 1 : 0));
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet} edges={["bottom"]}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.title}>{NATIVE.espn.title}</Text>
            <Text style={styles.lead}>{found ? NATIVE.espn.found : hidden >= HIDDEN_AFTER ? NATIVE.espn.noKey : NATIVE.espn.lead}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.cancel}>{NATIVE.espn.cancel}</Text>
          </Pressable>
        </View>
        <View style={styles.web}>
          <WebView
            source={{ uri }}
            injectedJavaScript={ESPN_READ_SCRIPT}
            onMessage={onMessage}
            // ESPN's sign-in sometimes opens itself as a new window; keep it in this sheet.
            onOpenWindow={(e) => setUri(e.nativeEvent.targetUrl)}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={INK} />
              </View>
            )}
            allowsBackForwardNavigationGestures
            style={{ backgroundColor: "#ffffff" }}
          />
          {found && (
            <View style={styles.loading}>
              <ActivityIndicator color={INK} />
            </View>
          )}
        </View>
        <Text style={styles.privacy}>{NATIVE.espn.privacy}</Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: PLANE.dark },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  headText: { flex: 1 },
  title: { color: INK, fontSize: 20, fontWeight: "800" },
  lead: { color: MUTED, fontSize: 14, lineHeight: 19, marginTop: 4 },
  cancel: { color: INK, fontSize: 16, fontWeight: "600", paddingTop: 2 },
  web: { flex: 1, overflow: "hidden", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  loading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,9,11,0.72)" },
  privacy: { color: MUTED, fontSize: 12, textAlign: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
});
