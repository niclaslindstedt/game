// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Set-piece MECHANICS — the telegraphed moves and turns that make elites and
// bosses categorically harder than fat minions (see EnemyMechanics in
// defs/enemies/types.ts): the charge, the ground slam, the enrage turn, the
// add summon, and the hp-breakpoint phases that re-select among them. All of
// it is opt-in def data; every dangerous move is TELEGRAPHED (the mob roots
// for the windup and the app sells it off the `enemyTelegraph` event), so the
// answer to a set piece is reading and dodging it, not out-statting it.
// Kept out of step.ts so the move rules read in one place; moveEnemy calls
// `stepEnemyMechanics` first and stands down for any tick a mechanic owns.

import { direction, distance } from "@game/lib/vec.ts";
import { JUMP, PLAYER, STATS } from "./config.ts";
import { spawnEnemy } from "./create.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import type { EnemyDef, EnemyMechanics } from "./defs/enemies/types.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { armorReduction, wearWornArmor } from "./items.ts";
import { queueStruckProcs } from "./loot.ts";
import { currentMobLevel, menaceStage, mobLevelScale } from "./menace.ts";
import { lineOfSight } from "./obstacles.ts";
import { BALANCE } from "./tuning.ts";
import type { Enemy, GameState } from "./types.ts";

/** How much further than its trigger range a charge dash carries (the mob
 * overshoots the spot the player stood on, like a real bull rush). */
const CHARGE_OVERSHOOT = 1.3;

/** The charge's default contact multiplier while dashing. */
const CHARGE_DAMAGE_MULT = 1.5;

/**
 * The mechanic set active on this mob RIGHT NOW: the deepest crossed phase's
 * set when the def has `phases`, the base `mechanics` otherwise. A phase
 * REPLACES the base set — composition, not stacking — so a two-phase boss
 * reads as two different fights.
 */
export function activeMechanics(
  enemy: Enemy,
  def: EnemyDef,
): EnemyMechanics | undefined {
  const frac = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
  let active = def.mechanics;
  for (const phase of def.phases ?? []) {
    if (frac <= phase.belowHpFrac) active = phase.mechanics;
  }
  return active;
}

/**
 * The speed multiplier the mob's mechanics put on its ordinary movement —
 * the enrage's fury (1 for everything calm). moveEnemy multiplies through.
 */
export function mechSpeedMult(enemy: Enemy, def: EnemyDef): number {
  const enrage = activeMechanics(enemy, def)?.enrage;
  return enemy.mech?.enraged && enrage ? enrage.speedMult : 1;
}

/**
 * The contact-damage multiplier the mob's mechanics put on its blows: the
 * charge's impact while dashing, the enrage's fury once turned. Read by the
 * contact path in stepEnemies alongside `contactMult`.
 */
export function mechDamageMult(enemy: Enemy, def: EnemyDef): number {
  let mult = 1;
  const mech = enemy.mech;
  if (!mech) return mult;
  if (mech.dashMs && mech.dashMs > 0) mult *= mech.dashDamageMult ?? 1;
  const enrage = activeMechanics(enemy, def)?.enrage;
  if (mech.enraged && enrage) mult *= enrage.damageMult;
  return mult;
}

/**
 * Advance one elite/boss's mechanics for this tick. Returns true when a
 * mechanic OWNS the mob's movement right now — rooted in a windup, or riding
 * a dash — so moveEnemy stands down for the tick. Minions and defs without
 * mechanics fall straight through (one cheap branch).
 */
