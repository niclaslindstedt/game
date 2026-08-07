// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE'S SCENERY — that every sprite the road names actually exists, and
// that the crowd's two halves agree about how many people there are.
//
// BOTH FAILURES ARE SILENT WITHOUT THIS, which is the only reason the file is
// here. The sim rolls `DrivePedestrian.variant` in `[0, CROWD_VARIANTS)` and the
// renderer indexes its sprite table with `variant % table.length` — so a table
// SHORTER than the count quietly stops using the people at the end of the
// roster (nobody ever sees the wheelchair), and a table LONGER than it means
// the sim can never roll them. Neither throws, neither looks wrong in a
// screenshot, and both waste art that was drawn on purpose.
//
// A MISSPELT SPRITE NAME is the same shape of bug: `spriteByName` returns
// undefined and the draw is skipped, so a pedestrian becomes an invisible thing
// that still goes under the car. This lives in `tests/content/` rather than
// `tests/engine/` precisely because it asserts things about SHIPPED CONTENT —
// the atlas and the app's own tables — rather than an engine rule.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CROWD_VARIANTS,
  FLEET,
  RIDER_VARIANTS,
  TRAFFIC_VARIANTS,
} from "@game/core";

import {
  CROWD_SPRITES,
  HOUSE_SPRITES,
  RIDER_SEATS,
  RIDER_SPRITES,
  TRAFFIC_SPRITES,
  trafficSprite,
} from "../../pwa/src/game/drive-screen/scenery.ts";

const ATLAS: Record<string, unknown> = JSON.parse(
  readFileSync(
    new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
    "utf8",
  ),
);

/** Every sprite the drive can ask for, flattened. */
const NAMED = [
  ...CROWD_SPRITES.flat(),
  ...TRAFFIC_SPRITES,
  ...RIDER_SPRITES,
  ...HOUSE_SPRITES,
  // …and every rung of every vehicle's DAMAGE LADDER, which is derived at build
  // time (`scripts/asset-tools/wreck.mjs`) and is therefore exactly the kind of
  // thing that silently stops being generated: a car that loses its `_dent2`
  // simply stops being drawn the moment it takes a second hit, which on a road
  // this busy reads as the car having vanished rather than as a missing sprite.
  ...FLEET.flatMap((def) =>
    [1, 2, 3].map((rung) => trafficSprite(FLEET.indexOf(def), rung)),
  ),
  // The kerbside furniture and the car's own thrown wheels, named inline by the
  // renderer rather than in a table — they are as easy to misspell.
  "lamp_post",
  "car_wheel_0",
  "car_wheel_flat",
];

describe("the drive's sprite tables", () => {
  it("names only sprites the shipped atlas actually has", () => {
    const missing = NAMED.filter((name) => !(name in ATLAS));
    expect(missing).toEqual([]);
  });

  it("gives the crowd exactly as many bodies as the sim rolls", () => {
    expect(CROWD_SPRITES).toHaveLength(CROWD_VARIANTS);
  });

  it("gives the traffic exactly as many cars as the sim rolls", () => {
    expect(TRAFFIC_SPRITES).toHaveLength(TRAFFIC_VARIANTS);
  });

  it("gives every pedestrian two distinct walk frames", () => {
    for (const [a, b] of CROWD_SPRITES) {
      expect(a).not.toBe(b);
      expect(a.endsWith("_0")).toBe(true);
      expect(b.endsWith("_1")).toBe(true);
    }
  });

  it("draws the crowd from twenty DIFFERENT people, not one repeated", () => {
    const stems = new Set(CROWD_SPRITES.map(([a]) => a.replace(/_0$/, "")));
    expect(stems.size).toBe(CROWD_SPRITES.length);
  });

  it("gives every rider a body, and every machine a saddle to put one on", () => {
    expect(RIDER_SPRITES).toHaveLength(RIDER_VARIANTS);
    for (const def of FLEET) {
      if (def.rider === null) continue;
      expect(RIDER_SPRITES[def.rider]).toBeTruthy();
      // A machine whose seat is missing draws its rider standing on the road
      // beside it, which is worse than drawing no rider at all.
      expect(RIDER_SEATS[def.id]).toBeTruthy();
    }
  });

  it("only puts riders on the vehicles that are open to the weather", () => {
    // A rider is somebody sitting OUTSIDE, and the whole ejection ladder hangs
    // off the distinction: anything with a roof carries `occupants` instead and
    // only empties through a screen.
    for (const def of FLEET) {
      expect(def.rider !== null).toBe(def.class === "open");
      if (def.class === "open") expect(def.occupants).toBe(0);
    }
  });

  it("keeps the delivery trade the most common thing on the road", () => {
    // The point of the pavement riders, stated as a number: mopeds and e-bikes
    // together are a fifth of everything out here, and the single most common
    // vehicle is a food moped rather than any car.
    const total = FLEET.reduce((sum, def) => sum + def.weight, 0);
    const delivery = FLEET.filter((def) => def.pavement).reduce(
      (sum, def) => sum + def.weight,
      0,
    );
    expect(delivery / total).toBeGreaterThan(0.15);
    const heaviest = [...FLEET].sort((a, b) => b.weight - a.weight)[0];
    expect(heaviest?.id).toBe("traffic_delivery_moped");
  });

  it("keeps a town to put beside the road", () => {
    expect(HOUSE_SPRITES.length).toBeGreaterThan(4);
  });
});
