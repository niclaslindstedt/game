// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SEEKER VOLLEY — a handful of slow bolts that STEER after the hero. The magic
// tree's seeker orbs, turned around (see defs/enemies/abilities.ts).
//
// The one number that decides whether this is a mechanic or a tax is `homing`,
// and the temptation is always to raise it. A bolt that turns hard enough to be
// unavoidable is not a projectile at all — it is damage on a delay, wearing a
// sprite. Keep it low enough that a hero at a run pulls away from the turn, so
// the move asks "are you willing to stop shooting and move" rather than
// "please subtract this".
//
// It shares the COIN CANNON's launch geometry deliberately — an evenly spread
// fan about the locked bearing, never a rolled one — so the two read as the
// same kind of thing arriving, and the player's answer to a fan (find the gap)
// still starts them off correctly before the bolts begin to turn.

import { direction } from "@game/lib/vec.ts";
import type { SeekerVolleyAbility } from "../defs/enemies/abilities.ts";
import { lineOfSight } from "../obstacles.ts";
import { createProjectile } from "../projectile.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { mobBlowDamage, pushEliteCast } from "./shared.ts";

/** Bolt size (world px) — read as a thrown orb rather than as a bullet. */
const BOLT_RADIUS = 4;

function ready(ability: SeekerVolleyAbility, ctx: AbilityCtx): boolean {
  if (ctx.distance > ability.range) return false;
  return lineOfSight(ctx.state, ctx.enemy.pos, ctx.state.player.pos);
}

function cast(ability: SeekerVolleyAbility, ctx: AbilityCtx): void {
  const { state, enemy, def } = ctx;
  const locked = ctx.lockedDir ?? direction(enemy.pos, state.player.pos);
  const centre = Math.atan2(locked.y, locked.x);
  const spread = (ability.spreadDeg * Math.PI) / 180;
  const damage = mobBlowDamage(enemy, def.contactDamage, ability.damageFrac);

  for (let i = 0; i < ability.count; i++) {
    const t = ability.count === 1 ? 0.5 : i / (ability.count - 1);
    const angle = centre - spread / 2 + spread * t;
    state.projectiles.push(
      createProjectile({
        id: state.nextId++,
        pos: { ...enemy.pos },
        dir: { x: Math.cos(angle), y: Math.sin(angle) },
        speed: ability.speed,
        radius: BOLT_RADIUS,
        damage,
        lifetimeMs: ability.lifetimeMs,
        // Not a weapon class — it only picks the app's fallback shot family.
        weaponClass: "magic",
        sprite: ability.sprite,
        homing: ability.homing,
        hostile: true,
        sourceMlvl: enemy.mlvl,
        sourceDefId: enemy.defId,
        z: 0,
      }),
    );
  }
  pushEliteCast(state, enemy, ability, {
    angle: centre,
    spread,
    count: ability.count,
  });
}

registerAbility<SeekerVolleyAbility>({ id: "seeker_volley", ready, cast });
