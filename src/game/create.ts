// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level setup: builds the initial GameState for the single finite level. The
// seed makes generation deterministic — tests pass a constant, the app passes
// a clock-derived value so every retry lays the level out differently.

import { createRng, randomRange } from "../lib/rng.ts";
import { distance, vec } from "../lib/vec.ts";
import { ENEMY, LEVEL, MEDKIT, PLAYER } from "./config.ts";
import type { Enemy, GameState, Item } from "./types.ts";

export function createGame(seed: number): GameState {
  const rng = createRng(seed);
  const playerPos = vec(LEVEL.width / 2, LEVEL.height / 2);
  let nextId = 1;

  // Enemies spawn anywhere in the level that keeps a fair distance from the
  // player's starting position. Rejection sampling is fine at this scale; the
  // attempt cap keeps pathological seeds from looping forever.
  const enemies: Enemy[] = [];
  const margin = ENEMY.radius + 4;
  while (enemies.length < ENEMY.count) {
    let pos = vec(
      randomRange(rng, margin, LEVEL.width - margin),
      randomRange(rng, margin, LEVEL.height - margin),
    );
    for (
      let attempts = 0;
      distance(pos, playerPos) < ENEMY.minSpawnDistance && attempts < 20;
      attempts++
    ) {
      pos = vec(
        randomRange(rng, margin, LEVEL.width - margin),
        randomRange(rng, margin, LEVEL.height - margin),
      );
    }
    enemies.push({
      id: nextId++,
      pos,
      hp: ENEMY.hp,
      maxHp: ENEMY.hp,
      speed:
        ENEMY.speed *
        (1 + randomRange(rng, -ENEMY.speedJitter, ENEMY.speedJitter)),
      contactCooldownMs: 0,
    });
  }

  const items: Item[] = [];
  const itemMargin = MEDKIT.radius + 8;
  while (items.length < MEDKIT.count) {
    items.push({
      id: nextId++,
      kind: "medkit",
      pos: vec(
        randomRange(rng, itemMargin, LEVEL.width - itemMargin),
        randomRange(rng, itemMargin, LEVEL.height - itemMargin),
      ),
    });
  }

  return {
    phase: "playing",
    level: { width: LEVEL.width, height: LEVEL.height },
    player: {
      pos: playerPos,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      facing: vec(0, 1),
      moving: false,
      weaponCooldownMs: 0,
      hurtFlashMs: 0,
    },
    enemies,
    projectiles: [],
    items,
    stats: {
      kills: 0,
      totalEnemies: ENEMY.count,
      shotsFired: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsCollected: 0,
      timeMs: 0,
    },
    events: [],
    nextId,
  };
}
