// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Reading a game controller. Generic browser input with no game in it, so it
// lives in the shared pool (`@ui/lib/gamepad.ts`) and is earmarked for
// extraction to oss-framework once it has been played with properly.
//
// The Gamepad API is a POLLING api, not an event one: `navigator.getGamepads()`
// returns a fresh snapshot each call and there are no button events at all. So
// this module's job is to turn that into something a game loop and a menu can
// both use — a snapshot per frame, plus the EDGES between two snapshots, since
// "the player just pressed A" is what a menu needs and the API never says it.
//
// One reader covers every shell the game ships in, which is the reason to do it
// in the web layer rather than in `electron/`: Chromium implements the Gamepad
// API, so the same code serves the browser, the desktop Steam build (where
// Steam Input presents even an exotic pad as a standard one), and iOS/Android's
// WKWebView, which exposes MFi and Bluetooth controllers the same way. Nothing
// platform-specific is needed for any of them.
//
// Everything here except `pollGamepad` is PURE — the deadzone shaping and the
// edge diffing are the parts with the bugs in them, and they are testable
// without a browser or a controller.

/** The standard-mapping button indices, per the W3C Gamepad spec's "standard"
 * layout. Named for the Xbox face labels because that is the layout the spec
 * itself is written against; a PlayStation pad reports the same INDICES (its
 * cross is 0, circle is 1), so a binding is stable across pads even though the
 * printed glyph differs. */
export const BUTTON = {
  /** A / cross — confirm. */
  a: 0,
  /** B / circle — back. */
  b: 1,
  /** X / square. */
  x: 2,
  /** Y / triangle. */
  y: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  /** Back / Select / Share. */
  select: 8,
  start: 9,
  leftStick: 10,
  rightStick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export type ButtonName = keyof typeof BUTTON;

/** Axis indices in the standard mapping. */
export const AXIS = {
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 3,
} as const;

/**
 * How far a stick must leave centre before it counts as pushed.
 *
 * Sticks rest off-centre — a worn one can idle at 0.15 — so a game that reads
 * the raw value walks slowly in a random direction forever while nobody is
 * touching it. 0.25 clears every pad tested in the wild without eating enough
 * travel to make a gentle push unreachable.
 */
export const STICK_DEADZONE = 0.25;

/**
 * How far a stick must go before it counts as a DIRECTION for menu navigation.
 * Higher than the movement deadzone on purpose: a menu step is a discrete,
 * one-shot action, so a stick resting just past the walking threshold must not
 * scroll a list, and a deliberate flick must not skip two rows.
 */
export const STICK_STEP_THRESHOLD = 0.6;

/** A stick reading after deadzone shaping. `magnitude` is 0 at the deadzone
 * edge and 1 at full deflection — NOT the raw distance. */
export type StickVector = { x: number; y: number; magnitude: number };

const CENTERED: StickVector = { x: 0, y: 0, magnitude: 0 };

/**
 * Shape a raw stick reading into a usable vector.
 *
 * RADIAL, not per-axis: a deadzone applied to x and y separately carves a
 * SQUARE hole out of the centre, which lets a stick pushed straight up register
 * a small sideways component while a diagonal push of the same force registers
 * nothing — the classic "my character drifts when I push up" bug.
 *
 * And RESCALED: after subtracting the deadzone, the remaining travel is
 * stretched back over 0…1. Without that, the slowest a character can move is a
 * lurch at whatever fraction the deadzone cut off, and the analogue control the
 * stick exists to give is gone — a creep would be impossible.
 */
export function stickVector(
  rawX: number,
  rawY: number,
  deadzone: number = STICK_DEADZONE,
): StickVector {
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return CENTERED;
  const distance = Math.hypot(rawX, rawY);
  if (distance <= deadzone) return CENTERED;
  // Clamp to the unit circle first: a pad can report a diagonal past 1.0, and
  // an unclamped magnitude would let a corner push outrun a cardinal one.
  const clamped = Math.min(1, distance);
  const magnitude = (clamped - deadzone) / (1 - deadzone);
  return {
    x: (rawX / distance) * magnitude,
    y: (rawY / distance) * magnitude,
    magnitude,
  };
}

/** One frame of controller state — everything a consumer needs, with nothing
 * live in it (the browser's own Gamepad object is a snapshot that goes stale,
 * so it is copied out rather than held). */
export type GamepadSnapshot = {
  /** The pad's index in `navigator.getGamepads()`. */
  index: number;
  /** The browser's identification string — used to pick a glyph set. */
  id: string;
  /** True when the browser remapped the pad to the standard layout, so the
   * `BUTTON` indices mean what they say. */
  standard: boolean;
  /** Pressed state per button index. */
  buttons: readonly boolean[];
  /** Raw axis values, before any deadzone. */
  axes: readonly number[];
};

/**
 * The active controller, or null when none is connected.
 *
 * Picks the first pad reporting any activity, then keeps to it: a wireless pad
 * left in a drawer and a plugged-in racing wheel both show up in the list, and
 * whichever the player is actually holding is the one moving. Ties are broken
 * by index so the choice is stable frame to frame.
 */
export function pollGamepad(preferIndex?: number): GamepadSnapshot | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  let pads: (Gamepad | null)[];
  try {
    pads = navigator.getGamepads();
  } catch {
    // Some browsers throw here when the page is not focused or the feature is
    // blocked by permissions policy; a controller is a convenience, never a
    // requirement, so this degrades to "no pad".
    return null;
  }

  // Once a pad has been chosen we STAY on it for as long as it is connected,
  // even while it sits still. Re-picking per frame would let a second connected
  // pad — a drawer controller waking up, a racing wheel reporting a jittery
  // axis — steal input mid-fight. Only when the preferred pad is gone does the
  // choice reopen, and then an ACTIVE pad wins over a merely-connected one, so
  // plugging in and immediately pushing the stick picks the right device.
  let active: GamepadSnapshot | null = null;
  let connected: GamepadSnapshot | null = null;
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const snapshot = toSnapshot(pad);
    if (pad.index === preferIndex) return snapshot;
    if (!active && isActive(snapshot)) active = snapshot;
    if (!connected) connected = snapshot;
  }
  return active ?? connected;
}

