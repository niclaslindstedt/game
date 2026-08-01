// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Bag access during an elite/boss ARRIVAL scene: the stare-down is exactly
// when the player wants to equip a fitting weapon, so `openInventory` works
// from an enemy-sourced dialogue (the hero's `screen` goes up while the
// `dialogue` phase keeps the stage) and `closeInventory` just clears the
// screen. Every other scene stays read-only (see `canOpenInventory` in
// items/flow.ts).

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  canOpenInventory,
  closeInventory,
  collectStoryItem,
  openInventory,
} from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** Park the fixture boss beside the hero and run to his arrival scene. */
function meetBoss(): GameState {
  const state = startGame();
  clearStage(state);
  state.enemies.push(
    makeEnemy(
      { pos: { x: state.players[0].pos.x + 40, y: state.players[0].pos.y } },
      "test_boss",
    ),
  );
  run(state, idle, 60, (s) => s.phase === "dialogue");
  expect(state.phase).toBe("dialogue");
  expect(state.dialogue?.source.kind).toBe("enemy");
  return state;
}

describe("inventory access during dialogue", () => {
  it("opens the bag from an arrival scene and hands the stage back", () => {
    const state = meetBoss();
    expect(canOpenInventory(state, state.players[0])).toBe(true);
    openInventory(state, state.players[0]);
    // The scene keeps the global stage; the bag rides on the hero's screen.
    expect(state.phase).toBe("dialogue");
    expect(state.players[0].screen).toBe("inventory");
    expect(state.dialogue).not.toBeNull();
    closeInventory(state.players[0]);
    expect(state.players[0].screen).toBeUndefined();
    expect(state.phase).toBe("dialogue");
  });

  it("resumes the scene on the same page after a bag visit", () => {
    const state = meetBoss();
    advanceDialogue(state); // page 1 of the fixture boss's 2
    openInventory(state, state.players[0]);
    closeInventory(state.players[0]);
    expect(state.dialogue?.page).toBe(1);
    advanceDialogue(state); // past the last page — the scene ends
    expect(state.phase).toBe("playing");
  });

  it("keeps a pending level-up banked through the scene", () => {
    const state = meetBoss();
    state.players[0].pendingStatPoints = 1;
    openInventory(state, state.players[0]);
    closeInventory(state.players[0]);
    // The speaker keeps the stage; the point stays banked, no chooser opens.
    expect(state.phase).toBe("dialogue");
    advanceDialogue(state);
    advanceDialogue(state);
    expect(state.phase).toBe("playing");
    expect(state.players[0].screen).toBeUndefined();
    expect(state.players[0].pendingStatPoints).toBe(1);
  });

  it("stays read-only in every other scene", () => {
    const state = startGame();
    clearStage(state);
    collectStoryItem(state, "test_key", { ...state.players[0].pos });
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source.kind).toBe("story");
    expect(canOpenInventory(state, state.players[0])).toBe(false);
    openInventory(state, state.players[0]);
    expect(state.players[0].screen).toBeUndefined();
  });

  it("still resumes play from a plain mid-run bag", () => {
    const state = startGame();
    openInventory(state, state.players[0]);
    expect(state.phase).toBe("playing");
    expect(state.players[0].screen).toBe("inventory");
    closeInventory(state.players[0]);
    expect(state.players[0].screen).toBeUndefined();
  });
});
