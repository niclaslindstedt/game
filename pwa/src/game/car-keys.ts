// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR'S OWN KEYS — WASD at the wheel, read as PEDALS AND A WHEEL rather
// than as a direction on the screen.
//
//   D  ACCELERATE          A  DECELERATE (then reverse)
//   W  TURN LEFT (UP)      S  TURN RIGHT (DOWN)
//   SPACE  HANDBRAKE (the JUMP bind — see `CarKeyControl.handbrake`)
//
// AND THEY MEAN THAT WHEREVER THE NOSE IS POINTING, which is the whole reason
// this module exists. A thumb on a pad says a DIRECTION — "go that way" — and
// the engine reads such a push along the car's own nose, so dragging the way
// the car is pointing is the accelerator on either leg of the road
// (`carControl`, src/game/vehicles.ts). A KEY is not a direction: D is the
// right-hand pedal, and a pedal that became the brake because the car turned
// round is a pedal nobody can drive with. So the four keys are resolved HERE,
// in the car's own frame, and then handed to the engine as a target it reads
// straight back — `carKeyTarget` is that inverse, and it is why the keyboard
// answers the same on the way out of the garage, on the way home, and under
// any camera yaw the projection happens to be wearing.
//
// ONE MODULE, BOTH WHEELS: the garage's pottering car (game-screen/
// player-input.ts) and the minigame's 120 mph one (drive-screen/) read their
// keys through this, so the car handles the same in both — which is the rule
// the physics already follows (`applyCarControl`).
//
// It is a LEAF — the bindings catalog and the vector helper, nothing else — so
// it stays testable in plain Node.

import { clamp } from "@game/lib/vec.ts";
import type { CarVehicle } from "@game/core";

import {
  actionForCode,
  moveVectorForCode,
  type KeyBindings,
} from "./keybindings.ts";

/** What the driver is asking for this tick, in the car's own frame — the
 * engine's `CarControl`, arrived at from four keys instead of a push. */
export type CarKeyControl = {
  /** -1 (full brake / reverse) … +1 (full throttle), 0 = hold this speed. */
  pedal: number;
  /** -1 (nose swings up the screen) … +1 (down), 0 = straighten up. */
  wheel: number;
  /**
   * THE HANDBRAKE, on the JUMP bind — SPACE as it ships.
   *
   * A borrowed key rather than a fifteenth row in the KEY BINDINGS menu, and it
   * is the right borrow twice over: space is where every driving game in
   * existence puts the lever, and JUMP is the one action on the board that a man
   * sitting in a car cannot perform. Nothing is taken from anybody — the bind
   * still jumps on foot, and it only ever reads as the lever with hands on a
   * wheel, because this whole module is only ever called at one.
   */
  handbrake: boolean;
};

/** Nothing held: carry on as you are (see `CAR.idleDragPx`). */
export const CAR_KEYS_IDLE: CarKeyControl = {
  pedal: 0,
  wheel: 0,
  handbrake: false,
};

/** The arrow cluster, as the same four controls. The player's OWN binds are
 * read first (so a rebound WASD drives); the arrows are a fallback for a key
 * that is bound to nothing at all, which is what lets the road be driven with
 * either hand without spending four more rows in the KEY BINDINGS menu. */
const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * This tick's pedal and wheel from the keys that are down.
 *
 * The steering binds already carry exactly the right vectors — FORWARD is
 * (0,-1) and RIGHT is (1,0) — so the sum IS the control: x is the pedal and y
 * is the wheel. Opposite keys cancel to a coast, and a held pair (D and W)
 * accelerates while it turns.
 */
export function carKeyControl(
  held: Iterable<string>,
  binds: KeyBindings,
): CarKeyControl {
  let pedal = 0;
  let wheel = 0;
  let handbrake = false;
  for (const code of held) {
    if (code === binds.jump) handbrake = true;
    const bound = moveVectorForCode(code, binds);
    // An arrow only drives while it is spare: a player who put the MAP on
    // ArrowUp meant the map, and `moveVectorForCode` has already answered for
    // an arrow that IS the steering bind.
    const vector =
      bound ?? (isSpare(code, binds) ? (ARROWS[code] ?? undefined) : undefined);
    if (!vector) continue;
    pedal += vector.x;
    wheel += vector.y;
  }
  return {
    pedal: clamp(pedal, -1, 1),
    wheel: clamp(wheel, -1, 1),
    handbrake,
  };
}

/** Is this code bound to nothing at all? (Steering, the walk modifier and
 * every discrete action are all one flat map of codes.) */
function isSpare(code: string, binds: KeyBindings): boolean {
  if (moveVectorForCode(code, binds)) return false;
  if (actionForCode(code, binds)) return false;
  return !Object.values(binds).includes(code);
}

/**
 * The pedal and the wheel, written back out as the world point the ENGINE
 * reads them off (`GameInput.target` → `carControl`).
 *
 * The engine takes the target as a plain DIRECTION off the car and splits it
 * along the nose (throttle) and across it (wheel), so putting the point at
 * `pedal × nose` ahead and `wheel` abeam hands back exactly the control that
 * went in. `reach` is how far out the point is thrown — any distance well past
 * the engine's own 1-px deadzone does, since only the direction is read.
 */
export function carKeyTarget(
  car: Pick<CarVehicle, "pos" | "faceLeft">,
  control: CarKeyControl,
  reach: number,
): { x: number; y: number } {
  const nose = car.faceLeft ? -1 : 1;
  return {
    x: car.pos.x + control.pedal * nose * reach,
    y: car.pos.y + control.wheel * reach,
  };
}