export function stepEnemyMechanics(
  state: GameState,
  enemy: Enemy,
  dt: number,
  dtMs: number,
): boolean {
  const def = enemyDef(enemy.defId);
  const mechanics = activeMechanics(enemy, def);
  if (!mechanics || def.role === "minion" || def.apparition) return false;
  const mech = (enemy.mech ??= {});
  const player = state.player;

  // Cooldown clocks burn down whatever else happens.
  if (mech.chargeCooldownMs) {
    mech.chargeCooldownMs = Math.max(0, mech.chargeCooldownMs - dtMs);
  }
  if (mech.slamCooldownMs) {
    mech.slamCooldownMs = Math.max(0, mech.slamCooldownMs - dtMs);
  }
  if (mech.summonCooldownMs) {
    mech.summonCooldownMs = Math.max(0, mech.summonCooldownMs - dtMs);
  }

  // THE ENRAGE TURN: latched once, forever. Fires even mid-windup — fury
  // interrupts nothing, it only makes what follows worse.
  const enrage = mechanics.enrage;
  if (
    enrage &&
    !mech.enraged &&
    enemy.maxHp > 0 &&
    enemy.hp <= enemy.maxHp * enrage.belowHpFrac
  ) {
    mech.enraged = true;
    state.events.push({
      type: "enemyEnraged",
      pos: { ...enemy.pos },
      defId: enemy.defId,
    });
  }

  // Mechanics only run once the fight is on: elites use their awake latch,
  // bosses the same derived wakefulness moveEnemy uses (wounded or close).
  const awake =
    def.role === "boss"
      ? enemy.hp < enemy.maxHp ||
        distance(player.pos, enemy.home) < def.ai.aggroRadius ||
        distance(player.pos, enemy.pos) < def.ai.aggroRadius
      : enemy.awake === true;
  // A speaker mid-approach keeps its scene first — no mechanic upstages the
  // dialogue (the rush and stare-down beats stay exactly as authored).
  const speechPending = !enemy.spoke && (def.dialogue?.length ?? 0) > 0;
  if (!awake || speechPending) return false;

  // A WINDUP in progress: rooted until it runs out, then the move fires.
  const telegraph = mech.telegraph;
  if (telegraph) {
    telegraph.remainingMs -= dtMs;
    if (telegraph.remainingMs > 0) return true; // rooted — the readable tell
    mech.telegraph = undefined;
    if (telegraph.kind === "charge" && mechanics.charge && telegraph.dir) {
      const charge = mechanics.charge;
      const chargeSpeed = enemy.speed * charge.speedMult;
      mech.dashDir = telegraph.dir;
      mech.dashMs = ((charge.range * CHARGE_OVERSHOOT) / chargeSpeed) * 1000;
      mech.dashDamageMult = charge.damageMult ?? CHARGE_DAMAGE_MULT;
      mech.chargeCooldownMs = charge.cooldownMs;
    } else if (telegraph.kind === "slam" && mechanics.slam) {
      const slam = mechanics.slam;
      mech.slamCooldownMs = slam.cooldownMs;
      state.events.push({
        type: "enemySlam",
        pos: { ...enemy.pos },
        radius: slam.radius,
        defId: enemy.defId,
      });
      resolveSlamHit(state, enemy, slam.radius, slam.damageFrac);
    }
    return true;
  }

  // A DASH in flight: ride the locked bearing; walls and bounds are resolved
  // by the ordinary post-move passes in stepEnemies.
  if (mech.dashMs && mech.dashMs > 0 && mech.dashDir) {
    mech.dashMs = Math.max(0, mech.dashMs - dtMs);
    const charge = mechanics.charge;
    const chargeSpeed = enemy.speed * (charge?.speedMult ?? 3);
    enemy.pos.x += mech.dashDir.x * chargeSpeed * dt;
    enemy.pos.y += mech.dashDir.y * chargeSpeed * dt;
    return true;
  }

  // Ready checks, most dramatic first: SLAM (point blank) beats CHARGE.
  const dist = distance(enemy.pos, player.pos);
  const slam = mechanics.slam;
  if (slam && !mech.slamCooldownMs && dist <= slam.radius * 0.9) {
    mech.telegraph = { kind: "slam", remainingMs: slam.windupMs };
    state.events.push({
      type: "enemyTelegraph",
      kind: "slam",
      pos: { ...enemy.pos },
      defId: enemy.defId,
      ms: slam.windupMs,
    });
    return true;
  }
  const charge = mechanics.charge;
  if (
    charge &&
    !mech.chargeCooldownMs &&
    dist <= charge.range &&
    dist > enemy.speed * 0.2 && // pointless at contact — let the bite land
    lineOfSight(state, enemy.pos, player.pos)
  ) {
    // The bearing LOCKS now, at the start of the windup — the whole point:
    // the player who keeps moving is not where the bull arrives.
    const dir = direction(enemy.pos, player.pos);
    mech.telegraph = { kind: "charge", remainingMs: charge.windupMs, dir };
    state.events.push({
      type: "enemyTelegraph",
      kind: "charge",
      pos: { ...enemy.pos },
      defId: enemy.defId,
      ms: charge.windupMs,
      dir,
    });
    return true;
  }

  // SUMMON runs alongside the ordinary hunt — calling for help is not a
  // roots-you move, so it never owns the tick.
  const summon = mechanics.summon;
  if (summon && !mech.summonCooldownMs) {
    mech.summons = (mech.summons ?? []).filter((id) =>
      state.enemies.some((e) => e.id === id && e.hp > 0),
    );
    if (mech.summons.length < summon.maxAlive) {
      const room = summon.maxAlive - mech.summons.length;
      const count = Math.min(summon.count, room);
      for (let i = 0; i < count; i++) {
        const angle = state.rng() * Math.PI * 2;
        const ring = enemyDef(enemy.defId).radius + 26;
        const pos = {
          x: Math.min(
            Math.max(enemy.pos.x + Math.cos(angle) * ring, 8),
            state.level.width - 8,
          ),
          y: Math.min(
            Math.max(enemy.pos.y + Math.sin(angle) * ring, 8),
            state.level.height - 8,
          ),
        };
        const add = spawnEnemy(
          summon.defId,
          pos,
          state.rng,
          state.nextId++,
          mobLevelScale(state),
          menaceStage(state),
          difficultyDef(state.difficulty).menaceEffectMult,
          currentMobLevel(state),
        );
        add.awake = true; // called to the fight, not to a nap
        state.enemies.push(add);
        mech.summons.push(add.id);
      }
      if (count > 0) {
        mech.summonCooldownMs = summon.cooldownMs;
        state.events.push({
          type: "enemySummoned",
          pos: { ...enemy.pos },
          defId: enemy.defId,
          count,
        });
      }
    }
  }

  return false;
}

