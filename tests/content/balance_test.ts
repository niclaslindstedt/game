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
// no difficulty turns standing still into a safe haven. Retune the wall weapons,
// the horde, or the stats freely; read the printed table to see where the feel
// landed rather than chasing a red X.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  allocateStat,
  createGame,
  dismissIntro,
  muteDialogue,
  skipCutscene,
  step,
  unmuteDialogue,
} from "@game/core";

import { DT, idle, walkInside } from "../helpers.ts";

// A fixed seed keeps the horde arrangement deterministic.
const SEED = 42;

/**
 * In-game milliseconds until a stationary player dies on `level`/`difficulty`.
 * The character holds still (idle input) and lets the difficulty's starting
 * weapon auto-attack; any level-up that lands is banked into LUCK so the measurement
 * stays about the starting loadout rather than a chosen build. No loadout is
 * passed, so the benchmark pins the HORDE's pressure against the bare
 * authored hero — not whatever kit a campaign carry-over would hand him.
 * Returns `capMs` if the run survives the window (used to show EASY outlasts
 * the benchmark).
 */
function timeToDeathMs(
  level: string,
  difficulty: string,
  capMs = 60_000,
): number {
  const state = createGame(SEED, level, difficulty);
  skipCutscene(state);
  dismissIntro(state);
  // THE CLOCK STARTS WHERE THE FIGHT CAN REACH HIM, which on a level with an
  // ENTRANCE is not where he lands. GOODCO opens on a staff lot with a keyed
  // door in its wall (`LevelDef.arrivals`): nothing out there is hostile, and
  // the building cannot get at him until somebody arrives and badges the doors
  // open — which is the level working as designed, and which would otherwise be
  // measured here as fifteen seconds of the horde failing to kill him. So the
  // lot's own business is played out first, off the clock, and the hero is
  // stood on the floor inside; what the benchmark then measures is the HORDE,
  // which is the only thing it was ever about.
  const inside = state.arrivalPlan?.inside;
  const startedAt = inside ? stageInside(state) : 0;
  let guard = 0;
  while (
    state.phase !== "defeat" &&
    state.stats.timeMs - startedAt < capMs &&
    guard < 400_000
  ) {
    // A stat point can drop mid-run; spend it so the sim resumes. LUCK is the
    // least survival-relevant sink, keeping the benchmark honest.
    while (state.players[0].pendingStatPoints > 0)
      allocateStat(state, state.players[0], "luck");
    // A first-kill thought can open mid-run (the auto-swinging sword downs a
    // pinned minion); tap it closed so the pause doesn't read as survival.
    while (state.dialogue) advanceDialogue(state);
    step(state, idle, DT);
    guard++;
  }
  return state.phase === "defeat" ? state.stats.timeMs - startedAt : capMs;
}

/**
 * Play the staff lot out and put the hero through the doors — returns the game
 * clock at the moment the benchmark should start counting from.
 *
 * Idle throughout, and muted, because none of it is the measurement: it is the
 * level's opening beat happening at its own pace while the probe waits for the
 * building to become reachable.
 */
function stageInside(state: ReturnType<typeof createGame>): number {
  muteDialogue(state);
  for (let i = 0; i < 4000; i++) {
    if (!state.doors.some((d) => d.id === "entrance" && !d.open)) break;
    step(state, idle, DT);
  }
  unmuteDialogue(state);
  // Onto the floor rather than into the opening: `plan.inside` is a step past
  // the jambs, which is where the venue's own beats have decided he has not
  // arrived yet, and it is the doorway rather than the room the horde fills.
  walkInside(state);
  return state.stats.timeMs;
}

// Both shipped levels must honor the benchmark: goodco_hq is where the game
// starts (a dense opening now crowds the spawn), moon is the reference level
// the engine suites calibrate against.
describe.each(["goodco_hq", "moon"])(
  "standing-still lethality — %s",
  (level) => {
    // The window an idle run must die inside on the intended fight and up. Held
    // generous on purpose — this is the "doing nothing eventually loses" line,
    // not the felt-difficulty target (that's a playtest call, printed below).
    //
    // It went from 30s to 45s when the campaign moved onto CARVED maps, and the
    // reason is a deliberate one rather than a slipped number: the hero lands in
    // a QUIET cell (no ambient horde placed in it — somewhere to read the map
    // from), and the knots that hold this map's horde arm as he walks into them.
    // So the horde has to come to a man who never moves, which takes longer on
    // the open moon than the hand-drawn opening ring around his feet ever did.
    // The promise is unchanged and still measured on every rung: he dies.
    const OVERRUN_CAP_MS = 45_000;

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
