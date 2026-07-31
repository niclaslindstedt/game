// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Set-piece MECHANICS — the telegraphed moves and turns that make elites and
// bosses categorically harder than fat minions. All of it is opt-in def data;
// every dangerous move is TELEGRAPHED (the mob roots for the windup and the
// app sells it off the `enemyTelegraph` event), so the answer to a set piece
// is reading and dodging it, not out-statting it. Kept out of step/ so the
// move rules read in one place; moveEnemy calls `stepEnemyMechanics` first
// and stands down for any tick a mechanic owns.
//
// THERE ARE TWO AUTHORING PATHS INTO THIS FILE, and the difference is the
// point of the whole module:
//   • THE FOUR ORIGINALS — `charge`, `slam`, `enrage`, `summon` — are named
//     FIELDS on `EnemyMechanics`, and they are stepped inline below. They are
//     also the reason every boss in the game used to read the same: four
//     fields is the entire vocabulary a fight could be written in, so each
//     boss was a permutation rather than a character.
//   • THE ABILITY CATALOG — `EnemyMechanics.abilities`, a LIST of named
//     entries (see defs/enemies/abilities.ts) each stepped by its own module
//     in this directory and registered by id in ./catalog.ts. Adding one is
//     data plus a module; nothing here grows a member per idea.
// New moves go in the catalog. The four originals stay named fields because a
// pile of content already authors them that way and rewriting it would buy
// nothing — they are the catalog's grandfathered entries, not its future.

import { direction, distance } from "@game/lib/vec.ts";
import { PLAYER } from "../config/index.ts";
import { spawnEnemy } from "../create.ts";
import type { BossAbility } from "../defs/enemies/abilities.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import type { EnemyDef, EnemyMechanics } from "../defs/enemies/types.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import { currentMobLevel, menaceStage, mobLevelScale } from "../menace.ts";
import { lineOfSight } from "../obstacles.ts";
import type { Enemy, GameState } from "../types/index.ts";
import {
  abilityHandler,
  abilityUnlocked,
  abilityWindupMs,
  type AbilityCtx,
} from "./catalog.ts";
import {
  groundMoveCanTouch,
  landHostileBlow,
  mobBlowDamage,
} from "./shared.ts";

// The catalog's ability modules, imported for their registration side effect.
// A new ability is added HERE and nowhere else in the engine.
import "./laser-eyes.ts";
import "./flag-plant.ts";
import "./coin-cannon.ts";
import "./bait-drop.ts";
import "./airstrike.ts";
import "./call-horde.ts";
import "./recompile.ts";
import "./lockdown.ts";
// The ELITE TIER — personal moves built out of the hero's own vocabulary.
import "./orbit-guard.ts";
import "./seeker-volley.ts";
import "./ember-trail.ts";
import "./shock-pulse.ts";
import "./blink-strike.ts";
import "./rally-cry.ts";
import "./snare-field.ts";
import "./siphon-tether.ts";
import "./ward-shield.ts";
import "./quake-line.ts";

/** How much further than its trigger range a charge dash carries (the mob
 * overshoots the spot the player stood on, like a real bull rush). */
const CHARGE_OVERSHOOT = 1.3;

/** The charge's default contact multiplier while dashing. */
const CHARGE_DAMAGE_MULT = 1.5;

// Re-exported from the ONE module that imports every ability, so a caller
// asking "what may a def name?" gets the answer AFTER the whole catalog has
// registered itself. Reaching for `catalog.ts` directly would answer with an
// empty registry unless the caller happened to import the modules too — which
// is precisely the trap the mod SDK's own catalog generator would fall into.
export { registeredAbilityIds } from "./catalog.ts";

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
  const mech = enemy.mech;
  if (!mech) return 1;
  const enrage = activeMechanics(enemy, def)?.enrage;
  let mult = mech.enraged && enrage ? enrage.speedMult : 1;
  // A RALLY CRY's lift (mechanics/rally-cry.ts). Folded in here rather than
  // given a pass of its own precisely because this hook is already called for
  // EVERY body on the field — which is what lets a shout reach minions, who
  // never step their own mechanics at all.
  if (mech.rallyMs && mech.rallyMs > 0) mult *= mech.rallySpeedMult ?? 1;
  return mult;
}

/**
 * Burn down a RALLY's lift on whoever is carrying it. Called at the top of
 * `stepEnemyMechanics`, BEFORE the role gate below turns minions away — the
 * whole point of the shout is that it lands on the horde, and the horde is
 * exactly what that gate excludes.
 */
