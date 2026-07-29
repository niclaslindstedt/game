// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KILL LAUNCH (pwa/src/game/game-screen/event-fx.ts `corpseLaunch`): how a
// killing blow throws the corpse. The whole rule is the blow priced by the
// health that had to absorb it (`damage / maxHp`), so what matters here is that
// the throw is PROPORTIONAL to the damage (a crit outflies the plain blow beside
// it), that a bigger bar reads as a HEAVIER body (the same damage moves it
// less), and that the two calibration points hold: a clean one-shot always
// throws something visible, and three healthbars clear the screen.

import { afterEach, describe, expect, it } from "vitest";

import { corpseLaunch } from "../pwa/src/game/game-screen/corpse-launch.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";

/** The hero, and a mob parked 40px to his RIGHT — so a throw reads as +x. */
const HERO = { x: 0, y: 0 };
const MOB = { x: 40, y: 0 };

/** How far a `damage`-for-`maxHp` killing blow throws a minion. 0 when the
 * body isn't launched at all (it just topples where it fell). */
function throwPx(damage: number, maxHp: number, role = "minion"): number {
  return corpseLaunch(damage, maxHp, HERO, MOB, role)?.dist ?? 0;
}

// The knockback slider is a persisted developer setting; leave it neutral.
afterEach(() => updateSettings({ knockback: 1 }));

describe("corpseLaunch", () => {
  it("throws a clean one-shot — the smallest launch, never a mere lean", () => {
    const oneShot = throwPx(100, 100);
    // Comfortably past the 2px cull the renderer also gates on, so a mob killed
    // for exactly its full bar is always visibly knocked away.
    expect(oneShot).toBeGreaterThan(4);
    // ...and it is the FLOOR: nothing at or above a full bar throws less.
    for (const bars of [1, 1.5, 2, 3, 8]) {
      expect(throwPx(bars * 100, 100)).toBeGreaterThanOrEqual(oneShot);
    }
  });

  it("clears the screen at three healthbars", () => {
    // A phone's world viewport is ~422 units across (half-width ~211) and the
    // camera chases the hero, so the throw has to beat the half-width to put a
    // body off the rim.
    expect(throwPx(300, 100)).toBeGreaterThan(211);
  });

  it("scales the throw with the damage dealt — a crit outflies its blow", () => {
    const plain = throwPx(150, 100);
    const crit = throwPx(300, 100);
    expect(crit).toBeGreaterThan(plain);
    // Proportional, not a step: the extra bar of damage buys the same reach
    // wherever it lands on the curve.
    const step = throwPx(200, 100) - throwPx(100, 100);
    expect(throwPx(300, 100) - throwPx(200, 100)).toBeCloseTo(step, 6);
  });

  it("treats a bigger healthbar as a heavier body", () => {
    // The same blow against twice the health throws the body less far.
    expect(throwPx(400, 100)).toBeGreaterThan(throwPx(400, 200));
    // And the SAME number of healthbars throws the same distance whatever the
    // absolute numbers — the ratio is the whole rule.
    expect(throwPx(600, 200)).toBeCloseTo(throwPx(300, 100), 6);
  });

  it("tails a chip finish off to nothing", () => {
    // A tap that merely finished an already-wounded mob barely moves it, and a
    // sliver of a huge bar doesn't launch at all — it topples in place.
    expect(throwPx(60, 100)).toBeLessThan(throwPx(100, 100));
    expect(throwPx(1, 100)).toBe(0);
  });

  it("tumbles once per full EXTRA healthbar, and never backwards", () => {
    expect(corpseLaunch(100, 100, HERO, MOB, "minion")?.spins).toBe(0);
    expect(corpseLaunch(200, 100, HERO, MOB, "minion")?.spins).toBe(1);
    expect(corpseLaunch(300, 100, HERO, MOB, "minion")?.spins).toBe(2);
    // A sub-bar finisher must not roll a negative (backwards) tumble.
    expect(corpseLaunch(80, 100, HERO, MOB, "minion")?.spins).toBe(0);
  });

  it("throws the body away from the hero", () => {
    const launch = corpseLaunch(300, 100, HERO, MOB, "minion");
    expect(launch?.dx).toBeCloseTo(1, 6);
    expect(launch?.dy).toBeCloseTo(0, 6);
  });

  it("plants heavier roles: an elite budges, a boss stays on its mark", () => {
    expect(throwPx(300, 100, "elite")).toBeLessThan(throwPx(300, 100));
    expect(throwPx(300, 100, "boss")).toBeLessThan(throwPx(300, 100, "elite"));
  });

  it("keeps scaling past the screen edge — no ceiling on the throw", () => {
    // A cap would flatten the whole top of the range into one indistinguishable
    // throw: ten bars must still outfly five, and the slope must be the SAME
    // one the calibrated stretch rides.
    expect(throwPx(1000, 100)).toBeGreaterThan(throwPx(500, 100));
    const step = throwPx(300, 100) - throwPx(200, 100);
    expect(throwPx(1000, 100) - throwPx(900, 100)).toBeCloseTo(step, 6);
  });

  it("obeys the developer KNOCKBACK slider", () => {
    const shipped = throwPx(300, 100);
    updateSettings({ knockback: 0 });
    expect(throwPx(300, 100)).toBe(0);
    updateSettings({ knockback: 2 });
    expect(throwPx(300, 100)).toBeCloseTo(shipped * 2, 6);
  });
});
