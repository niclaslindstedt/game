// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind SCREENSHOTS on the desktop — where a picture the
// game took would go INTO STEAM'S OWN screenshot library, the place a Steam
// player expects to find one (Steam → View → Screenshots, and from there onto
// their profile, a friend's chat, or the Community hub).
//
// **There is no Steam provider today, and that is a finding rather than an
// omission.** It is written down here, at the seam, because this is the file
// somebody will open when they ask why the game does not call Steam directly.
//
//  1. **The binding cannot.** `steamworks.js` (0.4.0, the prebuilt-binary
//     binding this shell is built on) exposes achievements, cloud, stats,
//     overlay, input, workshop, matchmaking and networking — and no
//     `ISteamScreenshots` at all. `WriteScreenshot`, `AddScreenshotToLibrary`
//     and `HookScreenshots` are simply not bound. Reaching them means landing
//     them upstream or building our own N-API addon, and the latter also costs
//     the prebuilt binaries that make this shell installable without a Rust
//     toolchain. (Exactly the situation ./leaderboards-provider.ts records for
//     its own API; the two should be revisited together.)
//
//  2. **STEAM IS ALREADY DOING IT, and it needs no API to.** The overlay this
//     shell injects (`electronEnableSteamOverlay`, see main.ts) hooks the
//     presented frame and Steam's own screenshot key — F12 by default, and
//     whatever the player rebound it to in Steam's settings — so a press files
//     a copy in their Steam library with the game entirely uninvolved. The
//     game's SCREENSHOT bind ships on F12 IN A SHELL for that reason (a browser
//     tab defaults to ENTER instead — a page may not swallow F12) and never
//     captures the key away from the overlay (the page listens on `keydown`; it does not
//     grab), so one press on a Steam build gives the player BOTH: Steam's copy
//     in their Steam library, and the game's own copy in the in-game gallery
//     and on disk.
//
// So the honest reading is that `HookScreenshots` — the call that would make
// the game responsible for the picture INSTEAD of Steam — is the one we would
// least want even if it were bound: it would take a working feature away from
// the player and hand it to code that has to re-implement it. What is actually
// missing is `AddScreenshotToLibrary`, which would let a picture the player
// took some OTHER way (the in-game gallery's own key, on a build with no
// overlay) join their Steam library too. That is the gap, and it is small.
//
// Returning null is the seam's own idiom for exactly this (the mobile side's
// leaderboards provider returns null on Android today), and ./screenshots.ts
// already handles it: the picture is filed to the player's own pictures folder
// instead, and the game's status line says where it went.

/** Which platform library answered — labels the gallery's status line. */
export type ScreenshotLibraryId = "steam";

/** Somewhere a picture can be filed that is not just a folder. */
export type ScreenshotLibrary = {
  id: ScreenshotLibraryId;
  /**
   * Put this PNG in the platform's library. Resolves false when the platform
   * refused it — the caller still has its own on-disk copy either way.
   */
  add(png: Buffer, width: number, height: number): Promise<boolean>;
};

/**
 * The library for this shell. Always null today — see the header. The bridge
 * above it (./screenshots.ts) is wired up regardless, so adding one is one new
 * file and one line here, with no protocol or web-side change.
 */
export function screenshotLibrary(): ScreenshotLibrary | null {
  return null;
}