function tickRally(enemy: Enemy, dtMs: number): void {
  const mech = enemy.mech;
  if (!mech?.rallyMs) return;
  mech.rallyMs = Math.max(0, mech.rallyMs - dtMs);
  if (mech.rallyMs <= 0) {
    mech.rallyMs = undefined;
    mech.rallySpeedMult = undefined;
    mech.rallyDamageMult = undefined;
  }
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
  // A RALLY CRY's lift — see `mechSpeedMult` for why it rides these two hooks.
  if (mech.rallyMs && mech.rallyMs > 0) mult *= mech.rallyDamageMult ?? 1;
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
  // A RALLY's lift is carried by whoever was SHOUTED AT — which is mostly
  // minions, and the gate below turns minions away. So it burns down first.
  tickRally(enemy, dtMs);
  const mechanics = activeMechanics(enemy, def);
  if (!mechanics || def.role === "minion" || def.apparition) return false;
  const mech = (enemy.mech ??= {});
  const player = state.players[0];

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
  const abilityClocks = mech.abilityCooldownMs;
  if (abilityClocks) {
    for (const id in abilityClocks) {
      const left = abilityClocks[id];
      if (left) abilityClocks[id] = Math.max(0, left - dtMs);
    }
  }

  const ctx: AbilityCtx = {
    state,
    enemy,
    def,
    mech,
    dt,
    dtMs,
    distance: distance(enemy.pos, player.pos),
  };

  // A catalog ability still RUNNING (a beam mid-sweep) owns the tick before
  // anything else is considered — including the enrage turn below, which only
  // latches multipliers and never needs to interrupt a move in progress.
  const running = stepRunningAbility(mechanics, ctx);
  if (running) return true;

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
    } else if (telegraph.kind !== "charge" && telegraph.kind !== "slam") {
      // Hand the ability the bearing its windup locked. The telegraph itself
      // is already gone (clearing it is what un-roots the mob), so this is the
      // only surviving copy — see `AbilityCtx.lockedDir`.
      ctx.lockedDir = telegraph.dir;
      ctx.lockedDistance = telegraph.dist;
      // A CATALOG ability's windup ran out: commit it. The cooldown is started
      // there rather than inside the handler so no ability can forget to, and
      // it counts from the CAST — a move's cooldown is the gap between casts,
      // which is what a player actually learns to count.
      castAbility(mechanics, ctx, telegraph.kind);
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
  // THE CATALOG's abilities, in AUTHORED ORDER — the boss's own kit, checked
  // after the point-blank punish above (a slam answers "you got too close",
  // which should always win) and before the charge, so a boss with a signature
  // move leads with it rather than defaulting to the engine's stock rush.
  if (startReadyAbility(mechanics, ctx)) return true;

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
        // Summoned adds swell the horde like a wave spawn — count them so a
        // boss's endless summons hold the clearance gate shut (see tickMenace).
        if (enemyDef(summon.defId).role === "minion")
          state.pendingMinionSpawns++;
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
  // A jump sails clean over it, exactly like contact — the readable answer.
  if (!groundMoveCanTouch(state)) return;
  if (distance(state.players[0].pos, enemy.pos) > radius + PLAYER.radius)
    return;
  const def = enemyDef(enemy.defId);
  landHostileBlow(
    state,
    mobBlowDamage(enemy, def.contactDamage, damageFrac),
    enemy.mlvl,
    enemy.defId,
    enemy,
    state.rng() < def.critChance,
  );
}

// ─── THE ABILITY CATALOG's half of the tick ─────────────────────────────────
// Three small functions, and between them they are everything the engine knows
// about an ability: which of a boss's are live on this rung, whether one is
// still running, and how one gets started. No ability's name appears here.

/** The abilities live on the rung being played, in authored order. */
function liveAbilities(
  mechanics: EnemyMechanics,
  state: GameState,
): BossAbility[] {
  const list = mechanics.abilities;
  if (!list || list.length === 0) return [];
  return list.filter((a) => abilityUnlocked(a, state.difficulty));
}

/**
 * Advance whatever a previous cast left running (a beam mid-sweep). Returns
 * true while it owns the mob's tick — a boss planted mid-move must not also be
 * walking, which is precisely what makes the move readable.
 */
function stepRunningAbility(
  mechanics: EnemyMechanics,
  ctx: AbilityCtx,
): boolean {
  for (const ability of liveAbilities(mechanics, ctx.state)) {
    const handler = abilityHandler(ability.id);
    if (!handler?.step) continue;
    if (handler.step(ability as never, ctx as never)) return true;
  }
  return false;
}

/**
 * Begin the WINDUP of the first ability that is off cooldown and says it is
 * ready. The windup — the tell — is started here rather than by the handler,
 * so no ability in the catalog can ever ship without one. The bearing is
 * locked NOW, at the start of the tell, for exactly the charge's reason: the
 * player who keeps moving is not where the move arrives.
 */
function startReadyAbility(
  mechanics: EnemyMechanics,
  ctx: AbilityCtx,
): boolean {
  const { state, enemy, mech } = ctx;
  for (const ability of liveAbilities(mechanics, state)) {
    if (mech.abilityCooldownMs?.[ability.id]) continue;
    const handler = abilityHandler(ability.id);
    if (!handler) continue;
    if (!handler.ready(ability as never, ctx as never)) continue;
    const ms = abilityWindupMs(ability, state.difficulty);
    const dir = direction(enemy.pos, state.players[0].pos);
    // The bearing AND the range are both locked here — see `AbilityCtx`.
    mech.telegraph = {
      kind: ability.id,
      remainingMs: ms,
      dir,
      dist: ctx.distance,
    };
    state.events.push({
      type: "enemyTelegraph",
      kind: ability.id,
      pos: { ...enemy.pos },
      defId: enemy.defId,
      ms,
      dir,
    });
    return true;
  }
  return false;
}

/**
 * The windup ran out: commit the ability, start its cooldown, and — the FIRST
 * time this mob casts it — shout its bark. The bark is free teaching in the
 * character's own voice, delivered exactly once so it names a move the player
 * is meeting rather than nagging about one they have learned.
 */
function castAbility(
  mechanics: EnemyMechanics,
  ctx: AbilityCtx,
  id: BossAbility["id"],
): void {
  const { state, enemy, mech } = ctx;
  const ability = liveAbilities(mechanics, state).find((a) => a.id === id);
  const handler = ability && abilityHandler(id);
  if (!ability || !handler) return;
  handler.cast(ability as never, ctx as never);
  (mech.abilityCooldownMs ??= {})[id] = ability.cooldownMs;
  const cast = (mech.abilityCast ??= []);
  if (ability.bark && ability.bark.length > 0 && !cast.includes(id)) {
    cast.push(id);
    state.events.push({
      type: "bossBark",
      pos: { ...enemy.pos },
      defId: enemy.defId,
      lines: ability.bark,
    });
  }
}
