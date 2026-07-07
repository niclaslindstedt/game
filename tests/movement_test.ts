// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Dynamic walk speed: the app reports how hard the dpad is pushed (or how far
// the cursor leads the hero) as an input throttle in [0, 1], and the step
// scales the walk by it — a gentle nudge creeps, a full push runs. Absent
// (headless bots), it defaults to full speed.

import { describe, expect, it } from "vitest";

import { playerSpeed, step, type GameInput } from "@game/core";

import { clearStage, DT, startGame } from "./helpers.ts";

/** One step's rightward travel from spawn at the given throttle. */
function stepDistance(throttle: number | undefined): number {
  const state = startGame();
  clearStage(state);
  const startX = state.player.pos.x;
  const input: GameInput = {
    steering: true,
    target: { x: startX + 1000, y: state.player.pos.y },
    jump: false,
    throttle,
  };
  step(state, input, DT);
  return state.player.pos.x - startX;
}

describe("walk throttle", () => {
  it("defaults to full speed when the input omits a throttle", () => {
    const state = startGame();
    expect(stepDistance(undefined)).toBeCloseTo(
      (playerSpeed(state) * DT) / 1000,
      5,
    );
  });

  it("scales the walk by the throttle", () => {
    expect(stepDistance(0.5)).toBeCloseTo(stepDistance(1) * 0.5, 5);
  });

  it("clamps out-of-range throttles", () => {
    // Over 1 is capped at full speed; a negative throttle stands still.
    expect(stepDistance(3)).toBeCloseTo(stepDistance(1), 5);
    expect(stepDistance(-1)).toBeCloseTo(0, 5);
  });
});
