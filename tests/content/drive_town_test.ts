// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TOWN ON THE ROAD TO GOODCO — that every piece it can name exists, that
// the street tiles, and that the road actually gets nicer the nearer GOODCO it
// gets.
//
// EVERY FAILURE THIS FILE CATCHES IS SILENT, which is the whole reason it is
// here. A building is ASSEMBLED at runtime from a plan
// (`src/game/drive/town-plan.ts`) rather than blitted from one sprite, so:
//
//   A MISNAMED PART simply does not draw. `spriteByName` returns undefined, the
//   compositor skips the layer, and what ships is a house with no front door
//   on one archetype at one wear rung — a screenshot nobody takes.
//   A PART THAT IS THE WRONG SIZE lands over the reveal of a hole cut for
//   something else, on one bay width.
//   A GAP IN THE TILING is a hole in the row that only opens on the seed and
//   the district that produced it.
//   AND THE GRADIENT going the wrong way is invisible in any single frame: the
//   town is only ever seen a screenful at a time, so "the hero's end is worse"
//   is a claim about a mile of road and can only be measured, never eyeballed.
//
// It lives in `tests/content/` rather than `tests/engine/` because it asserts
// things about SHIPPED CONTENT — the atlas and this game's own roster — rather
// than an engine rule.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DRIVE,
  planTown,
  resetTownPlan,
  TOWN,
  TOWN_ART_SIZE,
  TOWN_COLOURWAYS,
  TOWN_DECALS,
  TOWN_DOORS,
  TOWN_FRONTS,
  TOWN_GARAGE_DOORS,
  TOWN_HOLE_STATES,
  TOWN_JUNK,
  TOWN_PORCHES,
  TOWN_SIGNS,
  townDistrict,
  townHeight,
  townSlots,
  townWidth,
  type TownRoad,
} from "@game/core";

const ATLAS: Record<string, unknown> = JSON.parse(
  readFileSync(
    new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
    "utf8",
  ),
);

const OUT: TownRoad = { direction: 1, coursePx: DRIVE.coursePx };
const HOME: TownRoad = { direction: -1, coursePx: DRIVE.coursePx };

/** Every sprite the plan could ever name, enumerated from the catalog rather
 * than from a run — a part that only turns up on one seed is exactly the part
 * that ships broken. */
const NAMED = [
  ...TOWN.flatMap((def) => TOWN_COLOURWAYS.map((c) => `${def.id}${c}`)),
  ...[...TOWN_DOORS, ...TOWN_GARAGE_DOORS].flatMap((part) =>
    TOWN_HOLE_STATES.map((state) => `town_${part.id}_${state}`),
  ),
  ...["small", "tall", "wide", "strip", "shop"].flatMap((type) =>
    TOWN_HOLE_STATES.map((state) => `town_win_${type}_${state}`),
  ),
  ...[...TOWN_PORCHES, ...TOWN_SIGNS, ...TOWN_DECALS, ...TOWN_JUNK].map(
    (part) => `town_${part.id}`,
  ),
  ...Object.values(TOWN_FRONTS)
    .filter((id): id is string => id !== null)
    .map((id) => `town_${id}`),
];

describe("the town's catalog", () => {
  it("names only sprites the shipped atlas actually has", () => {
    expect(NAMED.filter((name) => !(name in ATLAS))).toEqual([]);
  });

  it("keeps a street's worth of buildings to draw it from", () => {
    // The point of the whole rework, stated as a number. Below twenty the row
    // starts repeating inside a single screenful again, which is the thing it
    // was rebuilt to stop doing.
    expect(TOWN.length).toBeGreaterThanOrEqual(20);
    expect(new Set(TOWN.map((def) => def.id)).size).toBe(TOWN.length);
  });

  it("gives the row a silhouette rather than a ruled line", () => {
    const heights = new Set(TOWN.map(townHeight));
    const widths = new Set(TOWN.map(townWidth));
    expect(heights.size).toBeGreaterThan(5);
    expect(widths.size).toBeGreaterThan(2);
    // The old row was 40x30 for every building on the road; nothing about the
    // new one is allowed to be one number again.
    expect(Math.max(...heights) / Math.min(...heights)).toBeGreaterThan(2);
  });

  it("writes a ground floor as long as the facade has bays", () => {
    for (const def of TOWN) {
      expect(def.ground.length, def.id).toBe(def.bays);
      expect(def.ground, def.id).toMatch(/^[dwsg.]+$/);
    }
  });

  it("cuts every hole inside the wall it is cut in", () => {
    for (const def of TOWN) {
      const w = townWidth(def);
      const h = townHeight(def);
      for (const slot of townSlots(def)) {
        // A reveal is sunk one px outside the hole on every side, so a hole
        // flush with the corner board draws its lintel off the sprite.
        expect(slot.x, `${def.id} ${slot.part}`).toBeGreaterThan(0);
        expect(slot.x + slot.w, `${def.id} ${slot.part}`).toBeLessThan(w);
        expect(slot.y, `${def.id} ${slot.part}`).toBeGreaterThanOrEqual(
          def.roofPx - 2,
        );
        expect(slot.y + slot.h, `${def.id} ${slot.part}`).toBeLessThan(h);
      }
    }
  });

  it("gives every part a size, and every size a part", () => {
    const parts = [
      ...TOWN_DOORS,
      ...TOWN_GARAGE_DOORS,
      ...TOWN_PORCHES,
      ...TOWN_SIGNS,
      ...TOWN_DECALS,
      ...TOWN_JUNK,
    ];
    for (const part of parts)
      expect(TOWN_ART_SIZE[part.id], part.id).toBeTruthy();
    // …and nothing may be wider than the narrowest bay the plot grid produces,
    // which is what lets one part serve every archetype.
    for (const [id, [w]] of Object.entries(TOWN_ART_SIZE)) {
      if (id.startsWith("front_")) continue; // a frontage tile is a plot wide
      expect(w, id).toBeLessThanOrEqual(15);
    }
  });

  it("leaves somewhere for every archetype and every part to stand", () => {
    // A def or a part whose band nothing overlaps is art that is drawn, packed
    // into the atlas and never once seen.
    for (const def of TOWN) {
      expect(def.district[0], def.id).toBeLessThan(def.district[1]);
      expect(def.wear[0], def.id).toBeLessThanOrEqual(def.wear[1]);
    }
    for (const part of [...TOWN_DOORS, ...TOWN_PORCHES, ...TOWN_SIGNS]) {
      expect(part.district[0], part.id).toBeLessThan(part.district[1]);
    }
  });
});

