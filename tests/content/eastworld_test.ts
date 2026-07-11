// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 5 — EASTWORLD: the rift's far side, a knockoff wild-west theme park
// run on ZAI robotics. The town is TIGHT (house-sized obstacles + storefront
// wall rows), the CONTROL CENTER compound is locked behind SEAGULL's pass,
// ELON MOSQUE finally dies (dropping the TRASH tier's debut), PUTAIN drops
// brand-watch valuables that fund the merchant's rolled PUTAIN stall, and
// the finale is THE ZAI SUPERCORE — shielded by three GROK controllers who
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

  it("builds the tight town: house-sized obstacles and storefront rows", () => {
    const houses = EASTWORLD.obstacles.find((o) => o.kind === "house");
    expect(houses).toBeDefined();
    // Building-sized footprints — the largest obstacles in the game.
    expect(
      Math.max(...houses!.rockSizes!.map(([w]) => w)),
    ).toBeGreaterThanOrEqual(4);
    expect(houses!.jumpable).toBe(false);
    const storefronts = (EASTWORLD.walls ?? []).filter(
      (w) => w.kind === "storefront",
    );
    expect(storefronts.length).toBeGreaterThanOrEqual(6);
  });

  it("locks the control center behind SEAGULL's all-access pass", () => {
    expect(EASTWORLD.doors?.map((d) => d.id)).toEqual(["control"]);
    expect(STORY_ITEM_DEFS.keycard_eastworld?.unlocks).toBe("control");
    const seagull = enemyDef("steven_seagull");
    expect(seagull.loot?.storyItems).toContain("keycard_eastworld");
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

describe("the celebrity staff", () => {
  it("STEVEN SEAGULL moves slow and redirects half your swings", () => {
    const def = enemyDef("steven_seagull");
    expect(def.role).toBe("elite");
    expect(def.speed).toBeLessThanOrEqual(10);
    expect(def.dodgeChance).toBeGreaterThanOrEqual(0.25);
    expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
  });

  it("VLADIMIR PUTAIN drops three unique-tier brand watches and the map", () => {
    const def = enemyDef("vladimir_putain");
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
    // His last words face the war he retreated from.
    expect(def.lastWords?.join(" ")).toContain("UKRAINE");
  });

  it("GERALD DEPARDIEU is enormous, glacial, and cannot dodge", () => {
    const def = enemyDef("gerald_depardieu");
    expect(def.radius).toBeGreaterThanOrEqual(15);
    expect(def.speed).toBeLessThanOrEqual(8);
    expect(def.dodgeChance).toBe(0);
    expect(def.hp).toBeGreaterThan(enemyDef("vladimir_putain").hp);
  });

  it("EDWARD SNOW is the game's first ranged elite and drops the archive", () => {
    const def = enemyDef("edward_snow");
    expect(def.role).toBe("elite");
    // The leaker fights from cover, like the GROKs his archive trained.
    expect(def.ranged?.takesCover).toBe(true);
    expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
    // The plot payload: the SUPERCORE's training set, plus his insurance.
    expect(def.loot?.storyItems).toContain("snow_archive");
    expect(def.loot?.items).toContain("snows_dead_mans_switch");
    expect(STORY_ITEM_DEFS.snow_archive).toBeDefined();
  });
});

describe("ELON MOSQUE's last stand — the TRASH estate", () => {
  it("finally DIES here: no flee on the Eastworld def", () => {
    const def = enemyDef("elon_mosque_eastworld");
    expect(def.role).toBe("boss");
    expect(def.flees).toBeUndefined();
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
  });

  it("drops nothing but three zero-damage TRASH weapons", () => {
    const def = enemyDef("elon_mosque_eastworld");
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

describe("THE ZAI SUPERCORE and its controllers", () => {
  it("is shielded by exactly the three GROK controllers", () => {
    const def = enemyDef("zai_supercore");
    expect(def.role).toBe("boss");
    expect(def.shieldedBy?.sort()).toEqual([
      "grok_alpha",
      "grok_beta",
      "grok_gamma",
    ]);
    // A mainframe does not walk.
    expect(def.speed).toBe(0);
    expect(def.ranged).toBeDefined();
  });

  it("the controllers are cover-taking shooters that must die for the objective", () => {
    for (const id of ["grok_alpha", "grok_beta", "grok_gamma"]) {
      const def = enemyDef(id);
      // Boss role: the killBoss objective needs all three off the board.
      expect(def.role).toBe("boss");
      expect(def.ranged?.takesCover).toBe(true);
      expect(def.ranged?.range).toBeGreaterThan(150);
      expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
      expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("the shield holds in play: the SUPERCORE can't be hurt until the GROKs fall", () => {
    const state = startGame(SEED, "eastworld");
    const boss = state.enemies.find((e) => e.defId === "zai_supercore")!;
    expect(boss).toBeDefined();
    boss.powerScaled = true;
    const before = boss.hp;
    state.rng = () => 0.99;
    hitEnemy(state, boss, 500);
    expect(boss.hp).toBe(before);
    expect(state.events.some((e) => e.type === "enemyShielded")).toBe(true);
    // Drop the controllers: the shield falls.
    state.enemies = state.enemies.filter((e) => !e.defId.startsWith("grok_"));
    hitEnemy(state, boss, 500);
    expect(boss.hp).toBeLessThan(before);
  });
});

describe("the barkeep's PUTAIN stall", () => {
  it("lists the estate as rolled stall uniques, all real", () => {
    const ids = EASTWORLD.merchant?.stockUniques ?? [];
    expect(ids.sort()).toEqual([
      "honorary_black_belt",
      "putains_tracksuit",
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
