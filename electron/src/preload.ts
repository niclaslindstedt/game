// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The preload — the desktop peer of native/src/injected.ts, and the whole of
// the page's view of the shell.
//
// It exposes exactly three things into the page, all of them before the game's
// own scripts run:
//
//   __GIS_NATIVE__    this is a store shell, so the PWA update lifecycle is off
//                     (pwa/src/app/native.ts). The app bundles the game and
//                     ships updates through Steam; a service worker here would
//                     precache a build the player can no longer be given.
//   __GIS_PLATFORM__  WHICH shell — read by pwa/src/app/shell-bridge.ts to
//                     answer platform-feature questions, e.g. that Steam does
//                     not sell coins and has no vibration motor.
//   __gisShell.post   the page → shell pipe, the counterpart of the WebView's
//                     `ReactNativeWebView.postMessage`.
//
// The RETURN path is not here: the main process calls the page's
// `window.__gis*Event(...)` callbacks with `executeJavaScript`, exactly as the
// mobile shell calls them with `injectJavaScript`. That keeps the web side's
// receiving half identical on both shells.
//
// **`contextIsolation` stays ON**, which is a deliberate departure from
// steamworks.js' own Electron instructions (they suggest `nodeIntegration: true`
// and `contextIsolation: false` so the renderer can require the native module).
// The renderer here is the GAME — a large web app with its own dependency tree
// — and it has no business holding a handle to Steam, the filesystem, or
// `require`. Steam lives in the main process and the page reaches it only
// through the four JSON protocols it already speaks to the phone app. The
// isolation costs nothing and removes the entire class of "the page can do
// anything Node can".

import { contextBridge, ipcRenderer } from "electron";

/** The channel every bridge message travels on. One channel for all four
 * protocols, because each message already carries its own `__gis*` flag and the
 * main process routes on that — the same way the WebView's single `onMessage`
 * does. */
export const SHELL_CHANNEL = "gis:post";

/** The channel the renderer's end of the multiplayer snapshot port arrives on.
 * Mirrors `NET_PORT_CHANNEL` in net.ts — it cannot be imported from there,
 * because the preload is a separate bundle with no view of the main process's
 * module graph. */
const NET_PORT_CHANNEL = "gis:net-port";

contextBridge.exposeInMainWorld("__GIS_NATIVE__", true);
contextBridge.exposeInMainWorld("__GIS_PLATFORM__", "steam");
contextBridge.exposeInMainWorld("__gisShell", {
  post(message: string): void {
    // Only strings cross. The main process parses and validates; a structured
    // object would let the page hand `ipcRenderer` something with a prototype
    // to argue about, and the protocol is JSON on the phone shell anyway.
    if (typeof message !== "string") return;
    ipcRenderer.send(SHELL_CHANNEL, message);
  },
  /**
   * MULTIPLAYER'S SNAPSHOT CHANNEL — the one thing that crosses this bridge
   * which is not a JSON string, and the exception is deliberate.
   *
   * A session publishes twenty times a second; routing that through
   * `post`/`executeJavaScript` like the other five protocols would serialize
   * every mob on the field through the main process's event loop and back out
   * as a JavaScript literal. So the main process mints a `MessagePort` pair and
   * hands one end to the utility process running the simulation and the other
   * to this page, and the two talk directly with the buffer TRANSFERRED rather
   * than copied.
   *
   * A port is not a value `contextBridge` can hand over, so the listener is
   * registered here and the port is delivered to it — which also keeps the
   * page from ever seeing the `ipcRenderer` event that carried it.
   */
  onNetPort(listener: (port: MessagePort) => void): void {
    if (typeof listener !== "function") return;
    ipcRenderer.on(NET_PORT_CHANNEL, (event) => {
      const port = event.ports[0];
      if (port) listener(port);
    });
  },
});
