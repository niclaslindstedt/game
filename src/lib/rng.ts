// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Seeded pseudo-random number generator (mulberry32). Generic engine code —
// lives in src/lib/ so it can be extracted into oss-framework once mature.
// A seeded stream keeps level generation deterministic under test while the
// app passes a clock-derived seed for variety between runs.

export type Rng = () => number;

/** A deterministic RNG yielding floats in [0, 1), seeded by any integer. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function randomRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
