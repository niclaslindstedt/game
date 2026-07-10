// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Bag access during an elite/boss ARRIVAL scene: the stare-down is exactly
// when the player wants to equip a fitting weapon, so `openInventory` works
// from an enemy-sourced dialogue and `closeInventory` hands the stage back
// to the speaker on the same page. Every other scene stays read-only (see
// `canOpenInventory` in items.ts).

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
      { pos: { x: state.player.pos.x + 40, y: state.player.pos.y } },
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
    expect(canOpenInventory(state)).toBe(true);
    openInventory(state);
    expect(state.phase).toBe("inventory");
    // The scene is parked, not cancelled — the speaker keeps the stage.
    expect(state.dialogue).not.toBeNull();
    closeInventory(state);
    expect(state.phase).toBe("dialogue");
  });

  it("resumes the scene on the same page after a bag visit", () => {
    const state = meetBoss();
    advanceDialogue(state); // page 1 of the fixture boss's 2
    openInventory(state);
    closeInventory(state);
    expect(state.dialogue?.page).toBe(1);
    advanceDialogue(state); // past the last page — the scene ends
    expect(state.phase).toBe("playing");
  });

  it("keeps a pending level-up waiting for the scene to end", () => {
    const state = meetBoss();
    state.player.pendingStatPoints = 1;
    openInventory(state);
    closeInventory(state);
    // The speaker keeps the stage; the chooser gets its turn after the scene.
    expect(state.phase).toBe("dialogue");
    advanceDialogue(state);
    advanceDialogue(state);
    expect(state.phase).toBe("levelup");
  });

  it("stays read-only in every other scene", () => {
    const state = startGame();
    clearStage(state);
    collectStoryItem(state, "test_key", { ...state.player.pos });
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source.kind).toBe("story");
    expect(canOpenInventory(state)).toBe(false);
    openInventory(state);
    expect(state.phase).toBe("dialogue");
  });

  it("still resumes play from a plain mid-run bag", () => {
    const state = startGame();
    openInventory(state);
    expect(state.phase).toBe("inventory");
    closeInventory(state);
    expect(state.phase).toBe("playing");
  });
});
