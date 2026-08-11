// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SFW MODE is one presentation override over every gore family and kind. It
// replaces graphic deaths with stardust, keeps an intact readable corpse, and
// makes the DRIVE drain collision audio without recording collision visuals.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDrive } from "@game/core";

import { setDevicePolicyForTest } from "../pwa/src/app/device-policy.ts";
import { arcadeDriveParams } from "../pwa/src/game/drive-screen/begin.ts";
import { createDriveFx } from "../pwa/src/game/drive-screen/drive-fx.ts";
import { createDriveGore } from "../pwa/src/game/drive-screen/drive-gore.ts";
import { drainDrive, type Burst } from "../pwa/src/game/drive-screen/loop.ts";
import { createSkids } from "../pwa/src/game/drive-screen/skid.ts";
import { bossRitePresentation } from "../pwa/src/game/game-screen/boss-rite.ts";
import {
  dismemberAllowed,
  goreAmount,
  splashOnly,
} from "../pwa/src/game/game-screen/gore-gate.ts";
import { killPresentation } from "../pwa/src/game/game-screen/kill-presentation.ts";
import { stardustCount } from "../pwa/src/game/render/stardust.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";
import { ALL_GORE_ON } from "./gore-settings.ts";

beforeEach(() => {
  setDevicePolicyForTest(null);
  updateSettings({ ...ALL_GORE_ON, sfwMode: "on", blood: 1, knockback: 1 });
});

afterEach(() => {
  updateSettings({ ...ALL_GORE_ON, blood: 1, knockback: 1 });
  setDevicePolicyForTest(null);
});

describe("the SFW gore override", () => {
  it("refuses every gore output without falling back to collision splashes", () => {
    for (const family of ["blood", "ecto", "sparks", "cosmic"] as const) {
      expect(goreAmount(family)).toBeNull();
      expect(splashOnly(family)).toBe(false);
    }
    expect(dismemberAllowed("cleave")).toBe(false);
    expect(dismemberAllowed("gib")).toBe(false);
  });

  it("turns graphic kills into stardust and keeps the whole corpse", () => {
    const killed = killPresentation({
      edged: true,
      damage: 400,
      maxHp: 100,
      hpBefore: 100,
      heroPos: { x: 0, y: 0 },
      pos: { x: 20, y: 0 },
      role: "minion",
      anatomy: "humanoid",
      seed: 7,
    });
    expect(killed.gore).toBeNull();
    expect(killed.incinerate).toBe(false);
    expect(killed.stardust).toBe(true);
    expect(killed.launch).not.toBeNull();

    const ordinary = killPresentation({
      damage: 100,
      maxHp: 100,
      hpBefore: 100,
      heroPos: { x: 0, y: 0 },
      pos: { x: 20, y: 0 },
      role: "minion",
      anatomy: "humanoid",
      seed: 8,
    });
    expect(ordinary.stardust).toBe(false);
    expect(ordinary.launch).not.toBeNull();
  });

  it("turns a boss finisher into glitter around its landmark corpse", () => {
    expect(
      bossRitePresentation({
        remains: "gib",
        heading: 0,
        force: 6,
        anatomy: "humanoid",
        seed: 11,
      }),
    ).toEqual({ gore: null, stardust: true, corpse: true });
  });

  it("sizes pastel bursts while keeping their draw budget bounded", () => {
    expect(stardustCount({ intensity: 6, burst: true })).toBeGreaterThan(
      stardustCount({ intensity: 1, burst: false }),
    );
    expect(stardustCount({ intensity: 1_000_000, burst: true })).toBe(56);
    expect(
      stardustCount({ intensity: 1_000_000, burst: true, fairy: true }),
    ).toBe(72);
  });
});

describe("the SFW DRIVE", () => {
  it("disables the engine's split and gib outcomes for both cabinet variants", () => {
    expect(arcadeDriveParams(7, "medium", "goodco_hq")).toMatchObject({
      gib: false,
      split: false,
    });
    expect(arcadeDriveParams(7, "medium", "garage")).toMatchObject({
      gib: false,
      split: false,
    });
  });

  it("drains a collision into fairy dust without recording graphic effects", () => {
    const drive = createDrive({
      seed: 7,
      direction: 1,
      difficulty: "medium",
      to: "goodco_hq",
      gib: false,
      split: false,
    });
    drive.events.push({
      type: "pedestrianHit",
      pos: { x: drive.car.pos.x + 4, y: drive.car.pos.y },
      joules: 1_000_000,
      kind: "walker",
      variant: 0,
    });
    const bursts: Burst[] = [];
    const fx = createDriveFx();
    const gore = createDriveGore();
    drainDrive(drive, bursts, fx, gore, createSkids(), undefined, false);

    expect(bursts).toEqual([
      expect.objectContaining({
        kind: "fairyDust",
        x: drive.car.pos.x + 4,
        y: drive.car.pos.y,
      }),
    ]);
    expect(fx.fx).toEqual([]);
    expect(fx.shake).toBe(0);
    expect(fx.flash).toBe(0);
    expect(gore.marks).toEqual([]);
    expect(gore.wet.size).toBe(0);
    expect(gore.tyre).toBe(0);
  });
});
