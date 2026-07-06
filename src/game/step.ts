// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering + jump physics → weapon auto-attack → projectiles → enemies
// (aggro, boss guard AI, contact damage) → wave spawner (the escalating
// horde) → item pickups → objective check → win/lose. Kills grant XP
// proportional to the victim's max hp; level-ups pause the run in the
// `levelup` phase until `allocateStat` spends the point(s).

import {
  clamp,
  direction,
  distance,
  distanceSq,
  moveToward,
  type Vec2,
} from "@game/lib/vec.ts";
import {
  ENEMY_AI,
  JUMP,
  LEVELING,
  LOOT,
  MEDKIT,
  PLAYER,
  RUN,
  STATS,
} from "./config.ts";
import { spawnEnemy } from "./create.ts";
import { enemyDef, type EnemyDef } from "./defs/enemies.ts";
import { weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels.ts";
import {
  addToInventory,
  dropChance,
  enemyCritChance,
  playerCritChance,
  playerSpeed,
  rollEquipment,
  weaponDamage,
} from "./items.ts";
import type { Enemy, GameInput, GameState } from "./types.ts";

/** Advance the simulation by `dtMs` milliseconds. */
export function step(state: GameState, input: GameInput, dtMs: number): void {
  state.events = [];
  if (state.phase !== "playing") return;

  const dt = dtMs / 1000;
  state.stats.timeMs += dtMs;

  stepPlayer(state, input, dt, dtMs);
  stepWeapon(state, dtMs);
  stepProjectiles(state, dt, dtMs);
  stepEnemies(state, dt, dtMs);
  stepSpawner(state);
  stepItems(state);

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = "defeat";
    state.events.push({ type: "defeat" });
    return;
  }

  // The level ends a beat after the objective clears, leaving time to grab
  // the loot.
  if (state.victoryCountdownMs === null && objectiveCleared(state)) {
    state.victoryCountdownMs = RUN.victoryDelayMs;
  }
  if (state.victoryCountdownMs !== null) {
    state.victoryCountdownMs -= dtMs;
    if (state.victoryCountdownMs <= 0) {
      state.victoryCountdownMs = 0;
      state.phase = "victory";
      state.events.push({ type: "victory" });
    }
  }
}

/** Has the level's objective been met? */
function objectiveCleared(state: GameState): boolean {
  const objective = levelDef(state.level.id).objective;
  if (objective.type === "clearAll") {
    return state.enemies.length === 0 && unspawnedMinions(state) === 0;
  }
  return !state.enemies.some((e) => enemyDef(e.defId).role === "boss");
}

/** Monsters still owed by the wave budget but not yet streamed in. */
function unspawnedMinions(state: GameState): number {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return 0;
  return waves.budget.reduce(
    (sum, entry, i) => sum + entry.count - (state.waveSpawned[i] ?? 0),
    0,
  );
}

/**
 * The horde spawner: each wave-budget line streams its count in over its
 * time window, eased quadratically so a level opens with a few strays and
 * ends in an overwhelming flood. Spawns land in a ring just outside the
 * player's view and give chase at once; the live cap defers (never cancels)
 * what the field can't hold.
 */
function stepSpawner(state: GameState): void {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return;

  let alive = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).role !== "boss") alive++;
  }

  const t = state.stats.timeMs;
  for (let i = 0; i < waves.budget.length; i++) {
    const entry = waves.budget[i] as (typeof waves.budget)[number];
    const spawned = state.waveSpawned[i] ?? 0;
    if (spawned >= entry.count) continue;

    const start = entry.window[0] * waves.rampDurationMs;
    const end = entry.window[1] * waves.rampDurationMs;
    const progress = clamp((t - start) / Math.max(1, end - start), 0, 1);
    const eased = progress * progress;
    let due = Math.floor(entry.count * eased) - spawned;

    while (due-- > 0 && alive < waves.maxAlive) {
      if (!spawnWaveEnemy(state, entry.enemy)) return;
      state.waveSpawned[i] = (state.waveSpawned[i] ?? 0) + 1;
      alive++;
    }
  }
}

