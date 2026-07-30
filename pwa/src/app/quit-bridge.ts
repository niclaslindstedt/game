// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// QUIT — the smallest bridge in the game, and the only one with no reply.
//
// A desktop game's main menu ends with a way out; it is the one row a PC player
// looks for without reading. A browser tab cannot close itself (`window.close`
// is refused for a page the script did not open) and a phone has a home button
// and a task switcher, so the row exists in the DESKTOP shell alone — absent
// everywhere else rather than dead, exactly as the coin store and the vibration
// switch are.
//
// It is fire-and-forget on purpose: there is no request id, no waiter and no
// timeout, because the only successful outcome is the page ceasing to exist. A
// shell that ignores the message leaves the player exactly where they were,
// which is the right failure.
//
// The protocol, answered by `electron/src/main.ts`:
//
//   page → shell   { __gisQuit: true }
//
// A second platform is one line in `canQuitApp` and whatever that shell does
// with the same message — see the note on `shellPlatform` for why this asks
// WHICH shell rather than how to talk to one.

import { postToShell, shellAvailable, shellPlatform } from "./shell-bridge.ts";

/** Can this build close itself? Steam's Electron shell can; a browser, an
 * installed PWA and the mobile app cannot. */
export function canQuitApp(): boolean {
  return shellAvailable() && shellPlatform() === "steam";
}

/** Ask the shell to quit. Does nothing anywhere else. */
export function quitApp(): void {
  if (!canQuitApp()) return;
  postToShell({ __gisQuit: true });
}
