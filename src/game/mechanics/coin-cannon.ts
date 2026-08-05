// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// COIN CANNON — PAYLOAD-1 rears back and fires a fan of coins that come off the
// walls.
//
// Every hostile shot in the game until now travelled in a straight line and
// died on the first thing it touched, so the answer was always the same one
// thing: put a rock between you and it. A shot that RICOCHETS takes that answer
// away and replaces it with a better question — the room is now part of the
// fight, the safe spot is wherever the geometry is not pointing, and it moves
// as you do. In a corner the cannon is genuinely dangerous; in the open it is
// almost nothing. That is a fight asking the player where to stand.
//
// Two things keep it readable:
//   • IT IS A FAN, NOT A STREAM. The whole volley leaves at once, so what the
//     player reads is a SHAPE with gaps in it, not a sequence of separate
//     dodges. The gaps are the answer and they are visible immediately.
//   • THE BEARING LOCKS AT THE TELL, like every other move in the catalog, so
//     the fan goes where the hero WAS. Walking is what beats it.

import { direction } from "@game/lib/vec.ts";
import type { CoinCannonAbility } from "../defs/enemies/abilities.ts";
import { lineOfSight } from "../obstacles.ts";
import { createProjectile } from "../projectile.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { mobBlowDamage } from "./shared.ts";

/** Coin size (world px). Big enough to read as a thrown object, not a bullet. */
const COIN_RADIUS = 4;

function ready(ability: CoinCannonAbility, ctx: AbilityCtx): boolean {
  if (ctx.distance > ability.range) return false;
  return lineOfSight(ctx.state, ctx.enemy.pos, ctx.target.pos);
}

/**
 * Throw the volley. Every coin leaves on the same tick, spread evenly across
 * the fan — evenly rather than randomly, because a rolled spread would make the
 * gaps different every time and there would be nothing to learn.
 */
function cast(ability: CoinCannonAbility, ctx: AbilityCtx): void {
  const { state, enemy, def } = ctx;
  const locked = ctx.lockedDir ?? direction(enemy.pos, ctx.target.pos);
  const centre = Math.atan2(locked.y, locked.x);
  const spread = (ability.spreadDeg * Math.PI) / 180;
  const damage = mobBlowDamage(enemy, def.contactDamage, ability.damageFrac);

  for (let i = 0; i < ability.count; i++) {
    // A single coin goes dead centre; any more spread evenly edge to edge.
    const t = ability.count === 1 ? 0.5 : i / (ability.count - 1);
    const angle = centre - spread / 2 + spread * t;
    state.projectiles.push(
      createProjectile({
        id: state.nextId++,
        pos: { ...enemy.pos },
        dir: { x: Math.cos(angle), y: Math.sin(angle) },
        speed: ability.speed,
        radius: COIN_RADIUS,
        damage,
        lifetimeMs: ability.lifetimeMs,
        // Not a weapon class — it only picks the app's fallback shot family.
        weaponClass: "ranged",
        sprite: "coin_shot",
        bouncesLeft: ability.bounces,
        hostile: true,
        sourceMlvl: enemy.mlvl,
        sourceDefId: enemy.defId,
        z: 0,
      }),
    );
  }
  state.events.push({
    type: "bossVolley",
    pos: { ...enemy.pos },
    angle: centre,
    spread,
    count: ability.count,
    defId: enemy.defId,
  });
}

registerAbility<CoinCannonAbility>({ id: "coin_cannon", ready, cast });