/**
 * Drop one wave monster into the spawn ring around the player. Near a wall
 * the clamped ring can collapse onto the player — rejection-sample a few
 * angles and defer the spawn (false) rather than place an unfair one.
 */
function spawnWaveEnemy(state: GameState, defId: string): boolean {
  const def = enemyDef(defId);
  for (let attempts = 0; attempts < 8; attempts++) {
    const angle = state.rng() * Math.PI * 2;
    const ring =
      ENEMY_AI.minSpawnDistance + state.rng() * ENEMY_AI.spawnRingWidth;
    const pos = {
      x: clamp(
        state.player.pos.x + Math.cos(angle) * ring,
        def.radius,
        state.level.width - def.radius,
      ),
      y: clamp(
        state.player.pos.y + Math.sin(angle) * ring,
        def.radius,
        state.level.height - def.radius,
      ),
    };
    if (distance(pos, state.player.pos) < ENEMY_AI.minSpawnDistance) continue;
    state.enemies.push(spawnEnemy(defId, pos, state.rng, state.nextId++));
    return true;
  }
  return false;
}

function stepPlayer(
  state: GameState,
  input: GameInput,
  dt: number,
  dtMs: number,
): void {
  const player = state.player;
  player.hurtFlashMs = Math.max(0, player.hurtFlashMs - dtMs);
  player.moving = false;

  if (
    input.steering &&
    distance(player.pos, input.target) > PLAYER.arriveRadius
  ) {
    const before = player.pos;
    const next = moveToward(player.pos, input.target, playerSpeed(state) * dt);
    player.facing = direction(before, input.target);
    player.pos = next;
    player.moving = true;
  }

  // Jump: only from the ground. Gravity is the level's — the moon's low g
  // turns the same takeoff into a high, floaty arc.
  if (input.jump && player.z === 0) {
    player.vz = JUMP.velocity;
    player.z = player.vz * dt;
    state.events.push({ type: "jump" });
  } else if (player.z > 0 || player.vz !== 0) {
    player.vz -= state.level.gravity * dt;
    player.z += player.vz * dt;
    if (player.z <= 0) {
      player.z = 0;
      player.vz = 0;
      state.events.push({ type: "land" });
    }
  }

  // The level is finite: clamp to its bounds.
  player.pos.x = clamp(
    player.pos.x,
    PLAYER.radius,
    state.level.width - PLAYER.radius,
  );
  player.pos.y = clamp(
    player.pos.y,
    PLAYER.radius,
    state.level.height - PLAYER.radius,
  );
}

/**
 * The character fights autonomously with whatever is in the weapon slot:
 * melee weapons strike the nearest monster in reach directly, the rest fire
 * a projectile at it.
 */
function stepWeapon(state: GameState, dtMs: number): void {
  const player = state.player;
  player.weaponCooldownMs = Math.max(0, player.weaponCooldownMs - dtMs);
  if (player.weaponCooldownMs > 0) return;

  const weapon = weaponDef(player.equipment.weapon.defId);
  const target = nearestEnemy(state.enemies, player.pos, weapon.range);
  if (!target) return;

  player.weaponCooldownMs = weapon.cooldownMs;
  if (!weapon.projectile) {
    state.events.push({ type: "swing" });
    hitEnemy(state, target, weaponDamage(state));
    return;
  }

  state.projectiles.push({
    id: state.nextId++,
    pos: { ...player.pos },
    dir: direction(player.pos, target.pos),
    speed: weapon.projectile.speed,
    radius: weapon.projectile.radius,
    damage: weaponDamage(state),
    lifetimeMs: weapon.projectile.lifetimeMs,
    weaponClass: weapon.class,
  });
  state.stats.shotsFired++;
  state.events.push({ type: "shot", weaponClass: weapon.class });
}

