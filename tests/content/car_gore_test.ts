// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLOOD ON THE CAR — the ladder that draws it, and the two ways it has
// already been wrong.
//
// This lives in `tests/content/` because the whole feature is a claim about
// SHIPPED ART: `car-soak.ts` solves every alpha from `CAR_FILM_COVER`, which
// says what each rung of `content/sprites/goodco/car_gore_<rung>.yaml` actually
// paints. Nothing else checks that pair, and a redraw that thins or thickens a
// rung leaves every other test in the suite green while putting the original
// bug back.
//
// The two failures worth pinning, both of which shipped:
//
//   A DRENCHED NOSE ON A FACTORY-FRESH BODY. Nearly every body on this road is
//   met on the bumper, so a model built out of strikes alone wets one panel and
//   leaves the doors and the tail at zero — one hard seam down the middle of the
//   car. `smearCarSoak` is what carries it back, and what it must never do is
//   hand a panel MORE than the one ahead of it.
//
//   A PANEL THAT GETS LIGHTER AS IT GETS BLOODIER. The rungs used to reset the
//   alpha the way the hero's coat does, which works only because his rungs
//   triple in coverage; the car's top rung has to cover the canvas WHOLE, so the
//   reset made crossing a threshold a step DOWN in how bloody a panel looked.
//   Two neighbours either side of one then read inverted, and no amount of
//   smearing fixes it because it is not in the soak at all.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import type { CarPanelId } from "@game/core";

import {
  CAR_COAT_AT,
  carCoat,
  carIsClean,
  cleanCar,
  smearCarSoak,
  soakCarFromStrike,
  wheelCoat,
} from "../../pwa/src/game/drive-screen/car-soak.ts";
import {
  clearDriveGore,
  createDriveGore,
} from "../../pwa/src/game/drive-screen/drive-gore.ts";
import {
  carriedCarFilth,
  carryCarFilth,
  washCar,
} from "../../pwa/src/game/car-condition.ts";

/** What one rung of the film actually paints, as a share of its canvas. */
function coverage(rung: number): number {
  const doc = parse(
    readFileSync(`content/sprites/goodco/car_gore_${rung}.yaml`, "utf8"),
  ) as { grid: string };
  const rows = doc.grid
    .split("\n")
    .map((row) => row.trimEnd())
    .filter((row) => row.length > 0);
  const cells = rows.join("");
  return [...cells].filter((char) => char !== ".").length / cells.length;
}

/** How bloody a surface LOOKS: every layer's art, weighted by how hard it is
 * laid on. The film is masked to the panel, so this is the honest measure of
 * the picture — coverage and alpha are not interchangeable to the eye, but a
 * ladder that is not monotone in this is not monotone at all. */
function wetness(amount: number): number {
  const coat = carCoat(fill(amount));
  return (coat.doors ?? []).reduce(
    (sum, layer) =>
      sum + layer.alpha * coverage(Number(layer.sprite.slice(-1))),
    0,
  );
}

const PANELS: readonly CarPanelId[] = [
  "bumper",
  "hood",
  "glass",
  "roof",
  "front_side",
  "doors",
  "backside",
];

const fill = (amount: number) =>
  Object.fromEntries(PANELS.map((panel) => [panel, amount])) as Record<
    CarPanelId,
    number
  >;

describe("the film ladder is solved from the art", () => {
  it("paints the coverage the ladder is priced against", () => {
    // The figures `CAR_FILM_COVER` states. If a redraw moves one, move it there
    // too — the alphas, and with them the rungs' own thresholds, are solved
    // from these.
    expect(coverage(0)).toBeCloseTo(0.21, 1);
    expect(coverage(1)).toBeCloseTo(0.58, 1);
    expect(coverage(2)).toBe(1);
  });

  it("spaces the rungs far enough apart to be a ladder", () => {
    // Two rungs of near-equal coverage leave the ladder nowhere to go between
    // them — which is what 49/96/100 did: the sparse end was already a wash.
    expect(coverage(1) - coverage(0)).toBeGreaterThan(0.2);
    expect(coverage(2) - coverage(1)).toBeGreaterThan(0.2);
  });

  it("is one plan cut at three depths — a rung only ADDS marks", () => {
    const rows = [0, 1, 2].map((rung) =>
      (
        parse(
          readFileSync(`content/sprites/goodco/car_gore_${rung}.yaml`, "utf8"),
        ) as { grid: string }
      ).grid
        .split("\n")
        .map((row) => row.trimEnd())
        .filter((row) => row.length > 0),
    );
    for (let rung = 0; rung + 1 < rows.length; rung++) {
      for (let y = 0; y < rows[rung]!.length; y++) {
        for (let x = 0; x < rows[rung]![y]!.length; x++) {
          if (rows[rung]![y]![x] === ".") continue;
          // A panel climbing a rung must never LOSE a mark it had: that reads
          // as the mess sliding around the car.
          expect(rows[rung + 1]![y]![x]).not.toBe(".");
        }
      }
    }
  });

  it("never draws a bloodier panel lighter than a drier one", () => {
    let last = 0;
    for (let amount = 0; amount <= 0.92; amount += 0.01) {
      const now = wetness(amount);
      expect(now).toBeGreaterThanOrEqual(last - 1e-9);
      last = now;
    }
  });

  it("touches every pixel of a panel from the very first mark", () => {
    // The WASH under the spatter: a hole in the film over the flank's own white
    // highlight is the brightest thing on the wagon, so the sparse rungs may
    // never be the only layer.
    const layers = carCoat(fill(CAR_COAT_AT[0]! + 0.01)).doors ?? [];
    expect(layers.length).toBe(2);
    expect(coverage(Number(layers[0]!.sprite.slice(-1)))).toBe(1);
  });

  it("draws nothing at all on a car nobody has hit anything with", () => {
    expect(carIsClean(cleanCar())).toBe(true);
    expect(carCoat(cleanCar())).toEqual({});
    expect(wheelCoat(0)).toEqual([]);
  });
});

