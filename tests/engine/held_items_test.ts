// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The held-item bank: ability pickups are carried (HELD_ITEMS.cap deep) and
// spent with the useItem input — oldest first, quietly a no-op with empty
// hands, and overflow pickups stay on the ground.

import { describe, expect, it } from "vitest";

import { HELD_ITEMS, step } from "@game/core";
import type { GameInput, GameState, Item } from "@game/core";
import { clearStage, DT, idle, startGame } from "./helpers.ts";

const useItem: GameInput = { ...idle, useItem: true };

function abilityAt(state: GameState, id: number, defId: string): Item {
  return { id, kind: "ability", pos: { ...state.player.pos }, defId };
}

describe("held ability items", () => {
  it("banks pickups oldest-first up to the carry cap", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_orbit"),
      abilityAt(state, 501, "test_storm"),
      abilityAt(state, 502, "test_stasis"),
      abilityAt(state, 503, "test_orbit"), // one past the cap of 3
    ];
    step(state, idle, DT);

    expect(HELD_ITEMS.cap).toBe(3);
    expect(state.player.heldAbilities).toEqual([
      "test_orbit",
      "test_storm",
      "test_stasis",
    ]);
    // The overflow pickup is still on the ground, not lost.
    expect(state.items.map((i) => i.id)).toEqual([503]);
    expect(state.stats.itemsCollected).toBe(3);
  });

  it("spends the oldest banked ability per useItem edge", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_storm"),
      abilityAt(state, 501, "test_stasis"),
    ];
    step(state, idle, DT);

    step(state, useItem, DT);
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["test_storm"]);
    expect(state.player.heldAbilities).toEqual(["test_stasis"]);
    expect(state.events).toContainEqual({
      type: "abilityStarted",
      defId: "test_storm",
    });

    step(state, useItem, DT);
    expect(state.player.heldAbilities).toEqual([]);
    expect(state.player.abilities.map((a) => a.defId)).toEqual([
      "test_storm",
      "test_stasis",
    ]);
  });

  it("ignores useItem with empty hands", () => {
    const state = startGame();
    clearStage(state);
    step(state, useItem, DT);
    expect(state.player.abilities).toHaveLength(0);
    expect(state.events.some((e) => e.type === "abilityStarted")).toBe(false);
  });

  it("frees a carry slot once an ability is spent", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_orbit"),
      abilityAt(state, 501, "test_storm"),
      abilityAt(state, 502, "test_stasis"),
      abilityAt(state, 503, "test_orbit"),
    ];
    step(state, idle, DT); // bank three, one left grounded
    step(state, useItem, DT); // spend one → a slot opens → overflow banks
    expect(state.items).toHaveLength(0);
    expect(state.player.heldAbilities).toEqual([
      "test_storm",
      "test_stasis",
      "test_orbit",
    ]);
  });
});
