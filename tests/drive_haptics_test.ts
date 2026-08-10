// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD FEELS LIKE (drive-screen/drive-haptics.ts) — the minigame's own
// vibration vocabulary, pinned at the four places it can silently stop being
// feedback and start being a phone buzzing.
//
// The load-bearing facts: a collision's buzz grows with its own absorbed energy
// (so "the harder the more vibration" is the physics' answer rather than a
// shelf of constants), a tick that books six collisions buzzes ONCE for the
// hardest of them, a blockade cannot leave the motor simply switched on, and
// the road crashing WITHOUT the hero is not the hero's collision.

import { beforeEach, describe, expect, it } from "vitest";

import {
  createDrive,
  DRIVE,
  type DriveEvent,
  type DriveParams,
  type DriveState,
} from "@game/core";

import type { HapticPattern, HapticsDriver } from "@ui/lib/haptics.ts";

import { haptics, setHapticsEnabled } from "../pwa/src/game/haptics.ts";
import {
  driveHitForce,
  feelDrive,
  playDriveHitHaptic,
  resetDriveHaptics,
} from "../pwa/src/game/drive-screen/drive-haptics.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  to: "goodco_hq",
  difficulty: "medium",
  gib: true,
  split: true,
};

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
  resetDriveHaptics();
});

/** The total motor-on time of a pattern — how much buzz was actually asked for,
 * across however many pulses the shape happens to have. The native bridge reads
 * each pulse's LENGTH to pick a Taptic weight, so this is the honest measure of
 * "more vibration" and the only one that compares a flick with a rolling
 * three-beat crunch. */
function weight(pattern: HapticPattern): number {
  if (typeof pattern === "number") return pattern;
  let sum = 0;
  for (let i = 0; i < pattern.length; i += 2) sum += pattern[i] ?? 0;
  return sum;
}

/** A road with the wagon parked at a known spot, so an event can be placed
 * near it or well away from it. */
function staged(): DriveState {
  const drive = createDrive(PARAMS);
  drive.ms = 10_000;
  return drive;
}

/** A collision `atX` px along the road from the wagon. */
function at(drive: DriveState, event: DriveEvent, offsetX: number): DriveEvent {
  if (!("pos" in event)) return event;
  return {
    ...event,
    pos: { x: drive.car.pos.x + offsetX, y: drive.car.pos.y },
  } as DriveEvent;
}

describe("how hard a collision was", () => {
  it("grows the buzz with the collision's own energy", () => {
    const light = driveHitForce({
      type: "pedestrianHit",
      pos: { x: 0, y: 0 },
      joules: DRIVE.impact.wearJoules * 0.002,
    });
    const hard = driveHitForce({
      type: "pedestrianHit",
      pos: { x: 0, y: 0 },
      joules: DRIVE.impact.wearJoules * 0.04,
    });
    expect(light).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(light);
  });

  // The one place the joules are NOT consulted, and it is deliberate: a 14 kg
  // bicycle destroyed utterly cannot put enough energy through the sum to reach
  // the top of the scale at any speed the wagon can do, and what happened to it
  // is still total. Same exception `pickSmash` makes about its own sound shelf.
  it("gives a terminal beat full force whatever the arithmetic says", () => {
    for (const type of [
      "trafficRolled",
      "trafficWrecked",
      "machineSnapped",
    ] as const) {
      expect(driveHitForce({ type, pos: { x: 0, y: 0 }, joules: 1 })).toBe(1);
    }
  });

  // Every one of these rides a collision that is already in the same tick and
  // already being felt. Given a force of their own, the trimming could outweigh
  // the crash it came off.
  it("stays silent for the beats that ride another collision", () => {
    for (const type of [
      "glassSmashed",
      "windscreenOut",
      "windscreenGore",
      "occupantKilled",
    ] as const) {
      expect(driveHitForce({ type, pos: { x: 0, y: 0 }, joules: 90_000 })).toBe(
        0,
      );
    }
  });

  it("stays silent for the beats that are not blows at all", () => {
    for (const type of [
      "monologue",
      "cityGate",
      "arrived",
      "blackout",
    ] as const) {
      expect(driveHitForce({ type })).toBe(0);
    }
  });
});