function toSnapshot(pad: Gamepad): GamepadSnapshot {
  return {
    index: pad.index,
    id: pad.id,
    standard: pad.mapping === "standard",
    buttons: pad.buttons.map((button) => button.pressed),
    axes: [...pad.axes],
  };
}

/** Is anything on this pad being touched right now? */
export function isActive(snapshot: GamepadSnapshot): boolean {
  if (snapshot.buttons.some(Boolean)) return true;
  return snapshot.axes.some((axis) => Math.abs(axis) > STICK_DEADZONE);
}

/** Read one named button out of a snapshot. */
export function buttonDown(
  snapshot: GamepadSnapshot | null,
  name: ButtonName,
): boolean {
  return snapshot?.buttons[BUTTON[name]] === true;
}

/** The left stick, shaped. This is the steering input. */
export function leftStick(snapshot: GamepadSnapshot | null): StickVector {
  if (!snapshot) return CENTERED;
  return stickVector(
    snapshot.axes[AXIS.leftX] ?? 0,
    snapshot.axes[AXIS.leftY] ?? 0,
  );
}

/** The right stick, shaped. */
export function rightStick(snapshot: GamepadSnapshot | null): StickVector {
  if (!snapshot) return CENTERED;
  return stickVector(
    snapshot.axes[AXIS.rightX] ?? 0,
    snapshot.axes[AXIS.rightY] ?? 0,
  );
}

