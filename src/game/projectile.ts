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
  pierceLeft?: number;
  pierceFalloff?: number;
  homing?: number;
  chain?: number;
  hitIds?: number[];
  volley?: number;
  companionId?: number;
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
    pierceLeft: init.pierceLeft,
    pierceFalloff: init.pierceFalloff,
    homing: init.homing,
    chain: init.chain,
    hitIds: init.hitIds,
    volley: init.volley,
    companionId: init.companionId,
    hostile: init.hostile,
    sourceMlvl: init.sourceMlvl,
    sourceDefId: init.sourceDefId,
    critMult: init.critMult,
    z: init.z,
  };
}
