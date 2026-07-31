// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 5 — EASTWORLD: the rift's far side, a knockoff wild-west theme park
// run on TRUST ME BRO robotics. The town is TIGHT (house-sized obstacles + storefront
// wall rows), the CONTROL CENTER compound is locked behind THE STUNT DOUBLE's pass,
// THE FOUNDER finally dies (dropping the TRASH tier's debut), THE STRONGMAN drops
// brand-watch valuables that fund the merchant's rolled THE STRONGMAN stall, and
// the finale is THE BRO SUPERCORE — shielded by three TRUST ME BRO controllers who
// shoot from behind the compound's rocks. Beating it plays the campaign's
// outro epilogue under a victory quake.

import { describe, expect, it } from "vitest";

import {
  enemyDef,
  GEAR_DEFS,
  hitEnemy,
  LEVEL_ORDER,
  LEVELS,
  STORY_ITEM_DEFS,
  THOUGHT_DEFS,
  UNIQUE_DEFS,
  weaponDef,
} from "@game/core";
import { SEED, startGame } from "../helpers.ts";

const EASTWORLD = LEVELS.eastworld!;

describe("EASTWORLD level def", () => {
  it("is story level 5, after the rift", () => {
    expect(EASTWORLD.index).toBe(5);
    expect(LEVEL_ORDER[4]).toBe("eastworld");
    const state = startGame(SEED, "eastworld");
    expect(state.level.biome).toBe("eastworld");
    expect(state.level.foes).toBe("HOSTS");
  });

  it("builds Main Street from two rows of solid buildings framing a tight lane", () => {
    const buildings = EASTWORLD.buildings ?? [];
    // A whole town: many hand-placed buildings, not a handful of scattered rocks.
    expect(buildings.length).toBeGreaterThanOrEqual(24);
    // Solid, building-sized footprints — the widest is a livery barn / big house.
    expect(Math.max(...buildings.map((b) => b.w))).toBeGreaterThanOrEqual(60);
    expect(buildings.every((b) => !b.jumpable)).toBe(true);
    // Two rows FRAME a central lane: buildings north of it and buildings south
    // of it, none sitting ON the walked street (y ~745..855).
    const laneRow = buildings.filter(
      (b) => b.pos.y > 745 && b.pos.y < 855 && b.pos.x < 2400,
    );
    expect(laneRow).toHaveLength(0);
    const north = buildings.filter((b) => b.pos.y <= 745 && b.pos.x < 2400);
    const south = buildings.filter((b) => b.pos.y >= 855 && b.pos.x < 2400);
    expect(north.length).toBeGreaterThanOrEqual(8);
    expect(south.length).toBeGreaterThanOrEqual(8);
    // The named landmarks that make it a frontier town, not just houses.
    const sprites = new Set(buildings.map((b) => b.sprite));
    for (const s of ["saloon", "church", "bank", "hotel", "general_store"])
      expect(sprites.has(s)).toBe(true);
  });

  it("compiles the buildings into solid box-collider obstacles", () => {
    const state = startGame(SEED, "eastworld");
    const built = state.obstacles.filter((o) => o.kind === "building");
    // Every authored building lands in the field with a rectangular footprint.
    expect(built.length).toBe((EASTWORLD.buildings ?? []).length);
    expect(built.every((o) => o.half !== undefined && !o.jumpable)).toBe(true);
  });

  it("locks the control center behind THE STUNT DOUBLE's all-access pass", () => {
    expect(EASTWORLD.doors?.map((d) => d.id)).toEqual(["control"]);
    expect(STORY_ITEM_DEFS.keycard_eastworld?.unlocks).toBe("control");
    const stuntDouble = enemyDef("the_stunt_double");
    expect(stuntDouble.loot?.storyItems).toContain("keycard_eastworld");
  });

  it("plays the arrival read on sight, then the hosts read on the first kill", () => {
    expect(EASTWORLD.firstSightThoughts?.[0]?.thought).toBe(
      "eastworld_arrival",
    );
    const kill = EASTWORLD.firstKillThoughts?.[0];
    expect(kill?.thought).toBe("eastworld_hosts");
    expect(kill?.after).toBe("eastworld_arrival");
    expect(THOUGHT_DEFS.eastworld_arrival).toBeDefined();
    expect(THOUGHT_DEFS.eastworld_hosts).toBeDefined();
  });

  it("ships the campaign epilogue: outro pages on the level def", () => {
    expect(EASTWORLD.outro?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

describe("the park's resident staff", () => {
  it("THE STUNT DOUBLE moves slow and redirects half your swings", () => {
    const def = enemyDef("the_stunt_double");
    expect(def.role).toBe("elite");
    expect(def.speed).toBeLessThanOrEqual(10);
    expect(def.dodgeChance).toBeGreaterThanOrEqual(0.25);
    expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
  });

  it("THE STRONGMAN drops three unique-tier brand watches and the map", () => {
    const def = enemyDef("the_strongman");
    const items = (def.loot?.items ?? []).map((e) =>
      typeof e === "string" ? { defId: e, tier: undefined } : e,
    );
    const watches = items.filter((i) =>
      ["kolex_daytonne", "putek_philippe", "vacheron_kremlinton"].includes(
        i.defId,
      ),
    );
    expect(watches).toHaveLength(3);
    for (const watch of watches) expect(watch.tier).toBe("unique");
    expect(def.loot?.storyItems).toContain("annexation_map");
    // His last words face the only game he ever rigged and still lost.
    expect(def.lastWords?.join(" ")).toContain("LET ME WIN");
  });

  it("THE LEADING MAN is enormous, glacial, and cannot dodge", () => {
    const def = enemyDef("the_leading_man");
    expect(def.radius).toBeGreaterThanOrEqual(15);
    expect(def.speed).toBeLessThanOrEqual(8);
    expect(def.dodgeChance).toBe(0);
    expect(def.hp).toBeGreaterThan(enemyDef("the_strongman").hp);
  });

  it("THE LEAK is the game's first ranged elite and drops the archive", () => {
    const def = enemyDef("the_leak");
    expect(def.role).toBe("elite");
    // The leaker fights from cover, like the BROs his archive trained.
    expect(def.ranged?.takesCover).toBe(true);
    expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
    // The plot payload: the SUPERCORE's training set, plus his insurance.
    expect(def.loot?.storyItems).toContain("snow_archive");
    expect(def.loot?.items).toContain("leaks_dead_mans_switch");
    expect(STORY_ITEM_DEFS.snow_archive).toBeDefined();
  });
});

describe("THE FOUNDER's last stand — the TRASH estate", () => {
  it("finally DIES here: no flee on the Eastworld def", () => {
    const def = enemyDef("the_founder_eastworld");
    expect(def.role).toBe("boss");
    expect(def.flees).toBeUndefined();
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
  });

  it("drops nothing but three zero-damage TRASH weapons", () => {
    const def = enemyDef("the_founder_eastworld");
    const items = (def.loot?.items ?? []).map((e) =>
      typeof e === "string" ? { defId: e, tier: undefined } : e,
    );
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.tier).toBe("trash");
      const weapon = weaponDef(item.defId);
      expect(weapon.damage).toBe(0);
    }
    // Horrible crap loot means NOTHING else: no tier pledges, no consumables.
    expect(def.loot?.tierDrops).toBeUndefined();
    expect(def.loot?.weapons).toBe(0);
    expect(def.loot?.gear).toBe(0);
    expect(def.loot?.medkits).toBe(0);
  });
});

describe("THE BRO SUPERCORE and its controllers", () => {
  it("is shielded by exactly the three TRUST ME BRO controllers", () => {
    const def = enemyDef("bro_supercore");
    expect(def.role).toBe("boss");
    expect(def.shieldedBy?.sort()).toEqual([
      "bro_alpha",
      "bro_beta",
      "bro_gamma",
    ]);
    // A mainframe does not walk.
    expect(def.speed).toBe(0);
    expect(def.ranged).toBeDefined();
  });

  it("the controllers are cover-taking shooters that must die for the objective", () => {
    for (const id of ["bro_alpha", "bro_beta", "bro_gamma"]) {
      const def = enemyDef(id);
      // Boss role: the killBoss objective needs all three off the board.
      expect(def.role).toBe("boss");
      expect(def.ranged?.takesCover).toBe(true);
      expect(def.ranged?.range).toBeGreaterThan(150);
      expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
      expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("the shield holds in play: the SUPERCORE can't be hurt until the BROs fall", () => {
    const state = startGame(SEED, "eastworld");
    const boss = state.enemies.find((e) => e.defId === "bro_supercore")!;
    expect(boss).toBeDefined();
    boss.powerScaled = true;
    const before = boss.hp;
    state.rng = () => 0.99;
    hitEnemy(state, boss, 500);
    expect(boss.hp).toBe(before);
    expect(state.events.some((e) => e.type === "enemyShielded")).toBe(true);
    // Drop the controllers: the shield falls. Matched by name rather than by a
    // "bro_" prefix, which the SUPERCORE itself now shares.
    const controllers = ["bro_alpha", "bro_beta", "bro_gamma"];
    state.enemies = state.enemies.filter((e) => !controllers.includes(e.defId));
    hitEnemy(state, boss, 500);
    expect(boss.hp).toBeLessThan(before);
  });
});

describe("the barkeep's THE STRONGMAN stall", () => {
  it("lists the estate as rolled stall uniques, all real", () => {
    const ids = EASTWORLD.merchant?.stockUniques ?? [];
    expect(ids.sort()).toEqual([
      "honorary_black_belt",
      "strongmans_tracksuit",
      "the_kremlin_ushanka",
    ]);
    for (const id of ids) expect(UNIQUE_DEFS[id]).toBeDefined();
  });

  it("prices the estate against the watches: precious valuables with zero base stats", () => {
    for (const id of [
      "kolex_daytonne",
      "putek_philippe",
      "vacheron_kremlinton",
    ]) {
      const def = GEAR_DEFS[id]!;
      expect(def.material).toBe("precious");
      expect(def.bonuses).toEqual({});
    }
  });
});
