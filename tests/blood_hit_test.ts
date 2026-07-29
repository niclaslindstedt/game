// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLOOD RULE — what a landed blow is worth, and what it wets.
//
// `bloodBlow` is a leaf over the hit event and `bloodSpills` a pure scatter over
// its result, so both are testable without a canvas. What is pinned here is the
// promise the feature makes: the blood SCALES WITH THE DAMAGE, it is priced in
// the victim's own healthbars rather than in raw numbers (so it holds across the
// campaign), and EXTRA GORE off means nothing is produced at all — not merely
// nothing drawn.

import { beforeEach, describe, expect, it } from "vitest";

import {
  bloodBlow,
  bloodSpills,
} from "../pwa/src/game/game-screen/blood-hit.ts";
import {
  drawnRung,
  rungOf,
  RUNG_AT,
} from "../pwa/src/game/render/blood-rungs.ts";
import { getSettings, updateSettings } from "../pwa/src/game/settings.ts";

const MINION_HP = 100;

beforeEach(() => {
  updateSettings({ extraGore: "on", blood: 1 });
});

/** A blow taking `bars` of a minion's own health. */
function blow(bars: number, kill = false) {
  return bloodBlow(MINION_HP * bars, MINION_HP, "minion", kill);
}

describe("bloodBlow", () => {
  it("scales every count with the damage", () => {
    const nick = blow(0.05)!;
    const solid = blow(0.4)!;
    const heavy = blow(0.6)!;
    expect(nick.volume).toBeLessThan(solid.volume);
    expect(solid.volume).toBeLessThan(heavy.volume);
    for (const key of ["drops", "reach", "spatters"] as const) {
      expect(nick[key]).toBeLessThan(solid[key]);
      expect(solid[key]).toBeLessThan(heavy[key]);
    }
  });

  it("keeps the haze for blows worth more than a scratch", () => {
    expect(blow(0.05)!.mist).toBe(0);
    expect(blow(1)!.mist).toBeGreaterThan(0);
  });

  it("saturates the VOLUME — a body holds only one body's worth of blood", () => {
    // The whole point of splitting volume from force: hitting something for ten
    // times its health cannot spill more BLOOD than it had. The particle count
    // still rises (the same blood, divided finer), but how wet the floor gets
    // under the wound is volume's alone, and that stops dead.
    const oneShot = blow(1)!;
    const vast = blow(10)!;
    expect(vast.volume).toBeCloseTo(oneShot.volume, 6);
    const at = { x: 0, y: 0 };
    expect(bloodSpills(vast, at, 1, 0)[0]!.amount).toBeCloseTo(
      bloodSpills(oneShot, at, 1, 0)[0]!.amount,
      6,
    );
  });

  it("keeps the FORCE climbing so a vast overkill still reads as one", () => {
    // Force is what stays legible after the volume has run out: the same blood,
    // thrown harder, atomized more, and flung further.
    const solid = blow(1)!;
    const big = blow(3)!;
    const vast = blow(10)!;
    expect(big.force).toBeGreaterThan(solid.force);
    expect(vast.force).toBeGreaterThan(big.force);
    expect(vast.reach).toBeGreaterThan(big.reach);
    expect(vast.mist).toBeGreaterThan(big.mist);
    expect(vast.spatters).toBeGreaterThan(big.spatters);
  });

  it("EMPTIES anything hit several times harder than its whole health", () => {
    // A blow that many times a body's health does not kill it, it bursts it —
    // so even the smallest minion leaves the biggest pool there is.
    expect(blow(1, true)!.pool).toBe(1);
    expect(blow(10, true)!.pool).toBe(2);
  });

  it("still draws blood on the lightest connecting blow", () => {
    const tickle = bloodBlow(1, 100_000, "minion", false)!;
    expect(tickle.volume).toBeGreaterThan(0);
    expect(tickle.drops).toBeGreaterThan(0);
    expect(tickle.spatters).toBeGreaterThan(0);
  });

  it("prices the blow in the victim's own bars, not in raw damage", () => {
    // The same fraction of health taken reads the same, whether the numbers are
    // a level-1 blaster's or a legendary's — this is what stops the late game
    // drowning in blood purely because the damage figures got bigger.
    const early = bloodBlow(20, 40, "minion", false)!;
    const late = bloodBlow(20_000, 40_000, "minion", false)!;
    expect(late.volume).toBeCloseTo(early.volume, 6);
    expect(late.force).toBeCloseTo(early.force, 6);
    expect(late.drops).toBe(early.drops);
  });

  it("never stops scaling — a level 99 hero in a level 1 crowd keeps escalating", () => {
    // No ceiling on force, deliberately, exactly as there is none on the corpse
    // launch: every step up the overkill range has to look worse than the last,
    // all the way to hitting for a thousand times what the body holds.
    const forces = [1, 10, 100, 1000, 10_000].map((b) => blow(b)!.force);
    for (let i = 1; i < forces.length; i++) {
      expect(forces[i]!).toBeGreaterThan(forces[i - 1]!);
    }
    // …but sub-linearly, or a thousandfold blow would ask for a spray wider
    // than the level.
    expect(blow(1000)!.reach).toBeLessThan(blow(100)!.reach * 4);
  });

  it("holds the draw budget however absurd the blow", () => {
    // The counts are capped for PERFORMANCE only — a screen-clearing AoE fires
    // one of these per mob, so no single blow may put a thousand sprites up.
    const absurd = blow(100_000)!;
    expect(absurd.drops).toBeLessThanOrEqual(60);
    expect(absurd.mist).toBeLessThanOrEqual(20);
    expect(absurd.spatters).toBeLessThanOrEqual(48);
  });

  it("gives a bigger body a bigger spray at the same bars", () => {
    const minion = bloodBlow(50, 100, "minion", false)!;
    const boss = bloodBlow(50, 100, "boss", false)!;
    expect(boss.volume).toBeCloseTo(minion.volume, 6);
    expect(boss.reach).toBeGreaterThan(minion.reach);
    expect(boss.drops).toBeGreaterThan(minion.drops);
  });

  it("pools only on a kill, and sizes a set piece's pool by what it is", () => {
    expect(blow(0.5)!.pool).toBeNull();
    expect(blow(0.5, true)!.pool).toBe(0);
    // A boss's killing blow is usually a sliver of its enormous bar, so the
    // pool must not be priced on the blow or a giant would die leaving a smear.
    expect(bloodBlow(1, 100_000, "boss", true)!.pool).toBe(2);
    expect(bloodBlow(1, 100_000, "elite", true)!.pool).toBe(1);
  });

  it("produces nothing at all with EXTRA GORE off", () => {
    updateSettings({ extraGore: "off" });
    expect(blow(1, true)).toBeNull();
    expect(getSettings().extraGore).toBe("off");
  });

  it("produces nothing at all with the developer amount at zero", () => {
    updateSettings({ blood: 0 });
    expect(blow(1, true)).toBeNull();
  });
});

