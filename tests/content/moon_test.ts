// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 2 — THE MOON: the ridge-and-basin layout, the two off-path detour
// caches with their pinned guardians, and the loot table. The generic catalog
// integrity rules (pools resolve, wall chains leave no slip-through gaps) live
// in spacez_test.ts and run over every level.

import { describe, expect, it } from "vitest";

import { createGame, enemyDef, LEVELS } from "@game/core";
import { SEED, startGame } from "../helpers.ts";

const MOON = LEVELS.moon!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("THE MOON level def", () => {
  it("is campaign level 2 in the moon biome", () => {
    expect(MOON.index).toBe(2);
    const state = createGame(SEED, "moon");
    expect(state.level.id).toBe("moon");
    expect(state.level.biome).toBe("moon");
  });

  it("fields ARMSTRONG at the flag as the boss", () => {
    const state = startGame(SEED, "moon");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    expect(boss.defId).toBe("armstrong");
    const flag = state.landmarks.find((l) => l.kind === "flag")!;
    expect(dist(boss.pos, flag.pos)).toBeLessThan(200);
  });

  it("breaks the plain into basins with three offset ridge gaps", () => {
    // Each ridge is a vertical boulder spine at its x with a single pass-gap; the
    // gaps alternate low / high / low so the route weaves a full serpentine
    // across the four basins.
    const ridgeX = [680, 1180, 1680];
    for (const x of ridgeX) {
      const segs = (MOON.walls ?? []).filter(
        (w) => w.from.x === x && w.to.x === x && w.from.y !== w.to.y,
      );
      expect(segs.length).toBeGreaterThanOrEqual(1);
    }
    // The authored path threads from the lander toward the flag.
    expect(MOON.path?.length ?? 0).toBeGreaterThan(3);
  });
});

describe("the two off-path detour caches", () => {
  it("places exactly two chests, both breakable reward containers", () => {
    expect(MOON.chests?.length).toBe(2);
    const state = startGame(SEED, "moon");
    const caches = state.obstacles.filter((o) => o.chest);
    expect(caches).toHaveLength(2);
    for (const cache of caches) {
      expect(cache.breakable).toBe(true);
      expect(cache.hp ?? 0).toBeGreaterThan(0);
    }
  });

  it("marks each detour a quiet cul-de-sac (no ambient horde)", () => {
    const labels = (MOON.quietZones ?? []).map((z) => z.label);
    expect(labels).toContain("CRASHED LANDER");
    expect(labels).toContain("THE THIRTEENTH GRAVE");
  });

  it("pins a lone guardian beside each detour chest", () => {
    // The LOST COSMONAUT (rare) and THE THIRTEENTH MAN (unique) are PINNED —
    // not just random rares — each within its pocket, next to the chest it holds.
    for (const [guardId, rarity] of [
      ["lost_cosmonaut", "rare"],
      ["the_thirteenth_man", "unique"],
    ] as const) {
      const guard = MOON.spawns.find(
        (s) => "at" in s && s.enemy === guardId,
      ) as { enemy: string; at: { x: number; y: number } } | undefined;
      expect(guard).toBeDefined();
      expect(enemyDef(guardId).rarity).toBe(rarity);
      const nearestChest = (MOON.chests ?? [])
        .slice()
        .sort((a, b) => dist(a.at, guard!.at) - dist(b.at, guard!.at))[0]!;
      expect(dist(guard!.at, nearestChest.at)).toBeLessThan(160);
    }
  });

  it("gives the flag approach a STILL POINT breather for the merchant", () => {
    const still = (MOON.safeZones ?? []).find((z) => z.label === "STILL POINT");
    expect(still).toBeDefined();
  });
});