function nearestEnemy(
  enemies: Enemy[],
  from: Vec2,
  range: number,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistSq = range * range;
  for (const enemy of enemies) {
    const d = distanceSq(from, enemy.pos);
    if (d <= bestDistSq) {
      best = enemy;
      bestDistSq = d;
    }
  }
  return best;
}

/**
 * Apply one player hit: roll the crit (LUCK), deal damage, and on a kill
 * grant XP proportional to max hp and roll loot. Bosses' guaranteed drops
 * come from their def; the victory countdown starts once the objective
 * clears at the end of the step.
 */
function hitEnemy(state: GameState, enemy: Enemy, baseDamage: number): void {
  const crit = state.rng() < playerCritChance(state);
  const damage = Math.round(baseDamage * (crit ? STATS.critMultiplier : 1));
  enemy.hp -= damage;
  state.stats.damageDealt += damage;

  if (enemy.hp > 0) {
    state.events.push({ type: "enemyHit", pos: { ...enemy.pos }, crit });
    return;
  }

  const def = enemyDef(enemy.defId);
  state.enemies.splice(state.enemies.indexOf(enemy), 1);
  state.stats.kills++;
  state.events.push({
    type: "enemyKilled",
    pos: { ...enemy.pos },
    defId: enemy.defId,
  });

  grantXp(state, def.xp ?? Math.round(enemy.maxHp * LEVELING.xpPerHp));

  if (def.loot) {
    dropGuaranteedLoot(state, def, enemy.pos);
  } else {
    dropMinionLoot(state, enemy.pos);
  }

  if (def.role === "boss") {
    state.events.push({ type: "bossDefeated", pos: { ...enemy.pos } });
  }
}

/**
 * A dead regular monster's drop roll: LUCK widens the odds, the loot shares
 * split what falls between equipment, weapon upgrades, and medkits — and a
 * pity rule forces equipment whenever the monsters left alive couldn't
 * otherwise cover the level's guaranteed minimum.
 */
function dropMinionLoot(state: GameState, at: Vec2): void {
  const remaining =
    state.enemies.filter((e) => enemyDef(e.defId).role !== "boss").length +
    unspawnedMinions(state);

  // The last regular monster standing surrenders the level's trophy weapon.
  const trophy = levelDef(state.level.id).loot.allClearWeapon;
  if (remaining === 0 && trophy) {
    const pos = { x: at.x + 12, y: at.y };
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, {
        defId: trophy,
        tierBonus: LOOT.allClearTierBonus,
      }),
    });
    state.events.push({ type: "itemDropped", pos: { ...pos } });
  }

  const owed = LOOT.minEquipmentPerLevel - state.minionEquipmentDrops;
  const forced = owed > remaining;

  if (!forced && state.rng() >= dropChance(state)) return;

  const pos = { ...at };
  const roll = state.rng();
  if (forced || roll < LOOT.equipmentShare) {
    state.minionEquipmentDrops++;
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state),
    });
  } else if (roll < LOOT.equipmentShare + LOOT.upgradeShare) {
    state.items.push({ id: state.nextId++, kind: "upgrade", pos });
  } else {
    state.items.push({ id: state.nextId++, kind: "medkit", pos });
  }
  state.events.push({ type: "itemDropped", pos });
}

