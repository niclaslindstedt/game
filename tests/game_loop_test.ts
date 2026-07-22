// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The fixed-timestep game loop (pwa/src/lib/game-loop.ts): its fast-forward
// `speed` multiplier runs MORE fixed slices per frame (never bigger ones), so a
// sped-up run stays deterministic. rAF isn't in the Node test env, so we install
// a manual driver that captures each frame callback and fires it on demand.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startGameLoop } from "@ui/lib/game-loop.ts";

type Frame = (now: number) => void;

let pending: Frame | null = null;
const realRaf = globalThis.requestAnimationFrame;
const realCancel = globalThis.cancelAnimationFrame;

beforeEach(() => {
  pending = null;
  // Capture the callback instead of scheduling it — the test fires frames.
  globalThis.requestAnimationFrame = ((cb: Frame): number => {
    pending = cb;
    return 1;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {
    pending = null;
  }) as typeof globalThis.cancelAnimationFrame;
});

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancel;
});

/** Fire the next scheduled frame at wall-clock `now` (ms). */
function frame(now: number): void {
  const cb = pending;
  pending = null;
  cb?.(now);
}

describe("startGameLoop fast-forward", () => {
  it("runs constant-size steps and one render per frame at real time", () => {
    const dts: number[] = [];
    let renders = 0;
    const stop = startGameLoop({
      stepMs: 10,
      simulate: (dt) => dts.push(dt),
      render: () => renders++,
    });
    frame(0); // first frame seeds the clock, no elapsed time
    frame(100); // 100ms elapsed → ten 10ms steps
    stop();
    expect(dts).toEqual(Array(10).fill(10));
    expect(renders).toBe(2);
  });

  it("runs `speed`× as many steps for the same wall-clock delta", () => {
    let steps = 0;
    const stop = startGameLoop({
      stepMs: 10,
      speed: 3,
      simulate: () => steps++,
      render: () => {},
    });
    frame(0);
    frame(100); // 100ms × 3 = 300ms of sim → thirty 10ms steps
    stop();
    expect(steps).toBe(30);
  });

  it("keeps the slice size fixed under fast-forward (determinism)", () => {
    const dts: number[] = [];
    const stop = startGameLoop({
      stepMs: 16,
      speed: 4,
      simulate: (dt) => dts.push(dt),
      render: () => {},
    });
    frame(0);
    frame(100);
    stop();
    // Every step is exactly stepMs — fast-forward changes the COUNT, not dt.
    expect(dts.every((dt) => dt === 16)).toBe(true);
  });

  it("reads a live speed getter each frame", () => {
    let speed = 1;
    let steps = 0;
    const stop = startGameLoop({
      stepMs: 10,
      speed: () => speed,
      simulate: () => steps++,
      render: () => {},
    });
    frame(0);
    frame(50); // 50ms × 1 → 5 steps
    speed = 4;
    frame(100); // 50ms × 4 → 20 steps
    stop();
    expect(steps).toBe(25);
  });

  it("treats a non-positive or non-finite speed as real time", () => {
    let speed = 0;
    let steps = 0;
    const stop = startGameLoop({
      stepMs: 10,
      speed: () => speed,
      simulate: () => steps++,
      render: () => {},
    });
    frame(0);
    frame(100); // speed 0 → real time → 10 steps
    speed = Number.NaN;
    frame(200); // NaN → real time → 10 more
    stop();
    expect(steps).toBe(20);
  });

  it("caps steps per frame so a huge speed can't wedge the loop", () => {
    let steps = 0;
    const stop = startGameLoop({
      stepMs: 10,
      maxFrameMs: 1000,
      speed: 1000,
      maxStepsPerFrame: 50,
      simulate: () => steps++,
      render: () => {},
    });
    frame(0);
    frame(1000); // would owe 100_000 steps; the cap stops it at 50
    stop();
    expect(steps).toBe(50);
  });

  it("stops scheduling frames after stop()", () => {
    let renders = 0;
    const stop = startGameLoop({
      stepMs: 10,
      simulate: () => {},
      render: () => renders++,
    });
    frame(0);
    stop();
    frame(100); // a late frame after stop must be a no-op
    expect(renders).toBe(1);
  });
});
