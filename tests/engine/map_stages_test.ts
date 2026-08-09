// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAGE LADDER — a venue that CHANGES as the campaign goes by
// (`engine/game/mapgen/stages.ts`).
//
// Almost every map in the game is the same place whenever the hero walks into
// it. The hub is not: it is his home, he keeps lighting a rocket on the lawn,
// and the ground and the trees on it climb a ladder read off what he has
// already cleared. This suite is the RULE, on a synthetic blueprint — the shape
// of that ladder rather than this game's particular one, which is
// `tests/content/generated_maps_test.ts`'s business.
//
// The property that carries the feature is the last one below: a rung may
// REDRESS and never RESHAPE. Everything else about the carve — where the trees
// stand, which cell is the goal, every rng draw after it — has to come out
// identical on every rung, or a burnt lawn reads as a different lot instead of
// as the same one after a fire (and a host and a joiner deriving different tags
// would be carving different worlds rather than dressing one).

import { describe, expect, it } from "vitest";

import { resolveStages } from "../../engine/game/mapgen/stages.ts";
import type { MapBlueprint } from "../../engine/game/mapgen/types.ts";

const GREEN = { common: "test_green_0", rare: "test_green_1", rareEvery: 9 };
const CHAR = { common: "test_char_0", rare: "test_char_1", rareEvery: 9 };
const ASH = { common: "test_ash_0", rare: "test_ash_1", rareEvery: 9 };

/** A blueprint with one staged district and one staged prop, and nothing else
 * this module reads. */
function blueprint(): MapBlueprint {
  return {
    id: "test_stages",
    level: "test_level",
    size: { width: 400, height: 400, rooms: 4 },
    layout: {
      minRoom: 100,
      doorWidth: 60,
      loopDoors: 0,
      cluster: 0.5,
      wall: "test_wall",
    },
    areas: [
      {
        id: "yard",
        enclosure: "none",
        weight: 1,
        horde: 1,
        ground: GREEN,
        stages: [
          { needs: "cleared:one", ground: CHAR },
          { needs: "cleared:two", ground: ASH },
        ],
      },
      { id: "shed", enclosure: "hard", weight: 1, horde: 1, ground: GREEN },
    ],
    objects: [
      {
        id: "tree",
        type: "obstacle",
        sprite: "test_tree",
        radius: 7,
        density: 20,
        areas: ["yard"],
        stages: [
          { needs: "cleared:one", sprite: "test_tree_charred" },
          { needs: "cleared:two", sprite: "test_tree_ashen" },
        ],
      },
      { id: "test_wall", type: "wall", radius: 8 },
    ],
    horde: {
      perRoom: [1, 1],
      maxAlive: 1,
      lingering: 0,
      ramps: [],
      members: [],
    },
    elites: [],
    guardians: [],
    boss: null,
  } as unknown as MapBlueprint;
}

const yardGround = (bp: MapBlueprint) =>
  bp.areas.find((a) => a.id === "yard")?.ground?.common;
const treeSprite = (bp: MapBlueprint) =>
  bp.objects.find((o) => o.id === "tree")?.sprite;

describe("a blueprint's stage ladder", () => {
  it("wears its unstaged dressing when the run remembers nothing", () => {
    // Rung zero is the field itself, not a rung — which is what makes a ladder
    // safe to add to a venue that already ships: with no tags, nothing moved.
    const bp = resolveStages(blueprint(), []);
    expect(yardGround(bp)).toBe("test_green_0");
    expect(treeSprite(bp)).toBe("test_tree");
  });

  it("takes the rung whose tag the run carries", () => {
    const bp = resolveStages(blueprint(), ["cleared:one"]);
    expect(yardGround(bp)).toBe("test_char_0");
    expect(treeSprite(bp)).toBe("test_tree_charred");
  });

  it("lets the LAST held rung win, so a ladder is written worst-last", () => {
    // Both rungs hold here — the hero cleared one and then two — and the
    // ladder is ordered, so the second is the answer. Author order is the
    // whole vocabulary; there is no priority field to get wrong.
    const bp = resolveStages(blueprint(), ["cleared:one", "cleared:two"]);
    expect(yardGround(bp)).toBe("test_ash_0");
    expect(treeSprite(bp)).toBe("test_tree_ashen");
  });

  it("reads `until` as the mirror of `needs`", () => {
    const src = blueprint();
    src.areas[0]!.stages = [{ until: "cleared:one", ground: ASH }];
    expect(yardGround(resolveStages(src, []))).toBe("test_ash_0");
    expect(yardGround(resolveStages(src, ["cleared:one"]))).toBe(
      "test_green_0",
    );
  });

  it("ignores a tag no rung names", () => {
    const bp = resolveStages(blueprint(), ["cleared:somewhere_else"]);
    expect(yardGround(bp)).toBe("test_green_0");
    expect(treeSprite(bp)).toBe("test_tree");
  });

  it("hands back a blueprint with no ladders untouched, by identity", () => {
    // Every venue in the game but the hub is this case, so the pass has to cost
    // nothing on them — and returning the same object is the cheapest possible
    // proof that it did not.
    const plain = blueprint();
    plain.areas[0]!.stages = undefined;
    plain.objects[0]!.stages = undefined;
    expect(resolveStages(plain, ["cleared:one"])).toBe(plain);
  });

  it("REDRESSES, and never reshapes: only ground, patch and sprite move", () => {
    // The load-bearing property. A rung that could change a density, a radius,
    // an area's enclosure or the object list would put the campaign's memory
    // inside the CARVE — where it decides how many rng draws are spent and
    // therefore where everything downstream of them lands.
    const base = resolveStages(blueprint(), []);
    for (const tags of [["cleared:one"], ["cleared:one", "cleared:two"]]) {
      const rung = resolveStages(blueprint(), tags);
      expect(rung.areas.map((a) => a.id)).toEqual(base.areas.map((a) => a.id));
      expect(rung.objects.map((o) => o.id)).toEqual(
        base.objects.map((o) => o.id),
      );
      expect(strip(rung)).toEqual(strip(base));
    }
  });

  it("leaves the blueprint it was handed alone", () => {
    // It is the compiled catalog: a pass that mutated it in place would leave
    // the NEXT run — a fresh hero, or a joiner — carving somebody else's rung.
    const src = blueprint();
    resolveStages(src, ["cleared:two"]);
    expect(yardGround(src)).toBe("test_green_0");
    expect(treeSprite(src)).toBe("test_tree");
  });
});

/** Everything about a blueprint EXCEPT what a rung is allowed to restage. */
function strip(bp: MapBlueprint): unknown {
  const without = (o: object, keys: string[]) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
  return JSON.parse(
    JSON.stringify({
      ...bp,
      areas: bp.areas.map((a) => without(a, ["ground", "patch", "stages"])),
      objects: bp.objects.map((o) => without(o, ["sprite", "stages"])),
    }),
  );
}
