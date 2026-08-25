// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IS THE SHIPPED FLIGHT LADDER A LADDER — the rocket minigame's own rungs
// (`DifficultyDef.flight`), asserted against the real catalog, which is why
// this lives in tests/content/ rather than beside the sky's physics.
//
// The hole it exists to keep shut is the DROP. Everything the climb's four
// multipliers turn — the shell's thickness, the hardware's density, the ship's
// tippiness, what a hit costs — stops at orbit, and the module then falls
// through an empty sky. So a ladder authored for the climb alone reads like a
// ladder in the table while the MOON LANDING cabinet ranks five boards that are
// the same game: `scripts/flight-bench.mjs` landed 200/200 on every rung.
//
// Measured with that bench (200 seeds a rung, the shipped auto-pilot), the
// whole trip now falls away — 100% / 98% / 88% / 54% / 10% end to end — and
// with nobody at the stick it is 0% on every rung, so what the numbers below
// hold apart is a difficulty rather than a sky that was never dangerous.

import { describe, expect, it } from "vitest";

import {
  DIFFICULTY_ORDER,
  beginDescent,
  createFlight,
  difficultyDef,
  landingGates,
  type Difficulty,
} from "@game/core";

/** The climb's rungs, gentlest first. */
const RUNGS = DIFFICULTY_ORDER;

function flightOf(rung: Difficulty) {
  return difficultyDef(rung).flight;
}

describe("the shipped flight ladder", () => {
  it("makes the sky thicker and the ship twitchier, rung by rung", () => {
    for (let i = 1; i < RUNGS.length; i++) {
      const under = flightOf(RUNGS[i - 1]!);
      const over = flightOf(RUNGS[i]!);
      const where = `${RUNGS[i - 1]} → ${RUNGS[i]}`;
      expect(over.junkMult, where).toBeGreaterThan(under.junkMult);
      expect(over.hazardMult, where).toBeGreaterThan(under.hazardMult);
      expect(over.tipMult, where).toBeGreaterThan(under.tipMult);
      expect(over.damageMult, where).toBeGreaterThan(under.damageMult);
    }
    // MEDIUM is the 1.0 baseline the sky was tuned at, and every other rung is
    // a multiple of it — so a change that drifts the middle rung off 1 has
    // moved what "as intended" means rather than moved a rung.
    const medium = flightOf("medium");
    expect(medium).toEqual({
      junkMult: 1,
      hazardMult: 1,
      tipMult: 1,
      damageMult: 1,
      gateMult: 1,
      dropMult: 1,
    });
  });

  it("gives the DROP its own rung, which nothing above it reaches", () => {
    for (let i = 1; i < RUNGS.length; i++) {
      const under = flightOf(RUNGS[i - 1]!);
      const over = flightOf(RUNGS[i]!);
      const where = `${RUNGS[i - 1]} → ${RUNGS[i]}`;
      // Harder to hand over…
      expect(over.dropMult, where).toBeGreaterThan(under.dropMult);
      // …and less forgiving to set down.
      expect(over.gateMult, where).toBeLessThan(under.gateMult);
    }
  });

  it("hands a harder rung less sky and more to fix in it", () => {
    // The three knobs `dropMult` turns, read off a real hand-over. Both drops
    // are built from the same seed, so the ± rolls are the same draws and only
    // the scale differs.
    const open = (rung: Difficulty) => {
      const flight = createFlight({ seed: 4242, difficulty: rung, to: "moon" });
      beginDescent(flight);
      return flight.craft;
    };
    const gentle = open("easy");
    const cruel = open("jesus");
    expect(cruel.alt).toBeLessThan(gentle.alt);
    expect(Math.abs(cruel.vx)).toBeGreaterThan(Math.abs(gentle.vx));
    expect(Math.abs(cruel.tilt)).toBeGreaterThan(Math.abs(gentle.tilt));
  });

  it("tightens all three touchdown gates together", () => {
    const gentle = landingGates("easy");
    const cruel = landingGates("jesus");
    expect(cruel.vyPx).toBeLessThan(gentle.vyPx);
    expect(cruel.vxPx).toBeLessThan(gentle.vxPx);
    expect(cruel.tiltRad).toBeLessThan(gentle.tiltRad);
    // A rung never asks for a landing nobody could make: the gentlest legal
    // touchdown the module can be flown to is still well inside the tightest
    // rung's limit (the auto-pilot feathers to ~6 px/s on every rung).
    expect(cruel.vyPx).toBeGreaterThan(10);
  });
});
