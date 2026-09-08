// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IS THIS RUN DEAD? — the one rule that decides whether a throwing frame is
// survivable or the end of the run.
//
// The game loop is deliberately crash-resilient (lib/game-loop.ts): a frame
// that throws is dropped, the next one is scheduled anyway, and the run plays
// on. That is right for a bad frame in a healthy run and exactly wrong for a
// half that is never going to complete again — a state the build cannot read
// throws the SAME way on every frame, forever, and "keep going" leaves the
// player looking at a picture that will never move, with no HUD, no pause menu
// and no way out. The HUD snapshot is published by the LAST statement of the
// render frame (`render-frame.ts`), so a draw that keeps throwing takes every
// DOM surface gated on that snapshot with it: the canvas holds a
// half-drawn frame and React holds whatever the last complete one published.
//
// So a half is dead in either of two ways, and both end the run with "the game
// can't load" rather than with silence:
//
//   IT NEVER GOT GOING.  The first failure in a half that has not completed
//                        once is fatal on the spot. (The black screen after an
//                        app update: the update reloads onto a new build,
//                        CONTINUE thaws the run the old one parked, and every
//                        tick faults on a field the new engine reads and the
//                        old save never wrote.)
//   IT STOPPED.          A half that has thrown on every frame since it last
//                        completed, for `DEAD_STREAK` frames, is not coming
//                        back either — and it leaves exactly the same dead
//                        screen, an hour into a run instead of at the start.
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

/**
 * Consecutive failures in one half that mean it has STOPPED rather than
 * glitched — frames, so ~5 s at 60 Hz.
 *
 * The streak only counts frames with no completed one in between: a fault that
 * fires on some frames and not others resets it and is left to the loop's own
 * resilience, which is what a glitch deserves. What is being ruled out is a
 * fault that rides some long-lived thing on screen and clears with it, so the
 * bar is deliberately well past any of those: five seconds in which NOTHING has
 * been drawn or stepped is a run that is already broken from where the player
 * is sitting, and the cost of calling it a moment early is the few seconds
 * between the autosave and the reload.
 */
const DEAD_STREAK = 300;

export type RunHealth = {
  /** Record that this half of a frame completed without throwing. */
  ok(phase: LoopPhase): void;
  /**
   * Book a throw in this half, and answer whether the run is now dead.
   *
   * True lands EXACTLY ONCE per half, on the failure that kills it: the caller
   * abandons the run on that answer, and a half already given up on must not
   * ask for it again on each of the frames that follow.
   */
  failed(phase: LoopPhase): boolean;
  /** Has this half ever completed? */
  ran(phase: LoopPhase): boolean;
};

export function createRunHealth(): RunHealth {
  const ran: Record<LoopPhase, boolean> = { simulate: false, render: false };
  const streak: Record<LoopPhase, number> = { simulate: 0, render: 0 };
  const gaveUp: Record<LoopPhase, boolean> = { simulate: false, render: false };
  return {
    ok(phase) {
      ran[phase] = true;
      streak[phase] = 0;
    },
    failed(phase) {
      streak[phase]++;
      const dead = !ran[phase] || streak[phase] >= DEAD_STREAK;
      if (!dead || gaveUp[phase]) return false;
      gaveUp[phase] = true;
      return true;
    },
    ran(phase) {
      return ran[phase];
    },
  };
}
