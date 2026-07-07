// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run setup: builds the initial GameState from a level definition
// (defs/levels.ts). Monsters spawn in difficulty bands that scale with
// distance from the player spawn toward the objective; fixed spawns (bosses)
// guard their landmarks. The seed makes generation deterministic — tests
// pass a constant, the app passes a clock-derived value so every retry lays
// the level out differently.

import { createCutscene } from "@game/lib/cutscene.ts";
import { createRng, randomRange, type Rng } from "@game/lib/rng.ts";
import { distance, vec, type Vec2 } from "@game/lib/vec.ts";
import { ENEMY_AI, LEVELING, LOOT, OBSTACLES, PLAYER } from "./config.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import {
  difficultyDef,
  meetsMinDifficulty,
  scaledMobCount,
} from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { LEVEL_ORDER, levelDef, type LevelDef } from "./defs/levels/index.ts";
import { rollEquipment } from "./items.ts";
import { evolutionHpMult } from "./menace.ts";
import type {
  Decor,
  Difficulty,
  DoorState,
  Enemy,
  GameState,
  Item,
  Obstacle,
} from "./types.ts";

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

  // Obstacles go down first so monsters (and their walk-in spawns) never
  // start wedged inside one. Deliberate walls and locked doors land before
  // the scatter so scattered pieces keep their distance from the
  // architecture.
  const obstacles = buildWalls(def, () => nextId++);
  const doors = buildDoors(def, obstacles, () => nextId++);
  obstacles.push(
    ...scatterObstacles(rng, def, playerSpawn, obstacles, () => nextId++),
  );
  const blocked = (pos: Vec2, radius: number) =>
    obstacles.some((o) => distance(pos, o.pos) < o.radius + radius);

  const enemies: Enemy[] = [];
  for (const spawn of def.spawns) {
    // Difficulty-gated spawns sit out the rungs below their `minDifficulty`.
    if (!meetsMinDifficulty(difficulty, spawn.minDifficulty)) continue;
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
          distance(pos, playerSpawn) >= ENEMY_AI.minSpawnDistance &&
          !blocked(pos, margin)
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
    (sum, entry) =>
      meetsMinDifficulty(difficulty, entry.minDifficulty)
        ? sum + scaledMobCount(entry.count, difficulty)
        : sum,
    0,
  );

  const state: GameState = {
    phase: def.prelude ? "cutscene" : "intro",
    cutscene: def.prelude ? createCutscene(cutsceneDef(def.prelude)) : null,
    difficulty,
    menace: 0,
    combatDps: 0,
    combatKillRate: 0,
    level: {
      id: def.id,
      index: def.index,
      name: def.name,
      width: def.width,
      height: def.height,
      gravity: def.gravity,
      biome: def.biome,
      tiles: def.tiles,
      foes: def.foes,
    },
    playerSpawn,
    landmarks: def.landmarks.map((l) => ({
      kind: l.kind,
      sprite: l.sprite ?? l.kind,
      anchor: l.anchor ?? "center",
      pos: { ...l.pos },
    })),
    dialogue: null,
    storyItems: [],
    doors,
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
      // The bag starts at its STRENGTH-0 floor; allocating STRENGTH grows it
      // (see inventoryCapacity / syncInventoryCapacity).
      inventory: new Array<null>(LOOT.baseInventorySize).fill(null),
    },
    enemies,
    projectiles: [],
    items: [],
    decor,
    obstacles,
    victoryCountdownMs: null,
    minionEquipmentDrops: 0,
    waveSpawned: (def.waves?.budget ?? []).map(() => 0),
    moveSpawnCredit: 0,
    // Resolve the scripted opening drops: a rolled [min, max] threshold picks
    // a concrete kill discovered in play; a fixed number stands as authored.
    earlyDropKills: (def.loot.earlyDrops ?? []).map((d) =>
      Array.isArray(d.atKills)
        ? Math.floor(randomRange(rng, d.atKills[0], d.atKills[1] + 1))
        : d.atKills,
    ),
    // The scripted opening drops fire in kill order from the first entry.
    earlyDropCursor: 0,
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

  // Hand-placed pickups (locked-room loot, plot pieces on pedestals) mint
  // last: equipment rolls draw on the state's rng exactly like drops do.
  for (const placed of def.placedItems ?? []) {
    state.items.push(placeItem(state, placed));
  }

  return state;
}

/** Mint one of the level def's hand-placed pickups. */
function placeItem(
  state: GameState,
  placed: NonNullable<LevelDef["placedItems"]>[number],
): Item {
  const pos = { ...placed.pos };
  const id = state.nextId++;
  if (placed.kind === "equipment") {
    return {
      id,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, { defId: placed.defId }),
    };
  }
  if (placed.kind === "story") {
    return { id, kind: "story", pos, defId: placed.defId };
  }
  return { id, kind: placed.kind, pos };
}

/** Mint one enemy instance (also used by the wave spawner in step.ts).
 * `hpMult` is the difficulty's monster-hp multiplier — kill XP scales with
 * max hp, so tougher monsters also pay out more. `evo` is the menace
 * evolution stage stamped onto a MINION spawned while the horde is rampaging
 * (see menace.ts): it stacks extra hp (worth more xp) and marks the mob so
 * its drop rolls better. Elites and bosses ignore `evo` — they instead
 * power-match the player when they engage (maybePowerScale). */
