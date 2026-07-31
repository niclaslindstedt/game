// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 2 — THE MOON: the venue a carve of its blueprint delivers — the ridges
// between its basins, the caches at the dead ends with their pinned keepers, and
// the flag THE FLAGBEARER haunts. The generic catalog integrity rules (pools resolve,
// wall chains leave no slip-through gaps) live in goodco_test.ts and run over
// every level; the generator's own invariants live in generated_maps_test.ts.
//
// A mission is not a map any more, so every geometry assertion here reads a
// CARVE — `resolveLevelDef` at a fixed seed, which is exactly what a run of the
// moon builds — rather than the mission def, which has no floor on it at all.

import { describe, expect, it } from "vitest";

import {
  createGame,
  enemyDef,
  LEVELS,
  MAP_BLUEPRINTS,
  resolveLevelDef,
} from "@game/core";
import { SEED, startGame } from "../helpers.ts";

const MOON = LEVELS.moon!;
const BLUEPRINT = MAP_BLUEPRINTS.moon!;
/** One representative far side. The carve is deterministic per seed, so this is
 * a real map rather than a stand-in — see generated_maps_test.ts for the spread
 * of seeds and sizes every rule below is also held to. */
const CARVED = resolveLevelDef("moon", SEED, "medium");
import { distance as dist } from "@game/lib/vec.ts";

describe("THE MOON level def", () => {
  it("is campaign level 2 in the moon biome", () => {
    expect(MOON.index).toBe(2);
    const state = createGame(SEED, "moon");
    expect(state.level.id).toBe("moon");
    expect(state.level.biome).toBe("moon");
  });

  it("fields THE FLAGBEARER at the flag as the boss", () => {
    const state = startGame(SEED, "moon");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    expect(boss.defId).toBe("the_flagbearer");
    // The flag is planted wherever the boss turned out to be (`at: goal` on the
    // blueprint's landmark), so the two travel together on every carve.
    const flag = state.landmarks.find((l) => l.kind === "flag")!;
    expect(dist(boss.pos, flag.pos)).toBeLessThan(400);
  });

  it("breaks the plain into basins with rubble ridges", () => {
    // The moon is fenced with `boulder` chains rather than panel: the blueprint
    // says the districts are cut from a ridge, and a ridge is rubble — a POOL of
    // stones, wandering off true, so a spine reads as scree rather than as a
    // manufactured lattice.
    const ridge = BLUEPRINT.objects.find((o) => o.id === "ridge")!;
    expect(ridge.type).toBe("wall");
    expect((ridge.sprites ?? []).length).toBeGreaterThan(5);
    expect(ridge.wander ?? 0).toBeGreaterThan(0);
    const walls = CARVED.walls ?? [];
    expect(walls.length).toBeGreaterThan(3);
    for (const wall of walls) expect(wall.kind).toBe("boulder");
  });

  it("emits no intended path — the flag has to be found", () => {
    expect(CARVED.path).toBeUndefined();
  });
});

describe("the off-path detour caches", () => {
  it("puts a cache at the dead ends, each a breakable reward container", () => {
    expect((CARVED.chests ?? []).length).toBeGreaterThan(1);
    const state = startGame(SEED, "moon");
    const caches = state.obstacles.filter((o) => o.chest);
    expect(caches.length).toBe((CARVED.chests ?? []).length);
    for (const cache of caches) {
      expect(cache.breakable).toBe(true);
      expect(cache.hp ?? 0).toBeGreaterThan(0);
    }
  });

  it("marks each cache a quiet cul-de-sac (no ambient horde)", () => {
    const labels = (CARVED.quietZones ?? []).map((z) => z.label);
    expect(labels).toContain("CACHE");
    // …and the landing is quiet too: somewhere to read the map from rather than
    // somewhere to be ambushed in.
    expect(labels).toContain("LANDING");
  });

  it("pins a lone guardian beside each cache", () => {
    // The LOST COSMONAUT (rare) and THE THIRTEENTH MAN (unique) are the
    // blueprint's KEEPERS — pinned, not rolled — cycled across whichever
    // cul-de-sacs the carve grew.
    const keepers = BLUEPRINT.guardians.map((g) => g.enemy);
    expect(keepers).toEqual(["lost_cosmonaut", "the_thirteenth_man"]);
    for (const [guardId, rarity] of [
      ["lost_cosmonaut", "rare"],
      ["the_thirteenth_man", "unique"],
    ] as const) {
      expect(enemyDef(guardId).rarity).toBe(rarity);
      const guard = CARVED.spawns.find(
        (s) => "at" in s && s.enemy === guardId,
      ) as { enemy: string; at: { x: number; y: number } } | undefined;
      expect(guard).toBeDefined();
      const nearestChest = (CARVED.chests ?? [])
        .slice()
        .sort((a, b) => dist(a.at, guard!.at) - dist(b.at, guard!.at))[0]!;
      expect(dist(guard!.at, nearestChest.at)).toBeLessThan(600);
    }
  });

  it("gives the trader a safe pitch to keep his stall in", () => {
    const post = (CARVED.safeZones ?? []).find(
      (z) => z.label === "TRADING POST",
    );
    expect(post).toBeDefined();
    expect(CARVED.merchantSpawns?.length).toBe(1);
  });
});
