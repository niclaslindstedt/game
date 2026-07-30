// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MOD'S BLUEPRINT, all the way through — from the YAML in the mod folder to a
// carved run.
//
// `mod_build_test.ts` proves the compiler accepts and refuses the right things;
// this proves the thing it emits is the thing the engine takes. The seam is
// `registerDefs({ blueprints })`, and it is the same one the shipped catalogs go
// through, so what is checked here is the whole feature: a mod's venue is carved
// fresh per run instead of always playing its hand-drawn layout.
//
// The four properties below are the ones a mod author would notice breaking, in
// the order they would notice them: the blueprint is FOUND, the carve is the
// mod's OWN mission (its name, its objective, its monsters), the boss MOVES with
// the seed, and the run is finishable — checked with the engine's own
// pathfinder, from a real `createGame`, so the grid and the def come from the
// same carve.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  ABILITY_DEFS,
  buildNavGrid,
  COMPANION_DEFS,
  createGame,
  CUTSCENE_DEFS,
  ENEMY_DEFS,
  findPath,
  GEAR_DEFS,
  hasMapBlueprint,
  LEVELS,
  MAP_BLUEPRINTS,
  registerDefs,
  setGeneratedMapSize,
  setGeneratedMapsEnabled,
  STORY_ITEM_DEFS,
  THOUGHT_DEFS,
  UNIQUE_DEFS,
  WEAPON_DEFS,
  type LevelDef,
} from "@game/core";

import { buildMod } from "../../mod/tools/build.mjs";
import { readCatalog } from "../../mod/tools/catalog-read.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const catalog = readCatalog(path.join(repoRoot, "mod", "catalog.json"));
const EXAMPLE = path.join(repoRoot, "mod", "examples", "greenhouse");

const { bundle, errors } = buildMod(EXAMPLE, catalog);
if (errors.length > 0) throw new Error(errors.join("\n"));

const SHIPPED = {
  levels: LEVELS,
  blueprints: MAP_BLUEPRINTS,
  enemies: ENEMY_DEFS,
  weapons: WEAPON_DEFS,
  gear: GEAR_DEFS,
  uniques: UNIQUE_DEFS,
  abilities: ABILITY_DEFS,
  companions: COMPANION_DEFS,
  cutscenes: CUTSCENE_DEFS,
  thoughts: THOUGHT_DEFS,
  storyItems: STORY_ITEM_DEFS,
};

/** Apply the compiled mod exactly as `pwa/src/game/mods.ts` does: merge onto the
 * SHIPPED catalogs, never onto whatever the last apply left behind. */
function applyExample(): void {
  const merge = <T>(base: Record<string, T>, add: object) => ({
    ...base,
    ...(add as Record<string, T>),
  });
  registerDefs({
    ...SHIPPED,
    levels: merge(
      LEVELS,
      Object.fromEntries(
        (bundle!.levels as LevelDef[]).map((def) => [def.id, def]),
      ),
    ),
    blueprints: merge(MAP_BLUEPRINTS, bundle!.blueprints),
    enemies: merge(ENEMY_DEFS, bundle!.enemies),
    weapons: merge(WEAPON_DEFS, bundle!.weapons),
    gear: merge(GEAR_DEFS, bundle!.gear),
    uniques: merge(UNIQUE_DEFS, bundle!.uniques),
    abilities: merge(ABILITY_DEFS, bundle!.powerups),
    companions: merge(COMPANION_DEFS, bundle!.companions),
    cutscenes: merge(CUTSCENE_DEFS, bundle!.cutscenes),
    thoughts: merge(THOUGHT_DEFS, bundle!.thoughts),
    storyItems: merge(STORY_ITEM_DEFS, bundle!.storyItems),
  });
}

/** The carve a run of the mod's venue was actually built on. */
function carve(seed: number): LevelDef {
  const state = createGame(seed, "greenhouse", "medium");
  const def = state.carvedLevel;
  expect(def, "the run was not carved from the mod's blueprint").toBeTruthy();
  return def as LevelDef;
}

/** Where the carve put the gardener. A pinned set piece carries an `at`; the
 * banded scatter spawns in the same list do not. */
function bossAt(def: LevelDef): { x: number; y: number } {
  const pinned = (def.spawns ?? []).find(
    (s): s is typeof s & { at: { x: number; y: number } } =>
      "at" in s && s.enemy === "greenhouse_gardener",
  );
  expect(pinned, "the blueprint's boss was not placed").toBeTruthy();
  return pinned!.at;
}

afterAll(() => {
  registerDefs(SHIPPED);
  setGeneratedMapsEnabled(false);
  setGeneratedMapSize("random");
});

describe("a mod's map blueprint", () => {
  it("is not there until the mod is applied", () => {
    expect(hasMapBlueprint("greenhouse")).toBe(false);
    applyExample();
    expect(hasMapBlueprint("greenhouse")).toBe(true);
    // And it goes away again with the mod — a mod applies to a RUN, never to
    // the install, so the menus and the next run are the shipped game.
    registerDefs(SHIPPED);
    expect(hasMapBlueprint("greenhouse")).toBe(false);
  });

  it("carves the mod's own mission, and inherits everything it is not", () => {
    applyExample();
    setGeneratedMapsEnabled(true);
    setGeneratedMapSize("medium");
    const def = carve(7);
    // INHERITED from the mod's level: a generated greenhouse is still the
    // greenhouse, because the blueprint is a recipe for geometry and nothing
    // else.
    expect(def.name).toBe("THE GREENHOUSE");
    expect(def.objective.type).toBe("clearAll");
    expect(def.music).toBe("greenhouse_hymn");
    // CARVED: the map is the blueprint's size, not the level's 1800×900, and it
    // emits no `path` — the guidance arrow is silent, which is the whole point.
    expect(def.width).toBe(2800);
    expect(def.height).toBe(1800);
    expect(def.path).toBeUndefined();
    // The mod's own monsters stand in it.
    const breeds = new Set(
      (def.spawners ?? []).flatMap((s) => s.members.map((m) => m.enemy)),
    );
    expect(breeds.has("greenhouse_creeper")).toBe(true);
  });

  it("hides its boss somewhere new every seed", () => {
    applyExample();
    setGeneratedMapsEnabled(true);
    setGeneratedMapSize("medium");
    const homes = new Set<string>();
    for (const seed of [1, 7, 42, 99, 1234]) {
      const at = bossAt(carve(seed));
      homes.add(`${at.x},${at.y}`);
    }
    // A search that ends in the same room every run is a commute.
    expect(homes.size).toBeGreaterThan(1);
  });

  it("carves a map the boss can actually be walked to", () => {
    applyExample();
    setGeneratedMapsEnabled(true);
    for (const size of ["small", "medium", "large"] as const) {
      setGeneratedMapSize(size);
      for (const seed of [3, 11, 77]) {
        // The grid comes from the SAME run as the def — building it from a
        // default run and pathing another carve's coordinates through it is a
        // check that passes and means nothing.
        const state = createGame(seed, "greenhouse", "medium");
        const def = state.carvedLevel as LevelDef;
        const route = findPath(
          buildNavGrid(state),
          def.playerSpawn,
          bossAt(def),
        );
        expect(
          route,
          `${size}/${seed}: the gardener is walled off`,
        ).toBeTruthy();
      }
    }
  });
});