describe("the buzz itself", () => {
  it("weighs a hard collision heavier than a light one", () => {
    playDriveHitHaptic(0.1, 0);
    playDriveHitHaptic(1, 5_000);
    expect(driver.calls).toHaveLength(2);
    expect(weight(driver.calls[1]!)).toBeGreaterThan(weight(driver.calls[0]!));
  });

  // Past a point a longer single pulse stops reading as heavier and starts
  // reading as a drone — the hero's own damage buzz learned this first.
  it("splits up the range rather than stretching one pulse", () => {
    playDriveHitHaptic(0.2, 0);
    playDriveHitHaptic(0.6, 5_000);
    playDriveHitHaptic(1, 10_000);
    expect(typeof driver.calls[0]).toBe("number");
    expect((driver.calls[1] as readonly number[]).length).toBe(3);
    expect((driver.calls[2] as readonly number[]).length).toBe(5);
  });

  it("is a noop when vibration is switched off", () => {
    setHapticsEnabled(false);
    playDriveHitHaptic(1, 0);
    expect(driver.calls).toEqual([]);
    setHapticsEnabled(true);
  });

  it("says nothing for a collision that cost nothing", () => {
    playDriveHitHaptic(0, 0);
    expect(driver.calls).toEqual([]);
  });
});

describe("the rate limit", () => {
  // Driving through a blockade books a wheel over a body several times a
  // second. Uncapped, the motor is simply switched on.
  it("refuses a second knock of the same size inside the gap", () => {
    expect(playDriveHitHaptic(0.2, 0)).toBe(true);
    expect(playDriveHitHaptic(0.2, 30)).toBe(false);
    expect(playDriveHitHaptic(0.2, 60)).toBe(false);
    expect(playDriveHitHaptic(0.2, 200)).toBe(true);
    expect(driver.calls).toHaveLength(2);
  });

  // …but the one event that most needs to be felt is a van met head-on in the
  // middle of a crowd, arriving while the last body's flick still holds it.
  it("lets a much harder blow cut in early", () => {
    expect(playDriveHitHaptic(0.2, 0)).toBe(true);
    expect(playDriveHitHaptic(1, 20)).toBe(true);
    expect(driver.calls).toHaveLength(2);
  });

  // A ladder of near-identical knocks must not be able to walk its way through
  // the gate — which a FACTOR would have allowed and a step does not.
  it("does not let a slow ramp walk through the gap", () => {
    expect(playDriveHitHaptic(0.2, 0)).toBe(true);
    expect(playDriveHitHaptic(0.3, 20)).toBe(false);
    expect(playDriveHitHaptic(0.4, 40)).toBe(false);
  });

  // A restart lays a fresh road at ms 0, so the clock runs backwards under the
  // limiter. Unguarded, the whole new leg is gated until it has driven past
  // where the old one crashed.
  it("heals itself when the road's clock is rewound", () => {
    expect(playDriveHitHaptic(0.5, 40_000)).toBe(true);
    expect(playDriveHitHaptic(0.2, 0)).toBe(true);
  });
});

describe("one tick of the road", () => {
  // The motor has one voice and `navigator.vibrate` REPLACES the running
  // pattern rather than queuing it, so a tick that called six times would leave
  // the SIXTH event playing — not the biggest.
  it("buzzes once, for the hardest thing that happened", () => {
    const drive = staged();
    drive.events.push(
      at(drive, { type: "bodyCrushed", pos: { x: 0, y: 0 }, joules: 10 }, 4),
      at(
        drive,
        { type: "trafficRolled", pos: { x: 0, y: 0 }, joules: 90_000 },
        8,
      ),
      at(drive, { type: "bodyCrushed", pos: { x: 0, y: 0 }, joules: 10 }, 12),
    );
    feelDrive(drive);
    expect(driver.calls).toHaveLength(1);
    // The rollover's full-force roll, not a wheel's flick.
    expect((driver.calls[0] as readonly number[]).length).toBe(5);
  });

  // The road crashes without the hero (`engine/game/drive/between.ts` — a
  // pile-up he never touched is the best obstacle this minigame has). A phone
  // that jumped for two strangers meeting a quarter of a mile up the
  // carriageway would be lying about what just happened to the player.
  it("ignores a crash the wagon was nowhere near", () => {
    const drive = staged();
    drive.events.push(
      at(
        drive,
        { type: "trafficWrecked", pos: { x: 0, y: 0 }, joules: 90_000 },
        900,
      ),
    );
    feelDrive(drive);
    expect(driver.calls).toEqual([]);
  });

  it("feels the same crash when it happens at the bumper", () => {
    const drive = staged();
    drive.events.push(
      at(
        drive,
        { type: "trafficWrecked", pos: { x: 0, y: 0 }, joules: 90_000 },
        20,
      ),
    );
    feelDrive(drive);
    expect(driver.calls).toHaveLength(1);
  });

  it("says nothing on a quiet tick", () => {
    const drive = staged();
    drive.events.push({ type: "cityGate" }, { type: "monologue" });
    feelDrive(drive);
    expect(driver.calls).toEqual([]);
  });
});