/** Bosses always pay out: their def pins the drops, scattered around them. */
function dropGuaranteedLoot(state: GameState, def: EnemyDef, at: Vec2): void {
  const loot = def.loot;
  if (!loot) return;
  const scatter = (): Vec2 => ({
    x: clamp(at.x + (state.rng() - 0.5) * 90, 16, state.level.width - 16),
    y: clamp(at.y + (state.rng() - 0.5) * 90, 16, state.level.height - 16),
  });
  for (const defId of loot.items ?? []) {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: scatter(),
      equipment: rollEquipment(state, { defId, tierBonus: loot.tierBonus }),
    });
  }
  const drops: ("weapon" | "gear")[] = [
    ...Array<"weapon">(loot.weapons).fill("weapon"),
    ...Array<"gear">(loot.gear).fill("gear"),
  ];
  for (const slot of drops) {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: scatter(),
      equipment: rollEquipment(state, { slot, tierBonus: loot.tierBonus }),
    });
  }
  for (let i = 0; i < loot.upgrades; i++) {
    state.items.push({ id: state.nextId++, kind: "upgrade", pos: scatter() });
  }
  for (let i = 0; i < loot.medkits; i++) {
    state.items.push({ id: state.nextId++, kind: "medkit", pos: scatter() });
  }
  state.events.push({ type: "itemDropped", pos: { ...at } });
}

/** Award XP; each threshold crossed banks a stat point and pauses the run. */
function grantXp(state: GameState, amount: number): void {
  const player = state.player;
  player.xp += amount;
  state.stats.xpGained += amount;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = Math.round(
      LEVELING.baseXpToLevel * Math.pow(LEVELING.xpGrowth, player.level - 1),
    );
    player.pendingStatPoints += LEVELING.statPointsPerLevel;
    state.events.push({ type: "levelUp", level: player.level });
  }
  if (player.pendingStatPoints > 0) state.phase = "levelup";
}

function stepProjectiles(state: GameState, dt: number, dtMs: number): void {
  const survivors = [];
  for (const projectile of state.projectiles) {
    projectile.pos.x += projectile.dir.x * projectile.speed * dt;
    projectile.pos.y += projectile.dir.y * projectile.speed * dt;
    projectile.lifetimeMs -= dtMs;

    const outOfBounds =
      projectile.pos.x < 0 ||
      projectile.pos.y < 0 ||
      projectile.pos.x > state.level.width ||
      projectile.pos.y > state.level.height;
    if (projectile.lifetimeMs <= 0 || outOfBounds) continue;

    const hit = state.enemies.find(
      (enemy) =>
        distance(enemy.pos, projectile.pos) <=
        enemyDef(enemy.defId).radius + projectile.radius,
    );
    if (!hit) {
      survivors.push(projectile);
      continue;
    }
    hitEnemy(state, hit, projectile.damage);
  }
  state.projectiles = survivors;
}

function stepEnemies(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  for (const enemy of state.enemies) {
    enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - dtMs);
    moveEnemy(state, enemy, dt);
  }

  separateEnemies(state);

  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    enemy.pos.x = clamp(
      enemy.pos.x,
      def.radius,
      state.level.width - def.radius,
    );
    enemy.pos.y = clamp(
      enemy.pos.y,
      def.radius,
      state.level.height - def.radius,
    );

    // Monsters drift along the ground — a player at the top of a moon jump
    // sails clean over their grasp.
    const touching =
      player.z <= JUMP.dodgeHeight &&
      distance(enemy.pos, player.pos) <= def.radius + PLAYER.radius;
    if (touching && enemy.contactCooldownMs <= 0) {
      const crit = state.rng() < enemyCritChance(state, def.critChance);
      const damage = Math.round(
        def.contactDamage * (crit ? STATS.critMultiplier : 1),
      );
      player.hp -= damage;
      player.hurtFlashMs = 250;
      enemy.contactCooldownMs = def.contactCooldownMs;
      state.stats.damageTaken += damage;
      state.events.push({ type: "playerHurt", crit });
    }
  }
}

// Spatial hash reused across steps: at horde scale (hundreds alive) the old
// all-pairs separation is the tick's hotspot, and reusing the map keeps
// per-tick allocation down to the bucket arrays.
const separationGrid = new Map<number, Enemy[]>();

/**
 * Push overlapping monsters apart so packs spread instead of collapsing
 * into a single stacked blob. Neighbors are found through a uniform grid
 * (cell = separation distance): any pair closer than one cell shares a
 * cell or sits in adjacent ones, so only those pairs are tested.
 */
