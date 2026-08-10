// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE COMMAND LINE TURNED ON — the one fact about HOW a desktop build was
// started that the game itself has to put in front of the player.
//
// Multiplayer and mod support are licensed with the store edition and not with
// a plain download of the binary, so a copy that has either of them switched on
// by launch options (`--multiplayer`, `--mods`, `--voice`) is being run outside
// the terms it was given. Somebody has to have said they understand that, on
// every such launch — a preference that remembered the answer would turn an
// acknowledgement into a checkbox.
//
// That used to be an OPERATING-SYSTEM MESSAGE BOX the shell raised before it
// created the window: a system-font dialog, with the platform's own buttons, in
// front of a game that had not drawn a pixel yet. It is now the game's own
// popup in front of the title menu (`pwa/src/game/LaunchNotice.tsx`) — the same
// words, the same refusal, in the game's window skin.
//
// THE SHELL STATES THE FACT; THE GAME SAYS THE WORDS. All that crosses is this
// one boolean, stamped onto `window` before the page's first module evaluates
// (`electron/src/preload.ts`, `tauri/src-tauri/src/page.rs`) — the same delivery
// `__GIS_CAPS__` and `__GIS_POLICY__` use, and for the same reason: the answer
// is wanted while the app is deciding what to paint, so a round trip would show
// the menu first and the notice after it.
//
// AND IT FAILS CLOSED — the opposite of the device policy beside it. An absent
// answer is a browser, an installed PWA, a phone build, or a shell that says
// nothing about launch options; none of those was started with one, and every
// one of them would otherwise be shown a licence notice about nothing.

declare global {
  interface Window {
    /** True when this shell's launch options — rather than its packaging —
     * are what turned multiplayer, mods or voice on. Stamped by the shell
     * before the page loads; absent everywhere else. */
    __GIS_UNLOCKED__?: boolean;
  }
}

/**
 * Whether this launch was unlocked by its command line, and therefore owes the
 * player the notice before they reach the menu.
 *
 * Only an explicit `true` counts (see the header): anything else — no shell, no
 * global, a string, a shell that predates the flag — is a launch nobody has to
 * acknowledge anything about.
 */
export function unlockedByLaunchOptions(): boolean {
  if (typeof window === "undefined") return false;
  return window.__GIS_UNLOCKED__ === true;
}
