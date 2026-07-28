// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GENERATED MAPS (see src/game/mapgen/): the guard on the map generator.
//
// A carved map is only ever seen once, by one player, on one seed — nobody
// reviews it before it ships and no screenshot proves the next one is fine. So
// the properties that MUST hold have to hold for every seed, and the only way to
// know that is to carve a spread of them and check.
//
// Two checks carry the weight:
//
//   REACHABILITY, using the engine's OWN pathfinder rather than a re-derivation
//   of it. A generated map whose boss sits behind a sealed partition is not a
//   hard map, it is a broken one — and the same goes for a cache walled off or a
//   story item dropped in a pocket. Asking `buildNavGrid`/`findPath` is asking
//   the thing the autopilot asks, so a pass here is a pass in play.
//
//   SCHEMA, using the same `validateLevel` the build runs over every
//   hand-authored level. The generator emits a `LevelDef` and the rest of the
//   engine cannot tell where one came from, so it has no business emitting one a
//   human would not be allowed to commit.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  buildNavGrid,
  createGame,
  ENEMY_DEFS,
  findPath,
  hasMapBlueprint,
  LEVEL_ORDER,
  MAP_BLUEPRINTS,
  levelDef,
  parseRegion,
  regionRect,
  resolveLevelDef,
  resolveMapSize,
  SECRET_LEVEL_ORDER,
  setGeneratedMapSize,
  setGeneratedMapsEnabled,
  type LevelDef,
  type MapSizeName,
} from "@game/core";

// @ts-expect-error — the level checker is plain JS tooling, deliberately shared
// with the build rather than reimplemented here.
import { validateLevel } from "../../scripts/asset-tools/level-schema.mjs";

import { GEAR_DEFS, WEAPON_DEFS } from "../../src/game/defs/equipment.ts";
import { ABILITY_DEFS } from "../../src/game/defs/abilities.ts";
import { STORY_ITEM_DEFS } from "../../src/game/defs/story.ts";
import { THOUGHT_DEFS } from "../../src/game/defs/thoughts.ts";
import { UNIQUE_DEFS, WORLD_UNIQUES } from "../../src/game/defs/uniques.ts";

const SIZES: MapSizeName[] = ["small", "medium", "large"];
// Enough seeds that a one-in-twenty layout quirk shows up, few enough that the
// suite stays under a few seconds.
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];
// Reachability builds a WHOLE RUN per case to get an honest nav grid, so it walks
// a smaller spread than the pure-def checks — every mission at every size, on
// four seeds, rather than eight.
const WALK_SEEDS = [1, 3, 8, 21];
const MISSIONS = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];

// The flag gates the simulation, so any test that turns it on must put it back —
// vitest shares a module graph across the files in a worker.
afterAll(() => {
  setGeneratedMapsEnabled(false);
  setGeneratedMapSize("medium");
});

const refs = {
  enemies: new Set(Object.keys(ENEMY_DEFS)),
  enemyRoles: new Map(
    Object.entries(ENEMY_DEFS).map(([id, d]) => [id, d.role]),
  ),
  weapons: new Set(Object.keys(WEAPON_DEFS)),
  gear: new Set(Object.keys(GEAR_DEFS)),
  abilities: new Set(Object.keys(ABILITY_DEFS)),
  thoughts: new Set(Object.keys(THOUGHT_DEFS)),
  storyItems: new Set(Object.keys(STORY_ITEM_DEFS)),
  uniques: new Set(Object.keys(UNIQUE_DEFS)),
  worldUniques: new Set(WORLD_UNIQUES.map((u) => u.id)),
  doorKeys: new Set(
    Object.values(STORY_ITEM_DEFS)
      .map((s) => s.unlocks)
      .filter(Boolean),
  ),
};

/** Where the run ENDS: the exit of a `reachExit` mission, or the boss's post. */
function goalOf(def: LevelDef): { x: number; y: number } | null {
  if (def.objective.type === "reachExit") return def.objective.at;
  const boss = def.spawns
    .filter((s) => "at" in s && ENEMY_DEFS[s.enemy]?.role === "boss")
    .at(-1);
  return boss && "at" in boss ? boss.at : null;
}

