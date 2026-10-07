/**
 * The screen the frame draws itself when our site cannot be reached.
 *
 * No signal, the API waking up after a quiet night, or the site mid-deploy. The mark, one line, one button.
 * Dark in both themes, like the rest of the frame.
 */

import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { NATIVE } from "../../web/src/lib/vocab.ts";
import { INK, LINE, MUTED, PLANE } from "./theme.ts";

export function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      {/* The OS monogram, so the one screen the frame draws itself still carries the brand.
          Rendered by scripts/render_brand_assets.py at 3x this slot. */}
      <Image source={require("../assets/mark.png")} style={styles.mark} accessibilityIgnoresInvertColors />
      <Text style={styles.title}>{NATIVE.offline.title}</Text>
      <Text style={styles.body}>{NATIVE.offline.body}</Text>
      <Pressable onPress={onRetry} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button">
        <Text style={styles.buttonText}>{NATIVE.offline.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, backgroundColor: PLANE.dark, alignItems: "center", justifyContent: "center", padding: 32 },
  mark: { width: 80, height: 37, marginBottom: 22, opacity: 0.9 },
  title: { color: INK, fontSize: 24, fontWeight: "800", letterSpacing: 0.3, textAlign: "center" },
  body: { color: MUTED, fontSize: 15, lineHeight: 21, marginTop: 10, textAlign: "center", maxWidth: 300 },
  button: { marginTop: 28, borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 13 },
  pressed: { opacity: 0.6 },
  buttonText: { color: INK, fontSize: 15, fontWeight: "700" },
});
