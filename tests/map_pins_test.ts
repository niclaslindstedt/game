// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE LEVEL MAP IS ALLOWED TO DRAW. The engine pins every marker the same
// way; the split between a pin that COMMEMORATES and a pin that INSTRUCTS is
// the app's, and it is one the fog decides.

import { describe, expect, it } from "vitest";

import { isExplored, MAP, mapCols, mapRows } from "@game/core";
import type { GameState } from "@game/core";

import { visiblePins } from "../pwa/src/game/overlays/map-pins.ts";
import { refog, startGame } from "./helpers.ts";

/**
 * An ON-MAP spot the fog is guaranteed to still stand on. It has to be inside
 * the grid: `isExplored` answers false for anything off it, which would make
 * every assertion here pass over a coordinate that is not a place.
 */
function fogged(state: GameState): { x: number; y: number } {
  const cell = MAP.cellSize;
  const far = {
    x: (mapCols(state.level) - 1.5) * cell,
    y: (mapRows(state.level) - 1.5) * cell,
  };
  // Both halves of the staging are the test's precondition, so prove both.
  expect(state.explored[Math.floor(far.y / cell) * mapCols(state.level)]).toBe(
    0,
  );
  expect(isExplored(state, far)).toBe(false);
  return far;
}

describe("the level map's pins", () => {
  it("holds a questGoal back until the fog lifts off its own ground", () => {
    const state = startGame();
    refog(state);
    const at = fogged(state);
    state.mapMarkers.push({ kind: "questGoal", pos: at, defId: "test_ward" });

    expect(visiblePins(state)).toHaveLength(0);

    // Walking there draws that page of the map, and the X can be drawn on it.
    state.explored.fill(1);
    expect(isExplored(state, at)).toBe(true);
    expect(visiblePins(state)).toHaveLength(1);
    expect(visiblePins(state)[0]!.kind).toBe("questGoal");
  });

  it("still draws a commemorative pin through standing fog", () => {
    const state = startGame();
    refog(state);
    const at = fogged(state);
    // Every one of these is a memory of somewhere a hero actually stood, so the
    // fog has no say: an elite that fell out there fell out there.
    state.mapMarkers.push(
      { kind: "elite", pos: at, defId: "test_elite" },
      { kind: "boss", pos: at, defId: "test_coward" },
      { kind: "story", pos: at, defId: "test_key" },
      { kind: "merchant", pos: at, defId: "merchant" },
      { kind: "questGiver", pos: at, defId: "test_giver" },
      { kind: "questTarget", pos: at, defId: "test_minion" },
    );
    expect(visiblePins(state)).toHaveLength(6);
  });

  it("leaves an explored questGoal alone once the fog is gone", () => {
    const state = startGame();
    state.explored.fill(1);
    const at = { x: state.players[0].pos.x + 40, y: state.players[0].pos.y };
    state.mapMarkers.push({ kind: "questGoal", pos: at, defId: "test_ward" });
    expect(visiblePins(state)).toHaveLength(1);
  });
});