describe("map blueprints", () => {
  it("ships one for every mission, named after it", () => {
    for (const id of MISSIONS) {
      expect(hasMapBlueprint(id), `no blueprint for "${id}"`).toBe(true);
      // The registry is keyed by level id so `resolveLevelDef` can look a
      // blueprint up by the id a run was started with, with nothing mapping
      // between two namespaces.
      expect(MAP_BLUEPRINTS[id]?.level).toBe(id);
    }
  });

  it("has a file on disk for every compiled blueprint", () => {
    // The compiled catalog is gitignored and regenerated, so a blueprint that
    // exists only in the generated output would survive right up until somebody
    // cleaned their tree.
    const dir = fileURLToPath(new URL("../../content/maps", import.meta.url));
    const stems = new Set(
      readdirSync(dir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => f.slice(0, -".yaml".length)),
    );
    for (const id of Object.keys(MAP_BLUEPRINTS)) expect(stems).toContain(id);
  });
});

describe("generated levels", () => {
  it("pass the same schema a hand-authored level does", () => {
    const errors: string[] = [];
    for (const id of MISSIONS)
      for (const size of SIZES)
        for (const seed of SEEDS) {
          const def = resolveLevelDef(id, seed, size);
          const res = validateLevel(def, refs, "generated") as {
            errors: string[];
          };
          for (const e of res.errors)
            errors.push(`${id}/${size}/${seed}: ${e}`);
        }
    expect(errors.slice(0, 8)).toEqual([]);
  });

  it("leave the objective, every cache and every placed item reachable", () => {
    const unreachable: string[] = [];
    for (const id of MISSIONS)
      for (const size of SIZES) {
        // The grid has to come from a run of THE SAME map. `createGame` resolves
        // its own level through the flag, so the flag has to be told which size
        // to carve — building the grid from a default run and pathing a
        // different def's coordinates through it silently checks nothing.
        setGeneratedMapsEnabled(true);
        setGeneratedMapSize(size);
        for (const seed of WALK_SEEDS) {
          const def = resolveLevelDef(id, seed, size);
          // Built from a real run, so it sees the walls, the scattered rock and
          // the crates exactly as the autopilot does.
          const grid = buildNavGrid(createGame(seed, id, "medium"));
          const targets: [string, { x: number; y: number }][] = [];
          const goal = goalOf(def);
          if (goal) targets.push(["objective", goal]);
          def.chests?.forEach((c, i) => targets.push([`chest ${i}`, c.at]));
          def.placedItems?.forEach((p, i) =>
            targets.push([`item ${i} (${p.kind})`, p.pos]),
          );
          for (const [what, at] of targets)
            if (!findPath(grid, def.playerSpawn, at))
              unreachable.push(`${id}/${size}/${seed}: ${what}`);
        }
      }
    setGeneratedMapsEnabled(false);
    expect(unreachable.slice(0, 8)).toEqual([]);
  }, 120_000);

  it("emit no intended path, so nothing points at the boss", () => {
    // The app's guidance arrow follows `path`; a generated map that shipped one
    // would walk the player straight to the thing they are meant to search for.
    for (const id of MISSIONS)
      for (const seed of SEEDS)
        expect(resolveLevelDef(id, seed, "medium").path).toBeUndefined();
  });

  it("put the boss somewhere new from run to run", () => {
    for (const id of MISSIONS) {
      const spots = new Set(
        SEEDS.map((seed) => {
          const goal = goalOf(resolveLevelDef(id, seed, "large"));
          return goal ? `${goal.x},${goal.y}` : "none";
        }),
      );
      // Not merely "more than one": a generator that alternated between two
      // corners would pass that and still be a commute by the third run.
      expect(spots.size, `"${id}" reuses boss spots`).toBeGreaterThanOrEqual(
        SEEDS.length - 1,
      );
    }
  });

  it("start the hero a long walk from the objective", () => {
    for (const id of MISSIONS)
      for (const seed of SEEDS) {
        const def = resolveLevelDef(id, seed, "large");
        const goal = goalOf(def);
        if (!goal) continue;
        const gap = Math.hypot(
          goal.x - def.playerSpawn.x,
          goal.y - def.playerSpawn.y,
        );
        // Well over a screen (the reference viewport is ~422 world units wide),
        // so the objective is never visible from the landing spot.
        expect(
          gap,
          `${id}/${seed} opens too close to the boss`,
        ).toBeGreaterThan(1200);
      }
  });

  it("carve the same map from the same seed", () => {
    for (const id of MISSIONS) {
      const a = resolveLevelDef(id, 7, "medium");
      const b = resolveLevelDef(id, 7, "medium");
      expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
      // …and a different one from a different seed, or the seed means nothing.
      const c = resolveLevelDef(id, 8, "medium");
      expect(JSON.stringify(c)).not.toEqual(JSON.stringify(a));
    }
  });

  it("grow with the size, in floor and in rooms", () => {
    for (const id of MISSIONS) {
      const [small, medium, large] = SIZES.map((size) =>
        resolveLevelDef(id, 4, size),
      ) as [LevelDef, LevelDef, LevelDef];
      expect(small.width * small.height).toBeLessThan(
        medium.width * medium.height,
      );
      expect(medium.width * medium.height).toBeLessThan(
        large.width * large.height,
      );
      // A bigger rectangle with the same handful of rooms would be a stretched
      // map, not a longer search — the knots are one per carved cell.
      const knots = (def: LevelDef) =>
        (def.spawners ?? []).filter((s) => !s.hellgate).length;
      expect(knots(small)).toBeLessThan(knots(large));
    }
  });

  it("keep every spawner, set piece and chest inside the map", () => {
    for (const id of MISSIONS)
      for (const size of SIZES) {
        const def = resolveLevelDef(id, 11, size);
        const inside = (p: { x: number; y: number }) =>
          p.x >= 0 && p.x <= def.width && p.y >= 0 && p.y <= def.height;
        for (const s of def.spawners ?? []) expect(inside(s.at)).toBe(true);
        for (const s of def.spawns)
          if ("at" in s) expect(inside(s.at)).toBe(true);
        for (const c of def.chests ?? []) expect(inside(c.at)).toBe(true);
        expect(inside(def.playerSpawn)).toBe(true);
      }
  });
});

