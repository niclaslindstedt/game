// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The one PROJECTILE factory. Every shot — the hero's volley (step/weapon.ts),
// a companion's fire (companions.ts), an enemy's hostile round (ranged.ts) —
// is minted here so all projectiles share ONE hidden class.
//
// The tick's `stepProjectiles` loop reads a dozen `projectile.*` fields on
// every live shot every tick; when shots are built by three literals each
// carrying a different subset of the optionals, those loads go MEGAMORPHIC.
// Stamping EVERY field here (absent optionals as `undefined`, in the type's
// declared order) unifies the shape, so those loads stay monomorphic and no
// in-flight assignment (`hitIds ??= []`, `pierceLeft--`, …) ever grows the
// object. `undefined` reads identically to an absent field at every consuming
// site, so behavior is unchanged.

import type { Vec2 } from "@game/lib/vec.ts";
import type { Projectile, WeaponClass } from "./types/index.ts";

/** All the fields a caller may set on a fresh projectile; the factory fills the
 * rest with `undefined` so every instance carries the full shape. */
export type ProjectileInit = {
  id: number;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  radius: number;
  damage: number;
  lifetimeMs: number;
  weaponClass: WeaponClass;
  sprite: string;
  z: number;
  damageRoll?: number;
  bouncesLeft?: number;
  pierceLeft?: number;
  pierceFalloff?: number;
  homing?: number;
  chain?: number;
  hitIds?: number[];
  volley?: number;
  companionId?: number;
  seat?: number;
  hostile?: boolean;
  sourceMlvl?: number;
  sourceDefId?: string;
  critMult?: number;
};

/** Mint a projectile with the canonical field order (see the module header). */
export function createProjectile(init: ProjectileInit): Projectile {
  return {
    id: init.id,
    pos: init.pos,
    dir: init.dir,
    speed: init.speed,
    radius: init.radius,
    damage: init.damage,
    damageRoll: init.damageRoll,
    lifetimeMs: init.lifetimeMs,
    weaponClass: init.weaponClass,
    sprite: init.sprite,
    bouncesLeft: init.bouncesLeft,
    pierceLeft: init.pierceLeft,
    pierceFalloff: init.pierceFalloff,
    homing: init.homing,
    chain: init.chain,
    hitIds: init.hitIds,
    volley: init.volley,
    companionId: init.companionId,
    seat: init.seat,
    hostile: init.hostile,
    sourceMlvl: init.sourceMlvl,
    sourceDefId: init.sourceDefId,
    critMult: init.critMult,
    z: init.z,
  };
}

/**
 * RICOCHET a shot off whatever just stopped it, and report whether it lives on.
 *
 * There is no wall normal to reflect against — an obstacle is a rectangle in a
 * list, not a surface — so the normal is RECOVERED by asking which axis was
 * actually blocked: step the shot from where it started along X alone, then
 * along Y alone, and flip whichever one could not get through. For the
 * axis-aligned boxes the level is built of that is the true normal; for a
 * corner (both axes blocked) it flips both, which is what a corner does.
 *
 * Cheap on purpose: this runs only for a shot that has already been stopped,
 * which is a handful per volley, and never for the ordinary bullets that make
 * up almost every shot in the game.
 */
export function bounceProjectile(
  blocked: (from: Vec2, to: Vec2) => boolean,
  projectile: Projectile,
  from: Vec2,
  bounds: { width: number; height: number },
): boolean {
  if (!projectile.bouncesLeft || projectile.bouncesLeft <= 0) return false;
  projectile.bouncesLeft--;

  // The level's own edges have a normal by inspection.
  let flipX = projectile.pos.x <= 0 || projectile.pos.x >= bounds.width;
  let flipY = projectile.pos.y <= 0 || projectile.pos.y >= bounds.height;
  if (!flipX && !flipY) {
    // An obstacle: probe each axis on its own from where the shot set off.
    flipX = blocked(from, { x: projectile.pos.x, y: from.y });
    flipY = blocked(from, { x: from.x, y: projectile.pos.y });
    // Neither axis alone explains it — a diagonal clip. Treat it as a corner.
    if (!flipX && !flipY) {
      flipX = true;
      flipY = true;
    }
  }
  if (flipX) projectile.dir.x = -projectile.dir.x;
  if (flipY) projectile.dir.y = -projectile.dir.y;
  // Put it back where it set off from, so the reflected shot leaves the wall
  // instead of spawning inside it and being eaten again next tick.
  projectile.pos.x = from.x;
  projectile.pos.y = from.y;
  return true;
}
