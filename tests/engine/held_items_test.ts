// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The held-item bank: ability pickups are carried (HELD_ITEMS.cap deep) and
// spent with the useItem input — oldest first, quietly a no-op with empty
// hands, and overflow pickups stay on the ground.

import { describe, expect, it } from "vitest";

import { abilityDef, discardHeldAbility, HELD_ITEMS, step } from "@game/core";
import type { GameInput, GameState, Item } from "@game/core";
import { clearStage, DT, idle, run, startGame } from "./helpers.ts";

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

  it("spends the oldest banked slot per useItem edge, running it in place", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_storm"),
      abilityAt(state, 501, "test_stasis"),
    ];
    step(state, idle, DT);

    step(state, useItem, DT);
    // The oldest still-banked slot fires and keeps its place (slot 0); the dock
    // does not shift — both slots stay full, one running, one banked.
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["test_storm"]);
    expect(state.player.abilities[0]!.slot).toBe(0);
    expect(state.player.heldAbilities).toEqual(["test_storm", "test_stasis"]);
    expect(state.events).toContainEqual({
      type: "abilityStarted",
      defId: "test_storm",
    });

    // A second edge skips the running slot 0 and fires the next banked one.
    step(state, useItem, DT);
    expect(state.player.heldAbilities).toEqual(["test_storm", "test_stasis"]);
    expect(state.player.abilities.map((a) => a.defId)).toEqual([
      "test_storm",
      "test_stasis",
    ]);
    expect(state.player.abilities.map((a) => a.slot)).toEqual([0, 1]);
  });

  it("spends the exact slot named by useItemIndex, in place", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_orbit"),
      abilityAt(state, 501, "test_storm"),
      abilityAt(state, 502, "test_stasis"),
    ];
    step(state, idle, DT);

    // Tap the middle slot (index 1): the storm fires but stays in slot 1 —
    // orbit and stasis keep their places, nothing shifts.
    step(state, { ...idle, useItem: true, useItemIndex: 1 }, DT);
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["test_storm"]);
    expect(state.player.abilities[0]!.slot).toBe(1);
    expect(state.player.heldAbilities).toEqual([
      "test_orbit",
      "test_storm",
      "test_stasis",
    ]);
  });

  it("falls back to the oldest banked slot when useItemIndex is out of range", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_storm"),
      abilityAt(state, 501, "test_stasis"),
    ];
    step(state, idle, DT);

    step(state, { ...idle, useItem: true, useItemIndex: 9 }, DT);
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["test_storm"]);
    expect(state.player.abilities[0]!.slot).toBe(0);
    expect(state.player.heldAbilities).toEqual(["test_storm", "test_stasis"]);
  });

  it("skips a running slot, falling back to the oldest still-banked one", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_storm"),
      abilityAt(state, 501, "test_stasis"),
    ];
    step(state, idle, DT);

    // Fire slot 0 (it starts running in place)…
    step(state, { ...idle, useItem: true, useItemIndex: 0 }, DT);
    // …then aim at slot 0 again: it's running, so the edge falls through to the
    // oldest banked slot (1) instead of no-oping on the busy slot.
    step(state, { ...idle, useItem: true, useItemIndex: 0 }, DT);
    expect(state.player.abilities.map((a) => a.defId)).toEqual([
      "test_storm",
      "test_stasis",
    ]);
    expect(state.player.abilities.map((a) => a.slot)).toEqual([0, 1]);
  });

  it("ignores useItem with empty hands", () => {
    const state = startGame();
    clearStage(state);
    step(state, useItem, DT);
    expect(state.player.abilities).toHaveLength(0);
    expect(state.events.some((e) => e.type === "abilityStarted")).toBe(false);
  });

  it("keeps the dock full while a power runs, then banks overflow when it lapses", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_stasis"),
      abilityAt(state, 501, "test_storm"),
      abilityAt(state, 502, "test_orbit"),
      abilityAt(state, 503, "test_orbit"),
    ];
    step(state, idle, DT); // bank three, one left grounded

    // Spend the oldest: it keeps its slot and runs, so the dock stays full —
    // the grounded overflow can't bank while the power is going.
    step(state, useItem, DT);
    expect(state.player.abilities.map((a) => a.defId)).toEqual(["test_stasis"]);
    expect(state.player.heldAbilities).toEqual([
      "test_stasis",
      "test_storm",
      "test_orbit",
    ]);
    expect(state.items).toHaveLength(1); // overflow still grounded

    // Once the stasis lapses its slot frees, the row shifts down, and the
    // waiting overflow finally banks.
    const steps = Math.ceil(abilityDef("test_stasis").durationMs / DT) + 2;
    run(state, idle, steps);
    expect(state.items).toHaveLength(0);
    expect(state.player.heldAbilities).toEqual([
      "test_storm",
      "test_orbit",
      "test_orbit",
    ]);
    expect(state.player.abilities).toHaveLength(0);
  });
});

