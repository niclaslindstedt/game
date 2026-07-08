// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered player.
// The meter heats from the player's ACTUAL combat output — rolling
// damage-per-second and kill rate (tickMenace) — with an extra jolt from
// OVERKILL on a killing blow (bankOverkill); idling bleeds it back off. Menace
// is read as an integer "stage" (0…10) that drives three responses (all tuned
// in config MENACE):
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
import { difficultyDef } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import type { Enemy, GameState } from "./types.ts";

/** The current evolution stage: menace bucketed into [0, MENACE.maxStage]. */
export function menaceStage(state: GameState): number {
  return Math.min(MENACE.maxStage, Math.floor(state.menace / MENACE.perStage));
}

/**
 * The early-game warmup factor, easing from `warmupFloor` at level 1 up to 1.0
 * by player level `1 + warmupLevels`. A fresh hero's menace gain is damped so
 * hard that (on a fair difficulty) the meter can't outrun its decay in the
 * opening levels — reaching rampage stage 1 is effectively impossible until the
 * player has grown into real power. The non-zero floor is what a very sensitive
 * difficulty multiplies through so JESUS still bites from the first kills.
 */
export function menaceWarmup(state: GameState): number {
  const t = Math.min(
    1,
    Math.max(0, (state.player.level - 1) / MENACE.warmupLevels),
  );
  return MENACE.warmupFloor + (1 - MENACE.warmupFloor) * t;
}

/**
 * How hard the meter reacts to the player's output right now: the difficulty's
 * `menaceMult` (EASY barely reacts; JESUS is scalding) times the early-game
 * `menaceWarmup`. All menace gain — the rolling DPS/kill-rate heat in
 * `tickMenace` and the overkill jolt in `bankOverkill` — is scaled by this, so
 * whether an overpowered run rampages, and how fast, is set by difficulty and
 * progression rather than raw output alone.
 */
export function menaceSensitivity(state: GameState): number {
  return difficultyDef(state.difficulty).menaceMult * menaceWarmup(state);
}

/** The hp multiplier a minion spawned at evolution `stage` carries. */
export function evolutionHpMult(stage: number): number {
  return 1 + Math.max(0, stage) * MENACE.hpPerStage;
}

/**
 * The toughness the whole horde — rank-and-file minions included — locks in
 * from the player's LEVEL alone: a non-decaying floor of `mobHpPerLevel` extra
 * hp per level above 1. Stamped at spawn (see spawnEnemy), so a levelled hero
 * meets a proportionally sturdier swarm instead of mowing it down, and — since
 * kill xp is hp-proportional — is paid more xp per kill for the trouble. This
 * is the progression half of keeping the fight honest; the menace EVOLUTION
 * stage (`evolutionHpMult`) is the moment-to-moment overkill half, and the two
 * multiply together. Always ≥ 1.
 */
export function mobLevelScale(state: GameState): number {
  return 1 + Math.max(0, state.player.level - 1) * MENACE.mobHpPerLevel;
}

/**
 * The tier bonus a minion's drop rolls from the player's LEVEL — better gear to
 * match the tougher horde `mobLevelScale` produces (`tierBonusPerLevel` per
 * level above 1). Stacks with the menace evolution stage's `tierBonusPerStage`
 * and the mob's own `dropProfile`, read in `dropMinionLoot`.
 */
export function mobLevelTierBonus(state: GameState): number {
  return Math.max(0, state.player.level - 1) * MENACE.tierBonusPerLevel;
}

/**
 * The live-crowd multiplier the menace stage applies to the wave spawner's
 * floor and cap — a rampage pulls a bigger, denser horde onto the screen.
 */
export function lureMult(state: GameState): number {
  return 1 + menaceStage(state) * MENACE.lurePerStage;
}

/**
 * An overpowered kill's answer, keyed to the killing blow's OVERKILL. Overkill
 * is the blow's `damage` beyond the mob's FULL health (`damage − maxHp`), so a
 * hit that merely finishes off an already-wounded mob is NOT overkill — only a
 * blow big enough to have dropped the mob outright, with power to spare, counts.
 * It both (1) jolts the menace meter up instantly and (2) dinner-bells the
 * nearby horde over RIGHT NOW via spawner walk-credit, so a big hit is answered
 * within seconds. The meter jolt is measured in HEALTHBARS of overkill
 * (overkill ÷ maxHp) and scaled by `menaceSensitivity`, so a fair,
 * level-appropriate kill barely moves it while one-shotting a mob for several
 * times its health — being wildly stronger than the horde — escalates on the
 * spot, a spike on top of the rolling DPS/kill-rate heat in `tickMenace`. Emits
 * `menaceRose` if the jolt tips into a new stage. Called from hitEnemy on every
 * kill with the (crit-adjusted) killing-blow damage and the victim's max hp.
 */
export function bankOverkill(
  state: GameState,
  damage: number,
  maxHp: number,
): void {
  const spike = Math.max(0, damage - maxHp);
  state.moveSpawnCredit += spike * MENACE.lureCreditPerOverkill;
  if (spike <= 0 || maxHp <= 0) return;
  const healths = spike / maxHp;
  const before = menaceStage(state);
  state.menace = Math.min(
    MENACE.max,
    state.menace + healths * MENACE.perOverkill * menaceSensitivity(state),
  );
  const after = menaceStage(state);
  if (after > before) state.events.push({ type: "menaceRose", stage: after });
}

/**
 * Advance the meter one step from the player's ACTUAL combat output. The
 * per-step damage and kills feed rolling DPS / kill-rate estimates (EMAs
 * smoothed over `rateWindowSec`), and the meter heats in proportion to them:
 * the harder and faster you are clearing, the faster it climbs; idle output
 * lets `decayPerSec` bleed it back off. Emits `menaceRose` when the tick tips
 * the meter into a new stage so the app can sound the escalation. Replaces the
 * old per-kill banking + separate decay pass — called once per `step()`.
 */
export function tickMenace(
  state: GameState,
  dtMs: number,
  damageDealt: number,
  kills: number,
): void {
  const dt = dtMs / 1000;
  if (dt <= 0) return;

  // Fold this step's output into the rolling estimates. alpha is the fraction
  // of the window one step covers, so the EMA tracks roughly the last
  // `rateWindowSec` of fighting and a lone burst can't spike it.
  const alpha = Math.min(1, dt / MENACE.rateWindowSec);
  state.combatDps += (damageDealt / dt - state.combatDps) * alpha;
  state.combatKillRate += (kills / dt - state.combatKillRate) * alpha;

  const before = menaceStage(state);
  const gain =
    (state.combatDps * MENACE.perDps +
      state.combatKillRate * MENACE.perKillRate) *
    menaceSensitivity(state);
  const next = state.menace + (gain - MENACE.decayPerSec) * dt;
  state.menace = Math.max(0, Math.min(MENACE.max, next));
  const after = menaceStage(state);
  if (after > before) state.events.push({ type: "menaceRose", stage: after });
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
