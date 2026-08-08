// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RALLY CRY — it shouts, and the horde around it picks up (see
// defs/enemies/abilities.ts).
//
// The only move in the tier that does nothing to the hero at all, which is
// precisely what it is for: every other elite ability asks "can you dodge
// this", and this one asks "who are you going to kill first". A player who
// works out that the shouting one is the problem has made a real decision, and
// one the game otherwise never offers them — the horde is normally an
// undifferentiated mass whose only ordering is what happens to be nearest.
//
// THREE DECISIONS ARE LOAD-BEARING:
//
//   • IT BUFFS WHAT IS ALREADY THERE rather than summoning more. A summoner
//     adds work; a rallier makes the work you already have urgent. Only the
//     second one makes anybody change target.
//   • THE LIFT LIVES ON THE MOBS IT REACHED, not on the caller. So it outlives
//     the shout and — deliberately — the shouter: killing the caller stops the
//     NEXT shout, it does not un-shout this one. Anything else would make the
//     answer "kill it during the windup", which is not a decision, just a race.
//   • IT RIDES `mechSpeedMult` / `mechDamageMult`, the two multiplier hooks
//     `stepEnemies` already calls for every body on the field. A rallied MINION
//     therefore needs no new call site and no new pass — which is the only
//     reason a move that touches the whole horde costs nothing.

import { distance } from "@game/lib/vec.ts";
import type { RallyCryAbility } from "../defs/enemies/abilities.ts";
import { inertEnemy } from "../disposition.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { pushEliteCast } from "./shared.ts";

/** Who a shout can reach: anything alive and hostile within earshot, excluding
 * the caller (a mob shouting itself faster is a stat buff wearing a costume). */
function audience(ability: RallyCryAbility, ctx: AbilityCtx) {
  return ctx.state.enemies.filter(
    (e) =>
      e.id !== ctx.enemy.id &&
      e.hp > 0 &&
      !inertEnemy(e) &&
      distance(e.pos, ctx.enemy.pos) <= ability.radius,
  );
}

function ready(ability: RallyCryAbility, ctx: AbilityCtx): boolean {
  // Never shout at an empty room. It would burn the cooldown, play the bark,
  // and leave the player watching a mob roar at nothing — which reads as a bug
  // rather than as a move that happened not to find an audience.
  return audience(ability, ctx).length > 0;
}

function cast(ability: RallyCryAbility, ctx: AbilityCtx): void {
  const { state, enemy } = ctx;
  const heard = audience(ability, ctx);
  for (const mob of heard) {
    const mech = (mob.mech ??= {});
    // A second shout REFRESHES rather than stacks — two ralliers in one room
    // would otherwise multiply into a horde nobody tuned for.
    mech.rallyMs = Math.max(mech.rallyMs ?? 0, ability.durationMs);
    mech.rallySpeedMult = ability.speedMult;
    mech.rallyDamageMult = ability.damageMult;
    // Being shouted at is being called to the fight — a rallied sleeper that
    // stayed asleep would be the move's whole point, invisible.
    mob.awake = true;
  }
  pushEliteCast(state, enemy, ability, {
    radius: ability.radius,
    count: heard.length,
    ms: ability.durationMs,
  });
}

registerAbility<RallyCryAbility>({ id: "rally_cry", ready, cast });
