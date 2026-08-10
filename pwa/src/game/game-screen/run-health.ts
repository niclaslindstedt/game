// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IS THIS RUN DEAD ON ARRIVAL? — the one rule that decides whether a throwing
// frame is survivable or the end of the run.
//
// The game loop is deliberately crash-resilient (lib/game-loop.ts): a frame
// that throws is dropped, the next one is scheduled anyway, and the run plays
// on. That is right for a bad frame in a healthy run and exactly wrong for a
// run that never got going — a state the build cannot read throws the SAME way
// every frame, forever, and "keep going" leaves the player looking at a picture
// that will never move, with no HUD, no pause menu and no way out. That is the
// black screen an app update used to leave behind: the update reloads onto a
// new build, CONTINUE thaws the run parked by the old one, and every tick
// faults on a field the new engine reads and the old save never wrote.
//
// So each half of the frame is watched until it has completed ONCE. Before
// that, a failure in that half is fatal and the app says so; after it, the
// loop's own resilience takes over.
//
// THE TWO HALVES ARE WATCHED SEPARATELY, and that is the whole point rather
// than symmetry for its own sake. The first animation frame simulates NOTHING
// (the loop's accumulator is empty until a second frame gives it a delta), so
// it renders, succeeds, and would mark a run "started" that has not yet run a
// single step. A thawed state the engine cannot read is precisely the case
// that draws perfectly and faults on the first step — which is how the freeze
// survived the first attempt at this rule.

/** Which half of a frame ran — the same two names the loop reports with. */
export type LoopPhase = "simulate" | "render";

export type RunHealth = {
  /** Record that this half of a frame completed without throwing. */
  ok(phase: LoopPhase): void;
  /** Has this half ever completed? */
  ran(phase: LoopPhase): boolean;
  /**
   * Does a failure in this half mean the run never got going — i.e. must the
   * app abandon it and tell the player, rather than drop the frame and carry
   * on?
   */
  fatal(phase: LoopPhase): boolean;
};

export function createRunHealth(): RunHealth {
  const ran: Record<LoopPhase, boolean> = { simulate: false, render: false };
  return {
    ok(phase) {
      ran[phase] = true;
    },
    ran(phase) {
      return ran[phase];
    },
    fatal(phase) {
      return !ran[phase];
    },
  };
}
