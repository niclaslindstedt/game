// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Seeded pseudo-random number generator (mulberry32). Generic engine code —
// lives in src/lib/ so it can be extracted into oss-framework once mature.
// A seeded stream keeps level generation deterministic under test while the
// app passes a clock-derived seed for variety between runs.

export type Rng = () => number;

// The generator keeps its whole state in a single uint32, parked on the
// function object so a run can be frozen and thawed mid-stream (see
// `rngState` / `createRngFromState`) — persisting a game and resuming it must
// pick up the exact same sequence, or the run would desync on reload.
type StatefulRng = Rng & { state: number };

/** A deterministic RNG yielding floats in [0, 1), seeded by any integer. */
export function createRng(seed: number): Rng {
  return createRngFromState(seed >>> 0);
}

/**
 * Rebuild an RNG parked at a snapshotted internal state (from `rngState`), so a
 * serialized run resumes the exact stream it would have produced live. Seeding
 * a fresh generator is just this with `state = seed`.
 */
export function createRngFromState(state: number): Rng {
  const rng = (() => {
    let s = rng.state;
    s = (s + 0x6d2b79f5) >>> 0;
    rng.state = s;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as StatefulRng;
  rng.state = state >>> 0;
  return rng;
}

/**
 * The generator's current internal state — snapshot it (alongside the rest of
 * the run) to later resume the exact same stream via `createRngFromState`.
 * Falls back to 0 for a plain closure with no parked state (e.g. a test stub),
 * which never gets serialized in practice.
 */
export function rngState(rng: Rng): number {
  return ((rng as Partial<StatefulRng>).state ?? 0) >>> 0;
}

/** A float in [min, max). */
export function randomRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
