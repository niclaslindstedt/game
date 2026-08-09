// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EFFECT LIBRARY — one implementation per effect, shared by every CARRIER.
//
// An orbiting ring, a storm, a homing volley, a collapsing singularity, a
// burning aura: each of these used to exist TWICE. Once in `stepAbilities` /
// `stepPowerups` for the timed POWERUP that grants it, and once in
// `stepItemSpells` for the always-on GRANTED SPELL that grants the same thing —
// same ring, same candidate prefilter, same `hitEnemy` path, two files, drifting
// apart by construction.
//
// So the effect lives here ONCE and the carriers supply only what genuinely
// differs between them:
//
//   • the PARAMS. A powerup's are the flat authored numbers on its own block; a
//     granted spell's are a rank curve (`<kind>SpellBlock`, and stasis's own
//     `stasisSpellParams`) that INTELLIGENCE quickens. Both hand this module
//     the SAME block shape, which is the whole trick — a rank curve is just
//     another way of arriving at an `OrbitBlock`.
//   • the SCRATCH. The sweep angle and the ms to the next bite. Both carriers
//     already kept exactly these two fields (`ActiveAbility`, `ItemSpell`), so
//     neither had to grow state to move here.
//   • the BILLING. A temporary powerup's output is EXEMPT from the menace meter
//     (`noMenace`) — it is a pickup, not the hero's own strength; a granted
//     spell's is the hero's permanent build power and heats the meter like a
//     weapon blow. `bill()` is called ONCE per bite round, so every hit of one
//     sweep, volley or collapse shares an attack id (see `bankOverkill`).
//
// Nothing here reads a def, a rank, or a carrier: hand it a block and it runs.
// That is what lets a MOD compose these effects onto a powerup of its own
// without the engine learning anything new — and what stops the powerup half
// and the spell half of the same effect ever disagreeing again.

import { direction, distanceSq, moveToward } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { enemyDef } from "./defs/enemies/index.ts";
import type { AbilityDef } from "./defs/abilities.ts";
import {
  orbRingPositions,
  setAbilityClock,
  tickAbilityClock,
} from "./abilities.ts";
import { hitEnemy } from "./loot.ts";
import { seatOf } from "./party.ts";
import { nearestEnemy } from "./step/weapon.ts";
import type { ActiveAbility, Enemy, GameState, Player } from "./types/index.ts";
import { inert, inertEnemy } from "./disposition.ts";

/** The two scratch fields every timed effect keeps between ticks. A carrier
 * owns the storage; this module only reads and writes through it. */
export type EffectScratch = {
  /** The sweep angle in radians (orbit only). */
  angle: number;
  /** Ms until this effect's next bite. Already decremented by the caller. */
  cooldownMs: number;
};

/**
 * How one bite round's damage is billed. Called ONCE per round rather than per
 * victim, so the whole round shares an attack id and the menace meter judges a
 * sweep as one blow instead of as eight.
 *
 * Typed off `hitEnemy` itself rather than restated, so a new option can never
 * be one this module silently drops. Takes the state and the OWNING hero
 * rather than closing over them so every carrier's billing is a module
 * CONSTANT — a closure minted per effect per frame is exactly the 60 Hz
 * allocation the house rules forbid. The hero rides out as the round's
 * `attacker`, so a power a joiner carries bills its crits, procs and kill
 * pricing to the joiner rather than to seat 0.
 */
export type EffectBilling = (
  state: GameState,
  owner: Player,
) => Parameters<typeof hitEnemy>[4];

/**
 * The enemies whose own bodies reach inside `radius` of `center`, in enemy-list
 * order — apparitions (cold air, never targets) skipped.
 *
 * Snapshotted into a scratch array the CALLER owns, so a pass can bill each
 * victim without `hitEnemy`'s splices walking the live list out from under it,
 * and two passes in the same frame can't alias one buffer. A fresh array per
 * tick at 60 Hz is avoidable GC pressure, which is why the buffer is passed in
 * rather than allocated here.
 */
export function enemiesInReach(
  state: GameState,
  center: Vec2,
  radius: number,
  scratch: Enemy[],
): Enemy[] {
  scratch.length = 0;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    if (inert(def, enemy)) continue;
    const reach = radius + def.radius;
    if (distanceSq(enemy.pos, center) <= reach * reach) scratch.push(enemy);
  }
  return scratch;
}

/** This module's own prefilter buffer — the orbit and immolation rings, which
 * never run inside one another. */
const reachScratch: Enemy[] = [];

