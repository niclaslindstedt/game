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

import {
  createAchievementsBridge,
  type AchievementsBridge,
  type AchievementsEvent,
  type AchievementsRequest,
} from "./src/achievements";
import {
  createCloudBridge,
  type CloudBridge,
  type CloudEvent,
  type CloudRequest,
} from "./src/cloud-save";
import { BRAND_BG, REMOTE_GAME_URL } from "./src/config";
import { HAPTICS_BRIDGE, VIEWPORT_HARDENING } from "./src/injected";
import { startLocalServer, type LocalServer } from "./src/local-server";
import { playPattern, type VibrationPattern } from "./src/native-haptics";
import {
  createStoreBridge,
  type StoreBridge,
  type StoreEvent,
  type StoreRequest,
} from "./src/store-purchases";

// Keep the native splash up until the WebView paints its first frame, so the
// player never sees a white flash or a half-loaded page.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// One parsed message off the WebView channel. The `__gis*` flag says which
// bridge it belongs to; that bridge's own request type describes the rest of
// the fields (and validates them), so they aren't re-declared here.
type BridgeMessage = {
  __gisHaptics?: boolean;
  pattern?: VibrationPattern;
  // The coin store's messages (pwa/src/app/store-bridge.ts).
  __gisStore?: boolean;
  // Cloud save's messages (pwa/src/app/cloud-bridge.ts).
  __gisCloud?: boolean;
  // Game Center achievements (pwa/src/app/achievements-bridge.ts).
  __gisAchievements?: boolean;
};

/**
 * Is this URL one of the site's DOCUMENTS rather than the game itself?
 *
 * The library (`/library/…`) and the two store-mandated pages are plain long
 * HTML served off the very same local origin as the game, so the WebView can
 * only tell them apart by path. Keep this in step with `DOC_PAGES`
 * (pwa/pwa-plugin.ts) and the library's mount point.
 *
 * Matched on the PATH, not with `includes`, so a query or fragment can't smuggle
 * the word past it and a level called `library` in some future URL can't either.
 */
export function isDocumentUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return /(^|\/)(library|privacy|contact)(\/|$)/.test(path);
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Is the WebView showing a DOCUMENT rather than the game? The library
  // (`/library/…`) and the two store-mandated pages are ordinary long pages
  // served off the same local origin, and the game's viewport rules are wrong
  // for them — see `scrollEnabled` on the WebView below.
  const [onDocument, setOnDocument] = useState(false);
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

  // The coin store's native half, built on first use.
  const storeRef = useRef<StoreBridge | null>(null);
  // One injector for both bridges — they differ only in the page-side callback
  // the event is handed to (`window.__gis*Event(...)`). U+2028/2029 are the two
  // JSON-legal chars that break a JS literal, so they're escaped (a localized
  // price string, or a player's hero name, could carry anything).
  const inject = useCallback((channel: string, event: unknown) => {
    const payload = JSON.stringify(event)
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    webRef.current?.injectJavaScript(
      `try{window.${channel}&&window.${channel}(${payload})}catch(e){};true;`,
    );
  }, []);
  const emitStoreEvent = useCallback(
    (storeEvent: StoreEvent) => inject("__gisStoreEvent", storeEvent),
    [inject],
  );

  // CLOUD SAVE's native half (src/cloud-save.ts): the same shape as the store
  // bridge — built on first use, fed the page's messages, and torn down with
  // the shell so the provider's change subscription doesn't outlive it.
  const cloudRef = useRef<CloudBridge | null>(null);
  const emitCloudEvent = useCallback(
    (cloudEvent: CloudEvent) => inject("__gisCloudEvent", cloudEvent),
    [inject],
  );
  useEffect(() => {
    return () => {
      cloudRef.current?.stop();
      cloudRef.current = null;
    };
  }, []);

  // GAME CENTER's native half (src/achievements.ts): the game's badge ledger
  // mirrored into the platform's achievement service. Same shape again, minus
  // the teardown — it holds no subscription, because a platform achievement
  // service has nothing to push back.
  const achievementsRef = useRef<AchievementsBridge | null>(null);
  const emitAchievementsEvent = useCallback(
    (achievementsEvent: AchievementsEvent) =>
      inject("__gisAchievementsEvent", achievementsEvent),
    [inject],
  );

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
        storeRef.current.handle(data as StoreRequest);
      }
      if (data.__gisCloud) {
        if (!cloudRef.current) {
          cloudRef.current = createCloudBridge(emitCloudEvent);
        }
        cloudRef.current.handle(data as CloudRequest);
      }
      if (data.__gisAchievements) {
        if (!achievementsRef.current) {
          achievementsRef.current = createAchievementsBridge(
            emitAchievementsEvent,
          );
        }
        achievementsRef.current.handle(data as AchievementsRequest);
      }
    },
    [emitStoreEvent, emitCloudEvent, emitAchievementsEvent],
  );

  const onNavStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
    setOnDocument(isDocumentUrl(nav.url));
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
          // The GAME owns the whole viewport and scrolls nothing, so it gets
          // none of this. A DOCUMENT is the opposite: the library's pages are
          // long, and `scrollEnabled={false}` disables the underlying scroll
          // view outright on iOS — which left the LIBRARY row leading to a page
          // the reader could see the top of and never move down.
          bounces={onDocument}
          scrollEnabled={onDocument}
          overScrollMode={onDocument ? "always" : "never"}
          showsVerticalScrollIndicator={onDocument}
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
