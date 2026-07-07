// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 1 — SPACEZ HQ: the roster, the walls, and the loot table. Plus the
// catalog integrity rules every level must hold (pools resolve, sprites are
// named, wall chains leave no slip-through gaps).

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  createGame,
  enemyDef,
  gearDef,
  isWeaponDef,
  LEVEL_ORDER,
  LEVELS,
  OBSTACLES,
  PLAYER,
  weaponDef,
  type LevelDef,
} from "@game/core";
import { SEED, startGame } from "./helpers.ts";

const HQ = LEVELS.spacez_hq!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("SPACEZ HQ level def", () => {
  it("is story level 1 and the default run", () => {
    expect(HQ.index).toBe(1);
    expect(LEVEL_ORDER[0]).toBe("spacez_hq");
    const state = createGame(SEED);
    expect(state.level.id).toBe("spacez_hq");
    expect(state.level.biome).toBe("spacez");
  });

  it("fields the night shift: five staff types plus MUSKRAT at the rocket", () => {
    const minionIds = HQ.spawns
      .filter((s) => "band" in s)
      .map((s) => s.enemy)
      .sort();
    expect(minionIds).toEqual([
      "engineer",
      "guard",
      "hazmat",
      "intern",
      "scientist",
    ]);

    const state = startGame(SEED, "spacez_hq");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    expect(boss.defId).toBe("muskrat");
    const rocket = state.landmarks.find((l) => l.kind === "rocket")!;
    expect(dist(boss.pos, rocket.pos)).toBeLessThan(
      enemyDef("muskrat").ai.leashRadius!,
    );
  });

  it("keeps every hop viable: jumpable obstacles clear under HQ gravity", () => {
    // Peak jump height v²/2g must beat the clear height with margin, or
    // "jumpable" desks and crates are a lie on this level.
    const peak = 240 ** 2 / (2 * HQ.gravity);
    expect(peak).toBeGreaterThan(OBSTACLES.clearHeight + 10);
  });

  it("builds walls as contiguous chains nothing can slip through", () => {
    const state = startGame(SEED, "spacez_hq");
    const wallCircles = state.obstacles.filter((o) => o.kind === "wall");
    expect(wallCircles.length).toBeGreaterThan(50);

    for (const wall of HQ.walls!) {
      const online = wallCircles.filter(
        (o) =>
          // On the segment: collinear within a pixel and inside its bounds.
          Math.abs(
            (wall.to.x - wall.from.x) * (o.pos.y - wall.from.y) -
              (wall.to.y - wall.from.y) * (o.pos.x - wall.from.x),
          ) /
            dist(wall.from, wall.to) <
            1 &&
          o.pos.x >= Math.min(wall.from.x, wall.to.x) - 1 &&
          o.pos.x <= Math.max(wall.from.x, wall.to.x) + 1 &&
          o.pos.y >= Math.min(wall.from.y, wall.to.y) - 1 &&
          o.pos.y <= Math.max(wall.from.y, wall.to.y) + 1,
      );
      expect(online.length).toBeGreaterThan(1);
      // Endpoints are covered…
      expect(online.some((o) => dist(o.pos, wall.from) < 1)).toBe(true);
      expect(online.some((o) => dist(o.pos, wall.to) < 1)).toBe(true);
      // …and neighbouring circles overlap enough that no player-sized body
      // fits between them (gap between edges stays negative).
      const sorted = online
        .slice()
        .sort((a, b) => dist(a.pos, wall.from) - dist(b.pos, wall.from));
      for (let i = 1; i < sorted.length; i++) {
        const gap = dist(sorted[i]!.pos, sorted[i - 1]!.pos) - 2 * wall.radius;
        expect(gap).toBeLessThan(0);
      }
    }
  });

  it("keeps scattered furniture clear of the architecture", () => {
    const state = startGame(SEED, "spacez_hq");
    const architecture = ["wall", "door_locked"];
    const walls = state.obstacles.filter((o) => o.kind === "wall");
    const scattered = state.obstacles.filter(
      (o) => !architecture.includes(o.kind),
    );
    expect(scattered.length).toBeGreaterThan(0);
    for (const piece of scattered) {
      for (const wall of walls) {
        expect(dist(piece.pos, wall.pos)).toBeGreaterThan(
          piece.radius + wall.radius + OBSTACLES.spacing,
        );
      }
    }
  });

  it("spawns the player clear of every wall", () => {
    const state = startGame(SEED, "spacez_hq");
    for (const wall of state.obstacles.filter((o) => o.kind === "wall")) {
      expect(dist(state.player.pos, wall.pos)).toBeGreaterThan(
        wall.radius + PLAYER.radius,
      );
    }
  });
});

describe("level catalog integrity", () => {
  const levels = Object.values(LEVELS) as LevelDef[];

  it("gives every level a unique story index and an intro", () => {
    const indices = levels.map((l) => l.index);
    expect(new Set(indices).size).toBe(levels.length);
    for (const level of levels) expect(level.intro.length).toBeGreaterThan(0);
  });

  it("resolves every id referenced by spawns, waves, and loot", () => {
    for (const level of levels) {
      for (const spawn of level.spawns)
        expect(enemyDef(spawn.enemy)).toBeDefined();
      for (const line of level.waves?.budget ?? []) {
        expect(enemyDef(line.enemy)).toBeDefined();
      }
      for (const id of level.loot.weaponPool)
        expect(weaponDef(id)).toBeDefined();
      for (const id of level.loot.gearPool) expect(gearDef(id)).toBeDefined();
      for (const id of level.loot.abilityPool) {
        expect(abilityDef(id)).toBeDefined();
      }
      if (level.loot.allClearWeapon) {
        expect(weaponDef(level.loot.allClearWeapon)).toBeDefined();
      }
      if (level.loot.earlyWeapon) {
        expect(weaponDef(level.loot.earlyWeapon.defId)).toBeDefined();
      }
    }
  });

  it("resolves every boss guaranteed drop", () => {
    for (const level of levels) {
      for (const spawn of level.spawns) {
        const def = enemyDef(spawn.enemy);
        for (const entry of def.loot?.items ?? []) {
          const id = typeof entry === "string" ? entry : entry.defId;
          const resolved = isWeaponDef(id) ? weaponDef(id) : gearDef(id);
          expect(resolved).toBeDefined();
        }
      }
    }
  });
});
