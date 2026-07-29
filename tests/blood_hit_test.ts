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
    const heavy = blow(1)!;
    expect(nick.severity).toBeLessThan(solid.severity);
    expect(solid.severity).toBeLessThan(heavy.severity);
    for (const key of ["drops", "reach", "spatters"] as const) {
      expect(nick[key]).toBeLessThan(solid[key]);
      expect(solid[key]).toBeLessThan(heavy[key]);
    }
  });

  it("keeps the haze for blows worth more than a scratch", () => {
    expect(blow(0.05)!.mist).toBe(0);
    expect(blow(1)!.mist).toBeGreaterThan(0);
  });

  it("still draws blood on the lightest connecting blow", () => {
    const tickle = bloodBlow(1, 100_000, "minion", false)!;
    expect(tickle.severity).toBeGreaterThan(0);
    expect(tickle.drops).toBeGreaterThan(0);
    expect(tickle.spatters).toBeGreaterThan(0);
  });

  it("prices the blow in the victim's own bars, not in raw damage", () => {
    // The same fraction of health taken reads the same, whether the numbers are
    // a level-1 blaster's or a legendary's — this is what stops the late game
    // drowning in blood purely because the damage figures got bigger.
    const early = bloodBlow(20, 40, "minion", false)!;
    const late = bloodBlow(20_000, 40_000, "minion", false)!;
    expect(late.severity).toBeCloseTo(early.severity, 6);
    expect(late.drops).toBe(early.drops);
  });

  it("caps the overkill so a hundredfold one-shot is not a hundred times the gore", () => {
    const oneShot = blow(1)!;
    const absurd = blow(100)!;
    expect(absurd.severity).toBeGreaterThan(oneShot.severity);
    expect(absurd.severity).toBeLessThanOrEqual(2);
  });

  it("gives a bigger body a bigger spray at the same bars", () => {
    const minion = bloodBlow(50, 100, "minion", false)!;
    const boss = bloodBlow(50, 100, "boss", false)!;
    expect(boss.severity).toBeCloseTo(minion.severity, 6);
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