/**
 * Which buttons went down between two snapshots.
 *
 * The whole reason this module keeps previous state: the Gamepad API reports
 * only that a button IS down, so a menu reading it directly would advance one
 * row per frame — sixty rows a second — for as long as the player holds A.
 *
 * A frame with no comparable predecessor — the first poll, or the first poll
 * after the pad changed — yields NO edges and simply becomes the baseline. It
 * would otherwise report everything already held as freshly pressed, so a
 * controller reconnecting mid-fight with a trigger down, or a game launched
 * with A held, would fire actions the player never made. One frame of latency
 * at 60 Hz is not perceptible; a phantom confirm is.
 */
export function pressedSince(
  previous: GamepadSnapshot | null,
  current: GamepadSnapshot | null,
): number[] {
  if (!current) return [];
  // No comparable predecessor: establish a baseline instead of inventing edges.
  if (!previous || previous.index !== current.index) return [];
  const out: number[] = [];
  for (let i = 0; i < current.buttons.length; i += 1) {
    if (current.buttons[i] && !previous.buttons[i]) out.push(i);
  }
  return out;
}

/** Was this named button pressed between the two snapshots? */
export function wasPressed(
  previous: GamepadSnapshot | null,
  current: GamepadSnapshot | null,
  name: ButtonName,
): boolean {
  return pressedSince(previous, current).includes(BUTTON[name]);
}

/** A discrete menu direction from the d-pad or the left stick, or null. Used
 * with `repeatStep` below, never read raw — see its note. */
export type StepDirection = "up" | "down" | "left" | "right";

/** The direction a snapshot is currently asking for, treating the d-pad and a
 * pushed stick as the same thing. Diagonals resolve to the DOMINANT axis, so a
 * sloppy diagonal moves one row rather than jumping a row and a column. */
export function stepDirection(
  snapshot: GamepadSnapshot | null,
): StepDirection | null {
  if (!snapshot) return null;
  if (buttonDown(snapshot, "dpadUp")) return "up";
  if (buttonDown(snapshot, "dpadDown")) return "down";
  if (buttonDown(snapshot, "dpadLeft")) return "left";
  if (buttonDown(snapshot, "dpadRight")) return "right";
  const stick = leftStick(snapshot);
  if (stick.magnitude < STICK_STEP_THRESHOLD) return null;
  if (Math.abs(stick.x) > Math.abs(stick.y)) {
    return stick.x > 0 ? "right" : "left";
  }
  // Screen coordinates: a stick pushed forward reads NEGATIVE on Y.
  return stick.y > 0 ? "down" : "up";
}

/** How long a held direction waits before it starts repeating, and how fast it
 * repeats after that — the same shape as a keyboard's own auto-repeat, because
 * a held stick that either steps once or scrolls at 60 Hz is equally unusable
 * on a long list. */
export const STEP_REPEAT_DELAY_MS = 400;
export const STEP_REPEAT_INTERVAL_MS = 120;

/** Mutable bookkeeping for `repeatStep`. Create one per navigable surface. */
export type StepRepeatState = {
  direction: StepDirection | null;
  /** When the current direction was first seen. */
  since: number;
  /** When a step was last emitted. */
  last: number;
};

export function createStepRepeat(): StepRepeatState {
  return { direction: null, since: 0, last: 0 };
}

/**
 * Turn a held direction into discrete steps with keyboard-style auto-repeat:
 * one immediately, then nothing until the delay, then one per interval.
 *
 * Returns the direction to step, or null. Pure given its state and the clock,
 * so the timing is testable without waiting for it.
 */
export function repeatStep(
  state: StepRepeatState,
  direction: StepDirection | null,
  now: number,
): StepDirection | null {
  if (!direction) {
    state.direction = null;
    return null;
  }
  if (direction !== state.direction) {
    state.direction = direction;
    state.since = now;
    state.last = now;
    return direction; // the first step is immediate
  }
  const held = now - state.since;
  if (held < STEP_REPEAT_DELAY_MS) return null;
  if (now - state.last < STEP_REPEAT_INTERVAL_MS) return null;
  state.last = now;
  return direction;
}
