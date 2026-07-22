// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fixed-timestep game loop on requestAnimationFrame. Generic React/UI game
// code — lives in pwa/src/lib/ so it can be extracted into oss-framework
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
  /**
   * FAST-FORWARD multiplier on wall-clock → simulation time. `1` (the default)
   * runs real time; `2` advances the sim twice as fast, `8` eight times, and so
   * on. It scales how MANY fixed `stepMs` slices run per animation frame — never
   * the slice SIZE — so the simulation stays deterministic and frame-rate
   * independent at any speed (a fast-forwarded run is identical to a real-time
   * one, just quicker). This is the opposite lever from a slow-motion `dtMs`
   * scale, which would change the slice size and so the physics. Pass a getter
   * to change the speed live mid-run (a bot playtest cranking through a level).
   * Values ≤ 0 or non-finite are treated as `1`.
   */
  speed?: number | (() => number);
  /**
   * Hard cap on fixed steps simulated in a SINGLE frame — the spiral-of-death
   * backstop. At a high `speed` (or after a long hitch) a frame can owe more
   * steps than it can pay without blocking; once this many run, the leftover
   * accumulator is dropped so the loop can never wedge on unbounded catch-up
   * work in one frame. Defaults to 240 (~4s of sim at 60Hz) — far above what
   * ordinary fast-forward asks for, so it never trips in normal use.
   */
  maxStepsPerFrame?: number;
  /** Advance the simulation by exactly `dtMs`. */
  simulate: (dtMs: number) => void;
  /** Draw the current state. `timeMs` is the rAF timestamp (animations). */
  render: (timeMs: number) => void;
};

/** Start the loop; call the returned function to stop it. */
export function startGameLoop({
  stepMs = 1000 / 60,
  maxFrameMs = 100,
  speed = 1,
  maxStepsPerFrame = 240,
  simulate,
  render,
}: GameLoopOptions): () => void {
  let handle = 0;
  let running = true;
  let last: number | undefined;
  let accumulated = 0;
  const speedOf = typeof speed === "function" ? speed : () => speed;

  const frame = (now: number) => {
    if (!running) return;
    // Fast-forward scales the wall-clock delta before it enters the accumulator,
    // so more fixed slices run per frame — the sim advances faster while every
    // step stays exactly `stepMs` (determinism preserved).
    const factor = normalizeSpeed(speedOf());
    accumulated += Math.min(now - (last ?? now), maxFrameMs) * factor;
    last = now;
    let steps = 0;
    while (accumulated >= stepMs) {
      if (steps >= maxStepsPerFrame) {
        // Can't pay the whole debt this frame without blocking on it — drop the
        // remainder so the loop keeps rendering instead of freezing.
        accumulated = 0;
        break;
      }
      simulate(stepMs);
      accumulated -= stepMs;
      steps++;
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

/** A fast-forward factor is only honoured when it's a real, positive number;
 * anything else (0, negative, NaN, ∞) falls back to real time. */
function normalizeSpeed(f: number): number {
  return Number.isFinite(f) && f > 0 ? f : 1;
}
