// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FAUNA'S FENCE — a critter is drawn from a closed form off the render clock
// and collides with nothing, so where its placement says it may go is the ONLY
// thing between it and the inside of a building. These suites hold the two
// halves of that promise: the wander box stays inside the animal's district, and
// so does the piece of furniture it flies up to sit in.

import { describe, expect, it } from "vitest";

import { FAUNA, fitWander, scatterFauna, zoneContains } from "@game/core";
import type { LevelDef, Zone } from "@game/core";
import { createRng } from "@game/lib/rng.ts";

/** The lawn, as a district: a rect with a wall's worth of ground either side. */
const LAWN: Zone = {
  shape: "rect",
  rect: { x: 0, y: 0, width: 200, height: 120 },
};

/** Every corner of a critter's lap — what actually has to stay inside. */
function lapCorners(home: { x: number; y: number }, range: number) {
  const out: { x: number; y: number }[] = [];
  for (const dx of [-range, 0, range]) {
    for (const dy of [-range * FAUNA.ySweep, 0, range * FAUNA.ySweep]) {
      out.push({ x: home.x + dx, y: home.y + dy });
    }
  }
  return out;
}

/** A level def carrying one fauna line and nothing else the scatter reads. */
function faunaLevel(line: NonNullable<LevelDef["fauna"]>[number]): LevelDef {
  return { width: 400, height: 300, fauna: [line] } as unknown as LevelDef;
}

describe("the wander fence", () => {
  it("keeps a whole lap inside a rect district, wherever the home lands", () => {
    // Homes hard against every edge and corner: the placement draws these
    // uniformly, so an unfenced range is a bird half a lap through the wall.
    const homes = [
      { x: 1, y: 1 },
      { x: 199, y: 1 },
      { x: 1, y: 119 },
      { x: 199, y: 119 },
      { x: 100, y: 60 },
      { x: 100, y: 2 },
    ];
    for (const home of homes) {
      const fitted = fitWander(LAWN, home, 120);
      for (const corner of lapCorners(fitted.home, fitted.range)) {
        expect(
          zoneContains(LAWN, corner),
          `${JSON.stringify(home)} → ${JSON.stringify(corner)}`,
        ).toBe(true);
      }
    }
  });

  it("spends the room on the HOME first and the range only when it must", () => {
    // A district with space for the whole lap moves the animal to the middle of
    // it rather than clipping its wander — the read is the animal covering
    // ground, so the range is the last thing to give.
    const roomy = fitWander(LAWN, { x: 2, y: 2 }, 40);
    expect(roomy.range).toBe(40);
    expect(roomy.home).toEqual({ x: 40, y: 28 });
    // A strip too narrow to hold it takes it off the range instead.
    const strip: Zone = {
      shape: "rect",
      rect: { x: 0, y: 0, width: 300, height: 28 },
    };
    const pinched = fitWander(strip, { x: 150, y: 14 }, 120);
    expect(pinched.range).toBeCloseTo(14 / FAUNA.ySweep, 5);
  });

  it("holds a ROUND district too — the lap's corner, not its axis", () => {
    const pond: Zone = { shape: "circle", pos: { x: 100, y: 100 }, radius: 60 };
    const fitted = fitWander(pond, { x: 155, y: 100 }, 30);
    for (const corner of lapCorners(fitted.home, fitted.range)) {
      expect(zoneContains(pond, corner)).toBe(true);
    }
    // A circle smaller than the lap shrinks the lap and stands the animal in
    // the middle, rather than leaving it half outside.
    const puddle: Zone = { shape: "circle", pos: { x: 50, y: 50 }, radius: 10 };
    const tiny = fitWander(puddle, { x: 58, y: 50 }, 80);
    expect(tiny.home).toEqual({ x: 50, y: 50 });
    for (const corner of lapCorners(tiny.home, tiny.range)) {
      expect(zoneContains(puddle, corner)).toBe(true);
    }
  });

  it("fences every critter the scatter places", () => {
    const critters = scatterFauna(
      createRng(7),
      faunaLevel({ kind: "bird", count: 24, range: [40, 130], within: [LAWN] }),
    );
    expect(critters).toHaveLength(24);
    for (const critter of critters) {
      for (const corner of lapCorners(critter.home, critter.range)) {
        expect(zoneContains(LAWN, corner)).toBe(true);
      }
    }
  });

  it("places by hand the ones rejection sampling never landed", () => {
    // A district covering a sliver of the map: twenty tosses miss it often, and
    // every miss used to be a critter with no district at all — loose over the
    // whole map, which is the fence's own failure mode arriving sideways.
    const sliver: Zone = {
      shape: "rect",
      rect: { x: 300, y: 240, width: 60, height: 40 },
    };
    const critters = scatterFauna(
      createRng(4),
      faunaLevel({
        kind: "bird",
        count: 60,
        range: [30, 90],
        within: [sliver],
      }),
    );
    for (const critter of critters) {
      for (const corner of lapCorners(critter.home, critter.range)) {
        expect(zoneContains(sliver, corner)).toBe(true);
      }
    }
  });

  it("leaves an unrestricted line alone — a district is what fences it", () => {
    const [critter] = scatterFauna(
      createRng(3),
      faunaLevel({ kind: "bird", count: 1, range: [110, 110] }),
    );
    expect(critter!.range).toBe(110);
  });
});

describe("the perch", () => {
  const line = {
    kind: "bird",
    count: 1,
    range: [30, 30] as [number, number],
    within: [LAWN],
    perches: true,
  };

  it("takes the nearest perchable piece inside its own district", () => {
    const [critter] = scatterFauna(createRng(11), faunaLevel(line), [
      { pos: { x: 190, y: 20 } },
      { pos: { x: 60, y: 60 } },
      { pos: { x: 30, y: 30 } },
    ]);
    const home = critter!.home;
    const near = [
      { x: 190, y: 20 },
      { x: 60, y: 60 },
      { x: 30, y: 30 },
    ].sort(
      (a, b) =>
        Math.hypot(a.x - home.x, a.y - home.y) -
        Math.hypot(b.x - home.x, b.y - home.y),
    )[0];
    expect(critter!.perch).toEqual(near);
  });

  it("refuses a perch outside the district, however near it is", () => {
    // The bay's cement is a stride from the lawn's south edge, so a tree the
    // wrong side of that wall is exactly the bug the wander fence closes.
    const [critter] = scatterFauna(createRng(5), faunaLevel(line), [
      { pos: { x: 100, y: 130 } },
    ]);
    expect(critter!.perch).toBeUndefined();
  });

  it("refuses one further off than the animal would ever fly", () => {
    const wide: Zone = {
      shape: "rect",
      rect: { x: 0, y: 0, width: 400, height: 300 },
    };
    const [critter] = scatterFauna(
      createRng(2),
      faunaLevel({ ...line, within: [wide] }),
      [{ pos: { x: 399, y: 299 } }, { pos: { x: 1, y: 1 } }],
    );
    const perch = critter!.perch;
    if (perch) {
      expect(
        Math.hypot(perch.x - critter!.home.x, perch.y - critter!.home.y),
      ).toBeLessThanOrEqual(FAUNA.perchReach);
    }
  });

  it("is absent on a line that never sits down", () => {
    const [critter] = scatterFauna(
      createRng(9),
      faunaLevel({ kind: "bird", count: 1, within: [LAWN] }),
      [{ pos: { x: 60, y: 60 } }],
    );
    expect(critter!.perch).toBeUndefined();
  });
});
