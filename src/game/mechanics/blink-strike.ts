// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BLINK STRIKE — the mob is not where it was. It vanishes on the tell and
// arrives at arm's length, already swinging (see defs/enemies/abilities.ts).
//
// This is the tier's answer to the ranged build that has walked backwards for a
// whole level, and it is the one move here where the FAIRNESS rests entirely on
// a detail that looks like an implementation choice:
//
//   THE ARRIVAL IS DERIVED FROM THE TELL, NOT FROM NOW. Both the bearing and
//   the RANGE are read off the telegraph (`lockedDir`, `lockedDistance`), so
//   the mob arrives beside the spot the hero occupied when the tell started. A
//   hero who kept moving is not there, and the mob lands swinging at nothing —
//   which is the entire play. Re-measuring either one at cast time produces a
//   move that always connects, and no amount of windup makes that fair.
//
// It lands SHORT of the hero rather than on top of him (`arriveDistance`), for
// the same reason the charge overshoots rather than stopping dead: a body that
// materialises inside the hero's own radius has to be shoved back out by the
// collision pass, and what the player sees is the mob stuttering rather than
// arriving.

import { direction, distance } from "@game/lib/vec.ts";
import { PLAYER } from "../config/index.ts";
import type { BlinkStrikeAbility } from "../defs/enemies/abilities.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import {
  groundMoveCanTouch,
  landHostileBlow,
  mobBlowDamage,
  pushEliteCast,
} from "./shared.ts";

function ready(ability: BlinkStrikeAbility, ctx: AbilityCtx): boolean {
  // Pointless at contact — it is a gap-closer, so it wants a gap. The floor is
  // the arrival distance itself: any nearer and the mob would blink backwards.
  if (ctx.distance <= ability.arriveDistance * 1.5) return false;
  return ctx.distance <= ability.range;
}

function cast(ability: BlinkStrikeAbility, ctx: AbilityCtx): void {
  const { state, enemy, def } = ctx;
  const from = { ...enemy.pos };
  const dir = ctx.lockedDir ?? direction(enemy.pos, ctx.target.pos);
  // The RANGE locked at the tell, not the one measured now. See the header.
  const travel = Math.max(
    0,
    (ctx.lockedDistance ?? ctx.distance) - ability.arriveDistance,
  );
  enemy.pos.x = Math.min(
    Math.max(from.x + dir.x * travel, 8),
    state.level.width - 8,
  );
  enemy.pos.y = Math.min(
    Math.max(from.y + dir.y * travel, 8),
    state.level.height - 8,
  );

  // ONE event carrying BOTH ends, so the app can draw the departure and the
  // arrival as one move rather than guessing they belong together.
  pushEliteCast(state, enemy, ability, { pos: from, to: { ...enemy.pos } });

  if (!groundMoveCanTouch(ctx.target)) return;
  if (
    distance(ctx.target.pos, enemy.pos) >
    ability.strikeRadius + PLAYER.radius
  ) {
    return;
  }
  landHostileBlow(
    state,
    ctx.target,
    mobBlowDamage(enemy, def.contactDamage, ability.damageFrac),
    enemy.mlvl,
    `${enemy.defId}:blink_strike`,
    enemy,
    state.rng() < def.critChance,
  );
}

registerAbility<BlinkStrikeAbility>({ id: "blink_strike", ready, cast });
