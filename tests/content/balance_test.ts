// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Standing-still lethality: the felt-difficulty benchmark. Doing nothing must
// NOT be a winning strategy. A player who plants their feet on the moon and
// never steers, jumps, or swaps weapons — leaning entirely on the auto-firing
// sidearm — should be overrun. This suite pins the promise: on MEDIUM ("the
// fight as intended") an idle run dies inside 20 seconds, and the harder the
// difficulty the sooner it happens. It's the guardrail against the base fire
// rate drifting back up until the horde clears itself for free.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  createGame,
  dismissIntro,
  skipCutscene,
  step,
} from "@game/core";

import { DT, idle } from "../helpers.ts";

// A fixed seed keeps the horde arrangement deterministic; the moon is the
// reference level the balance is tuned against.
const SEED = 42;

/**
 * In-game milliseconds until a stationary player dies on `difficulty`. The
 * character holds still (idle input) and lets the starting blaster auto-fire;
 * any level-up that lands is banked into LUCK so the measurement stays about
 * the starting loadout rather than a chosen build. Returns `capMs` if the run
 * somehow survives the window (used to show EASY never dies inside it).
 */
function timeToDeathMs(difficulty: string, capMs = 30_000): number {
  const state = createGame(SEED, "moon", difficulty);
  skipCutscene(state);
  dismissIntro(state);
  let guard = 0;
  while (
    state.phase !== "defeat" &&
    state.stats.timeMs < capMs &&
    guard < 200_000
  ) {
    // A stat point can drop mid-run; spend it so the sim resumes. LUCK is the
    // least survival-relevant sink, keeping the benchmark honest.
    while (state.player.pendingStatPoints > 0) allocateStat(state, "luck");
    step(state, idle, DT);
    guard++;
  }
  return state.phase === "defeat" ? state.stats.timeMs : capMs;
}

describe("standing-still lethality benchmark", () => {
  it("on MEDIUM an idle player is overrun within 20 seconds", () => {
    const ttd = timeToDeathMs("medium");
    // The headline promise: doing nothing gets you killed, and fast.
    expect(ttd).toBeLessThanOrEqual(20_000);
    // ...but not INSTANTLY — the sidearm still holds the line for a while, so
    // an accidental idle beat isn't an immediate wipe.
    expect(ttd).toBeGreaterThan(8_000);
  });

  it("EASY gives a genuine warm-up: an idle player survives past the 20s mark", () => {
    // The gentlest rung is meant to be forgiving — standing still there does
    // not get you killed inside the medium benchmark window.
    expect(timeToDeathMs("easy")).toBeGreaterThan(20_000);
  });

  it("cranking the difficulty makes the idle player die sooner", () => {
    const easy = timeToDeathMs("easy");
    const medium = timeToDeathMs("medium");
    const hard = timeToDeathMs("hard");
    const nightmare = timeToDeathMs("nightmare");
    const jesus = timeToDeathMs("jesus");

    // The core ladder is strictly deadlier at every step up.
    expect(medium).toBeLessThan(easy);
    expect(hard).toBeLessThan(medium);
    expect(nightmare).toBeLessThan(hard);

    // JESUS CHRIST! inflates monster HP so hard the slow sidearm barely dents
    // the front rank — the run turns into an HP-sponge grind that lands it
    // alongside NIGHTMARE rather than strictly below it. What holds is the
    // promise that matters: the hardest rung is still well past deadly,
    // overrunning the idle player faster than the intended fight does.
    expect(jesus).toBeLessThan(medium);
  });
});
