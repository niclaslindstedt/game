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
import {
  clearStage,
  idle,
  makeEnemy,
  run,
  SEED,
  startGame,
  equipBlaster,
} from "../helpers.ts";

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

  it("fields the night shift: five staff types plus the OPTIMUS units and MUSKRAT at the rocket", () => {
    const minionIds = HQ.spawns
      .filter((s) => "band" in s)
      .map((s) => s.enemy)
      .sort();
    expect(minionIds).toEqual([
      "engineer",
      "guard",
      "hazmat",
      "intern",
      "optimus",
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

  it("fields OPTIMUS as a hard-hitting regular monster, not an elite", () => {
    const optimus = enemyDef("optimus");
    expect(optimus.role).toBe("minion");
    // Not a story unique: no guaranteed elite/boss loot block, no dialogue.
    expect(optimus.loot).toBeUndefined();
    expect(optimus.dialogue).toBeUndefined();
    // Tougher and harder-hitting than every human on the floor.
    for (const id of ["intern", "scientist", "engineer", "guard", "hazmat"]) {
      const staff = enemyDef(id);
      expect(optimus.hp).toBeGreaterThan(staff.hp);
      expect(optimus.contactDamage).toBeGreaterThan(staff.contactDamage);
    }
    // …but its payoff is a sweetened drop roll, not a pinned drop.
    expect(optimus.dropProfile?.dropBonus).toBeGreaterThan(0);
  });

  it("drops far more often than a plain staffer (its dropProfile)", () => {
    // Kill a stack of 1-hp mobs parked in blaster reach but out of pickup
    // range, and count what falls; OPTIMUS's dropProfile should rain gear
    // where an intern trickles it. Averaged over seeds so one unlucky run
    // can't flip the comparison.
    const dropsFrom = (defId: string, seed: number): number => {
      const state = equipBlaster(startGame(seed, "spacez_hq")); // pick off at range
      clearStage(state); // just the parked boss remains, waves silenced
      state.items = [];
      state.player.stats.luck = 0; // isolate the base rate + the profile bonus
      const N = 40;
      for (let i = 0; i < N; i++) {
        state.enemies.push(
          makeEnemy(
            {
              id: 9000 + i,
              pos: {
                x: state.player.pos.x + 80,
                y: state.player.pos.y + (i - N / 2) * 2,
              },
              hp: 1,
              maxHp: 1,
            },
            defId,
          ),
        );
      }
      run(state, idle, 40_000, (s) => s.enemies.length === 1);
      return state.items.length;
    };

    let optimusTotal = 0;
    let internTotal = 0;
    for (const seed of [1, 2, 3]) {
      optimusTotal += dropsFrom("optimus", seed);
      internTotal += dropsFrom("intern", seed);
    }
    expect(optimusTotal).toBeGreaterThan(internTotal + 20);
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

describe("THE ARCHITECT and the PASSAGE CHIP", () => {
  it("pins the old bench partner as a fifth speaking elite on the level", () => {
    const architect = HQ.spawns.find(
      (s) => "at" in s && s.enemy === "architect",
    );
    expect(architect).toBeDefined();
    const def = enemyDef("architect");
    expect(def.role).toBe("elite");
    expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
    // Rushes into view like the other uniques before it talks.
    expect(def.ai.rushSpeed ?? 0).toBeGreaterThan(def.speed);
  });

  it("stays a shorter scene than the boss's confrontation", () => {
    expect(enemyDef("architect").dialogue!.length).toBeLessThan(
      enemyDef("muskrat").dialogue!.length,
    );
  });

  it("hits the meeting's beats: the plea, the obsolescence, the threat", () => {
    const script = enemyDef("architect").dialogue!.flat().join(" ");
    expect(script).toContain("QUIT");
    expect(script).toContain("SUPERINTELLIGENCE");
    expect(script).toContain("OBSOLETE");
    expect(script).toContain("NOW YOU WILL DIE");
  });

  it("drops the chip he operated into himself", () => {
    const items = enemyDef("architect").loot?.items ?? [];
    const chip = items.find(
      (e) => (typeof e === "string" ? e : e.defId) === "passage_chip",
    );
    expect(chip).toBeDefined();
    // Forced regular so it lands as the plain, affix-free "+1 INT".
    expect(typeof chip === "string" ? undefined : chip?.tier).toBe("regular");
  });

  it("makes the PASSAGE CHIP a passive +1 INT trinket", () => {
    const chip = gearDef("passage_chip");
    expect(chip.slot).toBe("charm");
    expect(chip.passive?.intelligence).toBe(1);
    // Purely passive: no worn bonuses, no plating.
    expect(chip.bonuses).toEqual({});
    expect(chip.armor).toBeUndefined();
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
      for (const entry of level.loot.earlyDrops ?? []) {
        if ("weapon" in entry) expect(weaponDef(entry.weapon)).toBeDefined();
        else if ("ability" in entry) {
          expect(abilityDef(entry.ability)).toBeDefined();
        }
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
