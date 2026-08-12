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
//
// THE SECOND THING A COMMAND LINE CAN DO HERE IS HAND BACK A FEATURE THE SHELL
// SHIPS WITHOUT — the AUTO PILOT, and it is the only one of its kind. The paid
// ride flies the hero for the player, which is a fine thing to buy on a phone
// and a cheat in a session, so no desktop build carries it and `--autopilot` is
// a DEVELOPER switch that costs the launch its multiplayer. Two functions
// answer the two halves of that below, and they fail in opposite directions on
// purpose.

import { shellCapability } from "./shell-bridge.ts";

declare global {
  interface Window {
    /** True when this shell's launch options — rather than its packaging —
     * are what turned multiplayer, mods or voice on. Stamped by the shell
     * before the page loads; absent everywhere else. */
    __GIS_UNLOCKED__?: boolean;
    /** True when this shell's launch options are what gave the launch the AUTO
     * PILOT — a developer switch on a shell that ships without the ride. Same
     * delivery, same failure direction; absent everywhere else. */
    __GIS_AUTOPILOT__?: boolean;
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

/**
 * Whether the AUTO PILOT was switched on by this launch's command line.
 *
 * THE SECOND FACT IN THIS FILE, and the one that reads backwards from the
 * first: `--multiplayer` gives a launch something its packaging withheld, while
 * `--autopilot` gives it something no desktop packaging carries AT ALL. The
 * desktop shells ship without the ride on purpose — this is a game played WITH
 * people, and a copy that plays itself is a cheat in somebody else's session —
 * so asking for it costs the launch its multiplayer, and that is what the
 * notice says.
 *
 * Fails closed for exactly the reasons `unlockedByLaunchOptions` does: a
 * browser, an installed PWA and the phone builds all have the ride and none of
 * them was started with a command line, so an absent global must not put a
 * warning in front of them.
 */
export function autopilotByLaunchOption(): boolean {
  if (typeof window === "undefined") return false;
  return window.__GIS_AUTOPILOT__ === true;
}

/**
 * Whether the AUTO PILOT may be offered on this launch at all — the question
 * the pause menu's row is gated on (`PausedOverlays.tsx`).
 *
 * A CAPABILITY read rather than a launch-option read, so it FAILS OPEN: a
 * browser, an installed PWA and both phone shells publish no capability list
 * and keep the ride they have always had. Only a shell that publishes a list is
 * taken at its word, and the two desktop shells are the only ones that do —
 * they leave `autopilot` out of it unless `--autopilot` put it there.
 *
 * The pair with `autopilotByLaunchOption` above is deliberate and is the same
 * pair `__GIS_CAPS__` and `__GIS_UNLOCKED__` already are: one answers "may the
 * game offer this", the other "was it asked for by hand", and they fail in
 * opposite directions because the questions do.
 */
export function autopilotAllowed(): boolean {
  return shellCapability("autopilot");
}

/** Which of the two things this launch has to be told about before it reaches
 * the menu. Both may be true at once (`--mods --autopilot`), which is one box
 * with two paragraphs in it rather than two boxes. */
export type LaunchNoticeReasons = {
  /** Licensed features were switched on by the command line. */
  licence: boolean;
  /** The AUTO PILOT was, and multiplayer went with it. */
  autopilot: boolean;
};

/**
 * What this launch owes the player a sentence about, or null when it owes them
 * nothing — which is every browser, every installed PWA, both phone builds and
 * every desktop launch nobody typed an option into.
 *
 * Asked ONCE, at the top of the app, so the answer cannot be re-raised by a
 * later render; never remembered across launches, because the page load IS the
 * launch (`pwa/src/game/LaunchNotice.tsx` says the words).
 */
export function launchNoticeReasons(): LaunchNoticeReasons | null {
  const licence = unlockedByLaunchOptions();
  const autopilot = autopilotByLaunchOption();
  return licence || autopilot ? { licence, autopilot } : null;
}
