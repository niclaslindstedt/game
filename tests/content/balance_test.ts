// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Standing-still lethality: the felt-difficulty benchmark. Doing nothing must
// NOT be a winning strategy. A player who plants their feet and never steers,
// jumps, or swaps weapons — leaning entirely on the auto-firing starter blade —
// should be overrun. This suite guards ONE design promise: that idle play loses
// on the intended fight and every harder rung. It is deliberately NOT a tuning
// gate — the exact seconds-to-death are a feel knob to be set by PLAYTESTING,
// not by CI, so the suite MEASURES and PRINTS the full time-to-death table (so a
// tuning change's effect is visible in the test log) but only ASSERTS the broad,
// tuning-robust shape: idle death arrives within the window, isn't instant, and
// no difficulty turns standing still into a safe haven. Retune the crude sword,
// the horde, or the stats freely; read the printed table to see where the feel
// landed rather than chasing a red X.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  createGame,
  dismissIntro,
  skipCutscene,
  step,
} from "@game/core";

import { bareHero, DT, idle } from "../helpers.ts";

// A fixed seed keeps the horde arrangement deterministic.
const SEED = 42;

/**
 * In-game milliseconds until a stationary player dies on `level`/`difficulty`.
 * The character holds still (idle input) and lets the starting crude sword
 * auto-swing; any level-up that lands is banked into LUCK so the measurement
 * stays about the starting loadout rather than a chosen build. The seasoned
 * arrival is stripped (`bareHero`) so the benchmark pins the HORDE's
 * pressure, calibrated once against the bare hero — not the inherited kit a
 * mid-campaign start hands over. Returns `capMs` if the run survives the
 * window (used to show EASY outlasts the benchmark).
 */
function timeToDeathMs(
  level: string,
  difficulty: string,
  capMs = 60_000,
): number {
  const state = bareHero(createGame(SEED, level, difficulty));
  skipCutscene(state);
  dismissIntro(state);
  let guard = 0;
  while (
    state.phase !== "defeat" &&
    state.stats.timeMs < capMs &&
    guard < 400_000
  ) {
    // A stat point can drop mid-run; spend it so the sim resumes. LUCK is the
    // least survival-relevant sink, keeping the benchmark honest.
    while (state.player.pendingStatPoints > 0) allocateStat(state, "luck");
    step(state, idle, DT);
    guard++;
  }
  return state.phase === "defeat" ? state.stats.timeMs : capMs;
}

// Both shipped levels must honor the benchmark: spacez_hq is where the game
// starts (a dense opening now crowds the spawn), moon is the reference level
// the engine suites calibrate against.
describe.each(["spacez_hq", "moon"])(
  "standing-still lethality — %s",
  (level) => {
    // The window an idle run must die inside on the intended fight and up. Held
    // generous on purpose — this is the "doing nothing eventually loses" line,
    // not the felt-difficulty target (that's a playtest call, printed below).
    const OVERRUN_CAP_MS = 30_000;

    // One measurement per difficulty, shared across the assertions below.
    const ttd = {
      easy: timeToDeathMs(level, "easy"),
      medium: timeToDeathMs(level, "medium"),
      hard: timeToDeathMs(level, "hard"),
      nightmare: timeToDeathMs(level, "nightmare"),
      jesus: timeToDeathMs(level, "jesus"),
    };

    // Informative, not assertive: print the felt-difficulty table so a tuning
    // change's effect on idle survival is visible right in the test output.
    console.log(
      `[idle time-to-death — ${level}] ` +
        (Object.entries(ttd) as [string, number][])
          .map(([d, ms]) => `${d}=${(ms / 1000).toFixed(1)}s`)
          .join("  "),
    );

    it("doing nothing loses: an idle player is overrun on MEDIUM and up", () => {
      // The guardrail this suite exists for. On the intended fight and every
      // harder rung, a stationary player IS eventually overrun — standing still
      // never clears the horde for free. The exact timing is a feel knob (see
      // the printed table); the promise is only that death comes within the
      // generous window, and not so instantly that an accidental idle beat is a
      // guaranteed wipe.
      for (const [rung, ms] of [
        ["medium", ttd.medium],
        ["hard", ttd.hard],
        ["nightmare", ttd.nightmare],
        ["jesus", ttd.jesus],
      ] as const) {
        expect(ms, `${rung} idle death within window`).toBeLessThan(
          OVERRUN_CAP_MS,
        );
        expect(ms, `${rung} idle death not instant`).toBeGreaterThan(1_000);
      }
    });
  },
);
