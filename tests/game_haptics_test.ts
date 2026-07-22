// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The game's haptic vocabulary (website/src/game/haptics.ts) — the buzz shapes
// wired to game events. What matters here: the damage buzz scales with the
// share of the hp bar a hit cost (and splits into a two-beat rumble for a heavy
// blow), a menu press taps once, the typewriter tick stays the gentlest pulse,
// and every one is a silent noop when haptics are off. The native bridge turns
// these durations into Taptic weights (app/src/nativeHaptics.ts).

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { HapticPattern, HapticsDriver } from "@ui/lib/haptics.ts";

import {
  haptics,
  playDamageHaptic,
  playDeathHaptic,
  playMenuHaptic,
  playTypewriterHaptic,
  setHapticsEnabled,
} from "../website/src/game/haptics.ts";

/** A driver that records what it was asked to vibrate. */
function recordingDriver(): HapticsDriver & { calls: HapticPattern[] } {
  const calls: HapticPattern[] = [];
  return { supported: true, calls, vibrate: (pattern) => calls.push(pattern) };
}

let driver: ReturnType<typeof recordingDriver>;

beforeEach(() => {
  driver = recordingDriver();
  haptics.setDriver(driver);
  setHapticsEnabled(true);
});

afterEach(() => {
  setHapticsEnabled(true);
});

describe("playDamageHaptic", () => {
  it("stays silent when no hp was lost", () => {
    playDamageHaptic(0);
    playDamageHaptic(-0.2);
    expect(driver.calls).toEqual([]);
  });

  it("fires a single, short pulse for a light graze", () => {
    playDamageHaptic(0.05);
    expect(driver.calls).toHaveLength(1);
    const pulse = driver.calls[0];
    expect(typeof pulse).toBe("number");
    expect(pulse).toBeGreaterThan(0);
    expect(pulse).toBeLessThan(30); // well under a boss-kill's weight
  });

  it("grows the buzz with the fraction of the bar lost", () => {
    playDamageHaptic(0.1);
    playDamageHaptic(0.4);
    const light = driver.calls[0] as number;
    const heavy = driver.calls[1] as number;
    expect(heavy).toBeGreaterThan(light);
  });

  it("splits a heavy blow (half the bar or more) into a two-beat rumble", () => {
    playDamageHaptic(0.75);
    expect(Array.isArray(driver.calls[0])).toBe(true);
    expect((driver.calls[0] as readonly number[]).length).toBe(3);
  });

  it("clamps an overkill fraction to the top of the range", () => {
    playDamageHaptic(1);
    playDamageHaptic(5);
    expect(driver.calls[0]).toEqual(driver.calls[1]);
  });

  it("is a noop when haptics are disabled", () => {
    setHapticsEnabled(false);
    playDamageHaptic(0.9);
    expect(driver.calls).toEqual([]);
  });
});

describe("playDeathHaptic", () => {
  it("plays the hardest buzz — heavier than any single hit", () => {
    playDeathHaptic();
    expect(driver.calls).toHaveLength(1);
    const death = driver.calls[0] as readonly number[];
    // A long multi-pulse rumble whose every "on" span outweighs a full-bar hit,
    // so death is unmistakably the top of the range.
    expect(Array.isArray(death)).toBe(true);
    const fullBarHit = 14 + 80; // playDamageHaptic(1)'s pulse length
    for (let i = 0; i < death.length; i += 2) {
      expect(death[i]).toBeGreaterThanOrEqual(fullBarHit);
    }
  });

  it("is a noop when haptics are disabled", () => {
    setHapticsEnabled(false);
    playDeathHaptic();
    expect(driver.calls).toEqual([]);
  });
});

describe("menu and typewriter ticks", () => {
  it("taps once on a menu press", () => {
    playMenuHaptic();
    expect(driver.calls).toHaveLength(1);
    expect(typeof driver.calls[0]).toBe("number");
  });

  it("keeps the typewriter tick the gentlest pulse", () => {
    playTypewriterHaptic();
    playMenuHaptic();
    const tick = driver.calls[0] as number;
    const menu = driver.calls[1] as number;
    // The dialogue crawl fires per letter, so it must stay the lightest cue —
    // the native bridge routes the shortest pulses to a soft selection tick.
    expect(tick).toBeLessThanOrEqual(menu);
  });
});
