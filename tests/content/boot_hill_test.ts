// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 5 — BOOT HILL: the rift's far side, a knockoff wild-west theme park
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
  MAP_BLUEPRINTS,
  runLevelDef,
  STORY_ITEM_DEFS,
  THOUGHT_DEFS,
  UNIQUE_DEFS,
  weaponDef,
} from "@game/core";
import { SEED, startGame } from "../helpers.ts";

const BOOT_HILL = LEVELS.boot_hill!;
const BLUEPRINT = MAP_BLUEPRINTS.boot_hill!;

describe("BOOT HILL level def", () => {
  it("is story level 5, after the rift", () => {
    expect(BOOT_HILL.index).toBe(5);
    expect(LEVEL_ORDER[4]).toBe("boot_hill");
    const state = startGame(SEED, "boot_hill");
    expect(state.level.biome).toBe("boot_hill");
    expect(state.level.foes).toBe("HANDS");
  });

  it("builds Main Street from two rows of frontages framing a lane", () => {
    // What makes a town read as a town is ALIGNMENT, not density: the blueprint
    // gives its town district a `blocks` street width, and the carve walks the
    // building palette down both sides of the cell's long axis instead of
    // scattering it (see `streetBlock` in mapgen/place.ts).
    const town = BLUEPRINT.areas.find((a) => a.blocks !== undefined)!;
    expect(town.blocks).toBeGreaterThan(0);
    // …and exactly one town per map: a `once` district is withdrawn from the
    // palette the first time it wins a seed, so the map does not grow suburbs.
    expect(town.once).toBe(true);

    const frontages = BLUEPRINT.objects.filter((o) => o.type === "building");
    // A whole town's worth of frontages to draw from, not a handful.
    expect(frontages.length).toBeGreaterThanOrEqual(15);
    // The named landmarks that make it a frontier town, not just houses.
    const sprites = new Set(frontages.map((o) => o.sprite ?? o.id));
    for (const s of ["saloon", "church", "bank", "hotel", "general_store"])
      expect(sprites.has(s)).toBe(true);
  });

  it("compiles the buildings into solid box-collider obstacles", () => {
    const state = startGame(SEED, "boot_hill");
    const built = state.obstacles.filter((o) => o.kind === "building");
    // Every building the carve laid down lands in the field with a rectangular
    // footprint, and none of them is hoppable.
    expect(built.length).toBe((runLevelDef(state).buildings ?? []).length);
    expect(built.length).toBeGreaterThan(0);
    expect(built.every((o) => o.half !== undefined && !o.jumpable)).toBe(true);
  });

  it("keeps the control center's all-access pass on THE STUNT DOUBLE", () => {
    expect(STORY_ITEM_DEFS.keycard_boot_hill?.unlocks).toBe("control");
    const stuntDouble = enemyDef("the_stunt_double");
    expect(stuntDouble.loot?.storyItems).toContain("keycard_boot_hill");
    // The compound itself is a district of the blueprint's own, sealed behind
    // its fence with one way in.
    const compound = BLUEPRINT.areas.find((a) => a.id === "control")!;
    expect(compound.enclosure).toBe("hard");
  });

  it("plays the arrival read on sight, then the hands read on the first kill", () => {
    expect(BOOT_HILL.firstSightThoughts?.[0]?.thought).toBe(
      "boot_hill_arrival",
    );
    const kill = BOOT_HILL.firstKillThoughts?.[0];
    expect(kill?.thought).toBe("boot_hill_hands");
    expect(kill?.after).toBe("boot_hill_arrival");
    expect(THOUGHT_DEFS.boot_hill_arrival).toBeDefined();
    expect(THOUGHT_DEFS.boot_hill_hands).toBeDefined();
  });

  it("ships the campaign epilogue: outro pages on the level def", () => {
    expect(BOOT_HILL.outro?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("expands the deck's pack markers into camps of individual posts", () => {
    // The deck authors a CAMP as one `pack:` marker; the carve expands it into
    // N posts (ids `m<i>_<k>`) that share one rolled breed and stand scattered
    // around the anchor — each with its OWN respawn clock, which is the whole
    // point: a half-cleared camp refills member by member.
    const state = startGame(SEED, "boot_hill");
    const camps = new Map<string, typeof state.mobSpawns>();
    for (const post of state.mobSpawns) {
      const camp = /^(m\d+)_\d+$/.exec(post.id)?.[1];
      if (!camp) continue;
      camps.set(camp, [...(camps.get(camp) ?? []), post]);
    }
    // Every deal fields the park gate's cowbot camp; most field more.
    expect(camps.size).toBeGreaterThanOrEqual(1);
    for (const members of camps.values()) {
      expect(members.length).toBeGreaterThanOrEqual(2);
      // One breed to a camp, rolled once for the whole marker.
      expect(new Set(members.map((m) => m.enemy)).size).toBe(1);
      // Scattered, not stacked: no two members on the same spot.
      const spots = new Set(members.map((m) => `${m.at.x},${m.at.y}`));
      expect(spots.size).toBe(members.length);
    }
    // The park gate's camp is pinned on the breed the arrival read names.
    const cowbots = state.mobSpawns.filter((m) => m.enemy === "cowbot");
    expect(cowbots.length).toBeGreaterThanOrEqual(3);
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
      ["the_chronograph", "perpetual_calendar", "minute_repeater"].includes(
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

  it("THE LEAK is the game's first ranged elite and drops the corpus", () => {
    const def = enemyDef("the_leak");
    expect(def.role).toBe("elite");
    // The leaker fights from cover, like the BROs his corpus trained.
    expect(def.ranged?.takesCover).toBe(true);
    expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
    // The plot payload: the SUPERCORE's training set, plus his insurance.
    expect(def.loot?.storyItems).toContain("corpus_drive");
    expect(def.loot?.items).toContain("leaks_dead_mans_switch");
    expect(STORY_ITEM_DEFS.corpus_drive).toBeDefined();
  });
});

describe("THE FOUNDER's last stand — the TRASH estate", () => {
  it("finally DIES here: no flee on the Boot Hill def", () => {
    const def = enemyDef("the_founder_boot_hill");
    expect(def.role).toBe("boss");
    expect(def.flees).toBeUndefined();
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
  });

  it("drops nothing but three zero-damage TRASH weapons", () => {
    const def = enemyDef("the_founder_boot_hill");
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
    const state = startGame(SEED, "boot_hill");
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
    const ids = BOOT_HILL.merchant?.stockUniques ?? [];
    expect(ids.sort()).toEqual([
      "courtesy_star",
      "strongmans_tracksuit",
      "the_incumbents_ushanka",
    ]);
    for (const id of ids) expect(UNIQUE_DEFS[id]).toBeDefined();
  });

  it("prices the estate against the watches: precious valuables with zero base stats", () => {
    for (const id of [
      "the_chronograph",
      "perpetual_calendar",
      "minute_repeater",
    ]) {
      const def = GEAR_DEFS[id]!;
      expect(def.material).toBe("precious");
      expect(def.bonuses).toEqual({});
    }
  });
});
