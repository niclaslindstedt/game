// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SFW MODE is one presentation override over every gore family and kind. It
// replaces graphic deaths with stardust, keeps an intact readable corpse, and
// re-dresses the DRIVE rather than blanking it: the crash still lands with its
// full weight and the body peels away in fairy dust.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDrive } from "@game/core";

import { setDevicePolicyForTest } from "../pwa/src/app/device-policy.ts";
import { arcadeDriveParams } from "../pwa/src/game/drive-screen/begin.ts";
import { createDriveFx } from "../pwa/src/game/drive-screen/drive-fx.ts";
import {
  carCoat,
  cleanCar,
  wheelCoat,
} from "../pwa/src/game/drive-screen/car-soak.ts";
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
import { FAIRY_RAMP, stardustCount } from "../pwa/src/game/render/stardust.ts";
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
    ).toBe(90);
  });

  it("keeps a road collision's puff well under a body's shower", () => {
    const body = stardustCount({ intensity: 3, burst: true, fairy: true });
    const crash = stardustCount({ intensity: 1.5, burst: false, fairy: true });
    expect(crash).toBeLessThan(body / 2);
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

  it("peels a body into fairy dust while the collision itself still lands", () => {
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
    drainDrive(drive, bursts, fx, gore, createSkids(), undefined, true);

    // The body is dust — no viscera burst anywhere in the list.
    expect(bursts).toEqual([
      expect.objectContaining({
        kind: "fairyDust",
        x: drive.car.pos.x + 4,
        y: drive.car.pos.y,
        heavy: true,
      }),
    ]);
  });

  it("keeps the crash's own weight — the effects, the shake and the marks", () => {
    const drive = createDrive({
      seed: 7,
      direction: 1,
      difficulty: "medium",
      to: "goodco_hq",
      gib: false,
      split: false,
    });
    const pos = { x: drive.car.pos.x + 6, y: drive.car.pos.y };
    drive.events.push(
      { type: "trafficHit", pos, joules: 800_000, class: "car", headOn: false },
      { type: "trafficBent", pos, joules: 800_000 },
    );
    const fx = createDriveFx();
    drainDrive(
      drive,
      [],
      fx,
      createDriveGore(),
      createSkids(),
      undefined,
      true,
    );

    // The whole point of the change: a crash in SFW mode is still a crash.
    expect(fx.fx.length).toBeGreaterThan(0);
    expect(fx.shake).toBeGreaterThan(0);
  });

  it("marks a steel-on-steel crash with one light puff per contact point", () => {
    const drive = createDrive({
      seed: 7,
      direction: 1,
      difficulty: "medium",
      to: "goodco_hq",
      gib: false,
      split: false,
    });
    const pos = { x: drive.car.pos.x + 6, y: drive.car.pos.y };
    // The four events one car crash actually books, all at the same contact.
    drive.events.push(
      { type: "trafficHit", pos, joules: 80_000, class: "car", headOn: false },
      { type: "trafficBent", pos, joules: 80_000 },
      { type: "glassSmashed", pos, joules: 80_000 },
    );
    const bursts: Burst[] = [];
    drainDrive(
      drive,
      bursts,
      createDriveFx(),
      createDriveGore(),
      createSkids(),
      undefined,
      true,
    );

    expect(bursts).toEqual([
      expect.objectContaining({ kind: "fairyDust", heavy: false }),
    ]);
  });

  it("re-dresses the film the wagon wears instead of washing it off", () => {
    const soak = { ...cleanCar(), bumper: 1 };
    const bloody = carCoat(soak).bumper ?? [];
    const dusted = carCoat(soak, FAIRY_RAMP).bumper ?? [];
    expect(bloody.length).toBeGreaterThan(0);
    // The SAME art at the SAME strength — a wagon driven through a crowd is
    // still visibly a wagon driven through a crowd. Only the palette moves.
    expect(dusted.map((layer) => layer.sprite)).toEqual(
      bloody.map((layer) => layer.sprite),
    );
    expect(dusted.map((layer) => layer.alpha)).toEqual(
      bloody.map((layer) => layer.alpha),
    );
    expect(dusted.every((layer) => layer.ramp === FAIRY_RAMP)).toBe(true);
    expect(bloody.every((layer) => layer.ramp === undefined)).toBe(true);
    expect(
      wheelCoat(1, FAIRY_RAMP).every((layer) => layer.ramp === FAIRY_RAMP),
    ).toBe(true);
  });

  it("leaves a crash undusted while the graphic gore is on", () => {
    const drive = createDrive({
      seed: 7,
      direction: 1,
      difficulty: "medium",
      to: "goodco_hq",
      gib: true,
      split: true,
    });
    drive.events.push({
      type: "trafficBent",
      pos: { x: drive.car.pos.x + 6, y: drive.car.pos.y },
      joules: 80_000,
    });
    const bursts: Burst[] = [];
    drainDrive(
      drive,
      bursts,
      createDriveFx(),
      createDriveGore(),
      createSkids(),
    );

    expect(bursts).toEqual([]);
  });
});
