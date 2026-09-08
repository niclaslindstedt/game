// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dead-run rule (pwa `game-screen/run-health.ts`): which throwing frame the
// run survives, and which one ends it with "the game can't load".
//
// What is being guarded here is a screen the player cannot leave. Every DOM
// surface — the HUD, the docks, the pause menu — is gated on the snapshot the
// LAST statement of the render frame publishes, so a draw that keeps throwing
// leaves a half-drawn picture with nothing on top of it and no way out. The
// loop is built to survive a bad frame and would happily keep drawing that one
// forever, in either of the two ways it happens: a run that never got going (a
// thawed save a new build cannot read), and a run that was going fine until
// something in the draw started faulting on every frame.

import { describe, expect, it } from "vitest";

import { createRunHealth } from "../pwa/src/game/game-screen/run-health.ts";

/** Frames of unbroken failure to spend before giving up on the rule giving up.
 * Comfortably past `DEAD_STREAK`, which the module keeps to itself — these
 * tests assert THAT it gives up and that a completed half clears the count,
 * never the exact frame it happens on. */
const PAST_THE_STREAK = 1000;

describe("run health", () => {
  it("calls the first failure fatal until that half has completed once", () => {
    const health = createRunHealth();
    expect(health.failed("render")).toBe(true);

    const other = createRunHealth();
    other.ok("render");
    expect(other.failed("render")).toBe(false);
  });

  it("keeps the sim half fatal after a frame that only rendered", () => {
    // THE CASE THE FIRST VERSION OF THIS RULE MISSED. The loop's first
    // animation frame has no elapsed time to spend, so it simulates nothing
    // and only draws — and a thawed state a new build cannot read is exactly
    // the state that draws perfectly and faults on its first step. Marking the
    // run "started" off that drawn frame left the freeze in place.
    const health = createRunHealth();
    health.ok("render");
    expect(health.failed("simulate")).toBe(true);
  });

  it("keeps the draw half fatal after a step that never made it to screen", () => {
    const health = createRunHealth();
    health.ok("simulate");
    expect(health.failed("render")).toBe(true);
  });

  it("survives a bad frame in a live run", () => {
    // A live run's single bad frame is the loop's business (it drops it and
    // carries on); escalating one would throw a played run away over a glitch.
    const health = createRunHealth();
    health.ok("simulate");
    health.ok("render");
    expect(health.failed("simulate")).toBe(false);
    expect(health.failed("render")).toBe(false);
  });

  it("gives up on a half that has thrown on every frame since it last drew", () => {
    // THE ONE THIS RULE GREW FOR: a run an hour in whose draw starts faulting
    // and never stops. The loop keeps scheduling, the HUD snapshot is never
    // republished, and the player is left holding a frozen picture with no
    // HUD, no pause menu and no way out — the same dead end as a run that
    // never started, reached from the other direction.
    const health = createRunHealth();
    health.ok("render");
    let deadAt = -1;
    for (let frame = 0; frame < PAST_THE_STREAK; frame++) {
      if (health.failed("render")) {
        deadAt = frame;
        break;
      }
    }
    expect(deadAt).toBeGreaterThan(0);
    // …and only once: the frames that follow must not keep asking the app to
    // throw a run away it has already given up on.
    expect(health.failed("render")).toBe(false);
  });

  it("forgets a streak the moment the half completes again", () => {
    // Only an UNBROKEN run of failures counts. A fault that fires on some
    // frames and not others is a glitch the loop's own resilience owns, and
    // counting it toward the same total would end a playable run.
    const health = createRunHealth();
    health.ok("render");
    for (let frame = 0; frame < PAST_THE_STREAK; frame++) {
      expect(health.failed("render")).toBe(false);
      health.ok("render");
    }
  });

  it("counts the two halves apart", () => {
    // A draw that keeps throwing must not condemn the sim, or vice versa: the
    // halves fail for different reasons and only one of them is on screen.
    const health = createRunHealth();
    health.ok("render");
    health.ok("simulate");
    for (let frame = 0; frame < PAST_THE_STREAK; frame++) {
      health.failed("render");
      health.ok("simulate");
    }
    expect(health.failed("simulate")).toBe(false);
  });

  it("reports which halves have run", () => {
    // `ran` answers two questions: whether a DRIVE may take the picture over
    // (the very first frame must draw whatever happens), and whether a dead
    // run's parked save is one this build could never read — the only case
    // that is binned rather than kept.
    const health = createRunHealth();
    expect(health.ran("render")).toBe(false);
    health.ok("render");
    expect(health.ran("render")).toBe(true);
    expect(health.ran("simulate")).toBe(false);
  });
});