// ---------------------------------------------------------------------------
// Carrier bridges.
//
// A running POWERUP keeps its clocks per block (`ActiveAbility.clocks`) and its
// sweep angle once; the effect library wants both as one `EffectScratch`. These
// two bridge between them WITHOUT allocating: one object is reused for the
// whole run rather than one per effect per frame, which at 60 Hz × several
// effects is the difference between no garbage and a steady drip of it.
//
// The contract that buys that: `abilityScratch` must be COMMITTED before the
// next call to it. Every carrier does exactly `scratch → apply → commit`.
// ---------------------------------------------------------------------------

const scratchBridge: EffectScratch = { angle: 0, cooldownMs: 0 };

/** `block`'s scratch on `ability`, with its clock already run down by `dtMs`. */
export function abilityScratch(
  ability: ActiveAbility,
  block: string,
  dtMs: number,
): EffectScratch {
  scratchBridge.angle = ability.angle;
  scratchBridge.cooldownMs = tickAbilityClock(ability, block, dtMs);
  return scratchBridge;
}

/** Write `block`'s scratch back onto the running power. */
export function commitAbilityScratch(
  ability: ActiveAbility,
  block: string,
  scratch: EffectScratch,
): void {
  ability.angle = scratch.angle;
  setAbilityClock(ability, block, scratch.cooldownMs);
}

/** A POWERUP's output is exempt from the menace meter — a pickup is not the
 * hero's own strength, so it must not make the horde answer for it. The blow
 * is still the carrier's own (`attacker`). */
export const powerupBilling: EffectBilling = (state, owner) => ({
  noMenace: true,
  attacker: owner,
});

/**
 * A GRANTED SPELL's output is the hero's permanent build power, so it heats the
 * menace meter like any weapon blow. Each bite round takes its own attack id,
 * so one sweep, one collapse or one aura tick is judged as ONE blow however
 * many bodies it caught (see `bankOverkill`).
 */
export const spellBilling: EffectBilling = (state, owner) => ({
  attack: state.nextId++,
  attacker: owner,
});

/** The billing the granted STORM has always used: a single bolt into a single
 * body needs neither an exemption nor a grouping id — only its owner. */
export const plainBilling: EffectBilling = (state, owner) => ({
  attacker: owner,
});

/**
 * ORBIT: projectiles circling the hero, mangling what they touch.
 *
 * Every orb rides a circle of `radius`, so only enemies within that ring plus
 * the touch reach can be struck — gathered ONCE and scanned by every orb,
 * rather than each orb walking the whole horde (the shape both carriers had
 * independently arrived at).
 *
 * Advances the sweep every tick; bites only when the clock is up, and re-arms
 * it only if something was actually hit — a ring sweeping empty air keeps its
 * bite ready for the moment a body walks into it.
 */
export function applyOrbit(
  state: GameState,
  player: Player,
  orbit: NonNullable<AbilityDef["orbit"]>,
  scratch: EffectScratch,
  dt: number,
  power: number,
  bill: EffectBilling,
): void {
  scratch.angle += orbit.angularSpeed * dt;
  if (scratch.cooldownMs > 0) return;
  const candidates = enemiesInReach(
    state,
    player.pos,
    orbit.radius + orbit.orbRadius,
    reachScratch,
  );
  if (candidates.length === 0) return;

  let struck = false;
  const options = bill(state, player);
  const orbs = orbRingPositions(
    player,
    scratch.angle,
    orbit.count,
    orbit.radius,
  );
  for (const orb of orbs) {
    let victim: Enemy | undefined;
    for (const enemy of candidates) {
      if (enemy.hp <= 0) continue; // slain by an earlier orb this tick
      const reach = enemyDef(enemy.defId).radius + orbit.orbRadius;
      if (distanceSq(enemy.pos, orb) <= reach * reach) {
        victim = enemy;
        break;
      }
    }
    if (!victim) continue;
    // Conjured effects crit off INTELLIGENCE, like the magic they are.
    hitEnemy(state, victim, orbit.damage * power, "magic", options);
    struck = true;
  }
  if (struck) scratch.cooldownMs = orbit.hitCooldownMs;
}

/**
 * STORM: a bolt strikes the nearest body on an interval. Holds its clock when
 * nothing is in reach, so the first foe to wander in is struck at once.
 */
export function applyStorm(
  state: GameState,
  player: Player,
  storm: NonNullable<AbilityDef["storm"]>,
  scratch: EffectScratch,
  power: number,
  bill: EffectBilling,
): void {
  if (scratch.cooldownMs > 0) return;
  // The bolt strikes only what its owner can SEE (sight.ts, through
  // `nearestEnemy`): the storm reaches 300 px and half a landscape screen is
  // ~97 px down, so without the gate it spent itself on mobs the player had no
  // picture of — thunder off the top of the frame.
  const victim = nearestEnemy(state, player.pos, storm.range, player);
  if (!victim) return;
  scratch.cooldownMs = storm.intervalMs;
  state.events.push({ type: "lightning", pos: { ...victim.pos } });
  hitEnemy(state, victim, storm.damage * power, "magic", bill(state, player));
}

