// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SHOCK PULSE — one ring out from the mob, right now: everything caught is hit
// and SHOVED. The hero's PULSE powerup, turned around (see
// defs/enemies/abilities.ts).
//
// THE KNOCKBACK IS THE MECHANIC AND THE DAMAGE IS THE GARNISH, which is the
// opposite of how it reads in the numbers and the thing to remember before
// tuning it. Its job is to answer the player who has decided that standing on
// top of a named mob and out-trading it is the whole game: it puts them back
// out at range, where whatever else the mob has is off cooldown and waiting.
// A pulse tuned as a damage move is just a slam with extra steps.
//
// It reuses the asteroid blast's own `pushPlayer`, so the shove composes with
// the hero's steering exactly as every other impulse in the game does, and the
// degenerate case (a hero standing precisely on the caster) is handled the one
// way rather than two subtly different ways.

import { distance } from "@game/lib/vec.ts";
import { PLAYER } from "../config/index.ts";
import type { ShockPulseAbility } from "../defs/enemies/abilities.ts";
import { pushPlayer } from "../knockback.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import {
  groundMoveCanTouch,
  landHostileBlow,
  mobBlowDamage,
  pushEliteCast,
} from "./shared.ts";

/** What a def that says nothing gets — `pushCoastMs` is authored per mob, and
 * with `push` it decides HOW FAR the hero actually ends up. Short by default:
 * a shunt, not a launch. */
const DEFAULT_PUSH_COAST_MS = 260;

function ready(ability: ShockPulseAbility, ctx: AbilityCtx): boolean {
  // Only worth it once the hero is actually inside the ring. Cast at the edge
  // it would whiff, and a punish move that whiffs teaches nothing.
  return ctx.distance <= ability.radius * 0.9;
}

function cast(ability: ShockPulseAbility, ctx: AbilityCtx): void {
  const { state, enemy, def } = ctx;
  pushEliteCast(state, enemy, ability, { radius: ability.radius });

  // A jump sails clean over it — the same answer a slam takes.
  if (!groundMoveCanTouch(ctx.target)) return;
  if (distance(ctx.target.pos, enemy.pos) > ability.radius + PLAYER.radius) {
    return;
  }
  landHostileBlow(
    state,
    ctx.target,
    mobBlowDamage(enemy, def.contactDamage, ability.damageFrac),
    enemy.mlvl,
    `${enemy.defId}:shock_pulse`,
    enemy,
    state.rng() < def.critChance,
  );
  pushPlayer(
    ctx.target,
    enemy.pos,
    ability.push,
    ability.pushCoastMs ?? DEFAULT_PUSH_COAST_MS,
  );
}

registerAbility<ShockPulseAbility>({ id: "shock_pulse", ready, cast });
