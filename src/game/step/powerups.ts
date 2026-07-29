// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The CAMPAIGN POWERS' tick — the two powerups each map introduces past SPACEZ
// HQ's classics (see defs/ability-catalog.ts). The classics (orbs, storms,
// stasis, magnet) tick in ./powers.ts beside the granted spells; everything
// here is a kind that arrived with a later venue:
//
//   trail   ION WAKE          the hero sheds burning patches as he moves
//   rain    MOONFALL          rocks fall on the fight and crater it
//   well    DUST DEVIL        a roaming core hauls the horde in and grinds it
//           EVENT HORIZON     …the same core, anchored where it was spent
//   pulse   THE UNMAKING      a ring washes out of the hero and shoves
//   volley  DEAD MAN'S HAND   phantom rounds hunt the nearest body
//           IRON STAMPEDE     …and a line of heavies punches through them all
//   turret  SENTRY GRID       guns bolt to the floor and rake the room
//
// The purely PASSIVE kinds have no tick at all and are read where they bite:
// `barrier` and `ward` inside `absorbPlayerDamage`, `phase` at every
// player-damage site, `surge` in `weaponDamageFor`/`weaponCooldownFor`.
//
// Every blow here flows through `hitEnemy` with `noMenace` — a powerup's kills
// are not the hero out-fighting the horde, so they never escalate it — and
// carries `abilityPowerScale`, so a catalog number authored at level 1 keeps
// clipping the same fraction of a level-appropriate healthbar all campaign.

import { direction, distanceSq, moveToward, type Vec2 } from "@game/lib/vec.ts";
import {
  abilityPowerScale,
  setAbilityClock,
  tickAbilityClock,
} from "../abilities.ts";
import {
  abilityScratch,
  applyImmolation,
  applySingularity,
  applyVolley,
  commitAbilityScratch,
  powerupBilling,
} from "../ability-effects.ts";
import { abilityDef, type AbilityDef } from "../defs/abilities.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { knockEnemyBack } from "../hazards.ts";
import { hitEnemy } from "../loot.ts";
import type { ActiveAbility, Enemy, GameState } from "../types/index.ts";
import { nearestEnemy } from "./weapon.ts";

/** How long a shove from THE UNMAKING coasts before the AI takes back over
 * (ms) — short, so the wave reads as a shove and not a launch. */
const PULSE_KNOCK_MS = 260;

/** How far a ROAMING well (the DUST DEVIL) will walk to find its next body —
 * about a screen, so the cyclone works the fight the hero is in rather than
 * wandering off across the map after a distant straggler. */
const WELL_HUNT_RANGE = 340;

/** Scratch list reused by the area passes below — a fresh array per tick at
 * 60Hz is avoidable GC pressure. Valid only within one resolution. */
const areaScratch: Enemy[] = [];

/**
 * The enemies inside `radius` of `center`, in enemy-list order — apparitions
 * (cold air, never targets) skipped. Snapshotted into the shared scratch so
 * the caller can bill each without `hitEnemy`'s splices walking the live list
 * out from under it.
 */
function enemiesWithin(
  state: GameState,
  center: Vec2,
  radius: number,
): Enemy[] {
  areaScratch.length = 0;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    if (def.apparition) continue;
    const reach = radius + def.radius;
    if (distanceSq(enemy.pos, center) <= reach * reach) areaScratch.push(enemy);
  }
  return areaScratch;
}

/**
 * Advance the campaign powers for one tick. Called from the step pipeline
 * right after `stepAbilities`, so the two share a frame: the classics have
 * already swept and struck, and the lapse sweep at the end of `stepAbilities`
 * has NOT run yet — a power that ends here (a shattered barrier) is retired on
 * the next tick's sweep like any other.
 */
export function stepPowerups(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;
  if (player.abilities.length === 0) return;
  const power = abilityPowerScale(state);

  for (const ability of player.abilities) {
    const def = abilityDef(ability.defId);
    if (def.trail) stepTrail(state, ability, def, dtMs, power);
    if (def.rain) stepRain(state, ability, def, dtMs, power);
    if (def.well) stepWell(state, ability, def, dt, dtMs, power);
    if (def.pulse) stepPulse(state, ability, def, dtMs, power);
    if (def.volley) stepVolley(state, ability, def, dtMs, power);
    if (def.turret) stepTurret(state, ability, def, dtMs, power);
    if (def.singularity) stepSingularity(state, ability, def, dtMs, power);
    if (def.immolation) stepImmolation(state, ability, def, dtMs, power);
  }
}

/**
 * ION WAKE (`trail`): the hero sheds a burning patch every `dropMs` — only
 * where he has actually MOVED, so standing still stacks one fire instead of
 * piling a dozen on one tile — and every patch scorches whatever stands in it
 * on its own clock until it burns out. The patches ride the ability, so they
 * go out with the wake that laid them.
 */