describe("the generated-maps flag", () => {
  it("is off by default, so a run plays the hand-authored map", () => {
    // `resolveLevelDef` with no size override reads the flag; the engine default
    // must be the shipped campaign, or turning the developer menu on becomes a
    // prerequisite for playing the game as designed.
    const id = LEVEL_ORDER[0] as string;
    expect(resolveLevelDef(id, 3)).toBe(levelDef(id));
  });

  it("swaps in a carved map while it is on, and back off again", () => {
    const id = LEVEL_ORDER[0] as string;
    try {
      setGeneratedMapsEnabled(true);
      expect(resolveLevelDef(id, 3)).not.toBe(levelDef(id));
    } finally {
      setGeneratedMapsEnabled(false);
    }
    expect(resolveLevelDef(id, 3)).toBe(levelDef(id));
  });

  it("rolls a size per seed when asked to, and honours a named one", () => {
    const bp = MAP_BLUEPRINTS[LEVEL_ORDER[0] as string];
    if (!bp) throw new Error("no blueprint to size");
    for (const size of SIZES) expect(resolveMapSize(bp, size, 99)).toBe(size);
    const rolled = new Set(
      SEEDS.map((seed) => resolveMapSize(bp, "random", seed)),
    );
    expect(rolled.size).toBeGreaterThan(1);
  });
});

describe("compass regions", () => {
  it("read a bare direction as a whole band and a pair as one ninth", () => {
    const band = regionRect("north", 900, 900);
    expect(band).toEqual({ x: 0, y: 0, width: 900, height: 300 });
    const ninth = regionRect("center-east", 900, 900);
    expect(ninth).toEqual({ x: 600, y: 300, width: 300, height: 300 });
    expect(regionRect("northeast", 900, 900)).toEqual({
      x: 600,
      y: 0,
      width: 300,
      height: 300,
    });
    // A lone `center` centres both axes; beside a direction it centres only the
    // axis that direction left free.
    expect(regionRect("center", 900, 900)).toEqual({
      x: 300,
      y: 300,
      width: 300,
      height: 300,
    });
  });

  it("spell the diagonals either way round", () => {
    expect(parseRegion("northeast")).toEqual(parseRegion("north-east"));
    expect(parseRegion("south-west")).toEqual(parseRegion("southwest"));
  });

  it("throw on a name nobody can resolve", () => {
    // Silently relocating a boss because its region was misspelled is exactly the
    // kind of bug a generated map hides, so this is a build break by design.
    expect(() => parseRegion("nortlh")).toThrow();
    expect(() => parseRegion("")).toThrow();
    expect(() => parseRegion("north-south")).toThrow();
  });
});
