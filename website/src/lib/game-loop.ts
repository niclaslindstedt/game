// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fixed-timestep game loop on requestAnimationFrame. Generic React/UI game
// code — lives in website/src/lib/ so it can be extracted into oss-framework
// once mature. Simulation advances in constant `stepMs` slices (determinism,
// frame-rate independence); rendering happens once per animation frame.

export type GameLoopOptions = {
  /** Simulation timestep in ms. Defaults to ~60 steps/second. */
  stepMs?: number;
  /**
   * Longest frame delta ever fed to the accumulator. Caps the simulation
   * work after a tab was backgrounded, instead of fast-forwarding the game.
   */
  maxFrameMs?: number;
  /** Advance the simulation by exactly `dtMs`. */
  simulate: (dtMs: number) => void;
  /** Draw the current state. `timeMs` is the rAF timestamp (animations). */
  render: (timeMs: number) => void;
};

/** Start the loop; call the returned function to stop it. */
export function startGameLoop({
  stepMs = 1000 / 60,
  maxFrameMs = 100,
  simulate,
  render,
}: GameLoopOptions): () => void {
  let handle = 0;
  let running = true;
  let last: number | undefined;
  let accumulated = 0;

  const frame = (now: number) => {
    if (!running) return;
    accumulated += Math.min(now - (last ?? now), maxFrameMs);
    last = now;
    while (accumulated >= stepMs) {
      simulate(stepMs);
      accumulated -= stepMs;
    }
    render(now);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(handle);
  };
}
