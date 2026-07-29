// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for the score fingerprint (`scripts/music-data/digest.mjs`).
// It is plain JavaScript because the SNAPSHOT SCRIPT runs it under bare node,
// where there is no TypeScript — the same reason the mod toolchain is (see
// mod-tooling.d.ts). This shim gives the round-trip test real typing without
// making the module import anything it should not.

declare module "*/scripts/music-data/digest.mjs" {
  /** What the fixture pins: the shape numbers a person reads, plus a sha256
   * over every note, tie, rest and instrument setting. */
  export type TrackDigest = {
    bpm: number;
    stepsPerBeat: number;
    instruments: string[];
    order: string[];
    totalSteps: number;
    loopSeconds: number;
    digest: string;
  };

  export function trackDigest(
    track: unknown,
    flatten: (track: never) => { totalSteps: number; voices: unknown[] },
  ): TrackDigest;
}
