// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The seeded RNG (mulberry32) and its snapshot/restore helpers — the primitive
// that lets a persisted run resume the exact same stream after a reload.

import { describe, expect, it } from "vitest";

import { createRng, createRngFromState, rngState } from "@game/lib/rng.ts";

describe("seeded rng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("yields floats in [0, 1)", () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("resumes the exact stream from a snapshotted state", () => {
    // Advance a generator partway, snapshot it, then have a rebuilt generator
    // pick up where it left off — the two must agree from that point on.
    const live = createRng(0xc0ffee);
    for (let i = 0; i < 17; i++) live();
    const snapshot = rngState(live);

    const restored = createRngFromState(snapshot);
    const liveTail = Array.from({ length: 32 }, () => live());
    const restoredTail = Array.from({ length: 32 }, () => restored());
    expect(restoredTail).toEqual(liveTail);
  });

  it("survives a JSON round-trip of the snapshot", () => {
    const live = createRng(42);
    for (let i = 0; i < 5; i++) live();
    const snapshot = JSON.parse(JSON.stringify(rngState(live))) as number;
    const restored = createRngFromState(snapshot);
    expect(restored()).toEqual(live());
  });

  it("createRng and createRngFromState(seed) agree", () => {
    const seeded = createRng(7);
    const fromState = createRngFromState(7);
    expect(Array.from({ length: 4 }, () => seeded())).toEqual(
      Array.from({ length: 4 }, () => fromState()),
    );
  });
});