export function spawnEnemy(
  defId: string,
  pos: Vec2,
  rng: Rng,
  id: number,
  hpMult = 1,
  evo = 0,
): Enemy {
  const def = enemyDef(defId);
  const jitter =
    def.role === "boss"
      ? 0
      : randomRange(rng, -ENEMY_AI.speedJitter, ENEMY_AI.speedJitter);
  const evolved = def.role === "minion" ? Math.max(0, evo) : 0;
  const hp = Math.max(
    1,
    Math.round(def.hp * hpMult * evolutionHpMult(evolved)),
  );
  const enemy: Enemy = {
    id,
    defId,
    pos,
    home: { ...pos },
    hp,
    maxHp: hp,
    speed: def.speed * (1 + jitter),
    contactCooldownMs: 0,
  };
  if (evolved > 0) enemy.evo = evolved;
  return enemy;
}

/**
 * Expand one wall/door segment into a chain of solid circles. Centers step
 * by 1.5× the radius, so neighbouring circles overlap enough that no body
 * can slip between them — a segment collides as one continuous wall.
 */
function expandSegment(
  kind: string,
  sprite: string,
  from: Vec2,
  to: Vec2,
  radius: number,
  jumpable: boolean,
  takeId: () => number,
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const length = distance(from, to);
  const steps = Math.max(1, Math.ceil(length / (radius * 1.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    obstacles.push({
      id: takeId(),
      kind,
      sprite,
      pos: vec(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t),
      radius,
      jumpable,
    });
  }
  return obstacles;
}

/**
 * Expand the level's wall segments into chains of solid circles. Deliberate
 * architecture skips the scatter clearance rules: door gaps are the
 * designer's responsibility, not the sampler's.
 */
function buildWalls(def: LevelDef, takeId: () => number): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const wall of def.walls ?? []) {
    obstacles.push(
      ...expandSegment(
        wall.kind,
        wall.sprite ?? wall.kind,
        wall.from,
        wall.to,
        wall.radius,
        wall.jumpable,
        takeId,
      ),
    );
  }
  return obstacles;
}

/**
 * Expand the level's locked doors into `door_locked` obstacle chains
 * (appended to `obstacles`) and the DoorState entries that let the key
 * remove them again. Doors are never jumpable — a hop over a locked door
 * would make the key a souvenir.
 */
function buildDoors(
  def: LevelDef,
  obstacles: Obstacle[],
  takeId: () => number,
): DoorState[] {
  const doors: DoorState[] = [];
  for (const door of def.doors ?? []) {
    const chain = expandSegment(
      "door_locked",
      "door_locked",
      door.from,
      door.to,
      door.radius,
      false,
      takeId,
    );
    obstacles.push(...chain);
    doors.push({
      id: door.id,
      center: vec((door.from.x + door.to.x) / 2, (door.from.y + door.to.y) / 2),
      obstacleIds: chain.map((o) => o.id),
      open: false,
    });
  }
  return doors;
}

/**
 * Scatter the level's solid obstacles: clear of landmarks (the boss must
 * reach his flag), clear of the player spawn, and spaced apart from each
 * other (walls included) so the field always leaves walkable lanes.
 */
function scatterObstacles(
  rng: Rng,
  def: LevelDef,
  playerSpawn: Vec2,
  walls: Obstacle[],
  takeId: () => number,
): Obstacle[] {
  const scattered: Obstacle[] = [];
  const clearOf = (others: Obstacle[], pos: Vec2, radius: number) =>
    others.every(
      (o) => distance(pos, o.pos) > o.radius + radius + OBSTACLES.spacing,
    );
  for (const spec of def.obstacles) {
    for (let i = 0; i < spec.count; i++) {
      for (let attempts = 0; attempts < 30; attempts++) {
        const pos = vec(
          randomRange(rng, spec.radius + 8, def.width - spec.radius - 8),
          randomRange(rng, spec.radius + 8, def.height - spec.radius - 8),
        );
        const clear =
          distance(pos, playerSpawn) > OBSTACLES.spawnClearance + spec.radius &&
          def.landmarks.every(
            (l) => distance(pos, l.pos) > def.decorClearance + spec.radius,
          ) &&
          clearOf(walls, pos, spec.radius) &&
          clearOf(scattered, pos, spec.radius);
        if (!clear) continue;
        scattered.push({
          id: takeId(),
          kind: spec.kind,
          sprite: spec.sprite ?? spec.kind,
          pos,
          radius: spec.radius,
          jumpable: spec.jumpable,
        });
        break;
      }
    }
  }
  return scattered;
}

/** Scatter the level's decorative features, keeping landmarks clear. */
function scatterDecor(rng: Rng, def: LevelDef): Decor[] {
  const decor: Decor[] = [];
  for (const { kind, sprite, count } of def.decor) {
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
      decor.push({ kind, sprite: sprite ?? kind, pos });
    }
  }
  return decor;
}
