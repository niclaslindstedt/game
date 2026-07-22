// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native shell. It is deliberately thin: a full-bleed WebView that loads
// the deployed game so the app looks and plays exactly like the website, plus
// the native seams a browser can't provide — the Taptic Engine (the vibration
// that motivates buying the game) and an audio session that lets the game's
// sound play through the iOS silent switch.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import * as SplashScreen from "expo-splash-screen";
import { WebView } from "react-native-webview";
import type {
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview";

import { BRAND_BG, REMOTE_GAME_URL } from "./src/config";
import { HAPTICS_BRIDGE, VIEWPORT_HARDENING } from "./src/injected";
import { startLocalServer, type LocalServer } from "./src/localServer";
import { playPattern, type VibrationPattern } from "./src/nativeHaptics";
import {
  createStoreBridge,
  type StoreBridge,
  type StoreEvent,
  type StoreRequest,
} from "./src/storePurchases";

// Keep the native splash up until the WebView paints its first frame, so the
// player never sees a white flash or a half-loaded page.
void SplashScreen.preventAutoHideAsync().catch(() => {});

type BridgeMessage = {
  __gisHaptics?: boolean;
  pattern?: VibrationPattern;
  // The coin store's messages (pwa/src/app/storeBridge.ts).
  __gisStore?: boolean;
} & StoreRequest;

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const canGoBack = useRef(false);
  // The URL the WebView loads: the local server's origin once it is up, or the
  // remote override when EXPO_PUBLIC_GAME_URL is set. null until resolved, so
  // the splash/loader holds until there is something to show.
  const [uri, setUri] = useState<string | null>(null);
  const serverRef = useRef<LocalServer | null>(null);

  // Resolve where to load from: the bundled site over a local HTTP server by
  // default (self-contained, offline), or a remote URL when overridden. Held
  // in a stable callback so RETRY can re-run it after a failure.
  const startSource = useCallback(async () => {
    setFailed(false);
    setLoaded(false);
    if (REMOTE_GAME_URL) {
      setUri(REMOTE_GAME_URL);
      return;
    }
    try {
      if (!serverRef.current) {
        serverRef.current = await startLocalServer();
      }
      setUri(serverRef.current.origin);
    } catch {
      setFailed(true);
    }
  }, []);

  // Start the source on mount; tear the server down on unmount.
  useEffect(() => {
    void startSource();
    return () => {
      void serverRef.current?.stop();
      serverRef.current = null;
    };
  }, [startSource]);

  // Route the game's audio through a playback session so it is audible even
  // when the ringer switch is silenced — a game should sound like a game.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Android hardware back navigates the WebView history instead of closing the
  // app, until there's nowhere left to go back to (then default: exit).
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  // The coin store's native half, built on first use. Its events are pushed
  // back into the page as a `window.__gisStoreEvent(...)` call; U+2028/2029
  // are the two JSON-legal chars that break a JS literal, so they're escaped
  // (a localized price string could carry anything).
  const storeRef = useRef<StoreBridge | null>(null);
  const emitStoreEvent = useCallback((storeEvent: StoreEvent) => {
    const payload = JSON.stringify(storeEvent)
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    webRef.current?.injectJavaScript(
      `try{window.__gisStoreEvent&&window.__gisStoreEvent(${payload})}catch(e){};true;`,
    );
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: BridgeMessage;
      try {
        data = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      } catch {
        return; // not our message — ignore anything that isn't the bridge
      }
      if (data.__gisHaptics && data.pattern !== undefined) {
        playPattern(data.pattern);
      }
      if (data.__gisStore) {
        if (!storeRef.current) {
          storeRef.current = createStoreBridge(emitStoreEvent);
        }
        storeRef.current.handle(data);
      }
    },
    [emitStoreEvent],
  );

  const onNavStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
  }, []);

  const reveal = useCallback(() => {
    setLoaded(true);
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const retry = useCallback(() => {
    // A loaded page that errored just needs a reload; a failure before the
    // source resolved (e.g. the local server never started) re-runs startup.
    if (uri) {
      setFailed(false);
      setLoaded(false);
      webRef.current?.reload();
    } else {
      void startSource();
    }
  }, [uri, startSource]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {uri && (
        <WebView
          ref={webRef}
          source={{ uri }}
          originWhitelist={["*"]}
          style={styles.web}
          // The game manages its own audio start on first touch; let it play
          // inline without a gesture gate on the media element itself.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Make it feel native: no rubber-band bounce, no page scroll (the
          // game owns the whole viewport), no accidental history swipes.
          bounces={false}
          scrollEnabled={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          allowsBackForwardNavigationGestures={false}
          // Kill WKWebView's input accessory bar (the ▲▼/done strip above the
          // keyboard) — on a landscape phone it eats a third of the little
          // space the keyboard leaves, and the game's single name field has
          // nothing to navigate between.
          hideKeyboardAccessoryView
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          setSupportMultipleWindows={false}
          // No HTTP cache: the site is served from local disk, so caching buys
          // nothing — and a cached index.html from a previous bundle would
          // reference hashed chunks that no longer exist in the new webroot,
          // which surfaces as a silent black screen when the lazily-loaded
          // game chunk 404s. (Saves are storage, not cache — they persist.)
          cacheEnabled={false}
          // Persist the game's IndexedDB / localStorage saves across launches.
          domStorageEnabled
          javaScriptEnabled
          // The vibration bridge must exist before the game's scripts probe for
          // navigator.vibrate; the hardening runs once the document is up.
          injectedJavaScriptBeforeContentLoaded={HAPTICS_BRIDGE}
          injectedJavaScript={VIEWPORT_HARDENING}
          onMessage={onMessage}
          onNavigationStateChange={onNavStateChange}
          onLoadEnd={reveal}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
        />
      )}

      {!loaded && !failed && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#d63333" />
        </View>
      )}

      {failed && (
        <View style={styles.overlay}>
          <Text style={styles.title}>Can't reach the moon</Text>
          <Text style={styles.body}>
            {REMOTE_GAME_URL
              ? "The game needs a connection to load. Check your network and try again."
              : "The game couldn't start up. Try again."}
          </Text>
          <Pressable style={styles.button} onPress={retry}>
            <Text style={styles.buttonText}>RETRY</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_BG },
  web: { flex: 1, backgroundColor: BRAND_BG },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND_BG,
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { color: "#f4f4f5", fontSize: 20, fontWeight: "700" },
  body: { color: "#9aa3ad", fontSize: 14, textAlign: "center", lineHeight: 20 },
  button: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: "#d63333",
    borderRadius: 6,
  },
  buttonText: { color: "#fff", fontWeight: "700", letterSpacing: 1 },
});