/**
 * VOLLEY: shots loose themselves at the nearest body on an interval, fanned
 * across `spread` so a multi-shot volley spreads over a pack instead of
 * stacking into one line.
 *
 * Damage is pre-scaled by `power` HERE — the shots resolve later, in
 * `stepProjectiles`, which cannot re-ask the ability scale — and every shot of
 * one volley shares an id so its hits group like a trigger pull's pellets.
 * Holds the shot AND the clock when nothing is in range — and "in range" is
 * the owner's SIGHT as much as the reach (`nearestEnemy`): a volley never
 * looses itself at a pack the player is not being shown.
 */
export function applyVolley(
  state: GameState,
  player: Player,
  volley: NonNullable<AbilityDef["volley"]>,
  scratch: EffectScratch,
  power: number,
): void {
  if (scratch.cooldownMs > 0) return;
  const mark = nearestEnemy(state, player.pos, volley.range, player);
  if (!mark) return;
  scratch.cooldownMs = volley.intervalMs;

  const aim = direction(player.pos, mark.pos);
  const volleyId = state.nextId++;
  for (let i = 0; i < volley.count; i++) {
    const offset =
      volley.count > 1 ? (i / (volley.count - 1) - 0.5) * volley.spread : 0;
    const cos = Math.cos(offset);
    const sin = Math.sin(offset);
    state.projectiles.push({
      id: state.nextId++,
      pos: { ...player.pos },
      dir: { x: aim.x * cos - aim.y * sin, y: aim.x * sin + aim.y * cos },
      speed: volley.speed,
      radius: volley.radius,
      damage: volley.damage * power,
      lifetimeMs: volley.lifetimeMs,
      weaponClass: "magic",
      sprite: volley.sprite,
      homing: volley.homing,
      pierceLeft: volley.pierce,
      burst: volley.burst,
      volley: volleyId,
      // Whose power looses these shots — the impact bills their crits, procs
      // and kill pricing to this seat (stepProjectiles).
      seat: seatOf(state, player),
      z: 0,
    });
  }
}

/**
 * SINGULARITY: a vortex collapses on the nearest cluster every interval — every
 * body within reach is dragged toward the core and crushed.
 *
 * Unlike a `well`, which is a core PLACED where the power was spent and dragging
 * continuously, a singularity re-centres on the horde at each collapse: it is a
 * periodic event with a position, not a thing standing on the field. Victims are
 * snapshotted before `hitEnemy` splices the list.
 *
 * The SEED it collapses on is picked through the owner's sight
 * (`nearestEnemy`), so the vortex opens somewhere the player can watch it —
 * everything inside its radius is then dragged in, seen or not, because a
 * visible collapse pulling half a visible pack would be the odder rule.
 */
export function applySingularity(
  state: GameState,
  player: Player,
  singularity: NonNullable<AbilityDef["singularity"]>,
  scratch: EffectScratch,
  power: number,
  bill: EffectBilling,
): void {
  if (scratch.cooldownMs > 0) return;
  const seed = nearestEnemy(state, player.pos, singularity.range, player);
  if (!seed) return;
  scratch.cooldownMs = singularity.intervalMs;

  const center = { ...seed.pos };
  state.events.push({
    type: "singularity",
    pos: { ...center },
    radius: singularity.radius,
  });
  const reachSq = singularity.radius * singularity.radius;
  const victims = state.enemies.filter(
    (e) => !inertEnemy(e) && distanceSq(e.pos, center) <= reachSq,
  );
  const options = bill(state, player);
  for (const victim of victims) {
    if (victim.hp <= 0) continue;
    victim.pos = moveToward(victim.pos, center, singularity.pull);
    hitEnemy(state, victim, singularity.damage * power, "magic", options);
  }
}

/**
 * IMMOLATION: a burning ring scorches every body whose own reach enters it, on
 * a fast tick. The candidate prefilter is the orbit's — bodies within the ring
 * plus their own radius — and every one is billed with no per-orb reach test,
 * because the ring IS the reach. Iterating that snapshot keeps the `hitEnemy`
 * splices safe.
 */
export function applyImmolation(
  state: GameState,
  player: Player,
  immolation: NonNullable<AbilityDef["immolation"]>,
  scratch: EffectScratch,
  power: number,
  bill: EffectBilling,
): void {
  if (scratch.cooldownMs > 0) return;
  scratch.cooldownMs = immolation.tickMs;
  const options = bill(state, player);
  const caught = enemiesInReach(
    state,
    player.pos,
    immolation.radius,
    reachScratch,
  );
  for (const enemy of caught) {
    if (enemy.hp <= 0) continue; // slain earlier this tick
    hitEnemy(state, enemy, immolation.damage * power, "magic", options);
  }
}
