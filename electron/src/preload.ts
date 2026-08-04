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

// A sandboxed preload may import Electron but cannot require arbitrary local
// modules. These mirror channels.ts and are drift-checked by preload_test.ts.
const SHELL_CHANNEL = "gis:post";
const NET_PORT_CHANNEL = "gis:net-port";

/**
 * WHAT THIS LAUNCH MAY DO, as a list of plain names.
 *
 * It arrives on this process's own command line (`additionalArguments` in the
 * window's `webPreferences`) rather than over the shell channel, because the
 * menus have to know before they are first drawn — a row that appears and then
 * vanishes a round trip later is worse than one that was never offered.
 * Resolved in the main process; see `capabilities.ts`.
 */
const CAPS_PREFIX = "--gis-caps=";
const caps = (
  process.argv.find((arg) => arg.startsWith(CAPS_PREFIX)) ?? CAPS_PREFIX
)
  .slice(CAPS_PREFIX.length)
  .split(",")
  .filter(Boolean);

contextBridge.exposeInMainWorld("__GIS_NATIVE__", true);
contextBridge.exposeInMainWorld("__GIS_PLATFORM__", "steam");
contextBridge.exposeInMainWorld("__GIS_CAPS__", Object.freeze(caps));
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