describe("the airstream, not the spray, is what reaches the tail", () => {
  it("leaves the doors and the tail dry on a car that has not moved", () => {
    const soak = cleanCar();
    soakCarFromStrike(soak, "bumper", 200, 4);
    smearCarSoak(soak, 0, 16);
    expect(soak.bumper).toBeGreaterThan(0);
    expect(soak.doors).toBe(0);
    expect(soak.backside).toBe(0);
  });

  it("lays a gradient from the nose back once it is moving", () => {
    const soak = cleanCar();
    // A handful of bodies met on the nose over twenty seconds — a careful leg,
    // deliberately short of the ceiling, since a saturated nose would make the
    // gradient below true by clamping rather than by carrying.
    for (let tick = 0; tick < 60 * 20; tick++) {
      if (tick % 300 === 0) soakCarFromStrike(soak, "bumper", 120, 2);
      smearCarSoak(soak, 900, 16);
    }
    expect(soak.bumper).toBeLessThan(0.9);
    // Every panel wears something…
    for (const panel of PANELS) expect(soak[panel]).toBeGreaterThan(0);
    // …and none of them wears more than the panel ahead of it.
    expect(soak.hood).toBeLessThan(soak.bumper);
    expect(soak.glass).toBeLessThan(soak.hood);
    expect(soak.roof).toBeLessThan(soak.glass);
    expect(soak.front_side).toBeLessThan(soak.bumper);
    expect(soak.doors).toBeLessThan(soak.front_side);
    expect(soak.backside).toBeLessThan(soak.doors);
  });

  it("only ever raises — a panel keeps blood its neighbours never had", () => {
    const soak = cleanCar();
    soakCarFromStrike(soak, "backside", 200, 6);
    const had = soak.backside;
    smearCarSoak(soak, 900, 16);
    expect(soak.backside).toBe(had);
  });
});

describe("the wagon carries its mess between legs", () => {
  // THE CAR IS ONE OBJECT ACROSS THE NIGHT and the film is the half the engine
  // has no field for, so it rides in the app's own carrier
  // (`pwa/src/game/car-condition.ts`) between the road, the car park, the road
  // home and the bay. The two things that can go wrong are the two asserted:
  // a leg that opens clean when it should not, and a RESTART that hands the
  // player a washed car for having broken down.
  it("opens a leg on the film the car arrived with, and washes on request", () => {
    washCar();
    expect(carriedCarFilth().tyre).toBe(0);
    expect(carIsClean(carriedCarFilth().soak)).toBe(true);

    const soak = cleanCar();
    soakCarFromStrike(soak, "bumper", 200, 4);
    carryCarFilth({ soak, tyre: 0.5 });

    const gore = createDriveGore(carriedCarFilth());
    expect(gore.car.bumper).toBeGreaterThan(0);
    expect(gore.tyre).toBe(0.5);

    washCar();
    expect(carIsClean(carriedCarFilth().soak)).toBe(true);
  });

  it("puts the arrival film back on a breakdown restart, not a clean car", () => {
    const soak = cleanCar();
    soakCarFromStrike(soak, "bumper", 200, 4);
    const arrived = soak.bumper;
    const gore = createDriveGore({ soak, tyre: 0.4 });
    // …a stretch of road later, wetter still.
    soakCarFromStrike(gore.car, "bumper", 200, 8);
    expect(gore.car.bumper).toBeGreaterThan(arrived);
    clearDriveGore(gore);
    expect(gore.car.bumper).toBe(arrived);
    expect(gore.tyre).toBe(0.4);
  });

  it("hands a road with no night behind it a clean car", () => {
    const gore = createDriveGore();
    expect(carIsClean(gore.car)).toBe(true);
    expect(gore.tyre).toBe(0);
  });
});
