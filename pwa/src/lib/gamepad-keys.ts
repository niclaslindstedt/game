// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CONTROLLER NAVIGATION — driving the game's menus with a gamepad, by
// translating the pad into the KEYBOARD the UI already speaks.
//
// The alternative was threading gamepad awareness through every navigable
// surface, and there are a dozen of them: the title menu and its whole settings
// tree, the pause menu, the inventory, the shop, the level-up chooser, the
// talent picker, the vault, the achievements shelf, the arsenal, the high-score
// board, the item card, the effects gallery. Each already implements arrow /
// Enter / Escape navigation, and — the fact that makes this work — every single
// one listens on `window`. So one bridge that dispatches synthetic key events
// makes all of them controller-navigable at once, and any surface added later
// gets it for free rather than having to remember to opt in.
//
// It is a translation, not an emulation: nothing here knows what a menu is, and
// no menu learns what a gamepad is.
//
// **The one hazard is the FIELD**, where the pad is already steering the hero.
// Arrow keys are rebindable to movement, so a bridge running during play could
// walk the character while the player is only trying to browse. The run
// therefore SUSPENDS the bridge while it owns the input — see
// `setGamepadKeysSuspended`, which the game screen drives off its own phase.
// Every menu, overlay and pause screen is a different phase, so they all keep
// navigation; only live play gives it up, and there is nothing to navigate
// there anyway.

import {
  createStepRepeat,
  pollGamepad,
  pressedSince,
  repeatStep,
  stepDirection,
  BUTTON,
  type GamepadSnapshot,
  type StepDirection,
} from "./gamepad.ts";

/** The key a step direction stands for. */
const STEP_KEYS: Record<StepDirection, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

/**
 * Which key each button stands for.
 *
 * `a` → Enter and `b` → Escape is the console convention every player already
 * has in their hands, and it happens to be exactly what this UI implements:
 * Enter chooses a row, Escape backs out of a screen. START also backs out,
 * because a player who opened a menu with START expects it to close the same
 * way.
 *
 * Nothing else is mapped. A button that did something surprising in a menu is
 * worse than a button that does nothing.
 */
const BUTTON_KEYS: Record<number, string> = {
  [BUTTON.a]: "Enter",
  [BUTTON.b]: "Escape",
  [BUTTON.start]: "Escape",
};

/** Set by the run while the field owns the pad — see the header. */
let suspended = false;

/**
 * Suspend or resume controller navigation.
 *
 * Called by the game screen off its own phase: `playing` suspends (the stick is
 * steering the hero), every other phase resumes (a menu or overlay is up). It
 * is a module-level flag rather than a prop because the bridge is mounted once,
 * globally, above every screen that might want it.
 */
export function setGamepadKeysSuspended(value: boolean): void {
  suspended = value;
}

/** Build and dispatch one synthetic key event on `window`.
 *
 * Only `keydown` is emitted: every navigable surface in the game acts on
 * keydown and none tracks a held key, so a matching keyup would be ceremony
 * with nothing listening for it. `bubbles` is set so listeners registered in
 * either phase see it. */
function pressKey(key: string): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      // Both are set because the surfaces are split on which they read — the
      // menus match on `key`, the gameplay binds on `code`. For the keys used
      // here the two strings happen to be identical.
      code: key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** The keys one frame of pad state should produce, given the previous frame.
 * Pure, so the mapping is testable without a browser or a controller. */
export function keysForFrame(
  previous: GamepadSnapshot | null,
  current: GamepadSnapshot | null,
  repeat: ReturnType<typeof createStepRepeat>,
  now: number,
): string[] {
  const keys: string[] = [];
  const step = repeatStep(repeat, stepDirection(current), now);
  if (step) keys.push(STEP_KEYS[step]);
  for (const button of pressedSince(previous, current)) {
    const key = BUTTON_KEYS[button];
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * Start the bridge. Returns a stop function.
 *
 * Polled on an animation frame rather than a timer: the Gamepad API only
 * refreshes its snapshots per frame anyway, and a rAF loop stops on its own
 * while the window is in the background — a game left on the title screen
 * should not be reading a controller forever.
 */
export function startGamepadKeyBridge(): () => void {
  if (typeof window === "undefined") return () => {};
  let previous: GamepadSnapshot | null = null;
  const repeat = createStepRepeat();
  let frame = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    frame = window.requestAnimationFrame(tick);
    const current = pollGamepad(previous?.index);
    if (suspended) {
      // Keep tracking state while suspended, so resuming does not read the
      // whole held state as a burst of fresh presses.
      previous = current;
      return;
    }
    for (const key of keysForFrame(previous, current, repeat, now)) {
      pressKey(key);
    }
    previous = current;
  };

  frame = window.requestAnimationFrame(tick);
  return () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
  };
}