describe("bloodSpills", () => {
  const at = { x: 500, y: 500 };

  it("wets the floor under the blow hardest, and more of it as the blow grows", () => {
    const light = bloodSpills(blow(0.05)!, at, 7, 0);
    const heavy = bloodSpills(blow(1)!, at, 7, 0);
    expect(heavy.length).toBeGreaterThan(light.length);
    expect(heavy[0]!.amount).toBeGreaterThan(light[0]!.amount);
    // The wound's own splash leads and sits exactly where the blow landed.
    expect(heavy[0]!.x).toBe(at.x);
    expect(heavy[0]!.y).toBe(at.y);
  });

  it("is deterministic for a seed — the floor must agree with what flew", () => {
    const a = bloodSpills(blow(0.7)!, at, 42, 1.2);
    const b = bloodSpills(blow(0.7)!, at, 42, 1.2);
    expect(a).toEqual(b);
    expect(bloodSpills(blow(0.7)!, at, 43, 1.2)).not.toEqual(a);
  });

  it("puts a kill's pool where the body ended up, and drags it the whole way", () => {
    const kill = blow(2, true)!;
    const launch = { dx: 1, dy: 0, dist: 120 };
    const thrown = bloodSpills(kill, at, 5, 0, launch);
    const pool = thrown.at(-1)!;
    expect(pool.x).toBeCloseTo(at.x + 120, 6);
    // The skid: something wets the ground between the two ends, or the trail
    // reads as two unrelated stains.
    const between = thrown.filter((s) => s.x > at.x + 20 && s.x < at.x + 100);
    expect(between.length).toBeGreaterThan(0);
  });

  it("leaves the pool on the spot when the body was not thrown", () => {
    const pool = bloodSpills(blow(2, true)!, at, 5, 0).at(-1)!;
    expect(pool.x).toBe(at.x);
    expect(pool.y).toBe(at.y);
  });
});

// The floor's rung rule — the whole answer to "why is there a red square on my
// floor". Its own leaf (`render/blood-rungs.ts`) precisely so it can be pinned
// here without a canvas.
describe("drawnRung", () => {
  const SOAKED = 3;
  const FULL = 255;

  it("never lets a lone hard-hit tile draw the soaked rung", () => {
    // Nothing around it: one solid tile in open ground is a red SQUARE.
    expect(drawnRung(FULL, 0, 0)).toBeLessThan(SOAKED);
  });

  it("never lets a KNOT of soaked tiles all go solid together", () => {
    // The bug that shipped: with only the orthogonal cap, a tile in a small
    // blob has soaked neighbours on all four sides, clears the cap, and every
    // tile in the blob draws the opaque art — a rectangle whose outline is the
    // tile grid. A tile on the RIM (a bare diagonal) must stay off the top rung.
    expect(drawnRung(FULL, FULL, 0)).toBe(SOAKED - 1);
  });

  it("lets a tile ringed on all eight sides fill in", () => {
    expect(drawnRung(FULL, FULL, FULL)).toBe(SOAKED);
  });

  it("still climbs one rung above its neighbourhood on the lower rungs", () => {
    // The lower rungs are hole-punched, so they are free to lead their
    // surroundings — that is what gives a stain a gradient instead of a step.
    expect(drawnRung(RUNG_AT[2]!, 0, 0)).toBe(1);
    expect(drawnRung(RUNG_AT[2]!, RUNG_AT[1]!, 0)).toBe(2);
  });

  it("draws nothing above the first rung for a barely-wetted tile", () => {
    expect(rungOf(RUNG_AT[0]! - 1)).toBe(0);
    expect(rungOf(RUNG_AT[1]!)).toBe(1);
  });
});
