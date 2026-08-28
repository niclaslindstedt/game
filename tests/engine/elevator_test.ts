// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELEVATOR, and the one rule about it that is silent when it breaks.
//
// A keyed car is the LAST DOOR of any venue that ends past a lift, so a lock
// that can never open is not a hard level — it is a run that cannot be
// finished, on a map where everything else works. Nothing throws, nothing is
// drawn differently, and the only symptom is a player standing on a plate.
//
// `opensWith` names a DOOR, and the story item that answers it is whichever
// one's `unlocks` points back at it — two different id spaces, both strings.
// The pair below is the whole guard: the car refuses the hero holding no key
// AND the hero holding the wrong one, and it rides for the one holding the
// item that unlocks its door.

import { describe, expect, it } from "vitest";

import { step, type GameState } from "@game/core";

import { DT, idle, startGame } from "./helpers.ts";

const PAD = { x: 800, y: 800 };
const ARRIVAL = { x: 1900, y: 400 };

/** A run with one keyed car under the hero's feet, and nothing else to do. */
function onAKeyedPad(): GameState {
  const state = startGame();
  const hero = state.players[0]!;
  hero.pos = { ...PAD };
  hero.z = 0;
  state.elevators = [
    {
      id: "lift_down",
      pos: { ...PAD },
      to: { ...ARRIVAL },
      sprite: "elevator_pad",
      radius: 30,
      label: "TEST ANNEX",
      // The DOOR id — `test_key`'s `unlocks`, never `test_key` itself.
      opensWith: "test_door",
      used: false,
    },
  ];
  return state;
}

describe("a keyed elevator", () => {
  it("refuses the hero who is carrying nothing, and says which key", () => {
    const state = onAKeyedPad();
    step(state, idle, DT);
    expect(state.players[0]!.pos).toEqual(PAD);
    expect(state.events.find((e) => e.type === "elevatorLocked")).toMatchObject(
      { id: "lift_down", key: "test_door" },
    );
  });

  it("refuses a key that opens a different door", () => {
    const state = onAKeyedPad();
    state.storyItems.push("test_key_2"); // unlocks `test_vault`
    step(state, idle, DT);
    expect(state.players[0]!.pos).toEqual(PAD);
    expect(state.events.some((e) => e.type === "elevatorLocked")).toBe(true);
  });

  it("rides for the hero carrying the item that unlocks its door", () => {
    const state = onAKeyedPad();
    state.storyItems.push("test_key");
    step(state, idle, DT);
    const hero = state.players[0]!;
    expect(hero.pos.x).toBeCloseTo(ARRIVAL.x, 0);
    expect(hero.pos.y).toBeCloseTo(ARRIVAL.y, 0);
    expect(state.events.some((e) => e.type === "elevatorRide")).toBe(true);
  });

  it("carries the hero who holds the key even with the wrong one in hand too", () => {
    const state = onAKeyedPad();
    state.storyItems.push("test_key_2", "test_key");
    step(state, idle, DT);
    expect(state.players[0]!.pos.x).toBeCloseTo(ARRIVAL.x, 0);
  });
});
