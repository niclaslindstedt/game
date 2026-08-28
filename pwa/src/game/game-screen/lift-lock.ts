// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A KEYED LIFT SAYS WHEN IT WILL NOT COME.
//
// The engine refuses the ride and says nothing (`stepElevators`): the pad is a
// fixture with no voice, and it books an `elevatorLocked` event every tick the
// hero stands on it precisely so the APP can hold a read on screen for as long
// as he is asking. Without one the refusal is invisible — the plate is one more
// piece of ground furniture, the hero walks over it, nothing happens, and on
// the venues that END past a lift that is a player concluding the level is
// broken. (It is the only door in the game with no door in front of it.)
//
// It NAMES THE CARD, because "locked" on its own sends nobody anywhere. The
// pad's `opensWith` is a DOOR id, so the name comes through `keyItemForDoor` —
// the catalog is the only place the two id spaces meet.
//
// Lives beside event-fx.ts rather than in it so a root test can reach it.

import { keyItemForDoor, type GameState } from "@game/core";
import type { Vec2 } from "@game/core";

/**
 * How long one refusal's read stands before the pad may say it again (ms).
 * The event fires every tick, so without this the float lane fills with sixty
 * copies a second of the same sentence.
 */
export const LIFT_LOCK_REPEAT_MS = 1400;

/** How far above the plate the line floats (world px) — clear of the hero
 * standing on it, who is the reason the line is there. */
const LIFT_OFFSET = 22;

export type LiftLockRead = { text: string; pos: Vec2 };

/**
 * The line to float over a lift that just refused, or null when the last one
 * is still up (or the pad has gone). Stamps `shared` with the moment it spoke,
 * so the throttle is per RUN rather than per pad — two lifts arguing over the
 * lane would be worse than one saying it twice.
 */
export function lockedLiftRead(
  state: GameState,
  event: { id: string; key: string },
  shared: { liftRefusedMs: number },
): LiftLockRead | null {
  const now = state.stats.timeMs;
  if (now - shared.liftRefusedMs < LIFT_LOCK_REPEAT_MS) return null;
  const pad = state.elevators.find((p) => p.id === event.id);
  if (!pad) return null;
  shared.liftRefusedMs = now;
  const key = keyItemForDoor(event.key);
  return {
    pos: { x: pad.pos.x, y: pad.pos.y - LIFT_OFFSET },
    // A door nothing in the catalog opens is not an authoring hole to shout
    // about here — the staff entrance is exactly that by design — so the read
    // falls back to the fact rather than to a name it does not have.
    text: key ? `NEEDS ${key.name}` : "LOCKED",
  };
}
