// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE MINIMAP'S FOG HIDES — and the one pin it does not.
//
// This suite exists because the WRONG version is the tidy-looking one. Fog-
// gating every blip alike reads as consistent, passes review, and silently
// undoes the reason the goal pin was added: a destination the hero can only
// see once he has walked to it is a destination he had to find without the map.

import { describe, expect, it } from "vitest";

import { isExplored, MAP, mapCols, mapRows } from "@game/core";
import type { GameState, MapMarker } from "@game/core";

import { blipVisible } from "../pwa/src/game/minimap-pins.ts";
import { refog, startGame } from "./helpers.ts";

/**
 * An ON-MAP spot the fog still stands on. It has to be inside the grid:
 * `isExplored` answers false for anything off it, so an out-of-bounds
 * coordinate would satisfy every assertion here without being a place.
 */
function fogged(state: GameState): { x: number; y: number } {
  const cell = MAP.cellSize;
  const far = {
    x: (mapCols(state.level) - 1.5) * cell,
    y: (mapRows(state.level) - 1.5) * cell,
  };
  expect(isExplored(state, far)).toBe(false);
  return far;
}

const pin = (kind: MapMarker["kind"], pos: { x: number; y: number }) =>
  ({ kind, pos, defId: "test_thing" }) satisfies MapMarker;

describe("the minimap's blips", () => {
  it("draws a questGoal through standing fog — a giver described it", () => {
    const state = startGame();
    refog(state);
    expect(blipVisible(state, pin("questGoal", fogged(state)))).toBe(true);
  });

  it("hides every commemorative pin the hero has not reached yet", () => {
    const state = startGame();
    refog(state);
    const at = fogged(state);
    for (const kind of [
      "story",
      "elite",
      "boss",
      "merchant",
      "questGiver",
      "questTarget",
    ] as const) {
      expect(blipVisible(state, pin(kind, at))).toBe(false);
    }
  });

  it("draws them all once the ground is explored", () => {
    const state = startGame();
    const at = fogged(state);
    state.explored.fill(1);
    expect(isExplored(state, at)).toBe(true);
    for (const kind of ["story", "elite", "questGiver", "questGoal"] as const) {
      expect(blipVisible(state, pin(kind, at))).toBe(true);
    }
  });
});
