// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered player.
// Overkilling monsters and killing them faster than the horde is replenished
// banks menace; idling bleeds it back off. Menace is read as an integer
// "stage" that drives three responses (all tuned in config MENACE):
//   1. LURE — the wave spawner keeps a denser, bigger crowd on the player,
//      and every overkill drags nearby mobs in through the walk-credit channel.
//   2. EVOLVE — minions spawned while menace is high carry extra hp (baked in
//      at spawn), so they take more killing, pay more xp (xp is hp-proportional),
//      and drop better loot.
//   3. POWER-MATCH — elites and bosses, folded together with the player's own
//      level, scale their hp and contact damage when they first engage, so the
//      set-piece fights keep pace instead of melting.
// Kept out of step.ts/loot.ts so both stay lean and this rule reads in one place.

import { MENACE } from "./config.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import type { Enemy, GameState } from "./types.ts";

/** The current evolution stage: menace bucketed into [0, MENACE.maxStage]. */
export function menaceStage(state: GameState): number {
  return Math.min(MENACE.maxStage, Math.floor(state.menace / MENACE.perStage));
}

/** The hp multiplier a minion spawned at evolution `stage` carries. */
export function evolutionHpMult(stage: number): number {
  return 1 + Math.max(0, stage) * MENACE.hpPerStage;
}

/**
 * The live-crowd multiplier the menace stage applies to the wave spawner's
 * floor and cap — a rampage pulls a bigger, denser horde onto the screen.
 */
export function lureMult(state: GameState): number {
  return 1 + menaceStage(state) * MENACE.lurePerStage;
}

/**
 * Bank the menace from one kill: the flat pace tick plus the overkill (damage
 * dealt beyond the mob's remaining hp on the killing blow). Overkill also
 * dinner-bells the nearby horde in immediately via the spawner's walk-credit.
 * Emits `menaceRose` when the kill tips the meter into a new stage so the app
 * can sound the escalation. Called from hitEnemy on every kill.
 */
export function bankMenace(state: GameState, overkill: number): void {
  const before = menaceStage(state);
  const gain = MENACE.perKill + Math.max(0, overkill) * MENACE.perOverkill;
  state.menace = Math.min(MENACE.max, state.menace + gain);
  state.moveSpawnCredit += Math.max(0, overkill) * MENACE.lureCreditPerOverkill;
  const after = menaceStage(state);
  if (after > before) state.events.push({ type: "menaceRose", stage: after });
}

/** Bleed menace off over time — stop killing and the horde cools. */
export function decayMenace(state: GameState, dtMs: number): void {
  if (state.menace <= 0) return;
  state.menace = Math.max(0, state.menace - (MENACE.decayPerSec * dtMs) / 1000);
}

/**
 * The scale an elite or boss locks in the moment it engages, so the fight
 * matches the player's power: a non-decaying floor from the player's LEVEL
 * plus the current menace heat. Always ≥ 1.
 */
export function enemyPowerScale(state: GameState): number {
  return (
    1 +
    Math.max(0, state.player.level - 1) * MENACE.bossLevelWeight +
    menaceStage(state) * MENACE.bossMenaceWeight
  );
}

/**
 * Scale an elite/boss to the player's power the first time it engages —
 * called from both sides of the fight (the player's first blow in hitEnemy,
 * and the mob waking in moveEnemy), so whichever lands first applies it.
 * Idempotent: `powerScaled` latches it to exactly once. Hp scales in full
 * (preserving the current hp fraction); contact damage scales by a softened
 * share so a tanky boss threatens without one-shotting.
 */
export function maybePowerScale(state: GameState, enemy: Enemy): void {
  if (enemy.powerScaled) return;
  if (enemyDef(enemy.defId).role === "minion") return;
  enemy.powerScaled = true;
  const scale = enemyPowerScale(state);
  enemy.contactMult = 1 + (scale - 1) * MENACE.bossContactShare;
  if (scale <= 1) return;
  const frac = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
  enemy.maxHp = Math.round(enemy.maxHp * scale);
  enemy.hp = Math.max(1, Math.round(enemy.maxHp * frac));
}
