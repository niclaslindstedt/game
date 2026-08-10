// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dead-on-arrival rule (pwa `game-screen/run-health.ts`): which throwing
// frame the run survives, and which one ends it with "the game can't load".
//
// What is being guarded here is the black screen after an app update. The
// update reloads onto a new build, CONTINUE thaws the run the old one parked,
// and the engine faults on it — the same way, on every single frame. The loop
// is built to survive a bad frame and would happily keep drawing that one
// forever, so this rule is the only thing standing between the player and a
// picture that will never move.

import { describe, expect, it } from "vitest";

import { createRunHealth } from "../pwa/src/game/game-screen/run-health.ts";

describe("run health", () => {
  it("calls a failure fatal until that half has completed once", () => {
    const health = createRunHealth();
    expect(health.fatal("render")).toBe(true);
    expect(health.fatal("simulate")).toBe(true);

    health.ok("render");
    expect(health.fatal("render")).toBe(false);
    health.ok("simulate");
    expect(health.fatal("simulate")).toBe(false);
  });

  it("keeps the sim half fatal after a frame that only rendered", () => {
    // THE CASE THE FIRST VERSION OF THIS RULE MISSED. The loop's first
    // animation frame has no elapsed time to spend, so it simulates nothing
    // and only draws — and a thawed state a new build cannot read is exactly
    // the state that draws perfectly and faults on its first step. Marking the
    // run "started" off that drawn frame left the freeze in place.
    const health = createRunHealth();
    health.ok("render");
    expect(health.fatal("simulate")).toBe(true);
  });

  it("keeps the draw half fatal after a step that never made it to screen", () => {
    const health = createRunHealth();
    health.ok("simulate");
    expect(health.fatal("render")).toBe(true);
  });

  it("never calls a failure fatal again once the run is going", () => {
    // A live run's bad frame is the loop's business (it drops it and carries
    // on); escalating one would throw a played run away over a single glitch.
    const health = createRunHealth();
    health.ok("simulate");
    health.ok("render");
    expect(health.fatal("simulate")).toBe(false);
    expect(health.fatal("render")).toBe(false);
  });

  it("reports which halves have run", () => {
    // `ran` is what the render side asks before letting a DRIVE take the
    // picture over: the very first frame must draw whatever happens.
    const health = createRunHealth();
    expect(health.ran("render")).toBe(false);
    health.ok("render");
    expect(health.ran("render")).toBe(true);
    expect(health.ran("simulate")).toBe(false);
  });
});
