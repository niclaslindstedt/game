// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level-up spectacle's SIZE curve (pwa/src/game/levelup-intensity.ts): the
// one number every ding surface (canvas blast, hero burn, full-screen CSS
// overlay, haptic) multiplies itself by, so an early level-up is a modest glow
// and the last ding before the cap is the full detonation. What matters here:
// the first ding lands at the documented floor, the cap's ding at a full 1, the
// curve never goes backwards, and the haptic weighs itself with it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LEVELING } from "@game/core";

import type { HapticPattern, HapticsDriver } from "@ui/lib/haptics.ts";

import { haptics, playLevelUpHaptic } from "../pwa/src/game/haptics.ts";
import {
  LEVELUP_MIN_INTENSITY,
  levelUpIntensity,
} from "../pwa/src/game/levelup-intensity.ts";

describe("levelUpIntensity", () => {
  it("plays the first ding (1 → 2) at the toned-down floor", () => {
    expect(levelUpIntensity(2)).toBeCloseTo(LEVELUP_MIN_INTENSITY, 6);
    expect(LEVELUP_MIN_INTENSITY).toBeCloseTo(0.2, 6);
  });

  it("plays the last ding before the cap at full strength", () => {
    expect(levelUpIntensity(LEVELING.maxLevel)).toBeCloseTo(1, 6);
  });

  it("never goes backwards as the hero climbs", () => {
    let prev = 0;
    for (let level = 2; level <= LEVELING.maxLevel; level++) {
      const power = levelUpIntensity(level);
      expect(power).toBeGreaterThanOrEqual(prev);
      expect(power).toBeGreaterThanOrEqual(LEVELUP_MIN_INTENSITY);
      expect(power).toBeLessThanOrEqual(1);
      prev = power;
    }
  });

  it("holds back over the cheap early dings and opens up later", () => {
    // The mid-game ding sits well inside the range — neither pinned to the
    // floor nor already blinding.
    const mid = levelUpIntensity(Math.round(LEVELING.maxLevel / 2));
    expect(mid).toBeGreaterThan(LEVELUP_MIN_INTENSITY + 0.15);
    expect(mid).toBeLessThan(0.75);
    // Ease-in: the first quarter of the climb gains less than the last.
    const q = Math.round(LEVELING.maxLevel / 4);
    const early = levelUpIntensity(q) - levelUpIntensity(2);
    const late =
      levelUpIntensity(LEVELING.maxLevel) -
      levelUpIntensity(LEVELING.maxLevel - q);
    expect(late).toBeGreaterThan(early);
  });

  it("clamps a level outside the curve to the ends", () => {
    expect(levelUpIntensity(1)).toBeCloseTo(LEVELUP_MIN_INTENSITY, 6);
    expect(levelUpIntensity(LEVELING.maxLevel + 20)).toBeCloseTo(1, 6);
  });
});

/** A driver that records what it was asked to vibrate. */
function recordingDriver(): HapticsDriver & { calls: HapticPattern[] } {
  const calls: HapticPattern[] = [];
  return { supported: true, calls, vibrate: (pattern) => calls.push(pattern) };
}

describe("playLevelUpHaptic", () => {
  let driver: ReturnType<typeof recordingDriver>;

  beforeEach(() => {
    driver = recordingDriver();
    haptics.setDriver(driver);
  });

  afterEach(() => {
    haptics.setDriver(recordingDriver());
  });

  it("weighs the buzz down with a dim early ding", () => {
    playLevelUpHaptic(levelUpIntensity(2));
    playLevelUpHaptic(levelUpIntensity(LEVELING.maxLevel));
    const early = driver.calls[0] as number[];
    const full = driver.calls[1] as number[];
    // Same rhythm (pulse count unchanged), lighter pulses.
    expect(early).toHaveLength(full.length);
    expect(early[0]!).toBeGreaterThan(0);
    expect(early[0]!).toBeLessThan(full[0]!);
    // The gaps between pulses hold the pattern's shape.
    expect(early[1]!).toBe(full[1]!);
  });

  it("defaults to the full-weight pattern", () => {
    playLevelUpHaptic();
    playLevelUpHaptic(1);
    expect(driver.calls[0]).toEqual(driver.calls[1]);
  });
});