describe("uniqueHeld powers (one bomb in the dock at a time)", () => {
  it("refuses a second nuke pickup while one is docked, without blocking others", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_nuke"),
      abilityAt(state, 501, "test_nuke"),
      abilityAt(state, 502, "test_orbit"),
    ];
    step(state, idle, DT);

    // The first nuke banks; the double stays grounded (like an over-cap
    // pickup) while the orbit behind it banks past it into the open slot.
    expect(state.player.heldAbilities).toEqual(["test_nuke", "test_orbit"]);
    expect(state.items.map((i) => i.id)).toEqual([501]);
    expect(state.stats.itemsCollected).toBe(2);
  });

  it("banks the waiting double once the docked nuke is spent", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_nuke"),
      abilityAt(state, 501, "test_nuke"),
    ];
    step(state, idle, DT); // one banks, the double waits on the ground

    // Spending the nuke vacates its slot at once (it is instant), so the
    // grounded double is free to bank — the rule is one AT A TIME, not one
    // per run.
    step(state, useItem, DT);
    step(state, idle, DT);
    expect(state.player.heldAbilities).toEqual(["test_nuke"]);
    expect(state.items).toHaveLength(0);
  });
});

describe("discarding banked abilities", () => {
  it("drops a specific slot and shifts the rest down, without granting it", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_orbit"),
      abilityAt(state, 501, "test_storm"),
      abilityAt(state, 502, "test_stasis"),
    ];
    step(state, idle, DT);

    // Drag the middle slot out to the ground: it is gone (never activated) and
    // the row closes up oldest-first.
    expect(discardHeldAbility(state, 1)).toBe("test_storm");
    expect(state.player.heldAbilities).toEqual(["test_orbit", "test_stasis"]);
    expect(state.player.abilities).toHaveLength(0);
  });

  it("frees room so a grounded overflow pickup can bank", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      abilityAt(state, 500, "test_orbit"),
      abilityAt(state, 501, "test_storm"),
      abilityAt(state, 502, "test_stasis"),
      abilityAt(state, 503, "test_orbit"), // one past the cap of 3
    ];
    step(state, idle, DT); // bank three, one left grounded

    discardHeldAbility(state, 0); // trash the oldest → a slot opens
    step(state, idle, DT); // overflow pickup now banks
    expect(state.items).toHaveLength(0);
    expect(state.player.heldAbilities).toEqual([
      "test_storm",
      "test_stasis",
      "test_orbit",
    ]);
  });

  it("is a no-op on an empty or out-of-range slot", () => {
    const state = startGame();
    clearStage(state);
    state.items = [abilityAt(state, 500, "test_storm")];
    step(state, idle, DT);

    expect(discardHeldAbility(state, 5)).toBeNull();
    expect(discardHeldAbility(state, -1)).toBeNull();
    expect(state.player.heldAbilities).toEqual(["test_storm"]);
  });

  it("won't discard a slot whose power is running", () => {
    const state = startGame();
    clearStage(state);
    state.items = [abilityAt(state, 500, "test_storm")];
    step(state, idle, DT);
    step(state, useItem, DT); // slot 0 is now running in place

    // A running power holds its slot until it lapses — the discard gesture
    // can't trash it out from under itself.
    expect(discardHeldAbility(state, 0)).toBeNull();
    expect(state.player.heldAbilities).toEqual(["test_storm"]);
    expect(state.player.abilities).toHaveLength(1);
  });
});
