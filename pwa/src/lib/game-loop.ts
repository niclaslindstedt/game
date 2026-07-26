// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fixed-timestep game loop on requestAnimationFrame. Generic React/UI game
// code — lives in pwa/src/lib/ so it can be extracted into oss-framework
// once mature. Simulation advances in constant `stepMs` slices (determinism,
// frame-rate independence); rendering happens once per animation frame.
//
// THE LOOP OUTLIVES A BAD FRAME. A rAF callback that throws is never
// rescheduled by the browser, so — before this — one unhandled error anywhere
// under `simulate` or `render` silently unscheduled the whole game: the world
// froze mid-frame while the page stayed alive around it (React still handled
// clicks, the music kept playing off its own timers, queued DOM toasts kept
// firing), which reads to a player as an inexplicable hang rather than a
// crash. So each half of a frame is caught on its own — a throwing draw can't
// stop the simulation and a throwing step can't stop the drawing — the next
// frame is always scheduled, and the error is handed to `onError` (throttled,
// since a frame that throws usually throws sixty times a second).

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
  /**
   * A frame's `simulate` or `render` threw. The loop has already recovered
   * (it drops the frame's remaining step debt and keeps scheduling), so this
   * is purely for reporting — route it to the app's output channel. Called at
   * most `ERROR_REPORT_LIMIT` times per half (simulate and render count
   * separately), so a throw that repeats every frame can't flood the log.
   */
  onError?: (error: unknown, phase: "simulate" | "render") => void;
};

/** How many times one half of the frame may report before it goes quiet. */
const ERROR_REPORT_LIMIT = 3;

/** Start the loop; call the returned function to stop it. */
export function startGameLoop({
  stepMs = 1000 / 60,
  maxFrameMs = 100,
  speed = 1,
  maxStepsPerFrame = 240,
  simulate,
  render,
  onError,
}: GameLoopOptions): () => void {
  let handle = 0;
  let running = true;
  let last: number | undefined;
  let accumulated = 0;
  const speedOf = typeof speed === "function" ? speed : () => speed;
  const reported = { simulate: 0, render: 0 };

  // Hand one half's failure to the app, then fall quiet: the same bad frame
  // usually recurs every frame, and a 60Hz error log is its own outage.
  const report = (phase: "simulate" | "render", err: unknown) => {
    if (!onError || reported[phase] >= ERROR_REPORT_LIMIT) return;
    reported[phase]++;
    onError(err, phase);
  };

  const frame = (now: number) => {
    if (!running) return;
    // Fast-forward scales the wall-clock delta before it enters the accumulator,
    // so more fixed slices run per frame — the sim advances faster while every
    // step stays exactly `stepMs` (determinism preserved).
    const factor = normalizeSpeed(speedOf());
    accumulated += Math.min(now - (last ?? now), maxFrameMs) * factor;
    last = now;
    let steps = 0;
    try {
      // `running` is re-read each slice: a step that tears the loop down
      // (a run that ends and unmounts) must not keep stepping the state it
      // just dropped.
      while (running && accumulated >= stepMs) {
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
    } catch (err) {
      // Drop the rest of this frame's debt with the failed step: at a high
      // fast-forward the same throw would otherwise be re-run dozens of times
      // over before the frame is out.
      accumulated = 0;
      report("simulate", err);
    }
    try {
      render(now);
    } catch (err) {
      report("render", err);
    }
    // ALWAYS schedule the next frame — an unscheduled rAF is unrecoverable
    // (see the header), so the only thing that ends the loop is `stop()`,
    // which may itself have been called from inside this frame.
    if (running) handle = requestAnimationFrame(frame);
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
