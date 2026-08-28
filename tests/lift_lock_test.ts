// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE READ A KEYED LIFT PUTS ON SCREEN WHEN IT WILL NOT COME.
//
// The engine refuses the ride silently and books `elevatorLocked` EVERY TICK
// the hero stands on the plate, which makes two things the app's to get right:
// the line has to NAME the card (a "LOCKED" that says nothing sends nobody
// anywhere), and it has to be throttled (sixty copies a second is not a read).
// Both are silent when they break — the first reads as a broken level, the
// second as a broken renderer.

import { describe, expect, it } from "vitest";

import { createGame, type GameState } from "@game/core";

import {
  LIFT_LOCK_REPEAT_MS,
  lockedLiftRead,
} from "../pwa/src/game/game-screen/lift-lock.ts";

const PAD = { x: 900, y: 700 };
const EVENT = { id: "lift_down", key: "control" };

/** A boot_hill run with one keyed pad on it — the shipped case: the control
 * room's lift, whose door `keycard_boot_hill` unlocks. */
function runWithPad(): GameState {
  const state = createGame(7, "boot_hill");
  state.elevators = [
    {
      id: "lift_down",
      pos: { ...PAD },
      to: { x: 1500, y: 2500 },
      sprite: "elevator_pad",
      radius: 30,
      opensWith: "control",
      used: false,
    },
  ];
  state.stats.timeMs = 10_000;
  return state;
}

describe("a refused lift", () => {
  it("names the card that opens it, over the plate", () => {
    const state = runWithPad();
    const read = lockedLiftRead(state, EVENT, { liftRefusedMs: -Infinity });
    expect(read?.text).toBe("NEEDS ALL-ACCESS PASS");
    expect(read?.pos.x).toBe(PAD.x);
    expect(read?.pos.y).toBeLessThan(PAD.y);
  });

  it("falls back to the fact for a door no card opens", () => {
    const state = runWithPad();
    const read = lockedLiftRead(
      state,
      { id: "lift_down", key: "entrance" },
      { liftRefusedMs: -Infinity },
    );
    expect(read?.text).toBe("LOCKED");
  });

  it("says it once, not once a tick", () => {
    const state = runWithPad();
    const shared = { liftRefusedMs: -Infinity };
    expect(lockedLiftRead(state, EVENT, shared)).not.toBe(null);
    state.stats.timeMs += 16;
    expect(lockedLiftRead(state, EVENT, shared)).toBe(null);
    state.stats.timeMs += LIFT_LOCK_REPEAT_MS;
    expect(lockedLiftRead(state, EVENT, shared)).not.toBe(null);
  });

  it("says nothing for a pad that is not on the field", () => {
    const state = runWithPad();
    expect(
      lockedLiftRead(
        state,
        { id: "no_such_pad", key: "control" },
        {
          liftRefusedMs: -Infinity,
        },
      ),
    ).toBe(null);
  });
});