function stepTrail(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dtMs: number,
  power: number,
): void {
  const trail = def.trail;
  if (!trail) return;
  const patches = (ability.patches ??= []);
  const player = state.player;

  if (tickAbilityClock(ability, "trail", dtMs) <= 0) {
    setAbilityClock(ability, "trail", trail.dropMs);
    const last = patches[patches.length - 1];
    // A patch every `dropMs`, but only once the hero has walked clear of the
    // last one — a stationary hero keeps one fire burning under his boots
    // rather than banking a stack of them on the same spot.
    const moved =
      last === undefined ||
      distanceSq(last.pos, player.pos) > (trail.radius * 0.6) ** 2;
    if (moved) {
      patches.push({
        pos: { ...player.pos },
        remainingMs: trail.patchMs,
        tickMs: 0,
      });
    }
  }

  for (let i = patches.length - 1; i >= 0; i--) {
    const patch = patches[i]!;
    patch.remainingMs -= dtMs;
    if (patch.remainingMs <= 0) {
      patches.splice(i, 1);
      continue;
    }
    patch.tickMs -= dtMs;
    if (patch.tickMs > 0) continue;
    patch.tickMs = trail.tickMs;
    const victims = enemiesWithin(state, patch.pos, trail.radius).slice();
    for (const victim of victims) {
      if (victim.hp <= 0) continue;
      hitEnemy(state, victim, trail.damage * power, "magic", {
        noMenace: true,
      });
    }
  }
}

/**
 * MOONFALL (`rain`): rocks drop on the fight every `intervalMs`. Each aims at
 * a live foe within reach (a different one per rock, so a pair never doubles
 * up on the same body while the pack beside it is untouched) and craters
 * everything inside its blast; with the field empty they scatter around the
 * hero, so the barrage still reads while he walks between packs.
 */
function stepRain(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dtMs: number,
  power: number,
): void {
  const rain = def.rain;
  if (!rain) return;
  if (tickAbilityClock(ability, "rain", dtMs) > 0) return;
  setAbilityClock(ability, "rain", rain.intervalMs);

  const player = state.player;
  const marks = enemiesWithin(state, player.pos, rain.range).slice();
  for (let i = 0; i < rain.count; i++) {
    let target: Vec2;
    if (marks.length > 0) {
      // Spread the rocks across DISTINCT bodies while there are enough to go
      // around, then wrap — a pack of one still eats every rock.
      const mark = marks[i % marks.length]!;
      target = { ...mark.pos };
    } else {
      const angle = state.fxRng() * Math.PI * 2;
      const reach = rain.range * (0.3 + 0.7 * state.fxRng());
      target = {
        x: player.pos.x + Math.cos(angle) * reach,
        y: player.pos.y + Math.sin(angle) * reach * 0.7,
      };
    }
    state.events.push({
      type: "meteorFall",
      pos: { ...target },
      radius: rain.radius,
    });
    const victims = enemiesWithin(state, target, rain.radius).slice();
    // One rock = one menace ATTACK id, so the blast is judged as a single blow.
    const attack = state.nextId++;
    for (const victim of victims) {
      if (victim.hp <= 0) continue;
      hitEnemy(state, victim, rain.damage * power, "magic", {
        noMenace: true,
        attack,
      });
    }
  }
}

/**
 * DUST DEVIL / EVENT HORIZON (`well`): a core that drags everything inside its
 * reach toward itself and grinds it on a tick. `chase` walks the core to the
 * nearest body (the cyclone hunting); at 0 it holds the ground it was spent on
 * (the black hole). The pull is a per-tick `moveToward` nudge — the same drag
 * the level's own gravity wells use — so the horde clumps instead of being
 * teleported.
 */
function stepWell(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dt: number,
  dtMs: number,
  power: number,
): void {
  const well = def.well;
  if (!well) return;
  const core = (ability.pos ??= { ...state.player.pos });

  if (well.chase > 0) {
    const prey = nearestEnemy(state.enemies, core, WELL_HUNT_RANGE);
    if (prey) ability.pos = moveToward(core, prey.pos, well.chase * dt);
  }

  const caught = enemiesWithin(state, ability.pos, well.radius).slice();
  // The drag runs EVERY tick (a pull that only moved on the damage tick would
  // stutter); the grind is on the ability's own clock.
  for (const enemy of caught) {
    enemy.pos = moveToward(enemy.pos, ability.pos, well.pull * dt);
  }

  if (tickAbilityClock(ability, "well", dtMs) > 0) return;
  setAbilityClock(ability, "well", well.tickMs);
  // One grind tick = one menace ATTACK id (see bankOverkill).
  const attack = state.nextId++;
  for (const enemy of caught) {
    if (enemy.hp <= 0) continue;
    hitEnemy(state, enemy, well.damage * power, "magic", {
      noMenace: true,
      attack,
    });
  }
}

