// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHELL CHANNEL — the one transport every native bridge posts over, and
// the one place that knows HOW a shell is reached.
//
// The game ships inside more than one shell: the Expo WebView (`native/`, iOS
// and Android) and the Electron desktop app (`electron/`, Steam). Both wrap the
// SAME built website and both answer the SAME bridge protocols (the coin store,
// cloud save, achievements, leaderboards; plus mods and MULTIPLAYER, which only
// the desktop shell can honour) — they differ only in the pipe the JSON travels
// down:
//
//   Expo WebView   `window.ReactNativeWebView.postMessage(json)`
//   Electron       `window.__gisShell.post(json)`  (preload → ipcRenderer)
//
// So the pipe is the ONLY thing abstracted here. Every bridge keeps its own
// protocol, its own request ids and its own waiters; they just stopped naming
// React Native to send a message. A third shell is a third arm of `post` and
// nothing else — which is the same promise the native providers make about a
// second platform.
//
// The RETURN path needs no abstraction at all, and that is deliberate: both
// shells call the page's `window.__gis*Event(...)` callbacks from the outside
// (`injectJavaScript` on the WebView, `webContents.executeJavaScript` in
// Electron), so the bridges' receiving half is already shell-agnostic and is
// left exactly as it was.

import { isNativeApp } from "./native.ts";

/** Which shell the game is running inside, when it is running inside one.
 * `ios`/`android` are the Expo WebView (`native/`); `steam` is the Electron
 * desktop app (`electron/`). */
export type ShellPlatform = "ios" | "android" | "steam";

declare global {
  interface Window {
    /** The Expo WebView's message channel into the native shell
     * (native/App.tsx `onMessage`). */
    ReactNativeWebView?: { postMessage(message: string): void };
    /** The Electron shell's message channel, exposed by the preload over
     * `contextBridge` (electron/src/preload.ts). Same JSON, same protocols. */
    __gisShell?: {
      post(message: string): void;
      /**
       * MULTIPLAYER'S SNAPSHOT CHANNEL — the one thing this shell hands over
       * that is not a JSON string, and the only exception to "the pipe carries
       * text". A session publishes twenty times a second, which is not traffic
       * for a channel built around round trips, so the shell mints a
       * `MessagePort` pair and gives the page one end (see
       * `pwa/src/app/net-bridge.ts` and `electron/src/net.ts`).
       *
       * Optional because only the desktop shell has it: the WebView shells
       * host nothing, and a browser has no shell at all.
       */
      onNetPort?(listener: (port: MessagePort) => void): void;
    };
    /** Which shell this is — set by the shell before the game boots, beside
     * `__GIS_NATIVE__`. Absent in a browser/PWA. */
    __GIS_PLATFORM__?: ShellPlatform;
  }
}

/**
 * Which shell we're in, or null in a browser/PWA.
 *
 * Read it to answer "does THIS shell have that platform feature", never to
 * decide how to talk to it — that's `postToShell`'s job. The coin store is the
 * live example: it exists on iOS and Android, and deliberately does not exist
 * on Steam (the game is bought once there), so `store-bridge.ts` asks this.
 */
export function shellPlatform(): ShellPlatform | null {
  if (typeof window === "undefined") return null;
  const platform = window.__GIS_PLATFORM__;
  return platform === "ios" || platform === "android" || platform === "steam"
    ? platform
    : null;
}

/**
 * True when a shell is present AND its channel is up — i.e. a bridge request
 * could actually be answered. Every bridge's own `*BridgeAvailable()` is this
 * plus whatever that protocol additionally requires.
 *
 * Both halves matter: `isNativeApp()` says a shell wrapped the page, and the
 * channel says it finished wiring itself up. A request posted with no channel
 * would sit unanswered until its timeout, which reads as a stall rather than
 * as the "no such feature here" it actually is.
 */
export function shellAvailable(): boolean {
  return (
    isNativeApp() &&
    typeof window !== "undefined" &&
    (!!window.ReactNativeWebView || !!window.__gisShell)
  );
}

/**
 * Post one already-tagged message to whichever shell is listening.
 *
 * The caller supplies its own protocol flag (`__gisCloud`, `__gisStore`, …) —
 * this only serializes and picks the pipe, so a bridge's protocol stays
 * documented in the bridge that owns it.
 *
 * Never throws: a page tearing down can lose its channel mid-flight, and every
 * caller already resolves that case through its own request timeout.
 */
export function postToShell(message: Record<string, unknown>): void {
  try {
    const json = JSON.stringify(message);
    if (window.__gisShell) {
      window.__gisShell.post(json);
      return;
    }
    window.ReactNativeWebView?.postMessage(json);
  } catch {
    // Channel gone (page tearing down) — waiters resolve via their timeouts.
  }
}