describe("the street it lays out", () => {
  it("tiles without a gap and without an overlap", () => {
    resetTownPlan();
    for (const road of [OUT, HOME]) {
      for (const from of [0, 5000, 12000, 23000, -9000]) {
        const row = planTown(from, from + 1200, road)
          .filter((prop) => !prop.key.startsWith("f:"))
          .sort((a, b) => a.x - b.x);
        expect(row.length).toBeGreaterThan(8);
        let previous: number | null = null;
        for (const prop of row) {
          const left = prop.x - prop.w / 2;
          if (previous !== null) {
            const gap = left - previous;
            // The alley a building leaves for its neighbour, and nothing else:
            // a bigger hole is a plot the tiler failed to fill.
            expect(gap, `${road.direction}@${from}`).toBeGreaterThanOrEqual(0);
            expect(gap, `${road.direction}@${from}`).toBeLessThanOrEqual(6);
          }
          previous = prop.x + prop.w / 2;
        }
      }
    }
  });

  it("answers the same for the same ground however it is asked", () => {
    // The plan is cached per block, so the whole thing rests on a block being a
    // pure function of its index. A window that changed state when the camera
    // reached it from the other side would be the worst kind of flicker.
    resetTownPlan();
    const wide = planTown(6000, 7600, OUT);
    resetTownPlan();
    const narrow = [...planTown(6000, 6800, OUT), ...planTown(6800, 7600, OUT)];
    const key = (p: { key: string; x: number }) => `${p.x}:${p.key}`;
    expect([...new Set(narrow.map(key))].sort()).toEqual(
      [...new Set(wide.map(key))].sort(),
    );
  });

  it("stands the same buildings on the leg home", () => {
    // A player who noticed a burnt-out pub on the way out must drive home past
    // the same pub. Outbound x and homeward x are mirror images of each other
    // around the course, so the same DISTRICT has to produce the same street.
    resetTownPlan();
    const out = planTown(0, 1200, OUT).map((p) => p.key);
    resetTownPlan();
    const home = planTown(0, 1200, HOME).map((p) => p.key);
    // Not the same keys — the district at x=0 is 0 outbound and 1 homeward, so
    // these are the two ENDS of the road, and they had better not match.
    expect(home).not.toEqual(out);
    expect(townDistrict(0, OUT)).toBe(0);
    expect(townDistrict(0, HOME)).toBe(1);
    expect(townDistrict(-DRIVE.coursePx, HOME)).toBe(0);
  });

  it("gets nicer the nearer GOODCO it gets", () => {
    // THE CLAIM THE WHOLE FEATURE MAKES, measured rather than eyeballed. Wear
    // is not on the prop, so it is read off what wear DOES: a boarded or
    // smashed hole, and the junk in the front garden.
    resetTownPlan();
    const spoiled = (from: number) => {
      const props = planTown(from, from + 6000, OUT);
      const layers = props.flatMap((p) => p.layers.map((l) => l.sprite));
      const bad = layers.filter(
        (s) =>
          s.endsWith("_board") || s.endsWith("_broke") || s.includes("_junk_"),
      ).length;
      return bad / Math.max(1, layers.length);
    };
    const home = spoiled(0);
    const middle = spoiled(9000);
    const goodco = spoiled(18000);
    expect(home).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(goodco);
    // …and the two ends have to be genuinely different places rather than two
    // samples of one distribution.
    expect(home).toBeGreaterThan(goodco * 3);
  });

  it("keeps a light on at the hero's end", () => {
    // The story counts these: shuttered trades, boarded windows, "and a lit one
    // every third house where somebody's welfare still lands". A first mile
    // with nothing lit on it is a ruin, which is a different — and much less
    // uncomfortable — joke than the one this road is telling.
    resetTownPlan();
    const props = planTown(0, 6000, OUT);
    const lit = props.filter((p) =>
      p.layers.some((l) => l.sprite.endsWith("_lit")),
    );
    expect(lit.length).toBeGreaterThan(2);
  });

  it("puts a fence in front of a house and never through it", () => {
    resetTownPlan();
    for (const prop of planTown(0, 4000, OUT)) {
      for (const layer of prop.layers) {
        expect(layer.x, `${prop.key} ${layer.sprite}`).toBeGreaterThanOrEqual(
          0,
        );
        expect(layer.y, `${prop.key} ${layer.sprite}`).toBeGreaterThanOrEqual(
          0,
        );
        expect(layer.y, `${prop.key} ${layer.sprite}`).toBeLessThan(prop.h);
      }
    }
  });
});