/**
 * THE UNMAKING (`pulse`): a ring washes out of the hero every `intervalMs`,
 * billing everything it passes through and SHOVING it clear — the opposite
 * read of the well, and the reason to hold this one for the moment the crowd
 * closes. The shove reuses the meteor fling's coast (`knockEnemyBack`), so the
 * AI sits out while a body slides.
 */
function stepPulse(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dtMs: number,
  power: number,
): void {
  const pulse = def.pulse;
  if (!pulse) return;
  if (tickAbilityClock(ability, "pulse", dtMs) > 0) return;
  setAbilityClock(ability, "pulse", pulse.intervalMs);

  const origin = { ...state.player.pos };
  state.events.push({ type: "voidWave", pos: origin, radius: pulse.radius });
  const victims = enemiesWithin(state, origin, pulse.radius).slice();
  // One wave = one menace ATTACK id (see bankOverkill).
  const attack = state.nextId++;
  for (const victim of victims) {
    if (victim.hp <= 0) continue;
    // Shove first, bill second: a body killed by the wave should be thrown by
    // the same wave, and `hitEnemy` may splice it out on the spot.
    knockEnemyBack(victim, origin, pulse.push, PULSE_KNOCK_MS);
    hitEnemy(state, victim, pulse.damage * power, "magic", {
      noMenace: true,
      attack,
    });
  }
}

/**
 * DEAD MAN'S HAND / IRON STAMPEDE (`volley`): shots loose themselves at the
 * nearest body on an interval, fanned across `spread` so a multi-shot volley
 * spreads over a pack instead of stacking into one line. Damage is pre-scaled
 * by `power` here — the shots resolve later, in `stepProjectiles`, which can't
 * re-ask the ability scale — and every shot of one volley shares an id so its
 * hits are grouped like a trigger pull's pellets.
 */
function stepVolley(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dtMs: number,
  power: number,
): void {
  const volley = def.volley;
  if (!volley) return;
  const scratch = abilityScratch(ability, "volley", dtMs);
  applyVolley(state, volley, scratch, power);
  commitAbilityScratch(ability, "volley", scratch);
}

/**
 * ARCANE SINGULARITY (`singularity`): a vortex collapses on the nearest cluster
 * every interval, hauling everything inside it into the core. The `well`'s
 * twin: a well is a core PLACED where the power was spent and dragging
 * continuously, this re-centres on the horde at every collapse. Shared whole
 * with the magic tree's own singularity (see ability-effects.ts).
 */
function stepSingularity(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dtMs: number,
  power: number,
): void {
  const singularity = def.singularity;
  if (!singularity) return;
  const scratch = abilityScratch(ability, "singularity", dtMs);
  applySingularity(state, singularity, scratch, power, powerupBilling);
  commitAbilityScratch(ability, "singularity", scratch);
}

/**
 * IMMOLATION (`immolation`): a burning ring the hero CARRIES, scorching every
 * body that steps into it on a fast tick — the `pulse` minus the shove and the
 * wave, so it reads as heat he holds rather than a blow he throws. Shared whole
 * with the magic tree's immolation aura.
 */
function stepImmolation(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dtMs: number,
  power: number,
): void {
  const immolation = def.immolation;
  if (!immolation) return;
  const scratch = abilityScratch(ability, "immolation", dtMs);
  applyImmolation(state, immolation, scratch, power, powerupBilling);
  commitAbilityScratch(ability, "immolation", scratch);
}

/**
 * SENTRY GRID (`turret`): each deployed gun runs its own fire clock and shoots
 * the nearest body IT can see, from where IT stands — so the grid keeps
 * covering the ground the hero has already walked off. A gun with nothing in
 * range holds its shot (and its clock) rather than firing into the dark.
 */
function stepTurret(
  state: GameState,
  ability: ActiveAbility,
  def: AbilityDef,
  dtMs: number,
  power: number,
): void {
  const turret = def.turret;
  const nodes = ability.nodes;
  if (!turret || !nodes) return;
  for (const node of nodes) {
    node.cooldownMs -= dtMs;
    if (node.cooldownMs > 0) continue;
    const mark = nearestEnemy(state.enemies, node.pos, turret.range);
    if (!mark) continue;
    node.cooldownMs = turret.intervalMs;
    state.projectiles.push({
      id: state.nextId++,
      pos: { ...node.pos },
      dir: direction(node.pos, mark.pos),
      speed: turret.speed,
      radius: turret.projectileRadius,
      damage: turret.damage * power,
      lifetimeMs: (turret.range / turret.speed) * 1000,
      weaponClass: "magic",
      sprite: turret.sprite,
      volley: state.nextId++,
      z: 0,
    });
  }
}