function separateEnemies(state: GameState): void {
  const cell = ENEMY_AI.separation;
  // Level width caps near a few thousand px, so cell columns stay < 2¹⁶
  // and this key never collides.
  const keyOf = (x: number, y: number) =>
    Math.floor(x / cell) * 65536 + Math.floor(y / cell);

  separationGrid.clear();
  for (const enemy of state.enemies) {
    const key = keyOf(enemy.pos.x, enemy.pos.y);
    const bucket = separationGrid.get(key);
    if (bucket) bucket.push(enemy);
    else separationGrid.set(key, [enemy]);
  }

  for (const a of state.enemies) {
    const kx = Math.floor(a.pos.x / cell);
    const ky = Math.floor(a.pos.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = separationGrid.get((kx + dx) * 65536 + (ky + dy));
        if (!bucket) continue;
        for (const b of bucket) {
          if (b.id <= a.id) continue; // handle each pair once
          const d = distance(a.pos, b.pos);
          if (d >= cell || d === 0) continue;
          const push = (cell - d) / 2;
          const dir = direction(a.pos, b.pos);
          a.pos.x -= dir.x * push;
          a.pos.y -= dir.y * push;
          b.pos.x += dir.x * push;
          b.pos.y += dir.y * push;
        }
      }
    }
  }
}

/**
 * Enemy AI: haunt the spawn point, chase when the player wanders close,
 * drift home when they escape. Bosses guard their post instead — they wake
 * when the player nears it (or once wounded) but never stray past their
 * leash.
 */
function moveEnemy(state: GameState, enemy: Enemy, dt: number): void {
  const player = state.player;
  const def = enemyDef(enemy.defId);

  if (def.role === "boss") {
    const awake =
      enemy.hp < enemy.maxHp ||
      distance(player.pos, enemy.home) < def.ai.aggroRadius ||
      distance(player.pos, enemy.pos) < def.ai.aggroRadius;
    const leashed =
      def.ai.leashRadius !== undefined &&
      distance(enemy.pos, enemy.home) > def.ai.leashRadius;
    const target = awake && !leashed ? player.pos : enemy.home;
    enemy.pos = moveToward(enemy.pos, target, enemy.speed * dt);
    return;
  }

  if (distance(player.pos, enemy.pos) < def.ai.aggroRadius) {
    enemy.pos = moveToward(enemy.pos, player.pos, enemy.speed * dt);
  } else if (distance(enemy.pos, enemy.home) > 4) {
    enemy.pos = moveToward(
      enemy.pos,
      enemy.home,
      enemy.speed * (def.ai.returnSpeedFactor ?? 0.5) * dt,
    );
  }
}

function stepItems(state: GameState): void {
  const player = state.player;
  state.items = state.items.filter((item) => {
    const overlapping =
      distance(item.pos, player.pos) <= MEDKIT.radius + PLAYER.radius;
    if (!overlapping) return true;

    if (item.kind === "medkit") {
      player.hp = Math.min(player.maxHp, player.hp + MEDKIT.heal);
      state.stats.itemsCollected++;
      state.events.push({ type: "itemCollected", kind: "medkit" });
      return false;
    }

    // Upgrades sharpen whatever weapon is in hand, permanently.
    if (item.kind === "upgrade") {
      const weapon = player.equipment.weapon;
      weapon.upgrades = (weapon.upgrades ?? 0) + 1;
      state.stats.itemsCollected++;
      state.events.push({ type: "itemCollected", kind: "upgrade" });
      return false;
    }

    // Equipment goes into the bag; with a full bag it stays on the ground.
    if (!addToInventory(state, item.equipment)) return true;
    state.stats.itemsCollected++;
    state.events.push({
      type: "itemCollected",
      kind: "equipment",
      tier: item.equipment.tier,
    });
    return false;
  });
}
