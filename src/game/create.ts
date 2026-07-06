// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run setup: builds the initial GameState from a level definition
// (defs/levels.ts). Monsters spawn in difficulty bands that scale with
// distance from the player spawn toward the objective; fixed spawns (bosses)
// guard their landmarks. The seed makes generation deterministic — tests
// pass a constant, the app passes a clock-derived value so every retry lays
// the level out differently.

import { createRng, randomRange, type Rng } from "@game/lib/rng.ts";
import { distance, vec, type Vec2 } from "@game/lib/vec.ts";
import { ENEMY_AI, LEVELING, LOOT, PLAYER } from "./config.ts";
import { difficultyDef, scaledMobCount } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies.ts";
import { LEVEL_ORDER, levelDef, type LevelDef } from "./defs/levels.ts";
import type { Decor, Difficulty, Enemy, GameState } from "./types.ts";

export function createGame(
  seed: number,
  levelId: string = LEVEL_ORDER[0] as string,
  difficulty: Difficulty = "medium",
): GameState {
  const def = levelDef(levelId);
  const diff = difficultyDef(difficulty);
  const rng = createRng(seed);
  const playerSpawn = vec(def.playerSpawn.x, def.playerSpawn.y);
  let nextId = 1;

  // The difficulty axis: bands are fractions of the distance from the player
  // spawn to the objective (the boss's post), so "further out = harder"
  // scales with the level's actual geometry.
  const bossSpawn = def.spawns.find(
    (s) => "at" in s && enemyDef(s.enemy).role === "boss",
  );
  const bandReach =
    bossSpawn && "at" in bossSpawn
      ? distance(playerSpawn, bossSpawn.at)
      : Math.hypot(def.width, def.height);

  const enemies: Enemy[] = [];
  for (const spawn of def.spawns) {
    if ("at" in spawn) {
      enemies.push(
        spawnEnemy(
          spawn.enemy,
          vec(spawn.at.x, spawn.at.y),
          rng,
          nextId++,
          diff.mobHpMult,
        ),
      );
      continue;
    }
    const [bandMin, bandMax] = spawn.band;
    const count = scaledMobCount(spawn.count, difficulty);
    for (let i = 0; i < count; i++) {
      const margin = enemyDef(spawn.enemy).radius + 4;
      let pos = vec(0, 0);
      // Rejection sampling is fine at this scale; the attempt cap keeps
      // pathological seeds from looping forever.
      for (let attempts = 0; attempts < 40; attempts++) {
        pos = vec(
          randomRange(rng, margin, def.width - margin),
          randomRange(rng, margin, def.height - margin),
        );
        const fromSpawn = distance(pos, playerSpawn) / bandReach;
        if (
          fromSpawn >= bandMin &&
          fromSpawn <= bandMax &&
          distance(pos, playerSpawn) >= ENEMY_AI.minSpawnDistance
        ) {
          break;
        }
      }
      enemies.push(spawnEnemy(spawn.enemy, pos, rng, nextId++, diff.mobHpMult));
    }
  }

  const decor = scatterDecor(rng, def);

  // The wave budget is part of the level's population from the start — the
  // HUD's "ghosts N/total" counts the whole haunting, not just the placed few.
  const waveTotal = (def.waves?.budget ?? []).reduce(
    (sum, entry) => sum + scaledMobCount(entry.count, difficulty),
    0,
  );

  return {
    phase: "intro",
    difficulty,
    level: {
      id: def.id,
      index: def.index,
      name: def.name,
      width: def.width,
      height: def.height,
      gravity: def.gravity,
      biome: def.biome,
    },
    playerSpawn,
    landmarks: def.landmarks.map((l) => ({ kind: l.kind, pos: { ...l.pos } })),
    player: {
      pos: { ...playerSpawn },
      z: 0,
      vz: 0,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      facing: vec(1, 0),
      faceLeft: false,
      abilities: [],
      heldAbilities: [],
      moving: false,
      weaponCooldownMs: 0,
      hurtFlashMs: 0,
      level: 1,
      xp: 0,
      xpToNext: LEVELING.baseXpToLevel,
      pendingStatPoints: 0,
      stats: {
        health: 0,
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        speed: 0,
        luck: 0,
      },
      equipment: {
        // The starting sidearm: a plain blaster.
        weapon: {
          id: nextId++,
          defId: "blaster",
          slot: "weapon",
          tier: "regular",
          affixes: [],
        },
        suit: null,
        charm: null,
      },
      inventory: new Array<null>(LOOT.inventorySize).fill(null),
    },
    enemies,
    projectiles: [],
    items: [],
    decor,
    victoryCountdownMs: null,
    minionEquipmentDrops: 0,
    waveSpawned: (def.waves?.budget ?? []).map(() => 0),
    moveSpawnCredit: 0,
    // Roll where in [minKills, maxKills] the guaranteed early weapon lands —
    // fixed per seed, discovered in play.
    earlyWeaponAtKills: def.loot.earlyWeapon
      ? Math.floor(
          randomRange(
            rng,
            def.loot.earlyWeapon.minKills,
            def.loot.earlyWeapon.maxKills + 1,
          ),
        )
      : null,
    stats: {
      kills: 0,
      totalEnemies: enemies.length + waveTotal,
      shotsFired: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsCollected: 0,
      xpGained: 0,
      timeMs: 0,
    },
    events: [],
    nextId,
    rng,
  };
}

/** Mint one enemy instance (also used by the wave spawner in step.ts).
 * `hpMult` is the difficulty's monster-hp multiplier — kill XP scales with
 * max hp, so tougher monsters also pay out more. */
export function spawnEnemy(
  defId: string,
  pos: Vec2,
  rng: Rng,
  id: number,
  hpMult = 1,
): Enemy {
  const def = enemyDef(defId);
  const jitter =
    def.role === "boss"
      ? 0
      : randomRange(rng, -ENEMY_AI.speedJitter, ENEMY_AI.speedJitter);
  const hp = Math.max(1, Math.round(def.hp * hpMult));
  return {
    id,
    defId,
    pos,
    home: { ...pos },
    hp,
    maxHp: hp,
    speed: def.speed * (1 + jitter),
    contactCooldownMs: 0,
  };
}

/** Scatter the level's decorative features, keeping landmarks clear. */
function scatterDecor(rng: Rng, def: LevelDef): Decor[] {
  const decor: Decor[] = [];
  for (const { kind, count } of def.decor) {
    for (let i = 0; i < count; i++) {
      let pos = vec(0, 0);
      for (let attempts = 0; attempts < 20; attempts++) {
        pos = vec(
          randomRange(rng, 24, def.width - 24),
          randomRange(rng, 24, def.height - 24),
        );
        const clear = def.landmarks.every(
          (l) => distance(pos, l.pos) > def.decorClearance,
        );
        if (clear) break;
      }
      decor.push({ kind, pos });
    }
  }
  return decor;
}