/**
 * Land the slam on the player: grounded inside the radius takes
 * `contactDamage × damageFrac` through the ordinary armor curve (a jump
 * clears it exactly like contact — the readable answer). No dodge roll: the
 * windup WAS the dodge window.
 */
function resolveSlamHit(
  state: GameState,
  enemy: Enemy,
  radius: number,
  damageFrac: number,
): void {
  const player = state.player;
  if (player.z > JUMP.dodgeHeight) return;
  if (player.disarmed) return; // pre-combat grace, same as contact
  if (distance(player.pos, enemy.pos) > radius + PLAYER.radius) return;
  const def = enemyDef(enemy.defId);
  const crit = state.rng() < def.critChance;
  const damage = Math.round(
    def.contactDamage *
      damageFrac *
      (enemy.contactMult ?? 1) *
      (crit ? STATS.critMultiplier : 1) *
      BALANCE.mobDamage,
  );
  const hpDamage = Math.max(
    0,
    Math.round(damage * (1 - armorReduction(state, enemy.mlvl))),
  );
  wearWornArmor(state);
  player.hp -= hpDamage;
  player.hurtFlashMs = 250;
  state.stats.damageTaken += damage;
  state.events.push({ type: "playerHurt", crit });
  // The slam that lands may cast back — the D2 "when struck" procs.
  queueStruckProcs(state, enemy);
}
